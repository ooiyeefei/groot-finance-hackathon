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
// Tool 8: send_email_report (031-chat-cross-biz-voice)
// ============================================================================

export const SendEmailReportInputSchema = z.object({
  report_type: z.enum(['ap_aging', 'ar_aging', 'cash_flow', 'pnl', 'expense_summary'])
    .describe('Type of financial report to send'),
  report_data: z.record(z.unknown())
    .describe('Structured report data (generated by agent before calling this tool)'),
  recipients: z.array(z.string().email())
    .min(1)
    .max(10)
    .describe('Email addresses of recipients (1-10)'),
  subject: z.string().optional()
    .describe('Optional custom email subject line'),
  confirmed: z.boolean()
    .describe('Must be true to actually send. Set false for preview/confirmation phase.'),
  period: z.string().optional()
    .describe('Report period, e.g., "2026-03" or "2026-Q1"'),
});

export type SendEmailReportInput = z.infer<typeof SendEmailReportInputSchema>;

export interface SendEmailReportPreview {
  preview: true;
  confirmation_message: string;
  recipients: string[];
  report_type: string;
}

export interface SendEmailReportResult {
  success: boolean;
  message_ids: string[];
  recipients_sent: string[];
  recipients_failed: string[];
  daily_sends_remaining: number;
}

export type SendEmailReportOutput = SendEmailReportPreview | SendEmailReportResult;

// ============================================================================
// Tool 9: compare_to_industry (031-chat-cross-biz-voice)
// ============================================================================

export const CompareToIndustryInputSchema = z.object({
  metric: z.enum(['gross_margin', 'cogs_ratio', 'opex_ratio', 'ar_days', 'ap_days'])
    .describe('Financial metric to compare: gross_margin, cogs_ratio, opex_ratio, ar_days, ap_days'),
  period: z.string().optional()
    .describe('Optional period (defaults to most recent quarter). Format: "2026-Q1" or "2026-03"'),
});

export type CompareToIndustryInput = z.infer<typeof CompareToIndustryInputSchema>;

export interface CompareToIndustrySuccess {
  success: true;
  metric: string;
  business_value: number;
  industry_group: string;
  percentile: number;
  industry_average: number;
  industry_median: number;
  p25: number;
  p75: number;
  sample_size: number;
  period: string;
  recommendations: string[];
}

export interface CompareToIndustryNotOptedIn {
  success: false;
  reason: 'not_opted_in';
  message: string;
}

export interface CompareToIndustryInsufficientData {
  success: false;
  reason: 'insufficient_data';
  message: string;
  current_sample_size: number;
  minimum_required: number;
}

export type CompareToIndustryOutput =
  | CompareToIndustrySuccess
  | CompareToIndustryNotOptedIn
  | CompareToIndustryInsufficientData;

// ============================================================================
// Tool 10: toggle_benchmarking (031-chat-cross-biz-voice)
// ============================================================================

export const ToggleBenchmarkingInputSchema = z.object({
  action: z.enum(['opt_in', 'opt_out'])
    .describe('Whether to opt the business in or out of anonymized benchmarking'),
});

export type ToggleBenchmarkingInput = z.infer<typeof ToggleBenchmarkingInputSchema>;

export interface ToggleBenchmarkingOutput {
  success: boolean;
  is_active: boolean;
  industry_group: string;
  message: string;
}

// ============================================================================
// Tool: get_invoices (AP invoices)
// ============================================================================

