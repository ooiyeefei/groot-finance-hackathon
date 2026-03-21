/**
 * PDF Board Report Builder
 *
 * Generates multi-section PDF reports using PDFKit.
 * Sections: Cover, P&L, Cash Flow, AR Aging, AP Aging, Top Vendors, Trends.
 */

import PDFDocument from 'pdfkit';

export interface ReportData {
  businessName: string;
  reportType: string;
  dateRange: { start: string; end: string };
  currency: string;
  sections: {
    pnl?: PnlData;
    cashFlow?: CashFlowData;
    arAging?: AgingData;
    apAging?: AgingData;
    topVendors?: VendorData[];
    trends?: TrendData[];
  };
}

export interface PnlData {
  revenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  netIncome: number;
  expenseBreakdown: { category: string; amount: number }[];
}

export interface CashFlowData {
  openingBalance: number;
  totalInflows: number;
  totalOutflows: number;
  closingBalance: number;
  netChange: number;
}

export interface AgingData {
  current: number;
  thirtyDays: number;
  sixtyDays: number;
  ninetyPlus: number;
  total: number;
  items: { name: string; amount: number; aging: string }[];
}

export interface VendorData {
  name: string;
  totalSpend: number;
  invoiceCount: number;
  percentage: number;
}

export interface TrendData {
  month: string;
  revenue: number;
  expenses: number;
  netIncome: number;
}

const COLORS = {
  primary: '#1e40af',
  secondary: '#64748b',
  accent: '#059669',
  danger: '#dc2626',
  headerBg: '#f1f5f9',
  border: '#e2e8f0',
  text: '#1e293b',
  muted: '#94a3b8',
};

