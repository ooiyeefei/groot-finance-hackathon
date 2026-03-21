/**
 * generate_report_pdf MCP Tool Implementation
 *
 * Generates a multi-section board report PDF, uploads to S3,
 * and returns a signed download URL.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import { validateBusinessAccess, type AuthContext } from '../lib/auth.js';
import { buildBoardReport, type ReportData, type PnlData, type CashFlowData, type AgingData, type VendorData, type TrendData } from '../lib/pdf-builder.js';
import type { GenerateReportPdfInput, GenerateReportPdfOutput, MCPErrorResponse } from '../contracts/mcp-tools.js';

// AWS SDK is provided by Lambda runtime (externalModules: ['@aws-sdk/*'])
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

const S3_BUCKET = process.env.S3_BUCKET_NAME || 'finanseal-bucket';
const S3_REGION = process.env.AWS_REGION || 'us-west-2';

interface AccountingEntry {
  _id: string;
  businessId: string;
  transactionType: string;
  transactionDate?: string;
  category?: string;
  categoryName?: string;
  vendorName?: string;
  originalAmount?: number;
  homeCurrencyAmount?: number;
  currency?: string;
  deletedAt?: number;
}

interface InvoiceEntry {
  _id: string;
  totalAmount?: number;
  homeCurrencyAmount?: number;
  dueDate?: string;
  paymentStatus?: string;
  customerName?: string;
  vendorName?: string;
  currency?: string;
}

export async function generateReportPdf(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<GenerateReportPdfOutput | MCPErrorResponse> {
  const input = args as GenerateReportPdfInput;

  // Resolve business ID
  let businessId: string;
  if (authContext?.businessId) {
    businessId = authContext.businessId;
  } else {
    const authResult = validateBusinessAccess(input.business_id);
    if (!authResult.authorized) {
      return { error: true, code: authResult.error!.code as MCPErrorResponse['code'], message: authResult.error!.message };
    }
    businessId = authResult.businessId!;
  }

  if (!input.date_range?.start || !input.date_range?.end) {
    return { error: true, code: 'INVALID_INPUT', message: 'date_range with start and end is required' };
  }

  if (input.date_range.start > input.date_range.end) {
    return { error: true, code: 'INVALID_INPUT', message: 'date_range.start must be before date_range.end' };
  }

  const requestedSections = input.sections || ['pnl', 'cash_flow', 'ar_aging', 'ap_aging', 'top_vendors', 'trends'];

  try {
    const convex = getConvexClient();
    const { start, end } = input.date_range;

    // Fetch accounting entries
    const entries = await convex.query<AccountingEntry[]>(
      'functions/financialIntelligence:getMcpAccountingEntries',
      { businessId }
    );

    const activeEntries = (entries || []).filter(e =>
      !e.deletedAt &&
      e.transactionDate &&
      e.transactionDate >= start &&
      e.transactionDate <= end
    );

    if (activeEntries.length === 0) {
      return { error: true, code: 'INSUFFICIENT_DATA', message: `No transactions found between ${start} and ${end}` };
    }

    const currency = activeEntries[0]?.currency || 'MYR';

    // Build report sections
    const sections: ReportData['sections'] = {};

    // P&L
    if (requestedSections.includes('pnl')) {
      const income = activeEntries.filter(e => e.transactionType === 'Income');
      const expenses = activeEntries.filter(e => e.transactionType === 'Expense');
      const revenue = income.reduce((s, e) => s + Math.abs(e.homeCurrencyAmount || e.originalAmount || 0), 0);
      const totalExpenses = expenses.reduce((s, e) => s + Math.abs(e.homeCurrencyAmount || e.originalAmount || 0), 0);

      // Group expenses by category
      const expByCat = new Map<string, number>();
      for (const e of expenses) {
        const cat = e.categoryName || e.category || 'Uncategorized';
        expByCat.set(cat, (expByCat.get(cat) || 0) + Math.abs(e.homeCurrencyAmount || e.originalAmount || 0));
      }

      sections.pnl = {
        revenue,
        cogs: 0, // COGS would need separate account code filtering
        grossProfit: revenue,
        operatingExpenses: totalExpenses,
        netIncome: revenue - totalExpenses,
        expenseBreakdown: Array.from(expByCat.entries())
          .map(([category, amount]) => ({ category, amount }))
          .sort((a, b) => b.amount - a.amount),
      };
    }

    // Cash Flow
    if (requestedSections.includes('cash_flow')) {
      const allEntries = (entries || []).filter(e => !e.deletedAt);
      const beforePeriod = allEntries.filter(e => e.transactionDate && e.transactionDate < start);
      const inPeriod = activeEntries;

      const openingBalance = beforePeriod.reduce((bal, e) => {
        const amt = e.homeCurrencyAmount || e.originalAmount || 0;
        return e.transactionType === 'Income' ? bal + amt : bal - Math.abs(amt);
      }, 0);

      const inflows = inPeriod.filter(e => e.transactionType === 'Income')
        .reduce((s, e) => s + Math.abs(e.homeCurrencyAmount || e.originalAmount || 0), 0);
      const outflows = inPeriod.filter(e => e.transactionType !== 'Income')
        .reduce((s, e) => s + Math.abs(e.homeCurrencyAmount || e.originalAmount || 0), 0);

      sections.cashFlow = {
        openingBalance,
        totalInflows: inflows,
        totalOutflows: outflows,
        netChange: inflows - outflows,
        closingBalance: openingBalance + inflows - outflows,
      };
    }

    // AR Aging
    if (requestedSections.includes('ar_aging')) {
      try {
        const salesInvoices = await convex.query<InvoiceEntry[]>(
          'functions/financialIntelligence:getMcpSalesInvoices',
          { businessId }
        );
        sections.arAging = buildAgingData(salesInvoices || [], 'customer');
      } catch {
        sections.arAging = { current: 0, thirtyDays: 0, sixtyDays: 0, ninetyPlus: 0, total: 0, items: [] };
      }
    }

    // AP Aging
    if (requestedSections.includes('ap_aging')) {
      try {
        const purchaseInvoices = await convex.query<InvoiceEntry[]>(
          'functions/financialIntelligence:getMcpPurchaseInvoices',
          { businessId }
        );
        sections.apAging = buildAgingData(purchaseInvoices || [], 'vendor');
      } catch {
        sections.apAging = { current: 0, thirtyDays: 0, sixtyDays: 0, ninetyPlus: 0, total: 0, items: [] };
      }
    }

    // Top Vendors
    if (requestedSections.includes('top_vendors')) {
      const vendorSpend = new Map<string, { total: number; count: number }>();
      for (const e of activeEntries) {
        if (e.vendorName && e.transactionType !== 'Income') {
          const existing = vendorSpend.get(e.vendorName) || { total: 0, count: 0 };
          existing.total += Math.abs(e.homeCurrencyAmount || e.originalAmount || 0);
          existing.count += 1;
          vendorSpend.set(e.vendorName, existing);
        }
      }
      const totalSpend = Array.from(vendorSpend.values()).reduce((s, v) => s + v.total, 0);
      sections.topVendors = Array.from(vendorSpend.entries())
        .map(([name, data]) => ({
          name,
          totalSpend: data.total,
          invoiceCount: data.count,
          percentage: totalSpend > 0 ? Math.round((data.total / totalSpend) * 100) : 0,
        }))
        .sort((a, b) => b.totalSpend - a.totalSpend)
        .slice(0, 10);
    }

    // Trends (last 6 months of data)
    if (requestedSections.includes('trends')) {
      const allEntries = (entries || []).filter(e => !e.deletedAt && e.transactionDate);
      const monthlyData = new Map<string, { revenue: number; expenses: number }>();

      for (const e of allEntries) {
        const monthKey = e.transactionDate!.substring(0, 7);
        const existing = monthlyData.get(monthKey) || { revenue: 0, expenses: 0 };
        const amt = Math.abs(e.homeCurrencyAmount || e.originalAmount || 0);
        if (e.transactionType === 'Income') existing.revenue += amt;
        else existing.expenses += amt;
        monthlyData.set(monthKey, existing);
      }

      sections.trends = Array.from(monthlyData.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-6)
        .map(([month, data]) => ({
          month: new Date(month + '-01').toLocaleDateString('en', { month: 'short', year: 'numeric' }),
          revenue: Math.round(data.revenue),
          expenses: Math.round(data.expenses),
          netIncome: Math.round(data.revenue - data.expenses),
        }));
    }

    // Get business name
    let businessName = authContext?.businessName || 'Business';

    // Build PDF
    const reportData: ReportData = {
      businessName,
      reportType: 'Board Report',
      dateRange: input.date_range,
      currency,
      sections,
    };

    const { buffer, pageCount } = await buildBoardReport(reportData);

    // Generate filename and S3 key
    const period = formatPeriodShort(start, end);
    const timestamp = Date.now();
    const filename = `Board-Report-${period}.pdf`;
    const s3Key = `reports/${businessId}/board-report/${timestamp}-${filename}`;

    // Upload to S3
    const s3Client = new S3Client({ region: S3_REGION });
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: buffer,
      ContentType: 'application/pdf',
      ContentDisposition: `attachment; filename="${filename}"`,
    }));

    // Generate presigned download URL (7-day expiry)
    const downloadUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key }),
      { expiresIn: 7 * 24 * 60 * 60 } // 7 days
    );

    return {
      report_url: downloadUrl,
      filename,
      sections_included: requestedSections,
      date_range: input.date_range,
      generated_at: new Date().toISOString(),
      page_count: pageCount,
    };
  } catch (error) {
    console.error('[generate_report_pdf] Error:', error);

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }

    return { error: true, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}

function buildAgingData(invoices: InvoiceEntry[], entityType: 'customer' | 'vendor'): AgingData {
  const today = new Date();
  let current = 0, thirtyDays = 0, sixtyDays = 0, ninetyPlus = 0;
  const items: AgingData['items'] = [];

  for (const inv of invoices) {
    const amount = inv.homeCurrencyAmount || inv.totalAmount || 0;
    if (amount <= 0) continue;

    const dueDate = inv.dueDate ? new Date(inv.dueDate) : today;
    const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

    let aging: string;
    if (daysOverdue <= 0) { current += amount; aging = 'Current'; }
    else if (daysOverdue <= 30) { thirtyDays += amount; aging = '1-30 days'; }
    else if (daysOverdue <= 60) { sixtyDays += amount; aging = '31-60 days'; }
    else { ninetyPlus += amount; aging = '61-90+ days'; }

    const name = entityType === 'customer' ? (inv.customerName || 'Unknown') : (inv.vendorName || 'Unknown');
    items.push({ name, amount, aging });
  }

  return {
    current: Math.round(current),
    thirtyDays: Math.round(thirtyDays),
    sixtyDays: Math.round(sixtyDays),
    ninetyPlus: Math.round(ninetyPlus),
    total: Math.round(current + thirtyDays + sixtyDays + ninetyPlus),
    items: items.sort((a, b) => b.amount - a.amount).slice(0, 10),
  };
}

function formatPeriodShort(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  // If it's a quarter: Q1-2026
  if (s.getMonth() % 3 === 0 && e.getMonth() - s.getMonth() === 2) {
    const q = Math.floor(s.getMonth() / 3) + 1;
    return `Q${q}-${s.getFullYear()}`;
  }
  return `${s.toISOString().split('T')[0]}_${e.toISOString().split('T')[0]}`;
}
