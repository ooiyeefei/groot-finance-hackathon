/**
 * MCP Tool Contracts: Autonomous Finance MCP Server
 *
 * This file defines Zod schemas for MCP tool inputs and TypeScript
 * interfaces for tool outputs. These contracts ensure type safety
 * between the MCP server and LangGraph client.
 */

import { z } from 'zod';

// ============================================================================
// Common Types
// ============================================================================

export const DateRangeSchema = z.object({
  start: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format')
    .describe('Start date (ISO 8601, e.g., "2026-01-01")'),
  end: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format')
    .describe('End date (ISO 8601, e.g., "2026-01-15")')
});

export type DateRange = z.infer<typeof DateRangeSchema>;

export const SeveritySchema = z.enum(['medium', 'high', 'critical']);
export type Severity = z.infer<typeof SeveritySchema>;

// ============================================================================
// Tool 1: detect_anomalies
// ============================================================================

export const DetectAnomaliesInputSchema = z.object({
  business_id: z.string()
    .min(1)
    .describe('Business ID for authorization context'),

  date_range: DateRangeSchema.optional()
    .describe('Date range to analyze (defaults to last 30 days)'),

  category_filter: z.array(z.string()).optional()
    .describe('Filter to specific expense categories (e.g., ["OFFICE_SUPPLIES", "TRAVEL"])'),

  sensitivity: z.enum(['low', 'medium', 'high'])
    .default('medium')
    .describe('Detection sensitivity: low=3σ (extreme only), medium=2σ (standard), high=1.5σ (sensitive)')
});

export type DetectAnomaliesInput = z.infer<typeof DetectAnomaliesInputSchema>;

export interface AnomalyItem {
  transaction_id: string;
  description: string;
  amount: number;
  currency: string;
  category: string;
  category_name: string;
  transaction_date: string;
  vendor_name?: string;
  z_score: number;
  category_mean: number;
  category_stddev: number;
  severity: Severity;
  explanation: string;
}

export interface DetectAnomaliesOutput {
  anomalies: AnomalyItem[];
  summary: {
    total_transactions_analyzed: number;
    anomalies_found: number;
    date_range: DateRange;
    sensitivity_used: 'low' | 'medium' | 'high';
    categories_analyzed: string[];
  };
}

// ============================================================================
// Tool 2: forecast_cash_flow
// ============================================================================

export const ForecastCashFlowInputSchema = z.object({
  business_id: z.string()
    .min(1)
    .describe('Business ID for authorization context'),

  horizon_days: z.number()
    .min(7)
    .max(90)
    .default(30)
    .describe('Forecast horizon in days (7-90, default: 30)'),

  scenario: z.enum(['conservative', 'moderate', 'optimistic'])
    .default('moderate')
    .describe('Projection scenario: conservative (pessimistic), moderate (baseline), optimistic'),

  include_recurring: z.boolean()
    .default(true)
    .describe('Factor in recurring transactions for more accurate forecasts')
});

export type ForecastCashFlowInput = z.infer<typeof ForecastCashFlowInputSchema>;

