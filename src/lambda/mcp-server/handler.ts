/**
 * MCP Server Lambda Handler
 *
 * Entry point for the Groot Finance MCP Server running on AWS Lambda.
 * Implements JSON-RPC 2.0 over HTTP (stateless mode) with API key authentication.
 *
 * Category 3 MCP: Domain intelligence computed server-side, not by the LLM.
 *
 * Build timestamp: 2026-01-29T17:55:00Z - Using financialIntelligence module for auth
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  JSON_RPC_ERROR_CODES,
  SERVER_INFO,
  SERVER_CAPABILITIES,
  PROTOCOL_VERSION,
  createErrorResponse,
  createSuccessResponse,
  createToolResult,
} from './contracts/mcp-protocol.js';
import { MCP_TOOLS } from './contracts/mcp-tools.js';
import { detectAnomalies } from './tools/detect-anomalies.js';
import { forecastCashFlow } from './tools/forecast-cash-flow.js';
import { analyzeVendorRisk } from './tools/analyze-vendor-risk.js';
import { createProposal } from './tools/create-proposal.js';
import { confirmProposal } from './tools/confirm-proposal.js';
import { cancelProposal } from './tools/cancel-proposal.js';
import { analyzeTeamSpending } from './tools/analyze-team-spending.js';
import { generateReportPdf } from './tools/generate-report-pdf.js';
import { scheduleReport } from './tools/schedule-report.js';
import { runBankReconciliation } from './tools/run-bank-recon.js';
import { acceptReconMatch } from './tools/accept-recon-match.js';
import { showReconStatus } from './tools/show-recon-status.js';
import { sendEmailReport } from './tools/send-email-report.js';
import { compareToIndustry } from './tools/compare-to-industry.js';
import { toggleBenchmarking } from './tools/toggle-benchmarking.js';
// Finance/AP/AR batch (032-mcp-first)
import { getInvoices } from './tools/get-invoices.js';
import { getSalesInvoices } from './tools/get-sales-invoices.js';
import { getTransactions } from './tools/get-transactions.js';
import { getVendors } from './tools/get-vendors.js';
import { searchDocuments } from './tools/search-documents.js';
import { searchRegulatoryKB } from './tools/search-regulatory-kb.js';
import { getARSummary } from './tools/get-ar-summary.js';
import { getAPAging } from './tools/get-ap-aging.js';
import { getBusinessTransactions } from './tools/get-business-transactions.js';
// Team/Manager batch (032-mcp-first)
import { getEmployeeExpenses } from './tools/get-employee-expenses.js';
import { getTeamSummary } from './tools/get-team-summary.js';
import { getLateApprovals } from './tools/get-late-approvals.js';
import { compareTeamSpending } from './tools/compare-team-spending.js';
// Memory batch (032-mcp-first)
import { memoryStore } from './tools/memory-store.js';
import { memorySearch } from './tools/memory-search.js';
import { memoryRecall } from './tools/memory-recall.js';
import { memoryForget } from './tools/memory-forget.js';
// Misc batch (032-mcp-first)
import { createExpenseFromReceipt } from './tools/create-expense-from-receipt.js';
import { getActionCenterInsight } from './tools/get-action-center-insight.js';
import { analyzeTrends } from './tools/analyze-trends.js';
import { setBudget } from './tools/set-budget.js';
import { checkBudgetStatus } from './tools/check-budget-status.js';
// Financial Statements (033-fin-statements-gen)
import { generateTrialBalance } from './tools/generate-trial-balance.js';
import { generatePnl } from './tools/generate-pnl.js';
import { generateBalanceSheet } from './tools/generate-balance-sheet.js';
import { generateCashFlow } from './tools/generate-cash-flow.js';
import {
  authenticateApiKey,
  authenticateInternalService,
  updateApiKeyUsage,
  hasPermission,
  type AuthContext,
} from './lib/auth.js';
import { logger } from './lib/logger.js';

// Tool implementations registry
const TOOL_IMPLEMENTATIONS: Record<string, (args: Record<string, unknown>, authContext?: AuthContext) => Promise<unknown>> = {
  // Read-only intelligence tools
  detect_anomalies: detectAnomalies,
  forecast_cash_flow: forecastCashFlow,
  analyze_vendor_risk: analyzeVendorRisk,
  // Proposal tools (human approval workflow)
  create_proposal: createProposal,
  confirm_proposal: confirmProposal,
  cancel_proposal: cancelProposal,
  // Manager cross-employee analytics
  analyze_team_spending: analyzeTeamSpending,
  // CFO copilot tools
  generate_report_pdf: generateReportPdf,
  // Chat-driven scheduled reports & bank reconciliation
  schedule_report: scheduleReport,
  run_bank_reconciliation: runBankReconciliation,
  accept_recon_match: acceptReconMatch,
  show_recon_status: showReconStatus,
  // Email report sending (031-chat-cross-biz-voice)
  send_email_report: sendEmailReport,
  // Cross-business benchmarking (031-chat-cross-biz-voice)
  compare_to_industry: compareToIndustry,
  toggle_benchmarking: toggleBenchmarking,
  // Finance/AP/AR batch (032-mcp-first)
  get_invoices: getInvoices,
  get_sales_invoices: getSalesInvoices,
  get_transactions: getTransactions,
  get_vendors: getVendors,
  search_documents: searchDocuments,
  search_regulatory_knowledge_base: searchRegulatoryKB,
  get_ar_summary: getARSummary,
  get_ap_aging: getAPAging,
  get_business_transactions: getBusinessTransactions,
  // Team/Manager batch (032-mcp-first)
  get_employee_expenses: getEmployeeExpenses,
  get_team_summary: getTeamSummary,
  get_late_approvals: getLateApprovals,
  compare_team_spending: compareTeamSpending,
  // Memory batch (032-mcp-first)
  memory_store: memoryStore,
  memory_search: memorySearch,
  memory_recall: memoryRecall,
  memory_forget: memoryForget,
  // Misc batch (032-mcp-first)
  create_expense_from_receipt: createExpenseFromReceipt,
  get_action_center_insight: getActionCenterInsight,
  analyze_trends: analyzeTrends,
  set_budget: setBudget,
  check_budget_status: checkBudgetStatus,
  // Financial Statements (033-fin-statements-gen)
  generate_trial_balance: generateTrialBalance,
  generate_pnl: generatePnl,
  generate_balance_sheet: generateBalanceSheet,
  generate_cash_flow: generateCashFlow,
};

// CORS headers for all responses
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Lambda handler for MCP server
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const startTime = Date.now();
  const requestId = event.requestContext?.requestId || `req_${Date.now()}`;

  // Handle preflight requests (no auth required)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    logger.warn('invalid_method', { method: event.httpMethod, requestId });
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify(createErrorResponse(
        null,
        JSON_RPC_ERROR_CODES.INVALID_REQUEST,
        'Method not allowed'
      )),
    };
  }

  // Parse JSON-RPC request first (before auth to get request ID for error responses)
  const body = event.body;
  if (!body) {
    logger.warn('empty_body', { requestId });
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify(createErrorResponse(
        null,
        JSON_RPC_ERROR_CODES.PARSE_ERROR,
        'Empty request body'
      )),
    };
  }

  let request: {
    jsonrpc: string;
    id: string | number;
    method: string;
    params?: Record<string, unknown>;
  };

  try {
    request = JSON.parse(body);
  } catch {
    logger.warn('parse_error', { requestId });
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify(createErrorResponse(
        null,
        JSON_RPC_ERROR_CODES.PARSE_ERROR,
        'Invalid JSON'
      )),
    };
  }

  // Validate JSON-RPC version
  if (request.jsonrpc !== '2.0') {
    logger.warn('invalid_jsonrpc_version', { requestId, version: request.jsonrpc });
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify(createErrorResponse(
        request.id,
        JSON_RPC_ERROR_CODES.INVALID_REQUEST,
        'Invalid JSON-RPC version'
      )),
    };
  }

  logger.requestStart(request.method, { requestId });

  // Authenticate API key (required for all methods except initialize)
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  const internalKeyHeader = event.headers?.['X-Internal-Key'] || event.headers?.['x-internal-key'];
  const internalBusinessId = request.params?._businessId as string | undefined;
  const internalUserId = request.params?._userId as string | undefined;
  const internalUserName = request.params?._userName as string | undefined;
  const internalUserRole = request.params?._userRole as string | undefined;
  let authContext: AuthContext | undefined;

  // Initialize doesn't require auth (discovery phase)
  if (request.method !== 'initialize') {
    // Try internal service auth first (Layer 2 service-to-service calls)
    // Then fall back to standard API key auth
    const authResult = internalKeyHeader
      ? authenticateInternalService(internalKeyHeader, internalBusinessId)
      : await authenticateApiKey(authHeader);

    if (!authResult.authenticated) {
      const duration = Date.now() - startTime;
      logger.requestComplete(request.method, duration, 'unauthorized', { requestId });

      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify(createErrorResponse(
          request.id,
          JSON_RPC_ERROR_CODES.UNAUTHORIZED,
          authResult.error?.message || 'Unauthorized'
        )),
      };
    }

    // Check for rate limiting
    if (authResult.error?.code === 'RATE_LIMITED') {
      const duration = Date.now() - startTime;
      logger.requestComplete(request.method, duration, 'rate_limited', {
        requestId,
        apiKeyPrefix: authResult.context?.keyPrefix,
      });

      return {
        statusCode: 429,
        headers: {
          ...CORS_HEADERS,
          'Retry-After': String(authResult.rateLimitInfo?.retryAfter || 60),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(authResult.rateLimitInfo?.resetAt || Date.now() + 60000),
        },
        body: JSON.stringify(createErrorResponse(
          request.id,
          JSON_RPC_ERROR_CODES.RATE_LIMITED,
          authResult.error.message
        )),
      };
    }

    authContext = authResult.context;

    // Enrich auth context with user-level fields from request params (internal service calls)
    if (authContext && internalKeyHeader) {
      if (internalUserId) authContext.userId = internalUserId;
      if (internalUserName) authContext.userName = internalUserName;
      if (internalUserRole) authContext.userRole = internalUserRole;
    }
  }

  try {
    let result: unknown;

    switch (request.method) {
      case 'initialize':
        result = {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: SERVER_CAPABILITIES,
          serverInfo: SERVER_INFO,
        };
        break;

      case 'notifications/initialized':
        // Notification - no response needed
        return {
          statusCode: 204,
          headers: CORS_HEADERS,
          body: '',
        };

      case 'tools/list':
        // Return complete JSON Schema for each tool (Category 3: self-describing)
        result = {
          tools: Object.values(MCP_TOOLS).map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: zodToJsonSchema(tool.inputSchema, {
              target: 'openApi3',
              $refStrategy: 'none',
            }),
          })),
        };
        break;

      case 'tools/call': {
        const params = request.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};

        if (!toolName) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify(createErrorResponse(
              request.id,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Tool name is required'
            )),
          };
        }

        // Check tool permission
        if (authContext && !hasPermission(authContext, toolName)) {
          logger.warn('permission_denied', {
            requestId,
            tool: toolName,
            apiKeyPrefix: authContext.keyPrefix,
          });
          return {
            statusCode: 403,
            headers: CORS_HEADERS,
            body: JSON.stringify(createErrorResponse(
              request.id,
              JSON_RPC_ERROR_CODES.UNAUTHORIZED,
              `Permission denied for tool: ${toolName}`
            )),
          };
        }

        const toolImpl = TOOL_IMPLEMENTATIONS[toolName];
        if (!toolImpl) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify(createErrorResponse(
              request.id,
              JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
              `Tool not found: ${toolName}`
            )),
          };
        }

        const toolStartTime = Date.now();
        logger.info('tool_start', {
          requestId,
          tool: toolName,
          apiKeyPrefix: authContext?.keyPrefix,
          businessId: authContext?.businessId,
        });

        try {
          // Pass auth context to tool - it will use businessId from context
          const toolResult = await toolImpl(toolArgs, authContext);
          const toolDuration = Date.now() - toolStartTime;

          logger.toolExecution(toolName, toolDuration, 'success', {
            requestId,
            apiKeyPrefix: authContext?.keyPrefix,
            businessId: authContext?.businessId,
          });

          result = createToolResult(toolResult);
        } catch (error) {
          const toolDuration = Date.now() - toolStartTime;
          logger.toolExecution(toolName, toolDuration, 'error', {
            requestId,
            apiKeyPrefix: authContext?.keyPrefix,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          });

          // Check if it's a structured error from our tools
          const errorObj = error as { error?: boolean; code?: string; message?: string };
          if (errorObj.error && errorObj.code) {
            result = createToolResult(errorObj, true);
          } else {
            result = createToolResult({
              error: true,
              code: 'INTERNAL_ERROR',
              message: error instanceof Error ? error.message : 'Unknown error',
            }, true);
          }
        }

        // Update API key usage (non-blocking)
        if (authContext) {
          updateApiKeyUsage(authContext.apiKeyId).catch(() => {});
        }
        break;
      }

      default:
        logger.warn('unknown_method', { requestId, method: request.method });
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify(createErrorResponse(
            request.id,
            JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
            `Unknown method: ${request.method}`
          )),
        };
    }

    const duration = Date.now() - startTime;
    logger.requestComplete(request.method, duration, 'success', {
      requestId,
      apiKeyPrefix: authContext?.keyPrefix,
      businessId: authContext?.businessId,
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(createSuccessResponse(request.id, result as never)),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.requestComplete(request.method, duration, 'error', {
      requestId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify(createErrorResponse(
        request.id,
        JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        error instanceof Error ? error.message : 'Internal error'
      )),
    };
  }
}
