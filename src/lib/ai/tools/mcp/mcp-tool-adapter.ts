/**
 * MCP Tool Adapter for LangGraph Agent
 *
 * Adapts MCP tools to the LangGraph tool interface.
 * Handles business context injection, error translation, and memory integration.
 */

import { z } from 'zod';
import { getMCPClient, MCPToolCallResult } from './mcp-client';
import type {
  DetectAnomaliesOutput,
  ForecastCashFlowOutput,
  AnalyzeVendorRiskOutput,
} from '@/lambda/mcp-server/contracts/mcp-tools';

// ============================================================================
// Tool Context Types
// ============================================================================

export interface MCPToolContext {
  businessId: string;
  userId: string;
  conversationId?: string;
}

export interface MCPToolDefinition<TInput, TOutput> {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  execute: (args: TInput, context: MCPToolContext) => Promise<MCPToolCallResult<TOutput>>;
}

// ============================================================================
// Tool Schemas (for LangGraph registration)
// ============================================================================

export const detectAnomaliesSchema = z.object({
  date_range: z.object({
    start: z.string().describe('Start date YYYY-MM-DD'),
    end: z.string().describe('End date YYYY-MM-DD'),
  }).optional().describe('Date range to analyze (defaults to last 30 days)'),
  category_filter: z.array(z.string()).optional().describe('Filter to specific expense categories'),
  sensitivity: z.enum(['low', 'medium', 'high']).default('medium').describe('Detection sensitivity'),
});

export const forecastCashFlowSchema = z.object({
  horizon_days: z.number().min(7).max(90).default(30).describe('Forecast horizon in days (7-90)'),
  scenario: z.enum(['conservative', 'moderate', 'optimistic']).default('moderate').describe('Projection scenario'),
  include_recurring: z.boolean().default(true).describe('Factor in recurring transactions'),
});

export const analyzeVendorRiskSchema = z.object({
  vendor_filter: z.array(z.string()).optional().describe('Filter to specific vendor names'),
  analysis_period_days: z.number().min(7).max(365).default(90).describe('Lookback period in days'),
  include_concentration: z.boolean().default(true).describe('Include vendor concentration risk analysis'),
  include_spending_changes: z.boolean().default(true).describe('Include spending trend analysis'),
});

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * Execute detect_anomalies MCP tool
 */
export async function executeDetectAnomalies(
  args: z.infer<typeof detectAnomaliesSchema>,
  context: MCPToolContext
): Promise<MCPToolCallResult<DetectAnomaliesOutput>> {
  const client = getMCPClient();

  return client.callTool<DetectAnomaliesOutput>('detect_anomalies', {
    business_id: context.businessId,
    ...args,
  });
}

/**
 * Execute forecast_cash_flow MCP tool
 */
export async function executeForecastCashFlow(
  args: z.infer<typeof forecastCashFlowSchema>,
  context: MCPToolContext
): Promise<MCPToolCallResult<ForecastCashFlowOutput>> {
  const client = getMCPClient();

  return client.callTool<ForecastCashFlowOutput>('forecast_cash_flow', {
    business_id: context.businessId,
    ...args,
  });
}

/**
 * Execute analyze_vendor_risk MCP tool
 */
export async function executeAnalyzeVendorRisk(
  args: z.infer<typeof analyzeVendorRiskSchema>,
  context: MCPToolContext
): Promise<MCPToolCallResult<AnalyzeVendorRiskOutput>> {
  const client = getMCPClient();

  return client.callTool<AnalyzeVendorRiskOutput>('analyze_vendor_risk', {
    business_id: context.businessId,
    ...args,
  });
}

// ============================================================================
// Tool Definitions for Registration
// ============================================================================

export const MCP_TOOL_DEFINITIONS: MCPToolDefinition<unknown, unknown>[] = [
  {
    name: 'mcp_detect_anomalies',
    description: 'Detect unusual financial transactions using statistical outlier analysis. Use when users ask about anomalies, unusual expenses, or spending outliers.',
    schema: detectAnomaliesSchema,
    execute: executeDetectAnomalies as MCPToolDefinition<unknown, unknown>['execute'],
  },
  {
    name: 'mcp_forecast_cash_flow',
    description: 'Project future cash balance based on historical income/expense patterns. Use when users ask about cash flow, runway, or future balance projections.',
    schema: forecastCashFlowSchema,
    execute: executeForecastCashFlow as MCPToolDefinition<unknown, unknown>['execute'],
  },
  {
    name: 'mcp_analyze_vendor_risk',
    description: 'Analyze vendor concentration, spending changes, and risk factors. Use when users ask about vendor analysis, supplier risk, or spending patterns by vendor.',
    schema: analyzeVendorRiskSchema,
    execute: executeAnalyzeVendorRisk as MCPToolDefinition<unknown, unknown>['execute'],
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format MCP tool result for agent response
 */
export function formatToolResultForAgent<T>(
  result: MCPToolCallResult<T>,
  toolName: string
): string {
  if (!result.success) {
    return `Error from ${toolName}: ${result.error?.message || 'Unknown error'} (${result.error?.code || 'UNKNOWN'})`;
  }

  // Return stringified data for the agent to interpret
  return JSON.stringify(result.data, null, 2);
}

/**
 * Check if MCP server is available
 */
export async function isMCPServerAvailable(): Promise<boolean> {
  try {
    const client = getMCPClient();
    await client.initialize();
    return true;
  } catch {
    return false;
  }
}