function formatCurr(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })} – ${e.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

/**
 * Build a board report PDF and return it as a Buffer.
 */
export async function buildBoardReport(data: ReportData): Promise<{ buffer: Buffer; pageCount: number }> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    let pageCount = 1;

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), pageCount }));
    doc.on('error', reject);
    doc.on('pageAdded', () => pageCount++);

    const { sections, currency } = data;

    // --- Cover Page ---
    doc.fontSize(28).fillColor(COLORS.primary).text(data.businessName, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(20).fillColor(COLORS.text).text(data.reportType, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(12).fillColor(COLORS.muted).text(formatPeriod(data.dateRange.start, data.dateRange.end), { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}`, { align: 'center' });
    doc.moveDown(3);

    // Table of contents
    doc.fontSize(14).fillColor(COLORS.text).text('Contents', { underline: true });
    doc.moveDown(0.5);
    const sectionNames = [];
    if (sections.pnl) sectionNames.push('1. Profit & Loss Summary');
    if (sections.cashFlow) sectionNames.push('2. Cash Flow Overview');
    if (sections.arAging) sectionNames.push('3. Accounts Receivable Aging');
    if (sections.apAging) sectionNames.push('4. Accounts Payable Aging');
    if (sections.topVendors) sectionNames.push('5. Top Vendors');
    if (sections.trends) sectionNames.push('6. Monthly Trends');
    doc.fontSize(11).fillColor(COLORS.secondary);
    for (const name of sectionNames) {
      doc.text(name);
      doc.moveDown(0.2);
    }

    // --- P&L Section ---
    if (sections.pnl) {
      doc.addPage();
      sectionHeader(doc, 'Profit & Loss Summary');
      const pnl = sections.pnl;
      addRow(doc, 'Revenue', formatCurr(pnl.revenue, currency), COLORS.accent);
      addRow(doc, 'Cost of Goods Sold', formatCurr(pnl.cogs, currency), COLORS.danger);
      addRow(doc, 'Gross Profit', formatCurr(pnl.grossProfit, currency), COLORS.primary, true);
      addRow(doc, 'Operating Expenses', formatCurr(pnl.operatingExpenses, currency), COLORS.danger);
      addRow(doc, 'Net Income', formatCurr(pnl.netIncome, currency), pnl.netIncome >= 0 ? COLORS.accent : COLORS.danger, true);

      if (pnl.expenseBreakdown.length > 0) {
        doc.moveDown(1);
        doc.fontSize(12).fillColor(COLORS.text).text('Expense Breakdown');
        doc.moveDown(0.3);
        for (const item of pnl.expenseBreakdown.slice(0, 10)) {
          addRow(doc, `  ${item.category}`, formatCurr(item.amount, currency), COLORS.secondary);
        }
      }
    }

    // --- Cash Flow Section ---
    if (sections.cashFlow) {
      doc.addPage();
      sectionHeader(doc, 'Cash Flow Overview');
      const cf = sections.cashFlow;
      addRow(doc, 'Opening Balance', formatCurr(cf.openingBalance, currency), COLORS.secondary);
      addRow(doc, 'Total Inflows', formatCurr(cf.totalInflows, currency), COLORS.accent);
      addRow(doc, 'Total Outflows', formatCurr(cf.totalOutflows, currency), COLORS.danger);
      addRow(doc, 'Net Change', formatCurr(cf.netChange, currency), cf.netChange >= 0 ? COLORS.accent : COLORS.danger, true);
      addRow(doc, 'Closing Balance', formatCurr(cf.closingBalance, currency), COLORS.primary, true);
    }

    // --- AR Aging Section ---
    if (sections.arAging) {
      doc.addPage();
      sectionHeader(doc, 'Accounts Receivable Aging');
      renderAgingSection(doc, sections.arAging, currency);
    }

    // --- AP Aging Section ---
    if (sections.apAging) {
      doc.addPage();
      sectionHeader(doc, 'Accounts Payable Aging');
      renderAgingSection(doc, sections.apAging, currency);
    }

    // --- Top Vendors Section ---
    if (sections.topVendors && sections.topVendors.length > 0) {
      doc.addPage();
      sectionHeader(doc, 'Top Vendors by Spend');
      doc.moveDown(0.5);
      for (const vendor of sections.topVendors.slice(0, 10)) {
        addRow(doc, `${vendor.name} (${vendor.invoiceCount} invoices)`, formatCurr(vendor.totalSpend, currency), COLORS.text);
      }
    } else if (sections.topVendors) {
      doc.addPage();
      sectionHeader(doc, 'Top Vendors by Spend');
      noDataMessage(doc);
    }

    // --- Trends Section ---
    if (sections.trends && sections.trends.length > 0) {
      doc.addPage();
      sectionHeader(doc, 'Monthly Trends');
      doc.moveDown(0.5);
      // Simple table: Month | Revenue | Expenses | Net Income
      doc.fontSize(10).fillColor(COLORS.muted);
      doc.text('Month', 50, doc.y, { width: 100 });
      doc.text('Revenue', 160, doc.y - 12, { width: 120, align: 'right' });
      doc.text('Expenses', 290, doc.y - 12, { width: 120, align: 'right' });
      doc.text('Net Income', 420, doc.y - 12, { width: 120, align: 'right' });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(540, doc.y).stroke(COLORS.border);
      doc.moveDown(0.3);

      for (const trend of sections.trends) {
        const y = doc.y;
        doc.fontSize(10).fillColor(COLORS.text);
        doc.text(trend.month, 50, y, { width: 100 });
        doc.fillColor(COLORS.accent).text(formatCurr(trend.revenue, currency), 160, y, { width: 120, align: 'right' });
        doc.fillColor(COLORS.danger).text(formatCurr(trend.expenses, currency), 290, y, { width: 120, align: 'right' });
        const netColor = trend.netIncome >= 0 ? COLORS.accent : COLORS.danger;
        doc.fillColor(netColor).text(formatCurr(trend.netIncome, currency), 420, y, { width: 120, align: 'right' });
        doc.moveDown(0.5);
      }
    } else if (sections.trends) {
      doc.addPage();
      sectionHeader(doc, 'Monthly Trends');
      noDataMessage(doc);
    }

    doc.end();
  });
}

function sectionHeader(doc: PDFKit.PDFDocument, title: string) {
  doc.fontSize(16).fillColor(COLORS.primary).text(title);
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke(COLORS.primary);
  doc.moveDown(0.5);
}

function addRow(doc: PDFKit.PDFDocument, label: string, value: string, valueColor: string, bold = false) {
  const y = doc.y;
  doc.fontSize(11).fillColor(COLORS.text).text(label, 50, y, { width: 300 });
  doc.fontSize(11).fillColor(valueColor);
  if (bold) {
    doc.font('Helvetica-Bold');
  }
  doc.text(value, 350, y, { width: 195, align: 'right' });
  doc.font('Helvetica');
  doc.moveDown(0.4);
}

function renderAgingSection(doc: PDFKit.PDFDocument, aging: AgingData, currency: string) {
  addRow(doc, 'Current', formatCurr(aging.current, currency), COLORS.accent);
  addRow(doc, '1–30 Days', formatCurr(aging.thirtyDays, currency), COLORS.secondary);
  addRow(doc, '31–60 Days', formatCurr(aging.sixtyDays, currency), aging.sixtyDays > 0 ? '#d97706' : COLORS.secondary);
  addRow(doc, '61–90+ Days', formatCurr(aging.ninetyPlus, currency), aging.ninetyPlus > 0 ? COLORS.danger : COLORS.secondary);
  addRow(doc, 'Total', formatCurr(aging.total, currency), COLORS.primary, true);

  if (aging.items.length > 0) {
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor(COLORS.text).text('Details (Top 10)');
    doc.moveDown(0.3);
    for (const item of aging.items.slice(0, 10)) {
      addRow(doc, `  ${item.name} (${item.aging})`, formatCurr(item.amount, currency), COLORS.secondary);
    }
  }
}

function noDataMessage(doc: PDFKit.PDFDocument) {
  doc.moveDown(1);
  doc.fontSize(12).fillColor(COLORS.muted).text('No data available for this period.', { align: 'center' });
}
