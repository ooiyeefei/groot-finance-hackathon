/**
 * get_vendors MCP Tool Implementation
 *
 * Returns deduplicated list of vendor names from AP invoices.
 * Wraps Convex functions/journalEntries:getUniqueVendors.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  GetVendorsInput,
  GetVendorsOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

export async function getVendors(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<GetVendorsOutput | MCPErrorResponse> {
  const input = args as GetVendorsInput;

  const businessId = authContext?.businessId || (input.business_id as string);
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  try {
    const convex = getConvexClient();

    const result = await convex.query<any>('functions/journalEntries:getUniqueVendors', {
      businessId,
      sourceDocumentType: input.source_document_type || 'invoice',
    });

    if (!result || result.totalCount === 0) {
      return {
        vendors: [],
        totalCount: 0,
      };
    }

    return {
      vendors: result.vendors,
      totalCount: result.totalCount,
    };
  } catch (error) {
    logger.error('get_vendors_error', {
      businessId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }
    return { error: true, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
