/**
 * get_ap_aging MCP Tool Implementation
 *
 * Aggregates purchase invoice data: outstanding vendor balances,
 * aging buckets, and upcoming payment deadlines.
 * Wraps Convex functions/financialIntelligence:getAPAging.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  GetAPAgingInput,
  GetAPAgingOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

export async function getAPAging(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<GetAPAgingOutput | MCPErrorResponse> {
  const input = args as GetAPAgingInput;

  const businessId = authContext?.businessId || (input.business_id as string);
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  try {
    const convex = getConvexClient();

    const result = await convex.query<any>('functions/financialIntelligence:getAPAging', {
      businessId,
      startDate: input.start_date,
      endDate: input.end_date,
    });

    if ('error' in result && result.error) {
      return { error: true, code: 'CONVEX_ERROR', message: result.error };
    }

    return {
      totalOutstanding: result.totalOutstanding,
      totalOverdue: result.totalOverdue,
      currency: result.currency || 'MYR',
      agingBuckets: result.agingBuckets || [],
      vendorBreakdown: (result.vendorBreakdown || []).slice(0, 10).map((v: any) => ({
        vendorName: v.vendorName,
        outstanding: v.outstanding,
      })),
      upcomingDues: (result.upcomingDues || []).slice(0, 10).map((d: any) => ({
        vendorName: d.vendorName,
        invoiceNumber: d.invoiceNumber,
        amount: d.amount,
        dueDate: d.dueDate,
      })),
    };
  } catch (error) {
    logger.error('get_ap_aging_error', {
      businessId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }
    return { error: true, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
