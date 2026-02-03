/**
 * detect_anomalies MCP Tool Implementation
 *
 * Detects unusual financial transactions using statistical outlier analysis.
 * Wraps the existing Convex insights:detectAnomalies algorithm.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import { validateBusinessAccess, getDateRange, sensitivityToZScore, type AuthContext } from '../lib/auth.js';
import type {
  DetectAnomaliesInput,
  DetectAnomaliesOutput,
  AnomalyItem,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';

interface CategoryStats {
  category: string;
  count: number;
  mean: number;
  stdDev: number;
}

interface AccountingEntry {
  _id: string;
  businessId: string;
  transactionType: string;
  transactionDate?: string;
  category?: string;
  categoryName?: string;
  vendorName?: string;
  description?: string;
  originalAmount?: number;
  homeCurrencyAmount?: number;
  currency?: string;
  deletedAt?: number;
}

/**
 * Execute detect_anomalies tool
 *
 * @param args - Tool arguments (may include business_id for backward compatibility)
 * @param authContext - Authentication context from API key (preferred source of businessId)
 */
export async function detectAnomalies(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<DetectAnomaliesOutput | MCPErrorResponse> {
  // Type-safe input parsing
  const input = args as DetectAnomaliesInput;

  // Use businessId from auth context if available (API key auth)
  // Fall back to args.business_id for backward compatibility
  let businessId: string;

  if (authContext?.businessId) {
    // API key authenticated - use business from auth context
    businessId = authContext.businessId;
  } else {
    // Legacy mode - validate business_id from args
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
  const dateRange = getDateRange(input.date_range);
  const sensitivity = input.sensitivity || 'medium';
  const zScoreThreshold = sensitivityToZScore(sensitivity);

  try {
    const convex = getConvexClient();

    // Query accounting entries for the business
    const entries = await convex.query<AccountingEntry[]>(
      'functions/financialIntelligence:getMcpAccountingEntries',
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

    // Filter to expenses within date range
    const expenses = entries.filter(e =>
      !e.deletedAt &&
      e.transactionType === 'Expense' &&
      e.transactionDate &&
      e.transactionDate >= dateRange.start &&
      e.transactionDate <= dateRange.end &&
      (!input.category_filter || input.category_filter.includes(e.category || ''))
    );

    if (expenses.length < 5) {
      return {
        error: true,
        code: 'INSUFFICIENT_DATA',
        message: 'Not enough transactions in the selected date range (minimum 5 required)',
        details: {
          transactionsFound: expenses.length,
          minimumRequired: 5,
          suggestion: 'Expand the date range or wait for more transaction data',
        },
      };
    }

    // Calculate category statistics from historical data (last 180 days)
    const historicalCutoff = new Date();
    historicalCutoff.setDate(historicalCutoff.getDate() - 180);
    const historicalCutoffStr = historicalCutoff.toISOString().split('T')[0];

    const historicalExpenses = entries.filter(e =>
      !e.deletedAt &&
      e.transactionType === 'Expense' &&
      e.transactionDate &&
      e.transactionDate >= historicalCutoffStr
    );

    // Group by category and calculate statistics
    const byCategory: Record<string, number[]> = {};
    for (const txn of historicalExpenses) {
      const category = txn.category || 'uncategorized';
      const amount = Math.abs(txn.homeCurrencyAmount || txn.originalAmount || 0);
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(amount);
    }

    // Calculate mean and stdDev per category
    const categoryStats: Record<string, CategoryStats> = {};
    for (const [category, amounts] of Object.entries(byCategory)) {
      if (amounts.length < 3) continue; // Need minimum data points

      const mean = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
      const squaredDiffs = amounts.map(a => Math.pow(a - mean, 2));
      const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / amounts.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev > 0) {
        categoryStats[category] = {
          category,
          count: amounts.length,
          mean,
          stdDev,
        };
      }
    }

    // Find anomalies in the target date range
    const anomalies: AnomalyItem[] = [];
    const categoriesAnalyzed = new Set<string>();

    for (const txn of expenses) {
      const category = txn.category || 'uncategorized';
      const stats = categoryStats[category];
      if (!stats) continue;

      categoriesAnalyzed.add(category);
      const amount = Math.abs(txn.homeCurrencyAmount || txn.originalAmount || 0);
      const zScore = (amount - stats.mean) / stats.stdDev;

      if (zScore > zScoreThreshold) {
        // Determine severity based on z-score
        const severity: 'medium' | 'high' | 'critical' =
          zScore > 3 ? 'critical' :
          zScore > 2.5 ? 'high' : 'medium';

        anomalies.push({
          transaction_id: txn._id,
          description: txn.description || 'Unknown transaction',
          amount,
          currency: txn.currency || 'SGD',
          category,
          category_name: txn.categoryName || category,
          transaction_date: txn.transactionDate || '',
          vendor_name: txn.vendorName,
          z_score: Math.round(zScore * 100) / 100,
          category_mean: Math.round(stats.mean * 100) / 100,
          category_stddev: Math.round(stats.stdDev * 100) / 100,
          severity,
          explanation: `This expense is ${zScore.toFixed(1)} standard deviations above your typical ${category} spending (avg ${stats.mean.toLocaleString()})`,
        });
      }
    }

    // Sort by severity and z-score
    anomalies.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.z_score - a.z_score;
    });

    return {
      anomalies,
      summary: {
        total_transactions_analyzed: expenses.length,
        anomalies_found: anomalies.length,
        date_range: dateRange,
        sensitivity_used: sensitivity,
        categories_analyzed: Array.from(categoriesAnalyzed),
      },
    };
  } catch (error) {
    console.error('[detect_anomalies] Error:', error);

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