export interface ForecastDay {
  date: string;
  projected_balance: number;
  projected_income: number;
  projected_expenses: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface CashFlowAlert {
  type: 'negative_balance' | 'high_burn_rate' | 'low_runway';
  severity: 'warning' | 'critical';
  date?: string;
  message: string;
  recommendation: string;
}

export interface ForecastCashFlowOutput {
  forecast: ForecastDay[];
  alerts: CashFlowAlert[];
  summary: {
    current_balance: number;
    projected_end_balance: number;
    total_projected_income: number;
    total_projected_expenses: number;
    net_change: number;
    burn_rate_daily: number;
    runway_days?: number;
    scenario_used: string;
    horizon_days: number;
  };
}

// ============================================================================
// Tool 3: analyze_vendor_risk
// ============================================================================

export const AnalyzeVendorRiskInputSchema = z.object({
  business_id: z.string()
    .min(1)
    .describe('Business ID for authorization context'),

  vendor_filter: z.array(z.string()).optional()
    .describe('Filter to specific vendor names'),

  analysis_period_days: z.number()
    .min(7)
    .max(365)
    .default(90)
    .describe('Lookback period in days (7-365, default: 90)'),

  include_concentration: z.boolean()
    .default(true)
    .describe('Include vendor concentration risk analysis'),

  include_spending_changes: z.boolean()
    .default(true)
    .describe('Include spending trend analysis vs previous period')
});

export type AnalyzeVendorRiskInput = z.infer<typeof AnalyzeVendorRiskInputSchema>;

export interface VendorProfile {
  vendor_name: string;
  total_spend: number;
  transaction_count: number;
  spend_percentage: number;
  categories: string[];
  risk_score: number;
  risk_factors: string[];
  spending_trend: 'increasing' | 'stable' | 'decreasing';
  trend_percentage?: number;
}

export interface ConcentrationRisk {
  category: string;
  category_name: string;
  vendor_name: string;
  concentration_percentage: number;
  severity: Severity;
  message: string;
  recommendation: string;
}

export interface SpendingChange {
  vendor_name: string;
  previous_period_spend: number;
  current_period_spend: number;
  change_percentage: number;
  change_direction: 'increase' | 'decrease';
  significance: 'normal' | 'notable' | 'significant';
}

export interface AnalyzeVendorRiskOutput {
  vendors: VendorProfile[];
  concentration_risks: ConcentrationRisk[];
  spending_changes: SpendingChange[];
  summary: {
    total_vendors: number;
    total_spend: number;
    high_risk_vendors: number;
    concentration_risks_found: number;
    significant_spending_changes: number;
    analysis_period: DateRange;
  };
}

// ============================================================================
// Error Types
// ============================================================================

export const MCPErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'INVALID_INPUT',
  'INSUFFICIENT_DATA',
  'CONVEX_ERROR',
  'INTERNAL_ERROR',
  'RATE_LIMITED'
]);

export type MCPErrorCode = z.infer<typeof MCPErrorCodeSchema>;

export interface MCPToolError {
  error: true;
  code: MCPErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

// Backwards-compatible alias (deprecated - use MCPToolError)
export type MCPErrorResponse = MCPToolError;

// ============================================================================
// Union Types for Tool Results
// ============================================================================

export type MCPToolInput =
  | DetectAnomaliesInput
  | ForecastCashFlowInput
  | AnalyzeVendorRiskInput;

export type MCPToolOutput =
  | DetectAnomaliesOutput
  | ForecastCashFlowOutput
  | AnalyzeVendorRiskOutput;

export interface MCPToolResult<T extends MCPToolOutput = MCPToolOutput> {
  success: true;
  data: T;
}

export type MCPToolResponse<T extends MCPToolOutput = MCPToolOutput> =
  | MCPToolResult<T>
  | MCPToolError;

// ============================================================================
// Tool Registry (for MCP server initialization)
// ============================================================================

export const MCP_TOOLS = {
  detect_anomalies: {
    name: 'detect_anomalies',
    description: 'Detect unusual financial transactions using statistical outlier analysis. Returns transactions with spending patterns significantly different from historical norms.',
    inputSchema: DetectAnomaliesInputSchema
  },
  forecast_cash_flow: {
    name: 'forecast_cash_flow',
    description: 'Project future cash balance based on historical income/expense patterns. Provides alerts for potential cash flow issues.',
    inputSchema: ForecastCashFlowInputSchema
  },
  analyze_vendor_risk: {
    name: 'analyze_vendor_risk',
    description: 'Analyze vendor concentration, spending changes, and risk factors. Identifies suppliers with high dependency risk.',
    inputSchema: AnalyzeVendorRiskInputSchema
  }
} as const;

export type MCPToolName = keyof typeof MCP_TOOLS;
