/**
 * get_sales_invoices MCP Tool Implementation
 *
 * Retrieves outgoing sales invoices (AR).
 * Wraps Convex functions/salesInvoices:list.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  GetSalesInvoicesInput,
  GetSalesInvoicesOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

export async function getSalesInvoices(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<GetSalesInvoicesOutput | MCPErrorResponse> {
  const input = args as GetSalesInvoicesInput;

  const businessId = authContext?.businessId || (input.business_id as string);
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  try {
    const convex = getConvexClient();

    const result = await convex.query<any>('functions/salesInvoices:list', {
      businessId,
      status: input.status,
      limit: input.limit,
    });

    if (!result || !result.invoices || result.invoices.length === 0) {
      return {
        invoices: [],
        totalCount: 0,
        summary: { totalOutstanding: 0, totalOverdue: 0 },
      };
    }

    const invoices = result.invoices.map((inv: any) => ({
      clientName: inv.clientName || inv.client_name || 'Customer',
      invoiceNumber: inv.invoiceNumber || inv.invoice_number || '',
      amount: inv.total ?? inv.amount ?? 0,
      currency: inv.currency ?? '',
      status: inv.status,
      dueDate: inv.dueDate ?? inv.due_date,
      invoiceDate: inv.invoiceDate ?? inv.invoice_date,
    }));

    return {
      invoices,
      totalCount: result.totalCount || invoices.length,
      summary: result.summary ? {
        totalOutstanding: result.summary.totalOutstanding ?? 0,
        totalOverdue: result.summary.totalOverdue ?? 0,
      } : undefined,
    };
  } catch (error) {
    logger.error('get_sales_invoices_error', {
      businessId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }
    return { error: true, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
