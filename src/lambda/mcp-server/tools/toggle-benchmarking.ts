/**
 * toggle_benchmarking MCP Tool (031-chat-cross-biz-voice)
 *
 * Opts a business in or out of anonymized cross-business benchmarking.
 * RBAC: finance_admin or owner only.
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api.js';
import { Id } from '../../../../convex/_generated/dataModel.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  ToggleBenchmarkingInput,
  ToggleBenchmarkingOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';

// MSIC 2-digit codes to industry labels
const MSIC_GROUPS: Record<string, string> = {
  '01': 'Agriculture',
  '10': 'Food Products',
  '13': 'Textiles',
  '20': 'Chemicals',
  '25': 'Fabricated Metal Products',
  '41': 'Construction of Buildings',
  '45': 'Motor Vehicle Trade',
  '46': 'Wholesale Trade',
  '47': 'Retail Trade',
  '49': 'Land Transport',
  '55': 'Accommodation',
  '56': 'Food & Beverage Service',
  '58': 'Publishing',
  '61': 'Telecommunications',
  '62': 'IT & Computer Services',
  '63': 'Information Services',
  '64': 'Financial Services',
  '66': 'Insurance & Finance Support',
  '68': 'Real Estate',
  '69': 'Legal & Accounting',
  '70': 'Management Consultancy',
  '71': 'Architecture & Engineering',
  '72': 'Scientific R&D',
  '73': 'Advertising & Market Research',
  '74': 'Other Professional Services',
  '77': 'Rental & Leasing',
  '82': 'Office & Business Support',
  '85': 'Education',
  '86': 'Healthcare',
  '96': 'Other Personal Services',
};

let convexClient: ConvexHttpClient | null = null;

function getConvexClient(): ConvexHttpClient {
  if (!convexClient) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) throw new Error('NEXT_PUBLIC_CONVEX_URL is required');
    convexClient = new ConvexHttpClient(url);
  }
  return convexClient;
}

export async function toggleBenchmarking(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<ToggleBenchmarkingOutput | MCPErrorResponse> {
  const input = args as ToggleBenchmarkingInput;

  // RBAC check
  if (!authContext) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Authentication required' };
  }

  const userCtx = (args._userContext as { userId?: string; businessId?: string; role?: string }) || {};
  const userRole = authContext.userRole || userCtx.role || 'employee';
  if (!['finance_admin', 'owner'].includes(userRole)) {
    return {
      error: true,
      code: 'UNAUTHORIZED',
      message: 'Only finance admins and business owners can manage benchmarking settings.',
    };
  }

  const businessId = authContext.businessId || userCtx.businessId;
  if (!businessId) {
    return { error: true, code: 'INVALID_INPUT', message: 'Business context required' };
  }

  // Get business MSIC code for industry grouping
  const convex = getConvexClient();

  // Fetch the business to get msicCode
  let msicCode: string | undefined;
  try {
    const business = await convex.query(api.functions.businesses.getById, {
      id: businessId,
    });
    msicCode = business?.msicCode;
  } catch {
    // If we can't get the business, use a generic group
  }

  // Extract 2-digit industry group
  const industryGroup = msicCode ? msicCode.substring(0, 2) : '99';
  const industryLabel = MSIC_GROUPS[industryGroup] || 'Other Industries';

  // Toggle opt-in via Convex
  const result = await convex.mutation(api.functions.benchmarking.toggleOptIn, {
    businessId: businessId as Id<"businesses">,
    userId: authContext.userId || 'unknown',
    action: input.action,
    industryGroup,
    industryLabel,
  });

  const actionLabel = input.action === 'opt_in' ? 'opted in to' : 'opted out of';

  return {
    success: true,
    is_active: result.isActive,
    industry_group: `${industryLabel} (${industryGroup})`,
    message: `Successfully ${actionLabel} anonymized benchmarking. Your business is categorized under "${industryLabel}".${
      input.action === 'opt_in'
        ? ' Your anonymized financial metrics will be included in industry comparisons.'
        : ' Your data has been removed from future industry aggregations.'
    }`,
  };
}
