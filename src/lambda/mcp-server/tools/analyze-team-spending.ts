/**
 * analyze_team_spending MCP Tool Implementation
 *
 * Analyzes team spending patterns across a manager's direct reports.
 * Returns employee rankings, category/vendor breakdowns, and optional trends.
 *
 * Authorization: Requires manager/finance_admin/owner role.
 * Data source: Convex getMcpTeamExpenses query.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import { validateBusinessAccess, getDateRange, type AuthContext } from '../lib/auth.js';
import type {
  AnalyzeTeamSpendingInput,
  AnalyzeTeamSpendingOutput,
  TeamEmployeeSummary,
  TeamCategoryBreakdown,
  TeamVendorBreakdown,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';

interface TeamExpenseEntry {
  _id: string;
  userId: string;
  userName: string;
  businessId: string;
  transactionType: string;
  transactionDate?: string;
  category?: string;
  categoryName?: string;
  vendorName?: string;
  description?: string;
  homeCurrencyAmount?: number;
  homeCurrency?: string;
}

/**
 * Execute analyze_team_spending tool
 */
export async function analyzeTeamSpending(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<AnalyzeTeamSpendingOutput | MCPErrorResponse> {
  const input = args as AnalyzeTeamSpendingInput;

  // Resolve business ID from auth context or args
  let businessId: string;

  if (authContext?.businessId) {
    businessId = authContext.businessId;
  } else {
    const authResult = validateBusinessAccess(input.business_id);
    if (!authResult.authorized) {
      return {
        error: true,
        code: authResult.error!.code as MCPErrorResponse['code'],
        message: authResult.error!.message,
      };
    }
    businessId = authResult.businessId!;
  }

  // Validate manager_user_id is provided
  if (!input.manager_user_id) {
    return {
      error: true,
      code: 'INVALID_INPUT',
      message: 'manager_user_id is required for authorization',
    };
  }

  const dateRange = getDateRange(input.date_range);

  try {
    const convex = getConvexClient();

    // Query team expenses via Convex
    const entries = await convex.query<TeamExpenseEntry[]>(
      'functions/financialIntelligence:getMcpTeamExpenses',
      {
        businessId,
        managerUserId: input.manager_user_id,
        employeeIds: input.employee_filter,
        startDate: dateRange.start,
        endDate: dateRange.end,
        categoryFilter: input.category_filter,
      }
    );

    if (!entries || entries.length === 0) {
      return {
        error: true,
        code: 'INSUFFICIENT_DATA',
        message: 'No team expense data found for the selected period',
        details: { businessId, dateRange },
      };
    }

    // Apply vendor filter if provided (case-insensitive partial match)
    let filteredEntries = entries;
    if (input.vendor_filter && input.vendor_filter.length > 0) {
      const vendorFilters = input.vendor_filter.map(v => v.toLowerCase());
      filteredEntries = entries.filter(e =>
        e.vendorName && vendorFilters.some(vf => e.vendorName!.toLowerCase().includes(vf))
      );
    }

    // Determine currency from first entry
    const currency = filteredEntries[0]?.homeCurrency || 'SGD';

    // Compute employee summaries
    const employeeMap = new Map<string, {
      userId: string;
      name: string;
      total: number;
      count: number;
      categories: Map<string, number>;
      vendors: Map<string, number>;
    }>();

    let grandTotal = 0;

    for (const entry of filteredEntries) {
      const amount = Math.abs(entry.homeCurrencyAmount || 0);
      grandTotal += amount;

      let emp = employeeMap.get(entry.userId);
      if (!emp) {
        emp = {
          userId: entry.userId,
          name: entry.userName || 'Unknown',
          total: 0,
          count: 0,
          categories: new Map(),
          vendors: new Map(),
        };
        employeeMap.set(entry.userId, emp);
      }

      emp.total += amount;
      emp.count += 1;

      const cat = entry.category || 'uncategorized';
      emp.categories.set(cat, (emp.categories.get(cat) || 0) + amount);

      const vendor = entry.vendorName || 'Unknown';
      emp.vendors.set(vendor, (emp.vendors.get(vendor) || 0) + amount);
    }

    // Build employee rankings
    const employeeRankings: TeamEmployeeSummary[] = Array.from(employeeMap.values())
      .sort((a, b) => b.total - a.total)
      .map(emp => ({
        user_id: emp.userId,
        employee_name: emp.name,
        total_spend: Math.round(emp.total * 100) / 100,
        transaction_count: emp.count,
        spend_percentage: grandTotal > 0 ? Math.round((emp.total / grandTotal) * 10000) / 100 : 0,
        top_categories: Array.from(emp.categories.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 })),
        top_vendors: Array.from(emp.vendors.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([vendor, amount]) => ({ vendor, amount: Math.round(amount * 100) / 100 })),
      }));

    // Build category breakdown
    const categoryMap = new Map<string, { name: string; total: number; count: number }>();
    for (const entry of filteredEntries) {
      const cat = entry.category || 'uncategorized';
      const catName = entry.categoryName || cat;
      const existing = categoryMap.get(cat) || { name: catName, total: 0, count: 0 };
      existing.total += Math.abs(entry.homeCurrencyAmount || 0);
      existing.count += 1;
      categoryMap.set(cat, existing);
    }

    const categoryBreakdown: TeamCategoryBreakdown[] = Array.from(categoryMap.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .map(([category, data]) => ({
        category,
        category_name: data.name,
        total_amount: Math.round(data.total * 100) / 100,
        transaction_count: data.count,
        percentage: grandTotal > 0 ? Math.round((data.total / grandTotal) * 10000) / 100 : 0,
      }));

    // Build vendor breakdown
    const vendorMap = new Map<string, { total: number; count: number; employees: Set<string> }>();
    for (const entry of filteredEntries) {
      const vendor = entry.vendorName || 'Unknown';
      const existing = vendorMap.get(vendor) || { total: 0, count: 0, employees: new Set<string>() };
      existing.total += Math.abs(entry.homeCurrencyAmount || 0);
      existing.count += 1;
      existing.employees.add(entry.userId);
      vendorMap.set(vendor, existing);
    }

    const vendorBreakdown: TeamVendorBreakdown[] = Array.from(vendorMap.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 20) // Top 20 vendors
      .map(([vendor, data]) => ({
        vendor_name: vendor,
        total_amount: Math.round(data.total * 100) / 100,
        transaction_count: data.count,
        percentage: grandTotal > 0 ? Math.round((data.total / grandTotal) * 10000) / 100 : 0,
        employee_count: data.employees.size,
      }));

    // Build response
    const result: AnalyzeTeamSpendingOutput = {
      team_summary: {
        total_spend: Math.round(grandTotal * 100) / 100,
        currency,
        employee_count: employeeMap.size,
        transaction_count: filteredEntries.length,
        date_range: dateRange,
        average_per_employee: employeeMap.size > 0
          ? Math.round((grandTotal / employeeMap.size) * 100) / 100
          : 0,
      },
      employee_rankings: input.include_rankings !== false ? employeeRankings : [],
      category_breakdown: categoryBreakdown,
      vendor_breakdown: vendorBreakdown,
    };

    // Optional: Period-over-period trend comparison
    if (input.include_trends) {
      const currentStart = new Date(dateRange.start);
      const currentEnd = new Date(dateRange.end);
      const periodDays = Math.ceil((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24));

      const previousEnd = new Date(currentStart);
      previousEnd.setDate(previousEnd.getDate() - 1);
      const previousStart = new Date(previousEnd);
      previousStart.setDate(previousStart.getDate() - periodDays);

      const previousDateRange = {
        start: previousStart.toISOString().split('T')[0],
        end: previousEnd.toISOString().split('T')[0],
      };

      try {
        const previousEntries = await convex.query<TeamExpenseEntry[]>(
          'functions/financialIntelligence:getMcpTeamExpenses',
          {
            businessId,
            managerUserId: input.manager_user_id,
            employeeIds: input.employee_filter,
            startDate: previousDateRange.start,
            endDate: previousDateRange.end,
            categoryFilter: input.category_filter,
          }
        );

        const previousTotal = (previousEntries || []).reduce(
          (sum, e) => sum + Math.abs(e.homeCurrencyAmount || 0), 0
        );

        const changePercentage = previousTotal > 0
          ? Math.round(((grandTotal - previousTotal) / previousTotal) * 10000) / 100
          : 0;

        result.trends = {
          current_period_total: Math.round(grandTotal * 100) / 100,
          previous_period_total: Math.round(previousTotal * 100) / 100,
          change_percentage: Math.abs(changePercentage),
          change_direction: changePercentage > 1 ? 'increase'
            : changePercentage < -1 ? 'decrease'
            : 'stable',
        };
      } catch (trendError) {
        // Trends are optional — don't fail the whole response
        console.warn('[analyze_team_spending] Failed to compute trends:', trendError);
      }
    }

    return result;
  } catch (error) {
    console.error('[analyze_team_spending] Error:', error);

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
