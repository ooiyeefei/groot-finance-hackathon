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
    .optional()
    .describe('Business ID (optional when using API key authentication - business is derived from key)'),

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
    .optional()
    .describe('Business ID (optional when using API key authentication - business is derived from key)'),

  horizon_days: z.number()
    .min(7)
    .max(365)
    .default(30)
    .describe('Forecast horizon in days (7-365, default: 30). Used when granularity is "daily".'),

  forecast_months: z.number()
    .min(1)
    .max(12)
    .optional()
    .describe('Number of months to forecast (1-12). When provided, overrides horizon_days and sets granularity to "monthly".'),

  granularity: z.enum(['daily', 'monthly'])
    .default('daily')
    .describe('Forecast granularity: "daily" for day-by-day, "monthly" for month-by-month projections'),

  scenario: z.enum(['conservative', 'moderate', 'optimistic'])
    .default('moderate')
    .describe('Projection scenario: conservative (pessimistic), moderate (baseline), optimistic'),

  include_recurring: z.boolean()
    .default(true)
    .describe('Factor in recurring transactions for more accurate forecasts'),

  include_known_ar_ap: z.boolean()
    .default(true)
    .describe('Include known receivables (unpaid sales invoices) and payables (posted AP invoices) in projections')
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

// --- Monthly Forecast Types (used when granularity = 'monthly') ---