export const GetInvoicesInputSchema = z.object({
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
  vendor_name: z.string().optional()
    .describe('Filter by vendor/supplier name (case-insensitive partial match)'),
  invoice_number: z.string().optional()
    .describe('Filter by invoice number (exact or partial match)'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('Start date in YYYY-MM-DD format'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('End date in YYYY-MM-DD format'),
  min_amount: z.number().optional()
    .describe('Minimum invoice amount filter'),
  max_amount: z.number().optional()
    .describe('Maximum invoice amount filter'),
  limit: z.number().int().min(1).max(50).default(20).optional()
    .describe('Maximum number of invoices to return (default: 20, max: 50)'),
});

export type GetInvoicesInput = z.infer<typeof GetInvoicesInputSchema>;

export interface GetInvoicesOutput {
  invoices: Array<{
    _id: string;
    vendorName: string;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    amount: number;
    currency: string;
    isPosted: boolean;
    paymentStatus: string;
    confidenceScore: number;
    lineItems: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      totalAmount: number;
    }>;
  }>;
  totalCount: number;
  summary?: unknown;
}

// ============================================================================
// Tool: get_sales_invoices (AR invoices)
// ============================================================================

export const GetSalesInvoicesInputSchema = z.object({
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
  status: z.enum(['draft', 'sent', 'overdue', 'paid', 'partially_paid', 'void']).optional()
    .describe('Filter by invoice status'),
  limit: z.number().int().min(1).max(50).default(20).optional()
    .describe('Maximum number of invoices to return (default: 20)'),
});

export type GetSalesInvoicesInput = z.infer<typeof GetSalesInvoicesInputSchema>;

export interface GetSalesInvoicesOutput {
  invoices: Array<{
    clientName: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    status: string;
    dueDate?: string;
    invoiceDate?: string;
  }>;
  totalCount: number;
  summary?: {
    totalOutstanding: number;
    totalOverdue: number;
  };
}

// ============================================================================
// Tool: get_transactions (personal journal entries)
// ============================================================================

export const GetTransactionsInputSchema = z.object({
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
  query: z.string().optional()
    .describe('Text search for vendor names or descriptions'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('Start date in YYYY-MM-DD format'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('End date in YYYY-MM-DD format'),
  category: z.string().optional()
    .describe('Filter by transaction category'),
  min_amount: z.number().optional()
    .describe('Minimum transaction amount'),
  max_amount: z.number().optional()
    .describe('Maximum transaction amount'),
  transaction_type: z.enum(['Income', 'Cost of Goods Sold', 'Expense']).optional()
    .describe('Filter by transaction type'),
  source_document_type: z.enum(['invoice', 'expense_claim']).optional()
    .describe('Filter by source document type'),
  limit: z.number().int().min(1).max(100).default(10).optional()
    .describe('Maximum number of results (default: 10, max: 100)'),
});

export type GetTransactionsInput = z.infer<typeof GetTransactionsInputSchema>;

export interface GetTransactionsOutput {
  transactions: Array<{
    id: string;
    description: string;
    original_amount: number;
    original_currency: string;
    home_currency_amount: number;
    transaction_date: string;
    category: string;
    vendor_name: string;
    transaction_type: string;
    source_document_type: string;
  }>;
  totalCount: number;
  summary?: {
    totalAmount: number;
    currency: string;
  };
}

// ============================================================================
// Tool: get_vendors (unique vendor list)
// ============================================================================

export const GetVendorsInputSchema = z.object({
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
  source_document_type: z.enum(['invoice', 'expense_claim']).default('invoice').optional()
    .describe('Source document type to filter vendors (default: invoice for AP vendors)'),
});

export type GetVendorsInput = z.infer<typeof GetVendorsInputSchema>;

export interface GetVendorsOutput {
  vendors: string[];
  totalCount: number;
}

// ============================================================================
// Tool: search_documents (vector similarity search)
// ============================================================================

export const SearchDocumentsInputSchema = z.object({
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
  query: z.string().min(1).max(500)
    .describe('Search query to find relevant documents by text content'),
  limit: z.number().int().min(1).max(20).default(5).optional()
    .describe('Maximum number of results to return (default: 5, max: 20)'),
  similarity_threshold: z.number().min(0).max(1).default(0.7).optional()
    .describe('Similarity threshold for matching (0-1, default: 0.7)'),
});

export type SearchDocumentsInput = z.infer<typeof SearchDocumentsInputSchema>;

export interface SearchDocumentsOutput {
  documents: Array<{
    document_id: string;
    content_snippet: string;
    relevance_score: number;
    upload_date: string;
  }>;
  totalCount: number;
}

// ============================================================================
// Tool: search_regulatory_knowledge_base (RAG compliance search)
// ============================================================================

export const SearchRegulatoryKBInputSchema = z.object({
  query: z.string().min(1).max(500)
    .describe('Question about tax laws, compliance, or regulatory requirements'),
  limit: z.number().int().min(1).max(10).default(5).optional()
    .describe('Maximum number of knowledge snippets to return (default: 5)'),
});

export type SearchRegulatoryKBInput = z.infer<typeof SearchRegulatoryKBInputSchema>;

export interface SearchRegulatoryKBOutput {
  results: Array<{
    source_name: string;
    country: string;
    content_snippet: string;
    confidence_score: number;
    section?: string;
    official_url?: string;
    pdf_url?: string;
  }>;
  totalCount: number;
  disclaimer?: string;
}

// ============================================================================
// Tool: get_ar_summary (accounts receivable summary)
// ============================================================================

export const GetARSummaryInputSchema = z.object({
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('Start date in YYYY-MM-DD format'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('End date in YYYY-MM-DD format'),
});

export type GetARSummaryInput = z.infer<typeof GetARSummaryInputSchema>;

export interface GetARSummaryOutput {
  totalRevenue: number;
  totalOutstanding: number;
  totalOverdue: number;
  invoiceCount: number;
  totalInvoiceCount?: number;
  currency: string;
  statusBreakdown: Array<{ status: string; count: number; totalAmount: number }>;
  agingBuckets: Array<{ bucket: string; amount: number; count: number }>;
  topCustomers: Array<{ clientName: string; outstanding: number; overdueDays: number }>;
}

// ============================================================================
// Tool: get_ap_aging (accounts payable aging)
// ============================================================================

export const GetAPAgingInputSchema = z.object({
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('Start date in YYYY-MM-DD format'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('End date in YYYY-MM-DD format'),
});

export type GetAPAgingInput = z.infer<typeof GetAPAgingInputSchema>;

export interface GetAPAgingOutput {
  totalOutstanding: number;
  totalOverdue: number;
  currency: string;
  agingBuckets: Array<{ bucket: string; amount: number; count: number }>;
  vendorBreakdown: Array<{ vendorName: string; outstanding: number }>;
  upcomingDues: Array<{ vendorName: string; invoiceNumber: string; amount: number; dueDate: string }>;
}

// ============================================================================
// Tool: get_business_transactions (business-wide transactions)
// ============================================================================

export const GetBusinessTransactionsInputSchema = z.object({
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
  query: z.string().optional()
    .describe('Search vendor/description (e.g., "Starbucks", "office supplies")'),
  category: z.string().optional()
    .describe('Category filter'),
  transaction_type: z.enum(['Income', 'Expense', 'Cost of Goods Sold']).optional()
    .describe('Filter by transaction type'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('Start date in YYYY-MM-DD format'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('End date in YYYY-MM-DD format'),
  limit: z.number().int().min(1).max(100).default(50).optional()
    .describe('Max transactions to return (default: 50, max: 100)'),
});

export type GetBusinessTransactionsInput = z.infer<typeof GetBusinessTransactionsInputSchema>;

export interface GetBusinessTransactionsOutput {
  transactions: Array<{
    transactionDate: string;
    vendorName: string;
    amount: number;
    currency: string;
    category: string;
    description: string;
    transactionType: string;
    employeeName?: string;
  }>;
  totalCount: number;
  totalAmount: number;
  currency: string;
}

// ============================================================================
// Tool: get_employee_expenses (Team/Manager batch - 032-mcp-first)
// ============================================================================

export const GetEmployeeExpensesInputSchema = z.object({
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
  employee_name: z.string().min(1)
    .describe("The employee's name (first name, last name, or partial name). The system will match against direct reports."),
  vendor: z.string().optional()
    .describe("Optional vendor name filter. Case-insensitive partial match (e.g., 'starbucks')."),
  category: z.string().optional()
    .describe("Optional expense category in natural language (e.g., 'meals', 'travel', 'office supplies')."),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('Start date in YYYY-MM-DD format'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('End date in YYYY-MM-DD format'),
  transaction_type: z.enum(['Income', 'Expense', 'Cost of Goods Sold']).optional()
    .describe('Optional transaction type filter'),
  limit: z.number().int().min(1).max(50).default(50).optional()
    .describe('Max transactions to return in detail (1-50, default 50). Summary always covers all matches.'),
});

export type GetEmployeeExpensesInput = z.infer<typeof GetEmployeeExpensesInputSchema>;

export interface GetEmployeeExpensesOutput {
  employee: { name: string; id: string };
  summary: {
    total_amount: number;
    currency: string;
    record_count: number;
    date_range: { start: string; end: string };
  };
  items: Array<{
    date: string;
    description: string;
    vendor_name: string;
    amount: number;
    currency: string;
    category: string;
    transaction_type: string;
  }>;
  truncated: boolean;
  truncated_count: number;
  message?: string;
}

// ============================================================================
// Tool: get_team_summary (Team/Manager batch - 032-mcp-first)
// ============================================================================

export const GetTeamSummaryInputSchema = z.object({
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('Start date in YYYY-MM-DD format'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('End date in YYYY-MM-DD format'),
  category: z.string().optional()
    .describe("Optional category filter in natural language (e.g., 'travel', 'meals')."),
  vendor: z.string().optional()
    .describe("Optional vendor/merchant name filter. Case-insensitive partial match."),
  group_by: z.enum(['employee', 'category', 'vendor']).default('employee').optional()
    .describe('How to group the summary breakdown. Default: employee.'),
});

export type GetTeamSummaryInput = z.infer<typeof GetTeamSummaryInputSchema>;

export interface GetTeamSummaryOutput {
  summary: {
    total_amount: number;
    currency: string;
    employee_count: number;
    record_count: number;
    date_range: { start: string; end: string };
  };
  breakdown: Array<{
    group_key: string;
    total_amount: number;
    record_count: number;
    percentage: number;
  }>;
  top_categories: Array<{
    category: string;
    total_amount: number;
    percentage: number;
  }>;
}

// ============================================================================
// Tool: get_late_approvals (Team/Manager batch - 032-mcp-first)
// ============================================================================

export const GetLateApprovalsInputSchema = z.object({
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
  threshold_days: z.number().int().min(1).max(30).default(3).optional()
    .describe('Number of business days (Mon-Fri) after which a submission is considered late. Default: 3 business days.'),
});

export type GetLateApprovalsInput = z.infer<typeof GetLateApprovalsInputSchema>;

export interface LateSubmissionItem {
  submission_id: string;
  submitter_name: string;
  title: string;
  submitted_at: string;
  waiting_days: number;
  total_amount: number;
  currency: string;
  claim_count: number;
  urgency: 'overdue' | 'critical';
}

export interface GetLateApprovalsOutput {
  late_submissions: LateSubmissionItem[];
  summary: {
    total_pending: number;
    total_late: number;
    oldest_waiting_days: number;
    total_overdue_amount: number;
    currency: string;
    critical_count: number;
    threshold_days: number;
  };
}

// ============================================================================
// Tool: compare_team_spending (Team/Manager batch - 032-mcp-first)
// ============================================================================

export const CompareTeamSpendingInputSchema = z.object({
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('Start date in YYYY-MM-DD format. Defaults to first day of current month.'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('End date in YYYY-MM-DD format. Defaults to last day of current month.'),
  group_by: z.enum(['employee', 'category']).default('employee').optional()
    .describe("How to group the comparison. 'employee' compares spending per person (default), 'category' compares category spending across the team."),
});

export type CompareTeamSpendingInput = z.infer<typeof CompareTeamSpendingInputSchema>;

export interface CompareTeamSpendingOutput {
  period: { start: string; end: string };
  currency: string;
  team_total: number;
  team_average: number;
  outlier_threshold: number;
  employees: Array<{
    name: string;
    total_spend: number;
    transaction_count: number;
    percentage: number;
    is_outlier: boolean;
  }>;
  outliers: Array<{
    name: string;
    total_spend: number;
    ratio_to_average: number;
  }>;
  top_categories: Array<{
    category: string;
    total_amount: number;
    percentage: number;
  }>;
}

// ============================================================================
// Tool: memory_store (Memory batch - 032-mcp-first)
// ============================================================================

export const MemoryStoreInputSchema = z.object({
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
  content: z.string().min(1).max(1000)
    .describe('The fact, preference, or context to remember. Should be a clear, standalone statement.'),
  category: z.enum(['preference', 'fact', 'context', 'instruction'])
    .describe("Category: 'preference' for user preferences, 'fact' for business facts, 'context' for situational context, 'instruction' for how user wants to be helped."),
  tags: z.array(z.string().max(50)).max(10).optional()
    .describe("Optional tags for organization and retrieval. Examples: ['currency', 'reporting']."),
  conversation_id: z.string().optional()
    .describe('Conversation ID where this memory was captured (for audit trail).'),
});

export type MemoryStoreInput = z.infer<typeof MemoryStoreInputSchema>;

export interface MemoryStoreOutput {
  stored: boolean;
  memory_id?: string;
  category?: string;
  tags?: string[];
  message?: string;
  conflict?: {
    topic: string;
    existing_memory: {
      id: string;
      content: string;
      created_at: string;
    };
    options: Array<{
      action: 'replace' | 'keep_both' | 'cancel';
      label: string;
    }>;
  };
}

// ============================================================================
// Tool: memory_search (Memory batch - 032-mcp-first)
// ============================================================================

export const MemorySearchInputSchema = z.object({
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
  query: z.string().min(1).max(500)
    .describe("Search query to find relevant memories. Use descriptive terms. Examples: 'invoice processing workflow', 'currency preferences'."),
  limit: z.number().int().min(1).max(20).default(5).optional()
    .describe('Maximum number of results to return (1-20, default: 5).'),
});

export type MemorySearchInput = z.infer<typeof MemorySearchInputSchema>;

export interface MemorySearchOutput {
  memories: Array<{
    id: string;
    content: string;
    relevance_score: number;
    created_at: string;
  }>;
  total_count: number;
  query: string;
}

// ============================================================================
// Tool: memory_recall (Memory batch - 032-mcp-first)
// ============================================================================

export const MemoryRecallInputSchema = z.object({
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
  category: z.enum(['preference', 'fact', 'context', 'instruction', 'all']).default('all').optional()
    .describe("Filter memories by category. Use 'all' to retrieve all memories. Default: 'all'."),
  limit: z.number().int().min(1).max(50).default(20).optional()
    .describe('Maximum number of memories to retrieve (1-50, default: 20).'),
});

export type MemoryRecallInput = z.infer<typeof MemoryRecallInputSchema>;

export interface MemoryRecallOutput {
  memories: Array<{
    id: string;
    content: string;
    created_at: string;
  }>;
  total_count: number;
  total_available?: number;
  category: string;
}

// ============================================================================
// Tool: memory_forget (Memory batch - 032-mcp-first)
// ============================================================================

export const MemoryForgetInputSchema = z.object({
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key authentication)'),
  memory_id: z.string().optional()
    .describe('Specific memory ID to delete. Use if you have the exact memory ID from a previous recall or search.'),
  search_query: z.string().max(500).optional()
    .describe("Search query to find memories to delete. Example: 'currency preference'."),
  delete_all: z.boolean().default(false).optional()
    .describe('If true and search_query is provided, delete all matching memories. Default: false (only deletes first match).'),
});

export type MemoryForgetInput = z.infer<typeof MemoryForgetInputSchema>;

export interface MemoryForgetOutput {
  deleted_count: number;
  deleted_ids: string[];
  message: string;
}

// ============================================================================
// Tool: create_expense_from_receipt (receipt OCR -> expense claim)
// ============================================================================

export const CreateExpenseFromReceiptInputSchema = z.object({
  attachments: z.array(z.object({
    s3Path: z.string().describe('S3 key for the uploaded receipt image'),
    mimeType: z.string().describe('MIME type of the file'),
    filename: z.string().describe('Original filename'),
  })).min(1)
    .describe('Receipt image attachments from the chat message'),
  businessPurpose: z.string().optional()
    .describe('Optional business purpose provided by the user'),
});

export type CreateExpenseFromReceiptInput = z.infer<typeof CreateExpenseFromReceiptInputSchema>;

export interface CreateExpenseFromReceiptOutput {
  proposal_id: string;
  confirmation_required: true;
  attachment_count: number;
  message: string;
}

// ============================================================================
// Tool: get_action_center_insight
// ============================================================================

export const GetActionCenterInsightInputSchema = z.object({
  insight_id: z.string().min(1)
    .describe('The unique identifier of the Action Center insight to retrieve'),
});

export type GetActionCenterInsightInput = z.infer<typeof GetActionCenterInsightInputSchema>;

export interface GetActionCenterInsightOutput {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  recommendedAction?: string;
  affectedEntities?: unknown[];
  detectedAt: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Tool: analyze_trends
// ============================================================================

export const AnalyzeTrendsInputSchema = z.object({
  mode: z.enum(['compare', 'trend', 'growth'])
    .describe("Analysis mode: 'compare' for two-period comparison, 'trend' for multi-period time series, 'growth' for growth rate calculation."),
  metric: z.enum(['revenue', 'expenses', 'profit', 'cash_flow'])
    .describe('Financial metric to analyze: revenue, expenses, profit, or cash_flow.'),
  period_a: z.string().optional()
    .describe("First period (compare mode) or start of range. Natural language: 'Q1 2025', 'January 2026', 'last quarter'."),
  period_b: z.string().optional()
    .describe("Second period for comparison (compare mode only). E.g., 'Q1 2026'."),
  date_range: z.string().optional()
    .describe("Time range for trend mode. E.g., 'past 6 months', 'last year', 'past 12 months'."),
  granularity: z.enum(['monthly', 'quarterly', 'yearly']).optional()
    .describe("Data aggregation granularity for trend mode. Default: 'monthly'."),
  display_currency: z.string().optional()
    .describe("Optional currency code (e.g., 'USD', 'SGD') to show converted amounts alongside home currency."),
});

export type AnalyzeTrendsInput = z.infer<typeof AnalyzeTrendsInputSchema>;

export interface AnalyzeTrendsOutput {
  mode: string;
  metric: string;
  result: Record<string, unknown>;
}

// ============================================================================
// Tool: set_budget (write -- uses proposal pattern)
// ============================================================================

export const SetBudgetInputSchema = z.object({
  category_name: z.string().min(1)
    .describe("Name of the expense category (e.g., 'Travel', 'Meals', 'Office Supplies'). Case-insensitive match against existing categories."),
  monthly_limit: z.number().min(0)
    .describe('Budget amount. Use a value greater than 0 to set/update the limit, or 0 to remove the budget limit.'),
  currency: z.string().regex(/^[A-Z]{3}$/).optional()
    .describe("ISO 4217 currency code (e.g., 'MYR', 'SGD', 'USD'). Defaults to the business home currency if not specified."),
});

export type SetBudgetInput = z.infer<typeof SetBudgetInputSchema>;

export interface SetBudgetOutput {
  proposal_id: string;
  confirmation_required: true;
  action: string;
  category_name: string;
  monthly_limit?: number;
  currency?: string;
  message: string;
}

// ============================================================================
// Tool: check_budget_status (read-only)
// ============================================================================

export const CheckBudgetStatusInputSchema = z.object({
  category: z.string().optional()
    .describe("Optional: filter to a specific expense category name (e.g., 'Travel', 'Meals'). Case-insensitive. If omitted, returns all budgeted categories."),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional()
    .describe("Budget period in YYYY-MM format (e.g., '2026-03'). Defaults to the current month if not specified."),
});

export type CheckBudgetStatusInput = z.infer<typeof CheckBudgetStatusInputSchema>;

export interface CheckBudgetStatusOutput {
  period: string;
  currency: string;
  categories: Array<{
    categoryId: string;
    categoryName: string;
    budgetLimit: number;
    currentSpend: number;
    remaining: number;
    percentUsed: number;
    status: 'on_track' | 'warning' | 'overspent';
  }>;
  totalBudget: number;
  totalSpend: number;
  overallUtilization: number;
  overallStatus: string;
  overBudgetCategories: string[];
  warningCategories: string[];
  message?: string;
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
  | AnalyzeTeamSpendingInput
  | SendEmailReportInput
  | CompareToIndustryInput
  | ToggleBenchmarkingInput
  | GetInvoicesInput
  | GetSalesInvoicesInput
  | GetTransactionsInput
  | GetVendorsInput
  | SearchDocumentsInput
  | SearchRegulatoryKBInput
  | GetARSummaryInput
  | GetAPAgingInput
  | GetBusinessTransactionsInput
  | GetEmployeeExpensesInput
  | GetTeamSummaryInput
  | GetLateApprovalsInput
  | CompareTeamSpendingInput
  | MemoryStoreInput
  | MemorySearchInput
  | MemoryRecallInput
  | MemoryForgetInput
  | CreateExpenseFromReceiptInput
  | GetActionCenterInsightInput
  | AnalyzeTrendsInput
  | SetBudgetInput
  | CheckBudgetStatusInput;

export type MCPToolOutput =
  | DetectAnomaliesOutput
  | ForecastCashFlowOutput
  | AnalyzeVendorRiskOutput
  | AnalyzeTeamSpendingOutput
  | SendEmailReportOutput
  | CompareToIndustryOutput
  | ToggleBenchmarkingOutput
  | GetInvoicesOutput
  | GetSalesInvoicesOutput
  | GetTransactionsOutput
  | GetVendorsOutput
  | SearchDocumentsOutput
  | SearchRegulatoryKBOutput
  | GetARSummaryOutput
  | GetAPAgingOutput
  | GetBusinessTransactionsOutput
  | GetEmployeeExpensesOutput
  | GetTeamSummaryOutput
  | GetLateApprovalsOutput
  | CompareTeamSpendingOutput
  | MemoryStoreOutput
  | MemorySearchOutput
  | MemoryRecallOutput
  | MemoryForgetOutput
  | CreateExpenseFromReceiptOutput
  | GetActionCenterInsightOutput
  | AnalyzeTrendsOutput
  | SetBudgetOutput
  | CheckBudgetStatusOutput;

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
  },
  send_email_report: {
    name: 'send_email_report',
    description: 'Send a formatted financial report via email. Two-phase: call with confirmed=false for preview, then confirmed=true after user approval. Requires finance_admin or owner role. Rate limit: 50 emails/business/day.',
    inputSchema: SendEmailReportInputSchema
  },
  compare_to_industry: {
    name: 'compare_to_industry',
    description: 'Compare a business\'s financial metrics against anonymized industry benchmarks from opted-in Groot customers. Returns percentile ranking, averages, and recommendations. Business must be opted in.',
    inputSchema: CompareToIndustryInputSchema
  },
  toggle_benchmarking: {
    name: 'toggle_benchmarking',
    description: 'Opt a business in or out of anonymized cross-business benchmarking. Requires finance_admin or owner role.',
    inputSchema: ToggleBenchmarkingInputSchema
  },
  // Finance/AP/AR batch (032-mcp-first)
  get_invoices: {
    name: 'get_invoices',
    description: 'Search and retrieve incoming/purchase invoices (Accounts Payable). Returns invoices with vendor name, amount, date, invoice number, line items, and payment status. Supports filtering by vendor name, date range, amount range, and invoice number.',
    inputSchema: GetInvoicesInputSchema
  },
  get_sales_invoices: {
    name: 'get_sales_invoices',
    description: 'Retrieve outgoing sales invoices (Accounts Receivable). Returns sales invoices with status (draft, sent, overdue, paid, partially_paid), amounts, due dates, and outstanding balance summary.',
    inputSchema: GetSalesInvoicesInputSchema
  },
  get_transactions: {
    name: 'get_transactions',
    description: 'Primary financial tool: retrieve journal entry transactions with optional filters for date range, vendor, category, amount range, and transaction type. Returns personal-scoped data (employees see only expense claims).',
    inputSchema: GetTransactionsInputSchema
  },
  get_vendors: {
    name: 'get_vendors',
    description: 'Get deduplicated list of vendor/supplier names from AP invoices. Returns business-to-business vendors only (not expense claim merchants).',
    inputSchema: GetVendorsInputSchema
  },
  search_documents: {
    name: 'search_documents',
    description: 'Search uploaded financial documents by text content using vector similarity. Returns matching documents with relevance scores. Does NOT support date or amount filters.',
    inputSchema: SearchDocumentsInputSchema
  },
  search_regulatory_knowledge_base: {
    name: 'search_regulatory_knowledge_base',
    description: 'Answer questions about tax laws, compliance, regulations, and registration requirements for Singapore and Malaysia using RAG over the regulatory knowledge base.',
    inputSchema: SearchRegulatoryKBInputSchema
  },
  get_ar_summary: {
    name: 'get_ar_summary',
    description: 'Get accounts receivable summary: total revenue, outstanding balances, overdue aging buckets, status breakdown, and top customers with outstanding amounts.',
    inputSchema: GetARSummaryInputSchema
  },
  get_ap_aging: {
    name: 'get_ap_aging',
    description: 'Get accounts payable aging report: outstanding vendor balances, aging buckets, vendor breakdown, and upcoming payment due dates.',
    inputSchema: GetAPAgingInputSchema
  },
  get_business_transactions: {
    name: 'get_business_transactions',
    description: 'Query business-wide transactions across ALL employees with employee attribution. For admin/owner use. Supports vendor, category, date, and transaction type filters.',
    inputSchema: GetBusinessTransactionsInputSchema
  },
  // Team/Manager batch (032-mcp-first)
  get_employee_expenses: {
    name: 'get_employee_expenses',
    description: "Look up a specific employee's approved expense transactions. Use when a manager asks about a specific team member's spending (e.g., 'How much did Sarah spend at Starbucks?'). Requires the manager to have the employee as a direct report. Only returns approved/posted financial records.",
    inputSchema: GetEmployeeExpensesInputSchema
  },
  get_team_summary: {
    name: 'get_team_summary',
    description: "Get aggregate spending summary across your team (all direct reports). Use when a manager asks about total team spending, spending rankings, or comparisons across employees (e.g., 'What is the total team spending this month?'). Returns per-employee breakdown and top categories.",
    inputSchema: GetTeamSummaryInputSchema
  },
  get_late_approvals: {
    name: 'get_late_approvals',
    description: "Find expense submissions that have been waiting for approval beyond the threshold. Use when a manager asks 'Any late approvals?' or 'What\\'s overdue?' Returns late submissions sorted by urgency with business-day calculation.",
    inputSchema: GetLateApprovalsInputSchema
  },
  compare_team_spending: {
    name: 'compare_team_spending',
    description: "Compare spending across team members with outlier detection. Shows per-employee spending breakdown with employees spending significantly above average highlighted. Use when a manager asks 'Compare team spending' or 'Who is spending the most?'",
    inputSchema: CompareTeamSpendingInputSchema
  },
  // Memory batch (032-mcp-first)
  memory_store: {
    name: 'memory_store',
    description: 'Persist important user facts, preferences, and context for future conversations. Use when the user shares information worth remembering (e.g., "My company uses Thai Baht", "I prefer detailed reports"). Includes contradiction detection for conflicting facts.',
    inputSchema: MemoryStoreInputSchema
  },
  memory_search: {
    name: 'memory_search',
    description: "Semantic search over stored user memories. Find relevant previously stored information about specific topics (e.g., searching for 'currency preferences' returns memories about currency settings).",
    inputSchema: MemorySearchInputSchema
  },
  memory_recall: {
    name: 'memory_recall',
    description: 'Retrieve all stored memories about the user for context enrichment. Use at conversation start or when you need to recall what you know about the user. Returns preferences, facts, context, and instructions.',
    inputSchema: MemoryRecallInputSchema
  },
  memory_forget: {
    name: 'memory_forget',
    description: 'Remove stored memories by ID or search query. Use when the user explicitly requests to forget specific information. Supports deleting a single memory by ID or searching and deleting matching memories.',
    inputSchema: MemoryForgetInputSchema
  },
  // Misc batch (032-mcp-first)
  create_expense_from_receipt: {
    name: 'create_expense_from_receipt',
    description: 'Process receipt images attached in chat to create expense claims. Extracts merchant, amount, date, category via OCR and creates a draft expense claim. Uses proposal pattern for human confirmation before creating the claim.',
    inputSchema: CreateExpenseFromReceiptInputSchema
  },
  get_action_center_insight: {
    name: 'get_action_center_insight',
    description: 'Retrieve detailed information about a specific Action Center insight by ID. Returns the full insight including category, priority, description, affected entities, and metadata. Use when investigating a specific alert from the Action Center.',
    inputSchema: GetActionCenterInsightInputSchema
  },
  analyze_trends: {
    name: 'analyze_trends',
    description: "Analyze financial trends, compare periods, or calculate growth rates. Modes: 'compare' for two-period comparison (e.g., Q1 vs Q2), 'trend' for multi-period time series, 'growth' for growth rate calculation. Supports optional currency conversion.",
    inputSchema: AnalyzeTrendsInputSchema
  },
  set_budget: {
    name: 'set_budget',
    description: "Set, update, or remove a monthly budget limit for an expense category. Uses proposal pattern for human confirmation. Use when a manager says 'Set Travel budget to RM 5000' or 'Remove the Travel budget'. Requires manager/finance_admin/owner role.",
    inputSchema: SetBudgetInputSchema
  },
  check_budget_status: {
    name: 'check_budget_status',
    description: "Check budget utilization status across expense categories. Shows spending vs configured budget limits with status indicators (on_track, warning, overspent). If no budgets are configured, suggests using set_budget. Requires manager/finance_admin/owner role.",
    inputSchema: CheckBudgetStatusInputSchema
  },
} as const;

export type MCPToolName = keyof typeof MCP_TOOLS;
