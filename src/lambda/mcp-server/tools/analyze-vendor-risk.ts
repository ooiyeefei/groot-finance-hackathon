/**
 * analyze_vendor_risk MCP Tool Implementation
 *
 * Analyzes vendor concentration, spending changes, and risk factors.
 * Wraps the existing Convex insights:vendorIntelligence algorithms.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import { validateBusinessAccess } from '../lib/auth.js';
import type {
  AnalyzeVendorRiskInput,
  AnalyzeVendorRiskOutput,
  VendorProfile,
  ConcentrationRisk,
  SpendingChange,
  MCPErrorResponse,
  Severity,
} from '../contracts/mcp-tools.js';

interface AccountingEntry {
  _id: string;
  businessId: string;
  transactionType: string;
  transactionDate?: string;
  category?: string;
  categoryName?: string;
  vendorId?: string;
  vendorName?: string;
  originalAmount?: number;
  homeCurrencyAmount?: number;
  deletedAt?: number;
}

/**
 * Execute analyze_vendor_risk tool
 */
export async function analyzeVendorRisk(
  args: Record<string, unknown>
): Promise<AnalyzeVendorRiskOutput | MCPErrorResponse> {
  // Type-safe input parsing
  const input = args as AnalyzeVendorRiskInput;

  // Validate authorization
  const authResult = validateBusinessAccess(input.business_id);
  if (!authResult.authorized) {
    return {
      error: true,
      code: authResult.error!.code as MCPErrorResponse['code'],
      message: authResult.error!.message,
    };
  }

  const businessId = authResult.businessId!;
  const analysisPeriodDays = input.analysis_period_days || 90;
  const includeConcentration = input.include_concentration !== false;
  const includeSpendingChanges = input.include_spending_changes !== false;

  try {
    const convex = getConvexClient();

    // Query accounting entries for the business
    const entries = await convex.query<AccountingEntry[]>(
      'functions/system:getAccountingEntriesForBusiness',
      { businessId }
    );

    if (!entries || entries.length === 0) {
      return {
        error: true,
        code: 'INSUFFICIENT_DATA',
        message: 'No transactions found for this business',
        details: { businessId },
      };
    }

    // Calculate date ranges
    const today = new Date();
    const analysisCutoff = new Date();
    analysisCutoff.setDate(today.getDate() - analysisPeriodDays);
    const analysisCutoffStr = analysisCutoff.toISOString().split('T')[0];

    // For comparison, use the previous period of the same length
    const previousPeriodEnd = new Date(analysisCutoff);
    previousPeriodEnd.setDate(previousPeriodEnd.getDate() - 1);
    const previousPeriodStart = new Date(previousPeriodEnd);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - analysisPeriodDays);
    const previousPeriodEndStr = previousPeriodEnd.toISOString().split('T')[0];
    const previousPeriodStartStr = previousPeriodStart.toISOString().split('T')[0];

    // Filter to expenses with vendor info
    const currentPeriodExpenses = entries.filter(e =>
      !e.deletedAt &&
      e.transactionType === 'Expense' &&
      e.transactionDate &&
      e.transactionDate >= analysisCutoffStr &&
      (e.vendorId || e.vendorName) &&
      (!input.vendor_filter || input.vendor_filter.includes(e.vendorName || ''))
    );

    const previousPeriodExpenses = entries.filter(e =>
      !e.deletedAt &&
      e.transactionType === 'Expense' &&
      e.transactionDate &&
      e.transactionDate >= previousPeriodStartStr &&
      e.transactionDate <= previousPeriodEndStr &&
      (e.vendorId || e.vendorName)
    );

    if (currentPeriodExpenses.length < 3) {
      return {
        error: true,
        code: 'INSUFFICIENT_DATA',
        message: 'Not enough vendor transactions in the analysis period',
        details: {
          transactionsFound: currentPeriodExpenses.length,
          minimumRequired: 3,
        },
      };
    }

    // Aggregate vendor data for current period
    const vendorData: Record<string, {
      vendorName: string;
      totalSpend: number;
      transactionCount: number;
      categories: Set<string>;
      lastDate: string;
    }> = {};

    let totalSpend = 0;

    for (const txn of currentPeriodExpenses) {
      const vendorKey = txn.vendorId || txn.vendorName || 'unknown';
      const vendorName = txn.vendorName || 'Unknown Vendor';
      const amount = Math.abs(txn.homeCurrencyAmount || txn.originalAmount || 0);

      totalSpend += amount;

      if (!vendorData[vendorKey]) {
        vendorData[vendorKey] = {
          vendorName,
          totalSpend: 0,
          transactionCount: 0,
          categories: new Set(),
          lastDate: '',
        };
      }

      vendorData[vendorKey].totalSpend += amount;
      vendorData[vendorKey].transactionCount++;
      if (txn.category) {
        vendorData[vendorKey].categories.add(txn.category);
      }
      if (txn.transactionDate && txn.transactionDate > vendorData[vendorKey].lastDate) {
        vendorData[vendorKey].lastDate = txn.transactionDate;
      }
    }

    // Build vendor profiles
    const vendors: VendorProfile[] = [];
    let highRiskVendors = 0;

    for (const [vendorKey, data] of Object.entries(vendorData)) {
      const spendPercentage = (data.totalSpend / totalSpend) * 100;

      // Calculate risk score
      let riskScore = 0;
      const riskFactors: string[] = [];

      // High concentration = higher risk
      if (spendPercentage > 40) {
        riskScore += 40;
        riskFactors.push('High spend concentration');
      } else if (spendPercentage > 20) {
        riskScore += 20;
        riskFactors.push('Significant spend concentration');
      }

      // Single category dependency
      if (data.categories.size === 1 && data.transactionCount > 3) {
        riskScore += 15;
        riskFactors.push('Single category dependency');
      }

      // Low transaction diversity (large but infrequent payments)
      if (data.totalSpend > 10000 && data.transactionCount < 3) {
        riskScore += 15;
        riskFactors.push('Large infrequent payments');
      }

      if (riskScore >= 50) {
        highRiskVendors++;
      }

      // Determine spending trend
      const previousVendorSpend = previousPeriodExpenses
        .filter(e => (e.vendorId || e.vendorName) === vendorKey)
        .reduce((sum, e) => sum + Math.abs(e.homeCurrencyAmount || e.originalAmount || 0), 0);

      let spendingTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
      let trendPercentage: number | undefined;

      if (previousVendorSpend > 0) {
        const change = ((data.totalSpend - previousVendorSpend) / previousVendorSpend) * 100;
        trendPercentage = Math.round(change);

        if (change > 20) {
          spendingTrend = 'increasing';
        } else if (change < -20) {
          spendingTrend = 'decreasing';
        }
      }

      vendors.push({
        vendor_name: data.vendorName,
        total_spend: Math.round(data.totalSpend),
        transaction_count: data.transactionCount,
        spend_percentage: Math.round(spendPercentage * 10) / 10,
        categories: Array.from(data.categories),
        risk_score: riskScore,
        risk_factors: riskFactors,
        spending_trend: spendingTrend,
        trend_percentage: trendPercentage,
      });
    }

    // Sort by spend percentage descending
    vendors.sort((a, b) => b.spend_percentage - a.spend_percentage);

    // Analyze concentration risks by category
    const concentrationRisks: ConcentrationRisk[] = [];

    if (includeConcentration) {
      // Group by category
      const byCategory: Record<string, {
        total: number;
        byVendor: Record<string, { name: string; amount: number }>;
      }> = {};

      for (const txn of currentPeriodExpenses) {
        const category = txn.category || 'uncategorized';
        const categoryName = txn.categoryName || category;
        const vendorKey = txn.vendorId || txn.vendorName || 'unknown';
        const vendorName = txn.vendorName || 'Unknown Vendor';
        const amount = Math.abs(txn.homeCurrencyAmount || txn.originalAmount || 0);

        if (!byCategory[category]) {
          byCategory[category] = { total: 0, byVendor: {} };
        }
        byCategory[category].total += amount;

        if (!byCategory[category].byVendor[vendorKey]) {
          byCategory[category].byVendor[vendorKey] = { name: vendorName, amount: 0 };
        }
        byCategory[category].byVendor[vendorKey].amount += amount;
      }

      // Find concentration risks (>50% of category from single vendor)
      for (const [category, data] of Object.entries(byCategory)) {
        if (data.total < 1000) continue; // Skip small categories

        for (const [, vendorInfo] of Object.entries(data.byVendor)) {
          const percentage = (vendorInfo.amount / data.total) * 100;

          if (percentage >= 50) {
            const severity: Severity =
              percentage > 80 ? 'critical' :
              percentage > 65 ? 'high' : 'medium';

            concentrationRisks.push({
              category,
              category_name: category, // Would be better to look up actual name
              vendor_name: vendorInfo.name,
              concentration_percentage: Math.round(percentage),
              severity,
              message: `${vendorInfo.name} accounts for ${Math.round(percentage)}% of ${category} spending`,
              recommendation: `Consider diversifying ${category} vendors to reduce dependency risk`,
            });
          }
        }
      }
    }

    // Analyze spending changes
    const spendingChanges: SpendingChange[] = [];

    if (includeSpendingChanges) {
      // Build previous period vendor totals
      const previousVendorTotals: Record<string, { name: string; amount: number }> = {};

      for (const txn of previousPeriodExpenses) {
        const vendorKey = txn.vendorId || txn.vendorName || 'unknown';
        const vendorName = txn.vendorName || 'Unknown Vendor';
        const amount = Math.abs(txn.homeCurrencyAmount || txn.originalAmount || 0);

        if (!previousVendorTotals[vendorKey]) {
          previousVendorTotals[vendorKey] = { name: vendorName, amount: 0 };
        }
        previousVendorTotals[vendorKey].amount += amount;
      }

      // Compare vendors present in both periods
      for (const [vendorKey, currentData] of Object.entries(vendorData)) {
        const previousData = previousVendorTotals[vendorKey];
        if (!previousData || previousData.amount < 100) continue;

        const changePercent = ((currentData.totalSpend - previousData.amount) / previousData.amount) * 100;
        const absoluteChange = Math.abs(changePercent);

        if (absoluteChange >= 30) {
          const significance: 'normal' | 'notable' | 'significant' =
            absoluteChange > 75 ? 'significant' :
            absoluteChange > 50 ? 'notable' : 'normal';

          spendingChanges.push({
            vendor_name: currentData.vendorName,
            previous_period_spend: Math.round(previousData.amount),
            current_period_spend: Math.round(currentData.totalSpend),
            change_percentage: Math.round(changePercent),
            change_direction: changePercent > 0 ? 'increase' : 'decrease',
            significance,
          });
        }
      }

      // Sort by absolute change percentage
      spendingChanges.sort((a, b) => Math.abs(b.change_percentage) - Math.abs(a.change_percentage));
    }

    return {
      vendors: vendors.slice(0, 20), // Top 20 vendors
      concentration_risks: concentrationRisks,
      spending_changes: spendingChanges.slice(0, 10), // Top 10 changes
      summary: {
        total_vendors: Object.keys(vendorData).length,
        total_spend: Math.round(totalSpend),
        high_risk_vendors: highRiskVendors,
        concentration_risks_found: concentrationRisks.length,
        significant_spending_changes: spendingChanges.filter(s => s.significance === 'significant').length,
        analysis_period: {
          start: analysisCutoffStr,
          end: today.toISOString().split('T')[0],
        },
      },
    };
  } catch (error) {
    console.error('[analyze_vendor_risk] Error:', error);

    if (error instanceof ConvexError) {
      return {
        error: true,
        code: 'CONVEX_ERROR',
        message: error.message,
      };
    }

    return {
      error: true,
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