export interface MonthlyBucket {
  month: string;
  projected_income: number;
  projected_expenses: number;
  known_ar_due: number;
  known_ap_due: number;
  net_balance: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface ForecastRiskAlert {
  type: 'low_runway' | 'negative_balance' | 'ar_concentration' | 'high_burn_rate';
  severity: 'critical' | 'warning' | 'info';
  month?: string;
  message: string;
  recommendation: string;
}

export interface MonthlyForecastOutput {
  months: MonthlyBucket[];
  risk_alerts: ForecastRiskAlert[];
  summary: {
    current_balance: number;
    runway_months: number;
    scenario_used: string;
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    total_known_ar: number;
    total_known_ap: number;
    avg_monthly_expenses: number;
    avg_monthly_income: number;
  };
  currency: string;
}

// ============================================================================
// Tool 8: generate_report_pdf
// ============================================================================

export const GenerateReportPdfInputSchema = z.object({
  business_id: z.string()
    .optional()
    .describe('Business ID (optional when using API key authentication)'),

  report_type: z.enum(['board_report'])
    .default('board_report')
    .describe('Type of report to generate'),

  date_range: DateRangeSchema
    .describe('Date range for the report period'),

  sections: z.array(z.enum([
    'pnl', 'cash_flow', 'ar_aging', 'ap_aging', 'top_vendors', 'trends'
  ])).optional()
    .describe('Sections to include (defaults to all)'),
});

export type GenerateReportPdfInput = z.infer<typeof GenerateReportPdfInputSchema>;

export interface GenerateReportPdfOutput {
  report_url: string;
  filename: string;
  sections_included: string[];
  date_range: { start: string; end: string };
  generated_at: string;
  page_count: number;
}

// ============================================================================
// Tool 3: analyze_vendor_risk
// ============================================================================

export const AnalyzeVendorRiskInputSchema = z.object({
  business_id: z.string()
    .optional()
    .describe('Business ID (optional when using API key authentication - business is derived from key)'),

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
// Tool 4: create_proposal
// ============================================================================

export const CreateProposalInputSchema = z.object({
  action_type: z.enum(['approve_expense', 'reject_expense', 'categorize_expense', 'update_vendor'])
    .describe('Type of action to propose: approve_expense, reject_expense, categorize_expense, update_vendor'),

  target_id: z.string()
    .min(1)
    .describe('ID of the target entity (e.g., expense claim ID)'),

  parameters: z.record(z.unknown())
    .optional()
    .describe('Action-specific parameters (e.g., {reason: "Duplicate"} for reject_expense, {category: "TRAVEL"} for categorize_expense)'),

  summary: z.string()
    .min(10)
    .max(500)
    .describe('Human-readable summary of the proposed action for review'),
});

export type CreateProposalInput = z.infer<typeof CreateProposalInputSchema>;

export interface CreateProposalOutput {
  proposal_id: string;
  expires_at: number;
  expires_in_seconds: number;
  confirmation_required: true;
  message: string;
}

// ============================================================================
// Tool 5: confirm_proposal
// ============================================================================

export const ConfirmProposalInputSchema = z.object({
  proposal_id: z.string()
    .min(1)
    .describe('The proposal ID returned from create_proposal'),
});

export type ConfirmProposalInput = z.infer<typeof ConfirmProposalInputSchema>;

export interface ConfirmProposalOutput {
  success: boolean;
  action_executed: string;
  result: Record<string, unknown>;
  message: string;
}

// ============================================================================
// Tool 6: cancel_proposal
// ============================================================================

export const CancelProposalInputSchema = z.object({
  proposal_id: z.string()
    .min(1)
    .describe('The proposal ID to cancel'),

  reason: z.string()
    .optional()
    .describe('Optional reason for cancellation'),
});

export type CancelProposalInput = z.infer<typeof CancelProposalInputSchema>;

export interface CancelProposalOutput {
  success: boolean;
  message: string;
}

// ============================================================================
// Tool 7: analyze_team_spending (Manager Cross-Employee Analytics)
// ============================================================================

export const AnalyzeTeamSpendingInputSchema = z.object({
  business_id: z.string()
    .optional()
    .describe('Business ID (optional when using API key authentication - business is derived from key)'),

  manager_user_id: z.string()
    .describe('Convex user ID of the requesting manager. Required for authorization check.'),

  employee_filter: z.array(z.string()).optional()
    .describe('Optional list of employee user IDs to scope the analysis to specific team members'),

  date_range: DateRangeSchema.optional()
    .describe('Date range to analyze (defaults to last 30 days)'),

  category_filter: z.array(z.string()).optional()
    .describe('Filter to specific expense categories (e.g., ["TRAVEL_ENTERTAINMENT", "OFFICE_SUPPLIES"])'),

  vendor_filter: z.array(z.string()).optional()
    .describe('Filter to specific vendor names (case-insensitive partial match)'),

  include_trends: z.boolean()
    .default(false)
    .describe('Compare current period with previous period of equal length'),

  include_rankings: z.boolean()
    .default(true)
    .describe('Include employee spending rankings in the response')
});

export type AnalyzeTeamSpendingInput = z.infer<typeof AnalyzeTeamSpendingInputSchema>;

export interface TeamEmployeeSummary {
  user_id: string;
  employee_name: string;
  total_spend: number;
  transaction_count: number;
  spend_percentage: number;
  top_categories: Array<{ category: string; amount: number }>;
  top_vendors: Array<{ vendor: string; amount: number }>;
}

export interface TeamCategoryBreakdown {
  category: string;
  category_name: string;
  total_amount: number;
  transaction_count: number;
  percentage: number;
}

export interface TeamVendorBreakdown {
  vendor_name: string;
  total_amount: number;
  transaction_count: number;
  percentage: number;
  employee_count: number;
}

export interface TeamSpendingTrend {
  current_period_total: number;
  previous_period_total: number;
  change_percentage: number;
  change_direction: 'increase' | 'decrease' | 'stable';
}

export interface AnalyzeTeamSpendingOutput {
  team_summary: {
    total_spend: number;
    currency: string;
    employee_count: number;
    transaction_count: number;
    date_range: DateRange;
    average_per_employee: number;
  };
  employee_rankings: TeamEmployeeSummary[];
  category_breakdown: TeamCategoryBreakdown[];
  vendor_breakdown: TeamVendorBreakdown[];
  trends?: TeamSpendingTrend;
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
  | AnalyzeVendorRiskInput
  | AnalyzeTeamSpendingInput;

export type MCPToolOutput =
  | DetectAnomaliesOutput
  | ForecastCashFlowOutput
  | AnalyzeVendorRiskOutput
  | AnalyzeTeamSpendingOutput;

export interface MCPToolResult<T extends MCPToolOutput = MCPToolOutput> {
  success: true;
  data: T;
}

export type MCPToolResponse<T extends MCPToolOutput = MCPToolOutput> =
  | MCPToolResult<T>
  | MCPToolError;

// ============================================================================
// Tool 8: schedule_report
// ============================================================================

export const ScheduleReportInputSchema = z.object({
  action: z.enum(['create', 'modify', 'cancel', 'list'])
    .describe('Action to perform: create a new schedule, modify/cancel an existing one, or list all schedules'),
  scheduleId: z.string().optional()
    .describe('Schedule ID (required for modify/cancel)'),
  reportType: z.enum(['pnl', 'cash_flow', 'ar_aging', 'ap_aging', 'expense_summary']).optional()
    .describe('Report type (required for create): pnl=Profit & Loss, cash_flow=Cash Flow, ar_aging=AR Aging, ap_aging=AP Aging, expense_summary=Expense Summary'),
  frequency: z.enum(['daily', 'weekly', 'monthly']).optional()
    .describe('Delivery frequency (required for create)'),
  dayOfWeek: z.number().min(0).max(6).optional()
    .describe('Day of week for weekly reports: 0=Sunday, 1=Monday, ..., 6=Saturday'),
  dayOfMonth: z.number().min(1).max(28).optional()
    .describe('Day of month for monthly reports (1-28)'),
  recipients: z.array(z.string()).optional()
    .describe('Email addresses to receive the report (defaults to requesting user email)'),
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
});

export type ScheduleReportInput = z.infer<typeof ScheduleReportInputSchema>;

// ============================================================================
// Tool 9: run_bank_reconciliation
// ============================================================================

export const RunBankReconciliationInputSchema = z.object({
  bankAccountId: z.string()
    .describe('The bank account ID to reconcile. Always ask the user which account before calling.'),
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
});

export type RunBankReconciliationInput = z.infer<typeof RunBankReconciliationInputSchema>;

// ============================================================================
// Tool 10: accept_recon_match
// ============================================================================

export const AcceptReconMatchInputSchema = z.object({
  action: z.enum(['accept', 'reject', 'bulk_accept'])
    .describe('Action: accept/reject a single match, or bulk_accept all above a confidence threshold'),
  matchId: z.string().optional()
    .describe('Match ID (required for accept/reject)'),
  runId: z.string().optional()
    .describe('Reconciliation run ID (required for bulk_accept)'),
  minConfidence: z.number().min(0).max(1).default(0.9).optional()
    .describe('Minimum confidence threshold for bulk_accept (default: 0.9 = 90%)'),
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
});

export type AcceptReconMatchInput = z.infer<typeof AcceptReconMatchInputSchema>;

// ============================================================================
// Tool 11: show_recon_status
// ============================================================================

export const ShowReconStatusInputSchema = z.object({
  bankAccountId: z.string().optional()
    .describe('Bank account ID to check (omit for all accounts)'),
  query: z.string().optional()
    .describe('Natural language query about a specific transaction (e.g., "the $500 payment from Acme")'),
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
});

export type ShowReconStatusInput = z.infer<typeof ShowReconStatusInputSchema>;

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
  },
  create_proposal: {
    name: 'create_proposal',
    description: 'Create a proposal for a write operation that requires human approval. Returns a proposal_id that must be confirmed with confirm_proposal before the action executes. Proposals expire after 15 minutes.',
    inputSchema: CreateProposalInputSchema
  },
  confirm_proposal: {
    name: 'confirm_proposal',
    description: 'Confirm and execute a pending proposal. This is the human approval step that triggers the actual write operation. Only call this after the user has explicitly approved the action.',
    inputSchema: ConfirmProposalInputSchema
  },
  cancel_proposal: {
    name: 'cancel_proposal',
    description: 'Cancel a pending proposal. Use this when the user decides not to proceed with a proposed action.',
    inputSchema: CancelProposalInputSchema
  },
  analyze_team_spending: {
    name: 'analyze_team_spending',
    description: 'Analyze team spending patterns across a manager\'s direct reports. Returns employee rankings, category/vendor breakdowns, and optional period-over-period trends. Requires manager authorization.',
    inputSchema: AnalyzeTeamSpendingInputSchema
  },
  schedule_report: {
    name: 'schedule_report',
    description: 'Create, modify, cancel, or list recurring financial report schedules. Supports P&L, Cash Flow, AR Aging, AP Aging, and Expense Summary reports with daily/weekly/monthly delivery via email with PDF attachment. Only admin/manager can schedule financial reports; employees can only schedule expense summaries.',
    inputSchema: ScheduleReportInputSchema
  },
  run_bank_reconciliation: {
    name: 'run_bank_reconciliation',
    description: 'Trigger bank reconciliation for a specific bank account. Uses Tier 1 (rule-based) + Tier 2 (AI/DSPy) matching to process unmatched transactions. IMPORTANT: Always ask the user which bank account to reconcile before calling this tool. Returns match results with confidence scores for review.',
    inputSchema: RunBankReconciliationInputSchema
  },
  accept_recon_match: {
    name: 'accept_recon_match',
    description: 'Accept or reject a bank reconciliation match. Accepting creates a double-entry journal entry. Supports bulk_accept to accept all matches above a confidence threshold (e.g., "Accept all above 90%"). For bulk accept, always confirm the count with the user before executing.',
    inputSchema: AcceptReconMatchInputSchema
  },
  show_recon_status: {
    name: 'show_recon_status',
    description: 'Show current bank reconciliation status: matched, pending review, and unmatched transaction counts per bank account. Can also list unmatched transactions and search for specific transactions by description.',
    inputSchema: ShowReconStatusInputSchema
  }
} as const;

export type MCPToolName = keyof typeof MCP_TOOLS;
