/**
 * get_invoices MCP Tool Implementation
 *
 * Retrieves OCR-processed AP invoices with optional search filters.
 * Wraps Convex functions/invoices:searchForAI and getCompletedForAI.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  GetInvoicesInput,
  GetInvoicesOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

export async function getInvoices(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<GetInvoicesOutput | MCPErrorResponse> {
  const input = args as GetInvoicesInput;

  const businessId = authContext?.businessId || (input.business_id as string);
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  try {
    const convex = getConvexClient();

    const hasFilters = input.vendor_name || input.invoice_number ||
      input.start_date || input.end_date ||
      input.min_amount !== undefined || input.max_amount !== undefined;

    let result: any;

    if (hasFilters) {
      result = await convex.query('functions/invoices:searchForAI', {
        businessId,
        vendorName: input.vendor_name,
        invoiceNumber: input.invoice_number,
        startDate: input.start_date,
        endDate: input.end_date,
        minAmount: input.min_amount,
        maxAmount: input.max_amount,
        limit: input.limit,
      });
    } else {
      result = await convex.query('functions/invoices:getCompletedForAI', {
        businessId,
        limit: input.limit,
      });
    }

    if (!result || !result.invoices || result.invoices.length === 0) {
      return {
        invoices: [],
        totalCount: 0,
      };
    }

    const invoices = result.invoices.map((inv: any) => ({
      _id: inv._id,
      vendorName: inv.vendorName,
      invoiceNumber: inv.invoiceNumber || null,
      invoiceDate: inv.invoiceDate || null,
      amount: inv.amount,
      currency: inv.currency,
      isPosted: inv.isPosted,
      paymentStatus: inv.paymentStatus || (inv.isPosted ? 'posted' : 'pending'),
      confidenceScore: inv.confidenceScore ?? 0,
      lineItems: (inv.lineItems || []).map((item: any) => ({
        description: item.description ?? item.item_description ?? 'Item',
        quantity: item.quantity ?? 1,
        unitPrice: item.unitPrice ?? item.unit_price ?? 0,
        totalAmount: item.totalAmount ?? item.total_amount ??
          Math.round((item.unit_price ?? 0) * (item.quantity ?? 1) * 100) / 100,
      })),
    }));

    return {
      invoices,
      totalCount: result.totalCount || invoices.length,
      summary: result.summary,
    };
  } catch (error) {
    logger.error('get_invoices_error', {
      businessId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }
    return { error: true, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
