/**
 * get_ar_summary MCP Tool Implementation
 *
 * Aggregates sales invoice data: total revenue, outstanding balances,
 * aging buckets, and customer-level breakdown.
 * Wraps Convex functions/financialIntelligence:getARSummary.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  GetARSummaryInput,
  GetARSummaryOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

export async function getARSummary(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<GetARSummaryOutput | MCPErrorResponse> {
  const input = args as GetARSummaryInput;

  const businessId = authContext?.businessId || (input.business_id as string);
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  try {
    const convex = getConvexClient();

    const result = await convex.query<any>('functions/financialIntelligence:getARSummary', {
      businessId,
      startDate: input.start_date,
      endDate: input.end_date,
    });

    if ('error' in result && result.error) {
      return { error: true, code: 'CONVEX_ERROR', message: result.error };
    }

    return {
      totalRevenue: result.totalRevenue,
      totalOutstanding: result.totalOutstanding,
      totalOverdue: result.totalOverdue,
      invoiceCount: result.invoiceCount,
      totalInvoiceCount: result.totalInvoiceCount,
      currency: result.currency || 'MYR',
      statusBreakdown: result.statusBreakdown || [],
      agingBuckets: result.agingBuckets || [],
      topCustomers: (result.topCustomers || []).slice(0, 5).map((c: any) => ({
        clientName: c.clientName,
        outstanding: c.outstanding,
        overdueDays: c.overdueDays || 0,
      })),
    };
  } catch (error) {
    logger.error('get_ar_summary_error', {
      businessId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }
    return { error: true, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
