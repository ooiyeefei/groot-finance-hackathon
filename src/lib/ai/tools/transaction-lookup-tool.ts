/**
 * Secure Transaction Lookup Tool
 * Enforces RLS and proper user context validation for transaction queries
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { aiConfig } from '@/lib/ai/config/ai-config'
import { resolveDateRange } from '@/lib/ai/utils/date-range-resolver'
import { Id } from '@/convex/_generated/dataModel'

interface TransactionLookupParameters {
  query?: string
  limit?: number
  startDate?: string
  endDate?: string
  dateRange?: string  // Dynamic date range - supports patterns like "past_30_days", "100 days", "last 2 months", etc.
  category?: string
  minAmount?: number
  maxAmount?: number
  transactionType?: 'Income' | 'Cost of Goods Sold' | 'Expense'  // Filter by transaction type (income, expense, COGS)
  // Internal parameter for source document type filtering (not exposed to AI)
  _sourceDocumentType?: 'invoice' | 'expense_claim'
}

export class TransactionLookupTool extends BaseTool {
  // Temporal contamination detection patterns
  private static readonly TEMPORAL_PATTERNS = [
    /\b(past|last|previous|recent)\b/gi,
    /\b(days?|weeks?|months?|years?)\b/gi,
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/gi,
    /\b(today|yesterday|tomorrow)\b/gi,
    /\b(this|next)\s+(week|month|year)\b/gi,
    /\d{1,2}(st|nd|rd|th)\b/gi,  // 25th, 3rd, etc.
    /\b\d{1,4}[-/]\d{1,2}[-/]\d{1,4}\b/gi  // Date patterns
  ]

  private static readonly ANALYTICAL_PATTERNS = [
    /\b(largest|biggest|highest|maximum|max)\b/gi,
    /\b(smallest|lowest|minimum|min)\b/gi,
    /\b(total|sum|average|mean)\b/gi,
    /\b(all|every|each)\b/gi,
    /\b(what|show|list|find)\b/gi
  ]

  // Natural language intent words that should NEVER be used as text search terms.
  // These describe what the user wants to DO with the data, not what data to search for.
  private static readonly INTENT_PATTERNS = [
    /\b(spending|expenses?|income|revenue|costs?|profits?|loss(?:es)?|earnings?|savings?)\b/gi,
    /\b(trends?|patterns?|overview|summary|breakdown|analysis|analyze|insights?|metrics?)\b/gi,
    /\b(budget|budgets?|forecast|prediction|projections?|estimates?)\b/gi,
    /\b(anomal(?:y|ies)|unusual|irregular|strange|suspicious|outliers?)\b/gi,
    /\b(compare|comparison|versus|vs|against)\b/gi,
    /\b(cash|flow|runway|burn|rate|ratio)\b/gi,
    /\b(categorize|classify|group|sort|rank|order)\b/gi,
    /\b(report|reports?|chart|graph|visualization|dashboard)\b/gi,
    /\b(monitor|tracking|performance|review|audit)\b/gi,
  ]

  /**
   * Self-defending query sanitization to prevent temporal contamination
   * CRITICAL FIX: Preserve analytical terms for analysis queries
   */
  private _sanitize_query(query: string, dateRange?: string, isAnalysisQuery: boolean = false): string {
    if (!query || !query.trim()) {
      return ""
    }

    const originalQuery = query.toLowerCase().trim()
    let sanitized = originalQuery

    // Remove temporal contamination
    for (const pattern of TransactionLookupTool.TEMPORAL_PATTERNS) {
      sanitized = sanitized.replace(pattern, '')
    }

    // CRITICAL FIX: Only remove analytical contamination for NON-analysis queries
    // For analysis queries, preserve analytical terms like "largest", "biggest", etc.
    if (!isAnalysisQuery) {
      for (const pattern of TransactionLookupTool.ANALYTICAL_PATTERNS) {
        sanitized = sanitized.replace(pattern, '')
      }
      console.log(`[GUARDRAIL] Removed analytical patterns for non-analysis query`)
    } else {
      console.log(`[GUARDRAIL] PRESERVED analytical terms for analysis query: "${originalQuery}"`)
    }

    // Remove natural language intent words (unconditional — these are never valid text search terms)
    for (const pattern of TransactionLookupTool.INTENT_PATTERNS) {
      sanitized = sanitized.replace(pattern, '')
    }

    // Clean up extra spaces and common words
    sanitized = sanitized.replace(/\b(i|have|in|the|what|are|transactions?)\b/gi, '')
    sanitized = sanitized.split(/\s+/).filter(word => word.length > 0).join(' ') // Normalize spaces

    // Log contamination detection
    if (sanitized !== originalQuery) {
      console.log(`[GUARDRAIL] Query sanitized: '${originalQuery}' → '${sanitized}' (analysis: ${isAnalysisQuery})`)
    }

    // CRITICAL FIX: For analysis queries, don't return empty string even if sanitized is short
    // Analysis queries like "largest" should be preserved
    if (isAnalysisQuery && originalQuery.match(/\b(largest|biggest|highest|maximum|smallest|lowest|minimum)\b/i)) {
      console.log(`[GUARDRAIL] Analysis query detected - preserving original: '${originalQuery}'`)
      return originalQuery
    }

    // If date_range exists and query is now empty/meaningless, return empty
    if (dateRange && (!sanitized || sanitized.length < 3)) {
      console.log(`[GUARDRAIL] Empty query with dateRange=${dateRange} - returning empty string`)
      return ""
    }

    return sanitized
  }

  /**
   * Pre-execution parameter validation with automatic fixes
   */
  private _validate_parameters(parameters: TransactionLookupParameters): { is_valid: boolean; issues: string[]; suggested_fixes: Partial<TransactionLookupParameters> } {
    const issues: string[] = []
    const suggested_fixes: Partial<TransactionLookupParameters> = {}

    // Check for temporal contamination in query
    if (parameters.query) {
      const queryLower = parameters.query.toLowerCase()
      for (const pattern of TransactionLookupTool.TEMPORAL_PATTERNS) {
        if (pattern.test(queryLower)) {
          issues.push(`Temporal contamination detected: ${pattern}`)
        }
      }
    }

    // Check for query pollution when asking for "all transactions"
    if (parameters.dateRange && parameters.query) {
      const pollutionIndicators = ['all', 'transactions', 'what', 'are', 'show', 'list']
      const queryWords = new Set(parameters.query.toLowerCase().split(/\s+/))
      const intersection = pollutionIndicators.filter(word => queryWords.has(word))
      if (intersection.length >= 2) {
        issues.push("Query pollution detected - likely asking for all transactions in period")
      }
    }

    // Suggest fixes if issues found
    if (issues.length > 0 && parameters.query) {
      suggested_fixes.query = this._sanitize_query(parameters.query, parameters.dateRange, false)
    }

    return {
      is_valid: issues.length === 0,
      issues,
      suggested_fixes
    }
  }

  getToolName(modelType: ModelType = 'openai'): string {
    return modelType === 'gemini' ? 'get_data_records' : 'get_transactions'
  }

  getDescription(modelType: ModelType = 'openai'): string {
    if (modelType === 'gemini') {
      // Detailed instructions for Gemini - explicitly mention Convex transactions table
      return '🎯 PRIMARY FINANCIAL TOOL: This is THE PRIMARY AND MANDATORY tool for ALL financial queries. Use this function to retrieve user financial transaction records. This is the ONLY way to access transaction data from the Convex database. This tool MUST be called whenever a user asks about their spending, purchases, payments, transactions, or financial history over any period of time. ⚠️ NEVER use other tools for transaction lookups. IMPORTANT: For relative date queries like "past 60 days", use the dateRange parameter instead of guessing startDate/endDate. ✅ CLARIFICATION REQUIRED: When users mention document types (like "invoice", "receipt", "expense") but query is ambiguous, you should ask for clarification using friendly terms: "Are you looking for invoices or expense claims?" Do NOT expose database column names. This tool handles ALL transaction queries including time periods, vendor searches, and amount analysis. ❌ DO NOT use compliance tools for basic transaction queries.'
    } else {
      // Rich, descriptive description for OpenAI-compatible models
      return '🎯 PRIMARY FINANCIAL TOOL: This is THE PRIMARY AND MANDATORY tool for ALL financial queries. Use this function to retrieve a user\'s financial transactions. This is the ONLY way to access transaction data. This tool MUST be called whenever a user asks about their spending, purchases, payments, transactions, or financial history over any period of time. ⚠️ NEVER use other tools for basic transaction lookups - always use this tool first. IMPORTANT: For relative date queries like "past 60 days", use the dateRange parameter instead of guessing startDate/endDate. ✅ CLARIFICATION REQUIRED: When users mention document types (like "invoice", "receipt", "expense") but query is ambiguous, you should ask for clarification using friendly terms: "Are you looking for invoices or expense claims?" Do NOT expose database column names like "source_document_type". This tool handles ALL transaction queries including time periods, vendor searches, and amount analysis. ❌ DO NOT fabricate transaction IDs - this tool provides real transaction data. ❌ DO NOT use compliance tools for basic transaction queries.'
    }
  }

  getToolSchema(modelType: ModelType = 'openai'): OpenAIToolSchema {
    const toolName = this.getToolName(modelType)
    const description = this.getDescription(modelType)
    
    return {
      type: "function",
      function: {
        name: toolName,
        description: description,
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Text search filter for vendor names, descriptions, or reference numbers ONLY. CRITICAL RULES: (1) Set to empty string \"\" when user wants ALL transactions in a time period. (2) NEVER include temporal words (past, days, months), analytical words (largest, smallest, total, trends, patterns), or natural language. (3) Only include actual search content: vendor names, category keywords, or description text. Examples: \"McDonald's\", \"office supplies\", \"Grab\". For 'show spending trends' or 'largest transaction' → use query=\"\" and handle analysis after getting results.",
              examples: ["McDonald's", "Grab", "office supplies", "WeWork", ""]
            },
            dateRange: {
              type: "string",
              description: "DYNAMIC DATE RANGE: Flexible temporal filtering that accepts natural language patterns. Examples: 'past_60_days', '100 days', 'last 2 months', 'past 150 days', 'this_month', 'last_year'. Automatically calculates date ranges from user input instead of forcing predefined options.",
            },
            startDate: {
              type: "string",
              description: "Specific start date (YYYY-MM-DD). Use ONLY when user provides an exact date. For relative queries like 'past 60 days', use dateRange instead."
            },
            endDate: {
              type: "string",
              description: "Specific end date (YYYY-MM-DD). Use ONLY when user provides an exact date. For relative queries like 'past 60 days', use dateRange instead."
            },
            category: {
              type: "string",
              description: "Filter by transaction category"
            },
            minAmount: {
              type: "number",
              description: "Minimum transaction amount"
            },
            maxAmount: {
              type: "number",
              description: "Maximum transaction amount"
            },
            limit: {
              type: "integer",
              description: "Maximum number of results to return (default: 10)",
              minimum: 1,
              maximum: 100
            },
            transactionType: {
              type: "string",
              description: "Filter by transaction type. Use 'Income' for revenue/sales/deals, 'Expense' for costs/purchases, 'Cost of Goods Sold' for COGS/inventory costs. CRITICAL: When user asks about 'income', 'revenue', 'sales', 'deals' use 'Income'. When user asks about 'expenses', 'costs', 'purchases' use 'Expense'.",
              enum: ["Income", "Cost of Goods Sold", "Expense"]
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    // CRITICAL: Strip out unsupported parameters that AI models sometimes pass
    const supportedParams = ['query', 'limit', 'startDate', 'endDate', 'dateRange', 'category', 'minAmount', 'maxAmount', 'transactionType', '_sourceDocumentType']
    const cleanedParameters: any = {}
    
    for (const [key, value] of Object.entries(parameters)) {
      if (supportedParams.includes(key)) {
        cleanedParameters[key] = value
      } else {
        console.warn(`[TransactionLookupTool] Stripping unsupported parameter: ${key} = ${value}`)
      }
    }
    
    // Replace the original parameters with cleaned version
    Object.keys(parameters).forEach(key => delete parameters[key])
    Object.assign(parameters, cleanedParameters)
    
    const params = parameters as TransactionLookupParameters

    // Query is optional - allow analysis without specific query (handle undefined, null, and empty strings)
    if (params.query) {
      if (typeof params.query !== 'string') {
        return { valid: false, error: 'Query must be a string' }
      }
      // CRITICAL FIX: Don't reject empty queries - they're valid for dateRange-only queries
      if (params.query.length > 300) {
        return { valid: false, error: 'Query too long (max 300 characters)' }
      }
    }

    // Validate optional limit - handle JSON number parsing properly (handle both undefined and null)
    if (params.limit != null) {
      const limit = Number(params.limit)
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return { valid: false, error: 'Limit must be an integer between 1 and 100' }
      }
    }

    // Validate dates if provided
    if (params.startDate && !this.isValidDate(params.startDate)) {
      return { valid: false, error: 'Invalid start date format (use YYYY-MM-DD)' }
    }
    
    if (params.endDate && !this.isValidDate(params.endDate)) {
      return { valid: false, error: 'Invalid end date format (use YYYY-MM-DD)' }
    }
    
    if (params.startDate && params.endDate && new Date(params.startDate) > new Date(params.endDate)) {
      return { valid: false, error: 'Start date cannot be after end date' }
    }

    // Validate amounts if provided (handle both undefined and null from different LLM models)
    if (params.minAmount != null && (typeof params.minAmount !== 'number' || params.minAmount < 0)) {
      return { valid: false, error: 'Minimum amount must be a non-negative number' }
    }

    if (params.maxAmount != null && (typeof params.maxAmount !== 'number' || params.maxAmount < 0)) {
      return { valid: false, error: 'Maximum amount must be a non-negative number' }
    }

    if (params.minAmount != null && params.maxAmount != null && params.minAmount > params.maxAmount) {
      return { valid: false, error: 'Minimum amount cannot be greater than maximum amount' }
    }

    // Validate _sourceDocumentType if provided (internal parameter)
    if (params._sourceDocumentType != null) {
      const validSourceDocumentTypes = ['invoice', 'expense_claim']
      if (!validSourceDocumentTypes.includes(params._sourceDocumentType)) {
        return { valid: false, error: 'Invalid source document type. Must be invoice or expense_claim' }
      }
    }

    // Validate transactionType if provided
    if (params.transactionType != null) {
      const validTransactionTypes = ['Income', 'Cost of Goods Sold', 'Expense']
      if (!validTransactionTypes.includes(params.transactionType)) {
        return { valid: false, error: 'Invalid transaction type. Must be Income, Cost of Goods Sold, or Expense' }
      }
    }

    return { valid: true }
  }

  /**
   * Calculate date range from dateRange parameters.
   * Delegates to shared resolveDateRange utility for consistent behavior across all tools.
   *
   * Handles legacy patterns (underscore format like "past_60_days", "june_2024")
   * by normalizing them before passing to the shared resolver.
   */
  private _calculateDateRange(params: TransactionLookupParameters): { startDate?: string; endDate?: string } {
    let startDate: string | undefined = params.startDate
    let endDate: string | undefined = params.endDate

    if (!params.dateRange) {
      return { startDate, endDate }
    }

    console.log(`[TransactionLookupTool] DETERMINISTIC: Calculating dates via shared resolver for: ${params.dateRange}`)

    // Normalize legacy underscore patterns to space-separated for the shared resolver
    // e.g., "past_60_days" → "past 60 days", "june_2024" → "june 2024", "this_month" → "this month"
    const normalized = params.dateRange.replace(/_/g, ' ')

    const result = resolveDateRange(normalized)
    startDate = result.startDate
    endDate = result.endDate

    console.log(`[TransactionLookupTool] CALCULATED via shared resolver: ${params.dateRange} → ${startDate} to ${endDate} (${result.description})`)

    return { startDate, endDate }
  }

  /**
   * Parse month name and year into start/end dates
   * Consolidates duplicate month parsing logic
   */
  private _parseMonthYear(monthName: string, year: number): { startDate: string; endDate: string } | null {
    const monthMap: { [key: string]: number } = {
      'january': 0, 'jan': 0,
      'february': 1, 'feb': 1,
      'march': 2, 'mar': 2,
      'april': 3, 'apr': 3,
      'may': 4,
      'june': 5, 'jun': 5,
      'july': 6, 'jul': 6,
      'august': 7, 'aug': 7,
      'september': 8, 'sep': 8, 'sept': 8,
      'october': 9, 'oct': 9,
      'november': 10, 'nov': 10,
      'december': 11, 'dec': 11
    }

    const monthNumber = monthMap[monthName.toLowerCase()]
    if (monthNumber !== undefined) {
      // Calculate first and last day of the specified month
      const startDateObj = new Date(year, monthNumber, 1)
      const endDateObj = new Date(year, monthNumber + 1, 0) // Last day of the month

      return {
        startDate: startDateObj.toISOString().split('T')[0],
        endDate: endDateObj.toISOString().split('T')[0]
      }
    }
    return null
  }

  /**
   * ENHANCED: Dynamic date range calculation supporting flexible user inputs
   * Supports patterns like "100 days", "past 150 days", "last 2 months", etc.
   */
  private _calculateStandardDateRange(dateRange: string, today: Date): { startDate: string; endDate: string; error?: string } {
    const endDate = today.toISOString().split('T')[0] // YYYY-MM-DD format
    const dateRangeLower = dateRange.toLowerCase().trim()

    console.log(`[TransactionLookupTool] DYNAMIC: Processing date range: "${dateRange}"`)

    // ENHANCED PATTERN MATCHING: Support multiple formats
    // Pattern 1: "X days" or "past X days" or "last X days"
    const daysMatch = dateRangeLower.match(/(?:past\s+|last\s+)?(\d+)\s*days?/)
    if (daysMatch) {
      const dayCount = parseInt(daysMatch[1], 10)
      return this._calculateDaysRange(dayCount, today, dateRange, endDate)
    }

    // Pattern 2: "X weeks" or "past X weeks" or "last X weeks"
    const weeksMatch = dateRangeLower.match(/(?:past\s+|last\s+)?(\d+)\s*weeks?/)
    if (weeksMatch) {
      const weekCount = parseInt(weeksMatch[1], 10)
      const dayCount = weekCount * 7
      return this._calculateDaysRange(dayCount, today, dateRange, endDate)
    }

    // Pattern 3: "X months" or "past X months" or "last X months"
    const monthsMatch = dateRangeLower.match(/(?:past\s+|last\s+)?(\d+)\s*months?/)
    if (monthsMatch) {
      const monthCount = parseInt(monthsMatch[1], 10)

      // VALIDATION: Reasonable range limits (1-24 months = 2 years max)
      if (monthCount < 1 || monthCount > 24) {
        return {
          startDate: endDate,
          endDate,
          error: `Invalid month count: ${monthCount}. Must be between 1 and 24 months.`
        }
      }

      // Calculate start date by going back X months
      const startDateObj = new Date(today.getFullYear(), today.getMonth() - monthCount, today.getDate())
      const startDate = startDateObj.toISOString().split('T')[0]

      console.log(`[TransactionLookupTool] DYNAMIC: ${dateRange} = ${startDate} to ${endDate} (${monthCount} months)`)
      return { startDate, endDate }
    }

    // Pattern 3b: "X year(s)" or "past year" or "last year" (supports omitting the number for singular year)
    // FIX: Handles queries like "past year", "last year", "1 year", "2 years"
    const yearsMatch = dateRangeLower.match(/(?:past\s+|last\s+)?(\d*)\s*years?/)
    if (yearsMatch) {
      // Default to 1 year if no number specified (e.g., "past year" vs "past 2 years")
      const yearCount = yearsMatch[1] ? parseInt(yearsMatch[1], 10) : 1

      // VALIDATION: Reasonable range limits (1-5 years max)
      if (yearCount < 1 || yearCount > 5) {
        return {
          startDate: endDate,
          endDate,
          error: `Invalid year count: ${yearCount}. Must be between 1 and 5 years.`
        }
      }

      // Calculate start date by going back X years (using 365 days per year)
      const dayCount = yearCount * 365
      console.log(`[TransactionLookupTool] YEAR PATTERN: "${dateRange}" parsed as ${yearCount} year(s) = ${dayCount} days`)
      return this._calculateDaysRange(dayCount, today, dateRange, endDate)
    }

    // Pattern 4: Legacy numbered patterns like "past_60_days"
    const legacyDaysMatch = dateRangeLower.match(/past_(\d+)_days?/)
    if (legacyDaysMatch) {
      const dayCount = parseInt(legacyDaysMatch[1], 10)
      return this._calculateDaysRange(dayCount, today, dateRange, endDate)
    }

    // Pattern 5: Simple number extraction as fallback (e.g., user just says "100")
    const numberMatch = dateRangeLower.match(/(\d+)/)
    if (numberMatch) {
      const dayCount = parseInt(numberMatch[1], 10)
      console.log(`[TransactionLookupTool] FALLBACK: Treating "${dateRange}" as ${dayCount} days`)
      return this._calculateDaysRange(dayCount, today, dateRange, endDate)
    }

    // SIMPLIFIED PREDEFINED RANGES: Use same millisecond approach
    switch (dateRange) {
      case 'this_month': {
        const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
        console.log(`[TransactionLookupTool] SIMPLE: ${dateRange} = ${startDate} to ${endDate}`)
        return { startDate, endDate }
      }
      case 'last_month': {
        const lastMonthYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()
        const lastMonthMonth = today.getMonth() === 0 ? 11 : today.getMonth() - 1
        const startDate = new Date(lastMonthYear, lastMonthMonth, 1).toISOString().split('T')[0]
        const endDate = new Date(lastMonthYear, lastMonthMonth + 1, 0).toISOString().split('T')[0]
        console.log(`[TransactionLookupTool] SIMPLE: ${dateRange} = ${startDate} to ${endDate}`)
        return { startDate, endDate }
      }
      case 'this_year': {
        const startDate = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0]
        console.log(`[TransactionLookupTool] SIMPLE: ${dateRange} = ${startDate} to ${endDate}`)
        return { startDate, endDate }
      }
      default:
        return {
          startDate: endDate,
          endDate,
          error: `Unknown date range: "${dateRange}". Use patterns like "100 days", "past 30 days", "2 months", "this_month", "last_month", or "this_year".`
        }
    }
  }

  /**
   * Helper method to calculate date range for day-based periods with validation
   */
  private _calculateDaysRange(dayCount: number, today: Date, originalRange: string, endDate: string): { startDate: string; endDate: string; error?: string } {
    // VALIDATION: Reasonable range limits (1-1825 days = 5 years max)
    // Aligned with year pattern validation (lines 454-460) which allows 1-5 years
    if (dayCount < 1 || dayCount > 1825) {
      return {
        startDate: endDate,
        endDate,
        error: `Invalid day count: ${dayCount}. Must be between 1 and 1825 days (5 years).`
      }
    }

    // DIRECT CALCULATION: Today minus X days using milliseconds
    const msPerDay = 24 * 60 * 60 * 1000
    const startDateMs = today.getTime() - (dayCount * msPerDay)
    const startDate = new Date(startDateMs).toISOString().split('T')[0]

    console.log(`[TransactionLookupTool] DYNAMIC: ${originalRange} = ${startDate} to ${endDate} (${dayCount} days)`)
    return { startDate, endDate }
  }

  /**
   * Extract transaction type from user query using friendly terms
   * Maps user-friendly terms like "income", "revenue", "expense" to database values
   */
  private _extractTransactionType(query: string): 'Income' | 'Cost of Goods Sold' | 'Expense' | null {
    if (!query) return null

    const queryLower = query.toLowerCase()

    // Map user-friendly terms to database values
    const incomeTerms = ['income', 'incomes', 'revenue', 'revenues', 'sale', 'sales', 'deal', 'deals', 'earning', 'earnings', 'profit', 'profits']
    const expenseTerms = ['expense', 'expenses', 'cost', 'costs', 'purchase', 'purchases', 'payment', 'payments', 'spending', 'spendings']
    const cogsTerms = ['cogs', 'cost of goods', 'cost of goods sold', 'inventory cost', 'inventory costs']

    // Check for COGS-related terms first (more specific)
    const hasCogsTerms = cogsTerms.some(term => queryLower.includes(term))
    if (hasCogsTerms) {
      console.log(`[TransactionLookupTool] 📦 Detected COGS request from query: "${query}"`)
      return 'Cost of Goods Sold'
    }

    // Check for income-related terms
    const hasIncomeTerms = incomeTerms.some(term => queryLower.includes(term))
    if (hasIncomeTerms) {
      console.log(`[TransactionLookupTool] 💰 Detected income request from query: "${query}"`)
      return 'Income'
    }

    // Check for expense-related terms (but not COGS)
    const hasExpenseTerms = expenseTerms.some(term => queryLower.includes(term))
    if (hasExpenseTerms) {
      console.log(`[TransactionLookupTool] 💸 Detected expense request from query: "${query}"`)
      return 'Expense'
    }

    return null
  }

  /**
   * Extract source document type from user query using friendly terms
   * Maps user-friendly terms to database values
   */
  private _extractSourceDocumentType(query: string): 'invoice' | 'expense_claim' | null {
    if (!query) return null

    const queryLower = query.toLowerCase()

    // Map user-friendly terms to database values
    // "vendor" and "supplier" map to invoices (AP) — these are business-to-business relationships
    // "merchant" maps to expense claims — these are employee purchase receipts
    const invoiceTerms = ['invoice', 'invoices', 'bill', 'bills', 'vendor invoice', 'supplier invoice', 'vendor', 'vendors', 'supplier', 'suppliers']
    const expenseTerms = ['expense', 'expenses', 'expense claim', 'expense claims', 'reimbursement', 'reimbursements', 'claim', 'claims', 'merchant', 'merchants', 'receipt', 'receipts']

    // Check for expense-related terms first (more specific)
    const hasExpenseTerms = expenseTerms.some(term => queryLower.includes(term))
    if (hasExpenseTerms) {
      console.log(`[TransactionLookupTool] 💳 Detected expense claims request from query: "${query}"`)
      return 'expense_claim'
    }

    // Check for invoice-related terms
    const hasInvoiceTerms = invoiceTerms.some(term => queryLower.includes(term))
    if (hasInvoiceTerms) {
      console.log(`[TransactionLookupTool] 📄 Detected invoice request from query: "${query}"`)
      return 'invoice'
    }

    return null
  }

  /**
   * Detect if query mentions document types but needs clarification
   * User-friendly clarification for ambiguous document type queries
   */
  private _detectDocumentTypeClarificationNeeded(query: string): boolean {
    if (!query || query.length < 3) {
      return false // Don't ask for clarification on very short queries
    }

    const queryLower = query.toLowerCase()

    // Document type terms that might be ambiguous
    const documentTypeTerms = [
      'invoice', 'invoices', 'bill', 'bills', 'receipt', 'receipts',
      'expense', 'expenses', 'claim', 'claims', 'statement', 'statements',
      'contract', 'contracts', 'document', 'documents'
    ]

    // Check if query mentions document types
    const mentionsDocumentType = documentTypeTerms.some(term => queryLower.includes(term))

    if (!mentionsDocumentType) {
      return false // No document type mentioned, no clarification needed
    }

    // Specific patterns that are clear and don't need clarification
    const clearPatterns = [
      /\b(largest|biggest|highest|maximum|smallest|lowest|minimum)\b.*\b(transaction|amount|payment)\b/i,
      /\btransactions?\b.*\b(from|in|during|past|last)\b/i,
      /\ball\s+(my\s+)?transactions?\b/i,
      /\btotal\b.*\btransactions?\b/i
    ]

    // If query matches clear patterns, don't ask for clarification
    const hasTransactionFocus = clearPatterns.some(pattern => pattern.test(queryLower))
    if (hasTransactionFocus) {
      return false
    }

    // Document type queries that are ambiguous and need clarification
    const ambiguousPatterns = [
      /\b(invoice|bill|receipt|expense|claim)\b/i, // Generic mentions
      /\b(show|find|get|list)\b.*\b(invoice|bill|receipt|expense|claim)s?\b/i,
      /\bmy\s+(invoice|bill|receipt|expense|claim)s?\b/i
    ]

    const isAmbiguous = ambiguousPatterns.some(pattern => pattern.test(queryLower))

    console.log(`[TransactionLookupTool] CLARIFICATION CHECK:`)
    console.log(`[TransactionLookupTool]   - Query: "${query}"`)
    console.log(`[TransactionLookupTool]   - Mentions document type: ${mentionsDocumentType}`)
    console.log(`[TransactionLookupTool]   - Has transaction focus: ${hasTransactionFocus}`)
    console.log(`[TransactionLookupTool]   - Is ambiguous: ${isAmbiguous}`)
    console.log(`[TransactionLookupTool]   - Clarification needed: ${isAmbiguous}`)

    return isAmbiguous
  }

  /**
   * Detect analysis queries (largest, smallest, etc.) from query content and parameters
   * LOW RISK: Pure analysis function with no side effects
   *
   * CRITICAL FIX: Only detect analysis for EXPLICIT terms like "largest", "biggest".
   * DO NOT infer from limit=1 alone - that breaks "latest", "most recent" queries
   * which should sort by DATE, not by AMOUNT.
   */
  private _detectAnalysisQuery(query: string, limit: number, params: TransactionLookupParameters): boolean {
    // CRITICAL: Only detect analysis queries based on EXPLICIT terms in the query
    // DO NOT infer from limit=1 - that incorrectly triggers for "latest" queries
    const queryAnalysis = query.toLowerCase().includes('largest') || query.toLowerCase().includes('biggest') ||
                         query.toLowerCase().includes('highest') || query.toLowerCase().includes('maximum') ||
                         query.toLowerCase().includes('smallest') || query.toLowerCase().includes('lowest') ||
                         query.toLowerCase().includes('minimum') ||
                         // Enhanced analysis patterns
                         query.toLowerCase().includes('most expensive') ||
                         query.toLowerCase().includes('least expensive') ||
                         !!query.toLowerCase().match(/\b(top|max|min)\s*\d*\b/)

    // REMOVED: Inference from limit=1 - this incorrectly triggered for "latest" queries
    // Previously: const inferredAnalysis = (limit === 1) || (params.minAmount === 0 && limit <= 5)
    // Now: Only explicit terms trigger analysis mode
    const isAnalysisQuery = queryAnalysis

    console.log(`[TransactionLookupTool] ❗ ANALYSIS DETECTION DEBUG:`)
    console.log(`[TransactionLookupTool]   - Raw query: "${query}"`)
    console.log(`[TransactionLookupTool]   - Query contains explicit analysis terms: ${queryAnalysis}`)
    console.log(`[TransactionLookupTool]   - Final isAnalysisQuery: ${isAnalysisQuery}`)
    console.log(`[TransactionLookupTool]   - Note: limit=${limit} no longer triggers analysis (fixes "latest" queries)`)

    return isAnalysisQuery
  }

  /**
   * Process and sanitize parameters with guardrail validation
   * LOW RISK: Parameter validation and sanitization with no side effects
   * CRITICAL FIX: Added isAnalysisQuery parameter to preserve analytical terms
   */
  private _processAndSanitizeParameters(params: TransactionLookupParameters, isAnalysisQuery: boolean = false): {
    query: string;
    limit: number;
    sanitizedParams: TransactionLookupParameters
  } {
    // CRITICAL FIX: Create shallow copy to avoid side effects on input parameter
    const sanitizedParams = { ...params }

    // Apply guardrails - CRITICAL Layer 3 protection
    const validation = this._validate_parameters(sanitizedParams)

    if (!validation.is_valid) {
      console.log(`[GUARDRAIL] Parameter issues detected: ${validation.issues.join(', ')}`)

      // Auto-correct the parameters
      if (validation.suggested_fixes.query !== undefined) {
        sanitizedParams.query = validation.suggested_fixes.query
        console.log(`[GUARDRAIL] Auto-corrected query to: '${sanitizedParams.query}'`)
      }
    }

    // Execute search with cleaned parameters
    const sanitizedQuery = this._sanitize_query(sanitizedParams.query || '', sanitizedParams.dateRange, isAnalysisQuery)
    if (sanitizedParams.query && sanitizedQuery !== sanitizedParams.query) {
      sanitizedParams.query = sanitizedQuery
      console.log(`[GUARDRAIL] Final sanitized query: '${sanitizedParams.query}'`)
    }

    const query = sanitizedParams.query?.trim() || 'all transactions'
    const limit = sanitizedParams.limit || 10 // CRITICAL FIX: Align with schema default of 10, not 20

    return {
      query,
      limit,
      sanitizedParams
    }
  }

  /**
   * Format result summary and statistics for LLM consumption
   * LOW RISK: Pure data transformation with no side effects
   */
  private formatResultSummary(transactions: any[], query: string, startDate?: string, endDate?: string, params?: any): {
    data: string;
    metadata: any
  } {
    // Calculate summary statistics
    const totalAmount = transactions.reduce((sum, t) => sum + (t.original_amount || 0), 0)
    const formattedResults = this.formatResultData(transactions)

    // Determine dominant currency for summary
    const currencies = transactions.map(t => t.original_currency).filter(Boolean)
    const dominantCurrency = currencies.length > 0 ? currencies[0] : 'USD'
    const currencyLabel = currencies.every(c => c === dominantCurrency) ? dominantCurrency : 'mixed currencies'

    const summary = `Found ${transactions.length} transaction(s) for "${query}":\n\n${formattedResults}`
    const statistics = `\n\nSummary: Total amount ${totalAmount.toFixed(2)} (${currencyLabel})`
    const finalResult = summary + statistics

    // COMPREHENSIVE LOGGING: Show what the LLM will receive
    console.log(`[TransactionLookupTool] ✅ FINAL RESULT FOR LLM:`)
    console.log(`[TransactionLookupTool] Query: "${query}"`)
    console.log(`[TransactionLookupTool] Results Count: ${transactions.length}`)
    console.log(`[TransactionLookupTool] Total Amount: ${totalAmount.toFixed(2)}`)
    console.log(`[TransactionLookupTool] Sample Results:`)

    // Log first 3 transactions for debugging (PII-safe)
    transactions.slice(0, 3).forEach((t, idx) => {
      console.log(`[TransactionLookupTool]   ${idx + 1}. Transaction ID: ${t.id} - Date: ${t.transaction_date}`)
    })

    if (transactions.length > 3) {
      console.log(`[TransactionLookupTool]   ... and ${transactions.length - 3} more transactions`)
    }

    console.log(`[TransactionLookupTool] Response Length: ${finalResult.length} characters`)

    return {
      data: finalResult,
      metadata: {
        queryProcessed: query,
        resultsCount: transactions.length,
        totalAmount,
        dateRangeCalculated: params?.dateRange ? `${startDate} to ${endDate}` : 'none',
        sourceDocumentTypeFilter: params?._sourceDocumentType || 'none'
      }
    }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as TransactionLookupParameters

    // CRITICAL FIX 2: Detect analysis queries BEFORE sanitization to preserve analytical terms like "largest"
    const originalQuery = params.query || ''
    const originalLimit = params.limit || 10
    console.log(`[TransactionLookupTool] ✅ RUNNING ANALYSIS DETECTION WITH ORIGINAL QUERY: "${originalQuery}"`)
    const isAnalysisQuery = this._detectAnalysisQuery(originalQuery, originalLimit, params)

    // ✅ DOCUMENT TYPE EXTRACTION: Extract source document type from query
    const extractedSourceDocumentType = this._extractSourceDocumentType(originalQuery)

    // ✅ TRANSACTION TYPE EXTRACTION: Extract transaction type from query (income, expense, COGS)
    const extractedTransactionType = this._extractTransactionType(originalQuery)

    // ✅ CLARIFICATION LOGIC: Check if query mentions document types but is ambiguous
    const clarificationNeeded = this._detectDocumentTypeClarificationNeeded(originalQuery)
    if (clarificationNeeded && !extractedSourceDocumentType) {
      console.log(`[TransactionLookupTool] 🤔 CLARIFICATION NEEDED: Query mentions document types but is ambiguous`)
      return {
        success: true,
        data: `I can help you find your transactions! I noticed you mentioned document types in your query. Are you looking for:

📄 **Invoices** - Bills or invoices you've received from vendors
💳 **Expense Claims** - Submitted expense reports and reimbursements

Please clarify which type you'd like me to search, or say "both" to see all transactions.`,
        metadata: {
          queryProcessed: originalQuery,
          clarificationRequested: true,
          availableTypes: ['invoices', 'expense_claims', 'both']
        }
      }
    }

    // Process and sanitize parameters using extracted method (AFTER analysis detection)
    const processedParams = this._processAndSanitizeParameters(params, isAnalysisQuery)
    const query = processedParams.query
    const limit = processedParams.limit
    const sanitizedParams = processedParams.sanitizedParams

    // ✅ APPLY SOURCE DOCUMENT TYPE: Set extracted document type for filtering
    if (extractedSourceDocumentType) {
      sanitizedParams._sourceDocumentType = extractedSourceDocumentType
      console.log(`[TransactionLookupTool] 🎯 Applied source document type filter: ${extractedSourceDocumentType}`)
    }

    // ✅ APPLY TRANSACTION TYPE: Set extracted transaction type for filtering (income, expense, COGS)
    // Priority: Explicit param from AI > Extracted from query
    const effectiveTransactionType = sanitizedParams.transactionType || extractedTransactionType
    if (effectiveTransactionType) {
      sanitizedParams.transactionType = effectiveTransactionType
      console.log(`[TransactionLookupTool] 🎯 Applied transaction type filter: ${effectiveTransactionType}`)
    }

    try {
      console.log(`[TransactionLookupTool] Processing query for user ${userContext.userId}: ${query}`)
      console.log(`[TransactionLookupTool] ✅ ANALYSIS QUERY DETECTED (BEFORE SANITIZATION): ${isAnalysisQuery}`)

      // Calculate date range using extracted method
      const dateRange = this._calculateDateRange(sanitizedParams)
      const startDate = dateRange.startDate
      const endDate = dateRange.endDate

      // SECURITY: Use business context for proper tenant isolation
      if (!userContext.businessId) {
        throw new Error('Missing user context: Business ID required for secure queries')
      }

      console.log(`[TransactionLookupTool] SECURITY: Using proper identifiers:`, {
        userId: userContext.userId,
        businessId: userContext.businessId
      })

      // OPTIMIZED DATABASE QUERY STRATEGY
      // Phase 1: Broad Search - Use Convex searchForAI query with filters
      console.log(`[TransactionLookupTool] Phase 1: Optimized broad search via Convex`)

      // SMART CATEGORY FILTERING: Don't filter by "invoice" as category since it's not a real category
      let categoryFilter = sanitizedParams.category
      const commonNonCategories = ['invoice', 'bill', 'receipt', 'payment', 'expense', 'transaction']
      if (categoryFilter && commonNonCategories.includes(categoryFilter.toLowerCase())) {
        console.log(`[TransactionLookupTool] IGNORED category filter "${categoryFilter}" - treating as description search instead`)
        categoryFilter = undefined
      }

      // PERFORMANCE OPTIMIZATION: Calculate fetch limit
      const fetchLimit = isAnalysisQuery ? Math.max(50, limit * 3) : limit

      console.log(`[TransactionLookupTool] Fetching ${fetchLimit} records (analysis needed: ${isAnalysisQuery})`)

      // CRITICAL DEBUG: Log the query for debugging
      console.log(`[TransactionLookupTool] 🔍 CONVEX DEBUG: Executing searchForAI query with filters:`)
      console.log(`[TransactionLookupTool] 🔍 CONVEX DEBUG:   - businessId: ${userContext.businessId}`)
      console.log(`[TransactionLookupTool] 🔍 CONVEX DEBUG:   - startDate: ${startDate || 'none'}`)
      console.log(`[TransactionLookupTool] 🔍 CONVEX DEBUG:   - endDate: ${endDate || 'none'}`)
      console.log(`[TransactionLookupTool] 🔍 CONVEX DEBUG:   - category: ${categoryFilter || 'none'}`)
      console.log(`[TransactionLookupTool] 🔍 CONVEX DEBUG:   - minAmount: ${isAnalysisQuery ? 'skipped' : (sanitizedParams.minAmount || 'none')}`)
      console.log(`[TransactionLookupTool] 🔍 CONVEX DEBUG:   - maxAmount: ${isAnalysisQuery ? 'skipped' : (sanitizedParams.maxAmount || 'none')}`)
      console.log(`[TransactionLookupTool] 🔍 CONVEX DEBUG:   - sourceDocumentType: ${sanitizedParams._sourceDocumentType || 'none'}`)
      console.log(`[TransactionLookupTool] 🔍 CONVEX DEBUG:   - transactionType: ${sanitizedParams.transactionType || 'none'}`)
      console.log(`[TransactionLookupTool] 🔍 CONVEX DEBUG:   - limit: ${fetchLimit}`)

      // CRITICAL: Ensure authenticated Convex client is available
      if (!this.convex) {
        throw new Error('Convex client not initialized - authentication may have failed')
      }

      // ✅ MIGRATED: Use journal entries instead of accounting entries
      const result = await this.convex.query(
        this.convexApi.functions.journalEntries.searchForAI,
        {
          businessId: userContext.businessId as Id<"businesses">,
          startDate: startDate,
          endDate: endDate,
          category: categoryFilter,
          // CRITICAL: For analysis queries, skip amount filters to include negative expenses
          minAmount: isAnalysisQuery ? undefined : sanitizedParams.minAmount,
          maxAmount: isAnalysisQuery ? undefined : sanitizedParams.maxAmount,
          sourceDocumentType: sanitizedParams._sourceDocumentType,
          transactionType: sanitizedParams.transactionType,
          limit: fetchLimit,
        }
      )

      // Map Convex results to match expected format
      let allTransactions = result.entries.map((entry: any) => ({
        id: entry._id,
        description: entry.description,
        original_amount: entry.originalAmount,
        original_currency: entry.originalCurrency,
        home_currency_amount: entry.homeCurrencyAmount,
        transaction_date: entry.transactionDate,
        category: entry.category,
        vendor_name: entry.vendorName,
        transaction_type: entry.transactionType,
        source_document_type: entry.sourceDocumentType,
        created_by: entry.createdBy,
        created_at: entry._creationTime,
      }))

      // RBAC: Scope transactions by role
      // Employees should only see their own expense claims, not business-wide AP/AR
      const role = (userContext.role || '').toLowerCase()
      if (role === 'employee') {
        allTransactions = allTransactions.filter((t: any) =>
          t.source_document_type === 'expense_claim' && t.created_by === userContext.userId
        )
        console.log(`[TransactionLookupTool] RBAC: Employee filter applied — ${allTransactions.length} personal expense claims (from ${result.entries.length} total)`)
      } else if (role === 'manager') {
        // Managers see their own expense claims only (team data via get_team_summary/get_employee_expenses)
        allTransactions = allTransactions.filter((t: any) =>
          t.source_document_type === 'expense_claim' && t.created_by === userContext.userId
        )
        console.log(`[TransactionLookupTool] RBAC: Manager filter applied — ${allTransactions.length} personal expense claims (from ${result.entries.length} total)`)
      }
      // finance_admin/owner: no filter, see everything

      const error = null

      // CRITICAL DEBUG: Log actual query results
      console.log(`[TransactionLookupTool] 🔍 SQL RESULTS: Query returned ${allTransactions?.length || 0} records`)
      if (allTransactions && allTransactions.length > 0) {
        console.log(`[TransactionLookupTool] 🔍 SQL RESULTS: First transaction: ID=${allTransactions[0].id}, Date=${allTransactions[0].transaction_date}`)
        console.log(`[TransactionLookupTool] 🔍 SQL RESULTS: Last transaction: ID=${allTransactions[allTransactions.length - 1].id}, Date=${allTransactions[allTransactions.length - 1].transaction_date}`)
        console.log(`[TransactionLookupTool] 🔍 SQL RESULTS: All transaction dates: ${allTransactions.map(t => t.transaction_date).join(', ')}`)
      }

      if (error) {
        console.error('[TransactionLookupTool] Query error:', error)
        return {
          success: false,
          error: 'I encountered a database error while searching your transactions. Please try again in a moment, or you can view your transactions directly in the UI dashboard. If the issue persists, please contact support for assistance.'
        }
      }

      if (!allTransactions || allTransactions.length === 0) {
        // Enhanced debugging for zero results
        console.log(`[TransactionLookupTool] ❌ DEBUGGING ZERO RESULTS`)
        console.log(`[TransactionLookupTool] User ID used in query: ${userContext.userId}`)
        console.log(`[TransactionLookupTool] Date range: ${startDate || 'none'} to ${endDate || 'none'}`)
        console.log(`[TransactionLookupTool] Query parameters:`, JSON.stringify(sanitizedParams, null, 2))
        console.log(`[TransactionLookupTool] Analysis detection: ${isAnalysisQuery}`)
        console.log(`[TransactionLookupTool] Current timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`)

        // PERFORMANCE OPTIMIZATION: Only fetch count when truly needed for user feedback
        let totalCount = 0;
        try {
          // ✅ MIGRATED: Use journal entries for count
          const countResult = await this.convex.query(
            this.convexApi.functions.journalEntries.getEntryCount,
            { businessId: userContext.businessId as any }
          )
          totalCount = countResult.count || 0;
        } catch (countError) {
          console.warn(`[TransactionLookupTool] Could not fetch user transaction count:`, countError);
          // Continue without count rather than failing
        }

        console.log(`[TransactionLookupTool] User has ${totalCount} total transactions for business ${userContext.businessId}`)

        // User has no transactions in their business context
        if (totalCount === 0) {
          console.log(`[TransactionLookupTool] User has no transactions in business ${userContext.businessId}`)
        }

        // Enhanced user-friendly error message with actionable suggestions
        let helpfulMessage = `I couldn't find any transactions matching your search criteria.`

        if (totalCount > 0) {
          helpfulMessage += ` You have ${totalCount} total transactions in your account, but none matched your specific filters.`

          // Provide specific suggestions based on the query parameters
          const suggestions = []
          if (startDate && endDate) {
            suggestions.push(`Try expanding your date range (currently ${startDate} to ${endDate})`)
          }
          if (sanitizedParams._sourceDocumentType) {
            const friendlyType = sanitizedParams._sourceDocumentType === 'expense_claim' ? 'expense claims' : 'invoices'
            suggestions.push(`Try removing the document type filter (currently filtering for "${friendlyType}")`)
          }
          if (sanitizedParams.category) {
            suggestions.push(`Try removing the category filter (currently filtering for "${sanitizedParams.category}")`)
          }
          if (sanitizedParams.minAmount || sanitizedParams.maxAmount) {
            suggestions.push('Try removing the amount filters')
          }
          if (sanitizedParams.query && sanitizedParams.query.trim()) {
            suggestions.push('Try using broader search terms')
          }

          if (suggestions.length > 0) {
            helpfulMessage += `\n\nSuggestions:\n• ${suggestions.join('\n• ')}`
          }
        } else {
          helpfulMessage += ` It looks like you don't have any transactions in this business account yet.`
        }

        helpfulMessage += `\n\nAlternatively, you can:\n• Browse all your transactions in the UI dashboard with advanced filtering options\n• Contact our support team for assistance with finding your data`

        return {
          success: true,
          data: helpfulMessage,
          metadata: {
            queryProcessed: query,
            resultsCount: 0,
            totalUserTransactions: totalCount,
            userId: userContext.userId
          }
        }
      }

      // Phase 2: In-Memory Filtering and Analysis
      console.log(`[TransactionLookupTool] Phase 2: Processing ${allTransactions.length} transactions`)
      let transactions = [...allTransactions]

      // CRITICAL FIX: Only apply text search for NON-analysis, NON-document-type queries
      // If _sourceDocumentType parameter was used, skip text filtering entirely as database already filtered
      console.log(`[TransactionLookupTool] ❗ TEXT FILTER DECISION:`)
      console.log(`[TransactionLookupTool]   - sanitizedParams._sourceDocumentType: ${sanitizedParams._sourceDocumentType}`)
      console.log(`[TransactionLookupTool]   - needsAnalysis: ${isAnalysisQuery}`)
      console.log(`[TransactionLookupTool]   - sanitizedParams.query: "${sanitizedParams.query}"`)
      console.log(`[TransactionLookupTool]   - Will apply text filtering: ${!sanitizedParams._sourceDocumentType && !isAnalysisQuery && sanitizedParams.query}`)

      if (!sanitizedParams._sourceDocumentType && !isAnalysisQuery && sanitizedParams.query) {
        // SAFETY: For analysis queries that might have been missed, double-check
        if (query.toLowerCase().match(/\b(largest|biggest|highest|maximum|smallest|lowest|minimum)\b/)) {
          console.log(`[TransactionLookupTool] SAFETY: Detected analysis terms in query, skipping text filtering`)
        } else {
          // CRITICAL FIX: Extract meaningful filter terms, excluding date-related terms that were used for date filtering
          const usedDateTerms: string[] = []

          // Track which date terms were likely used if we have startDate/endDate parameters
          if (startDate || endDate) {
            // Extract date-related words that might have been used for date parameter extraction
            const queryWords = sanitizedParams.query!.toLowerCase().split(/\s+/)
            for (const word of queryWords) {
              const cleanWord = word.replace(/[^\w]/g, '')
              if (this.isDateRelatedTerm(cleanWord) || this.isMonthName(cleanWord)) {
                usedDateTerms.push(cleanWord)
              }
            }
            console.log(`[TransactionLookupTool] Identified date terms used for filtering: ${usedDateTerms.join(', ')}`)
          }

          // Extract only meaningful filter terms (not analysis terms, not date terms, not document types)
          const { filterTerms, dateTerms } = this.separateAnalysisAndFilter(sanitizedParams.query!, usedDateTerms)
          
          // Remove document type terms that should have been passed as document_type parameter
          const documentTypeTerms = ['invoice', 'receipt', 'bill', 'statement', 'contract']
          const meaningfulFilterTerms = filterTerms.filter(term => 
            !documentTypeTerms.includes(term.toLowerCase())
          )
          
          console.log(`[TransactionLookupTool] FILTER TERM ANALYSIS:`)
          console.log(`[TransactionLookupTool]   - Original query: "${sanitizedParams.query}"`)
          console.log(`[TransactionLookupTool]   - Date terms excluded: ${dateTerms.join(', ') || 'none'}`)
          console.log(`[TransactionLookupTool]   - Used date terms excluded: ${usedDateTerms.join(', ') || 'none'}`)
          console.log(`[TransactionLookupTool]   - Meaningful filter terms: ${meaningfulFilterTerms.join(', ') || 'none'}`)
          
          if (meaningfulFilterTerms.length > 0) {
            console.log(`[TransactionLookupTool] Applying text search for meaningful filter terms: ${meaningfulFilterTerms.join(', ')}`)
            transactions = transactions.filter(t => {
              return meaningfulFilterTerms.some(searchTerm => {
                const term = searchTerm.toLowerCase()
                return (t.description && t.description.toLowerCase().includes(term)) ||
                       (t.vendor_name && t.vendor_name.toLowerCase().includes(term)) ||
                       (t.category && t.category.toLowerCase().includes(term))
              })
            })
            console.log(`[TransactionLookupTool] Text search filtered to ${transactions.length} results`)
          } else {
            console.log(`[TransactionLookupTool] No meaningful filter terms found after excluding date/analysis terms, skipping text search`)
          }
        }
      } else {
        console.log(`[TransactionLookupTool] Skipping text search - _sourceDocumentType used: ${!!sanitizedParams._sourceDocumentType}, analysis needed: ${isAnalysisQuery}`)
      }

      // Apply analysis for superlative queries (largest, smallest, etc.)
      if (isAnalysisQuery) {
        console.log(`[TransactionLookupTool] Applying analysis - query: "${query}" (explicit terms detected)`)

        // Determine analysis type from query - NO inference from params
        const queryLower = query.toLowerCase()
        const isLargest = queryLower.includes('largest') || queryLower.includes('biggest') ||
                         queryLower.includes('highest') || queryLower.includes('maximum') ||
                         queryLower.includes('most expensive')
        const isSmallest = queryLower.includes('smallest') || queryLower.includes('lowest') ||
                          queryLower.includes('minimum') || queryLower.includes('least expensive')
        
        if (isLargest) {
          // Sort by ABSOLUTE VALUE descending to handle negative expenses properly
          transactions = transactions
            .sort((a, b) => Math.abs(b.home_currency_amount || 0) - Math.abs(a.home_currency_amount || 0))
            .slice(0, 1) // CRITICAL FIX: Return only the single largest transaction
          console.log(`[TransactionLookupTool] Found THE largest transaction by absolute amount`)
        } else if (isSmallest) {
          // Sort by absolute value ascending and exclude zero amounts
          transactions = transactions
            .filter(t => Math.abs(t.home_currency_amount || 0) > 0) // Exclude zero amounts
            .sort((a, b) => Math.abs(a.home_currency_amount || 0) - Math.abs(b.home_currency_amount || 0))
            .slice(0, 1) // CRITICAL FIX: Return only the single smallest transaction
          console.log(`[TransactionLookupTool] Found THE smallest transaction by absolute amount`)
        }
        
        // CRITICAL FIX: For analysis queries, don't apply additional text filtering
        // The database already found the right transactions, just sort them
        console.log(`[TransactionLookupTool] Analysis query detected - skipping text filtering, letting database results through`)
        
        // If _sourceDocumentType was specified, the database already filtered correctly
        // If query contains document type terms but _sourceDocumentType param wasn't used, warn but continue
        if (sanitizedParams.query && sanitizedParams.query.toLowerCase().includes('invoice') && !sanitizedParams._sourceDocumentType) {
          console.log(`[TransactionLookupTool] WARNING: Query contains 'invoice' but _sourceDocumentType parameter not used. Consider using _sourceDocumentType='invoice' for better results.`)
        }
      } else {
        // Normal limit for non-analysis queries
        transactions = transactions.slice(0, limit)
      }

      if (transactions.length === 0) {
        console.log(`[TransactionLookupTool] ❌ NO RESULTS AFTER FILTERING`)
        console.log(`[TransactionLookupTool] Query: "${query}"`)
        console.log(`[TransactionLookupTool] Original database results: ${allTransactions.length}`)
        console.log(`[TransactionLookupTool] Analysis type: ${isAnalysisQuery ? 'YES (largest/smallest)' : 'NO (regular search)'}`)
        
        // Enhanced error message for filtered results
        let filteredMessage = `I found ${allTransactions.length} transactions in your date range, but none matched your specific search criteria.`

        // Provide specific guidance based on what filtering was applied
        const appliedFilters = []
        if (sanitizedParams.query && sanitizedParams.query.trim()) {
          appliedFilters.push(`text search for "${sanitizedParams.query}"`)
        }
        if (sanitizedParams._sourceDocumentType) {
          const friendlyType = sanitizedParams._sourceDocumentType === 'expense_claim' ? 'expense claims' : 'invoices'
          appliedFilters.push(`document type "${friendlyType}"`)
        }
        if (sanitizedParams.category) {
          appliedFilters.push(`category "${sanitizedParams.category}"`)
        }
        if (isAnalysisQuery) {
          appliedFilters.push('analysis query (largest/smallest)')
        }

        if (appliedFilters.length > 0) {
          filteredMessage += `\n\nFilters applied:\n• ${appliedFilters.join('\n• ')}`
        }

        filteredMessage += `\n\nSuggestions:
• Try using broader or different search terms
• Remove some of the filters to see more results
• Check the spelling of vendor names or descriptions
• Use the UI dashboard to browse transactions with visual filters
• Contact support if you're looking for specific transactions you know should exist`

        return {
          success: true,
          data: filteredMessage,
          metadata: {
            queryProcessed: query,
            resultsCount: 0,
            totalCandidates: allTransactions.length,
            userId: userContext.userId
          }
        }
      }

      // Format results using extracted method
      const formattedResult = this.formatResultSummary(transactions, query, startDate, endDate, sanitizedParams)

      return {
        success: true,
        data: formattedResult.data,
        metadata: {
          ...formattedResult.metadata,
          userId: userContext.userId
        }
      }

    } catch (error) {
      console.error('[TransactionLookupTool] Execution error:', error)
      return {
        success: false,
        error: `Transaction lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  /** Resolve internal category IDs (e.g. "other_9gsnmr") to display names */
  private resolveCategoryDisplay(raw: string | undefined): string {
    if (!raw) return ''
    // Match internal ID patterns like "other_9gsnmr", "travel_abc123"
    if (/^[a-z_]+_[a-z0-9]{4,}$/i.test(raw)) {
      const prefix = raw.split('_')[0]
      return prefix.charAt(0).toUpperCase() + prefix.slice(1)
    }
    return raw
  }

  protected formatResultData(data: any[]): string {
    return data.map((transaction, index) => {
      // CRITICAL FIX: Display business date without timezone conversion
      // Financial documents should preserve the date as recorded (e.g., invoice date)
      // NOT converted based on viewer's timezone
      const date = this.formatBusinessDate(transaction.transaction_date)
      const amount = `${transaction.original_amount} ${transaction.original_currency}`
      const homeAmount = transaction.home_currency_amount
        ? ` (${transaction.home_currency_amount} home currency)`
        : ''
      const docType = transaction.source_document_type ? ` • ${transaction.source_document_type.charAt(0).toUpperCase() + transaction.source_document_type.slice(1)}` : ''

      return `${index + 1}. ${transaction.description || 'No description'}
   Amount: ${amount}${homeAmount}
   Date: ${date}
   Category: ${this.resolveCategoryDisplay(transaction.category) || 'Uncategorized'}
   Vendor: ${transaction.vendor_name || 'Unknown'}
   Type: ${transaction.transaction_type || 'Unknown'}${docType}`
    }).join('\n\n')
  }

  /**
   * Generate smart filters using AI to interpret natural language queries
   */
  private async generateSmartFilters(query: string): Promise<any> {
    try {
      const systemPrompt = `You are a JSON-only API. You do not speak in sentences. You do not explain. Your ONLY function is to convert user text into valid JSON.

CRITICAL: Output ONLY valid JSON. No text before or after. No explanations. No comments.

Extract filters from financial queries using these exact field names:
- "category": transaction category 
- "vendor_name": company or vendor name
- "min_amount": minimum amount (numbers only)
- "max_amount": maximum amount (numbers only) 
- "transaction_type": type of transaction

Examples (input -> output):
"invoice" -> {"category": "invoice"}
"expenses over 100" -> {"min_amount": 100}
"ABC Company" -> {"vendor_name": "ABC Company"}
"largest" -> {}
"highest amount" -> {}

Your response must be valid JSON only. Nothing else.`

      // Build headers conditionally based on API key presence
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      // Only add Authorization header if API key is present
      if (aiConfig.chat.apiKey) {
        headers['Authorization'] = `Bearer ${aiConfig.chat.apiKey}`;
      }

      const response = await fetch(`${aiConfig.chat.endpointUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: aiConfig.chat.modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query }
          ],
          max_tokens: 100,
          temperature: 0.0,
          stop: ["\n", ".", "Okay", "Let", "I "]
        })
      })

      if (!response.ok) {
        console.warn('[TransactionLookupTool] AI filter generation failed')
        return null
      }

      const result = await response.json()
      const content = result.choices?.[0]?.message?.content?.trim()
      
      if (!content) return null

      // Parse and validate the JSON response
      try {
        const filters = JSON.parse(content)
        return this.validateFilters(filters) ? filters : null
      } catch (parseError) {
        console.warn('[TransactionLookupTool] JSON parse failed, AI returned non-JSON:', content.substring(0, 100))
        return null // Fallback to basic filters
      }

    } catch (error) {
      console.warn('[TransactionLookupTool] Smart filter generation error:', error)
      return null
    }
  }

  /**
   * Apply AI-generated filters to the query
   */
  private applySmartFilters(query: any, filters: any): any {
    let enhancedQuery = query

    if (filters.category) {
      enhancedQuery = enhancedQuery.ilike('category', `%${filters.category}%`)
    }

    if (filters.vendor_name) {
      enhancedQuery = enhancedQuery.ilike('vendor_name', `%${filters.vendor_name}%`)
    }

    if (filters.transaction_type) {
      enhancedQuery = enhancedQuery.eq('transaction_type', filters.transaction_type)
    }

    if (filters.min_amount && typeof filters.min_amount === 'number') {
      enhancedQuery = enhancedQuery.gte('home_currency_amount', filters.min_amount)
    }

    if (filters.max_amount && typeof filters.max_amount === 'number') {
      enhancedQuery = enhancedQuery.lte('home_currency_amount', filters.max_amount)
    }

    return enhancedQuery
  }

  /**
   * Validate AI-generated filters
   */
  private validateFilters(filters: any): boolean {
    if (!filters || typeof filters !== 'object') return false

    const allowedFields = ['category', 'vendor_name', 'min_amount', 'max_amount', 'transaction_type']
    const filterKeys = Object.keys(filters)

    // Check if all keys are allowed
    if (!filterKeys.every(key => allowedFields.includes(key))) {
      return false
    }

    // Validate data types (handle both undefined and null)
    if (filters.min_amount != null && typeof filters.min_amount !== 'number') return false
    if (filters.max_amount != null && typeof filters.max_amount !== 'number') return false

    return true
  }

  /**
   * Separate analysis terms from actual filter terms in queries, excluding date-related terms
   * Analysis terms: largest, biggest, highest, smallest, lowest, minimum, maximum, etc.
   * Date terms: month names, day numbers, years that were used for date filtering
   * Filter terms: invoice, company names, categories, etc.
   */
  private separateAnalysisAndFilter(query: string, usedDateTerms: string[] = []): { analysisTerms: string[]; filterTerms: string[]; dateTerms: string[] } {
    const queryLower = query.toLowerCase()
    const words = queryLower.split(/\s+/)
    
    // Define analysis terms that should NOT be used for text filtering
    const analysisTerms = [
      'largest', 'biggest', 'highest', 'maximum', 'max', 'most', 'greatest',
      'smallest', 'lowest', 'minimum', 'min', 'least', 'fewest',
      'total', 'sum', 'average', 'mean', 'count', 'number'
    ]
    
    // Define date-related terms that should be excluded from text search when used for date filtering
    const monthNames = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
      'jan', 'feb', 'mar', 'apr', 'may', 'jun',
      'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
    ]
    
    // Define common non-filter words that don't help with text search
    const commonWords = [
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'what', 'is', 'are', 'was', 'were', 'have', 'has', 'had', 'do', 'does', 'did',
      'my', 'me', 'i', 'you', 'your', 'his', 'her', 'their', 'our',
      'show', 'find', 'get', 'give', 'tell', 'display', 'list',
      'amount', 'value', 'transaction', 'transactions', 'record', 'records', 'data',
      // Financial intent words — describe what to DO with data, not what to search for
      'spending', 'expense', 'expenses', 'income', 'revenue', 'cost', 'costs',
      'profit', 'profits', 'loss', 'losses', 'earnings', 'savings',
      'trends', 'trend', 'patterns', 'pattern', 'overview', 'summary', 'breakdown',
      'analysis', 'analyze', 'insights', 'metrics', 'budget', 'budgets',
      'forecast', 'prediction', 'projections', 'estimates',
      'anomaly', 'anomalies', 'unusual', 'irregular', 'suspicious', 'outliers',
      'compare', 'comparison', 'versus',
      'cash', 'flow', 'runway', 'burn', 'rate', 'ratio',
      'categorize', 'classify', 'group', 'sort', 'rank', 'order',
      'report', 'reports', 'chart', 'graph', 'visualization', 'dashboard',
      'monitor', 'tracking', 'performance', 'review', 'audit',
    ]
    
    const foundAnalysisTerms: string[] = []
    const foundDateTerms: string[] = []
    const filterWords: string[] = []
    
    for (const word of words) {
      const cleanWord = word.replace(/[^\w]/g, '') // Remove punctuation
      
      // Skip empty words
      if (!cleanWord) continue
      
      if (analysisTerms.includes(cleanWord)) {
        foundAnalysisTerms.push(cleanWord)
      } else if (monthNames.includes(cleanWord) || this.isDateRelatedTerm(cleanWord)) {
        foundDateTerms.push(cleanWord)
      } else if (usedDateTerms.includes(cleanWord)) {
        // Explicitly exclude date terms that were used for parameter extraction
        foundDateTerms.push(cleanWord)
        console.log(`[TransactionLookupTool] Excluding date term used for filtering: ${cleanWord}`)
      } else if (!commonWords.includes(cleanWord) && cleanWord.length > 2) {
        // Only include meaningful words that could be used for filtering
        filterWords.push(cleanWord)
      }
    }
    
    // Also extract quoted phrases as filter terms (but check they're not date-related)
    const quotedPhrases = query.match(/"([^"]+)"/g)
    if (quotedPhrases) {
      quotedPhrases.forEach(phrase => {
        const cleanPhrase = phrase.replace(/"/g, '').trim()
        if (cleanPhrase.length > 0 && !this.containsDateTerms(cleanPhrase)) {
          filterWords.push(cleanPhrase)
        }
      })
    }
    
    return {
      analysisTerms: foundAnalysisTerms,
      filterTerms: filterWords,
      dateTerms: foundDateTerms
    }
  }

  /**
   * Check if a word is date-related (year, day with suffix, etc.)
   */
  private isDateRelatedTerm(word: string): boolean {
    // Check for years (1900-2099)
    if (/^\d{4}$/.test(word)) {
      const year = parseInt(word)
      if (year >= 1900 && year <= 2099) return true
    }
    
    // Check for day numbers with suffixes (1st, 2nd, 3rd, 4th, ... 31st)
    if (/^\d{1,2}(st|nd|rd|th)$/.test(word)) return true
    
    // Check for simple day numbers (1-31)
    if (/^\d{1,2}$/.test(word)) {
      const day = parseInt(word)
      if (day >= 1 && day <= 31) return true
    }
    
    return false
  }

  /**
   * Check if a word is a month name (full or abbreviated)
   */
  private isMonthName(word: string): boolean {
    const monthNames = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
      'jan', 'feb', 'mar', 'apr', 'may', 'jun',
      'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
    ]
    return monthNames.includes(word.toLowerCase())
  }

  /**
   * Check if a phrase contains date-related terms
   */
  private containsDateTerms(phrase: string): boolean {
    const words = phrase.toLowerCase().split(/\s+/)
    return words.some(word => this.isDateRelatedTerm(word))
  }

  /**
   * Validate date string format
   */
  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString)
    return !isNaN(date.getTime()) && dateString.length >= 8 // Basic validation
  }

  /**
   * Format business date without timezone conversion
   * CRITICAL: Financial documents should preserve the date as recorded (e.g., invoice date)
   * NOT converted based on viewer's timezone
   *
   * @param dateString - ISO date string (YYYY-MM-DD or full ISO timestamp)
   * @returns Formatted date string (e.g., "October 31, 2025")
   */
  private formatBusinessDate(dateString: string): string {
    if (!dateString) return 'Unknown date'

    try {
      // Extract just the date part (YYYY-MM-DD) to avoid timezone issues
      const datePart = dateString.split('T')[0]
      const [year, month, day] = datePart.split('-').map(Number)

      // Validate parsed values
      if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
        console.warn(`[TransactionLookupTool] Invalid date format: ${dateString}`)
        return dateString // Return original if parsing fails
      }

      // Format without timezone conversion using UTC-based Date constructor
      // new Date(year, month, day) uses LOCAL timezone
      // new Date(Date.UTC(year, month-1, day)) uses UTC - but we want to display the business date
      // So we use Intl.DateTimeFormat with explicit UTC timezone to avoid conversion
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ]

      const monthName = monthNames[month - 1]
      if (!monthName) {
        console.warn(`[TransactionLookupTool] Invalid month: ${month}`)
        return dateString
      }

      return `${monthName} ${day}, ${year}`
    } catch (error) {
      console.warn(`[TransactionLookupTool] Date formatting error for ${dateString}:`, error)
      return dateString // Return original on error
    }
  }

  /**
   * Enhanced permission check for transaction access with business context validation
   */
  protected async checkUserPermissions(userContext: UserContext): Promise<boolean> {
    // Call parent permission check first (now includes business context validation)
    const basePermission = await super.checkUserPermissions(userContext)
    if (!basePermission) {
      return false
    }

    try {
      // SECURITY: Business context validation already performed in parent method
      // Additional check: verify user has proper business context for transaction access
      if (!userContext.businessId) {
        console.error('[TransactionLookupTool] Missing business context - transaction access denied')
        return false
      }

      console.log(`[TransactionLookupTool] Transaction access granted for business: ${userContext.businessId}`)
      return true

    } catch (error) {
      console.error('[TransactionLookupTool] Permission validation error:', error)
      return false
    }
  }
}