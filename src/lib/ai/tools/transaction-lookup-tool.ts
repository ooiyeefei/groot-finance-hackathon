/**
 * Secure Transaction Lookup Tool
 * Enforces RLS and proper user context validation for transaction queries
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { aiConfig } from '@/lib/ai/config/ai-config'

interface TransactionLookupParameters {
  query?: string
  limit?: number
  startDate?: string
  endDate?: string
  dateRange?: 'past_7_days' | 'past_30_days' | 'past_60_days' | 'past_90_days' | 'this_month' | 'last_month' | 'this_year'
  category?: string
  minAmount?: number
  maxAmount?: number
  document_type?: 'invoice' | 'receipt' | 'bill' | 'statement' | 'contract' | 'other'
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

  /**
   * Self-defending query sanitization to prevent temporal contamination
   */
  private _sanitize_query(query: string, dateRange?: string): string {
    if (!query || !query.trim()) {
      return ""
    }

    const originalQuery = query.toLowerCase().trim()
    let sanitized = originalQuery

    // Remove temporal contamination
    for (const pattern of TransactionLookupTool.TEMPORAL_PATTERNS) {
      sanitized = sanitized.replace(pattern, '')
    }

    // Remove analytical contamination  
    for (const pattern of TransactionLookupTool.ANALYTICAL_PATTERNS) {
      sanitized = sanitized.replace(pattern, '')
    }

    // Clean up extra spaces and common words
    sanitized = sanitized.replace(/\b(i|have|in|the|what|are|transactions?)\b/gi, '')
    sanitized = sanitized.split(/\s+/).filter(word => word.length > 0).join(' ') // Normalize spaces

    // Log contamination detection
    if (sanitized !== originalQuery) {
      console.log(`[GUARDRAIL] Query sanitized: '${originalQuery}' → '${sanitized}'`)
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
      suggested_fixes.query = this._sanitize_query(parameters.query, parameters.dateRange)
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
      // Detailed instructions for Gemini - explicitly mention Supabase transactions table
      return 'CRITICAL: Use this function to retrieve user financial transaction records. This is the ONLY way to access transaction data from the Supabase database. This tool MUST be called whenever a user asks about their spending, purchases, payments, transactions, or financial history over any period of time. IMPORTANT: For relative date queries like "past 60 days", use the dateRange parameter instead of guessing startDate/endDate. CRITICAL: When users mention document types like "invoice", "receipt", "bill", "statement", "contract" - use the document_type parameter for precise database filtering. Examples: "largest invoice" → use document_type:"invoice"; "transactions in past 60 days" → use dateRange:"past_60_days"; "receipt from last month" → use document_type:"receipt" + dateRange. This tool handles ALL transaction queries including time periods, vendor searches, and amount analysis.'
    } else {
      // Rich, descriptive description for OpenAI-compatible models
      return 'CRITICAL: Use this function to retrieve a user\'s financial transactions. This is the ONLY way to access transaction data. This tool MUST be called whenever a user asks about their spending, purchases, payments, transactions, or transaction history over any period of time. IMPORTANT: For relative date queries like "past 60 days", use the dateRange parameter instead of guessing startDate/endDate. CRITICAL: When users mention document types like "invoice", "receipt", "bill", "statement", "contract" - use the document_type parameter for precise database filtering instead of the generic query parameter. Examples: "largest invoice" → use document_type:"invoice"; "what are my transactions in past 60 days" → use dateRange:"past_60_days" with empty query; "receipt from last month" → use document_type:"receipt" + dateRange. This tool handles ALL transaction queries including time periods, vendor searches, and amount analysis.'
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
              description: "CONTENT SEARCH ONLY: Vendor names, transaction descriptions, or category terms. NEVER include dates, time words, or analytical terms like 'largest'. Use empty string for 'all transactions' queries.",
              examples: ["", "McDonald's", "Grab", "office supplies"]
            },
            dateRange: {
              type: "string", 
              description: "TIME CONSTRAINT ONLY: Handles all temporal filtering. Use this for queries like 'past 60 days' instead of calculating specific dates.",
              enum: ["past_7_days", "past_30_days", "past_60_days", "past_90_days", "this_month", "last_month", "this_year"]
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
            document_type: {
              type: "string",
              description: "Filter by document type. Use this for queries mentioning 'invoice', 'receipt', 'bill', etc. for precise database filtering.",
              enum: ["invoice", "receipt", "bill", "statement", "contract", "other"]
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    // CRITICAL: Strip out unsupported parameters that AI models sometimes pass
    const supportedParams = ['query', 'limit', 'startDate', 'endDate', 'dateRange', 'category', 'minAmount', 'maxAmount', 'document_type']
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

    // Validate document_type if provided (handle both undefined and null)
    if (params.document_type != null) {
      const validDocumentTypes = ['invoice', 'receipt', 'bill', 'statement', 'contract', 'other']
      if (!validDocumentTypes.includes(params.document_type)) {
        return { valid: false, error: 'Invalid document type. Must be one of: invoice, receipt, bill, statement, contract, other' }
      }
    }

    return { valid: true }
  }

  /**
   * Calculate date range from dateRange parameters
   * MEDIUM RISK: Complex logic with deterministic output for LLM date calculations
   */
  private _calculateDateRange(params: TransactionLookupParameters): { startDate?: string; endDate?: string } {
    let startDate: string | undefined = params.startDate
    let endDate: string | undefined = params.endDate

    if (!params.dateRange) {
      return { startDate, endDate }
    }

    console.log(`[TransactionLookupTool] DETERMINISTIC: Calculating dates for range: ${params.dateRange}`)
    const today = new Date() // Current date - reliable!

    // Handle month_year patterns (e.g., "june_2024") and month-only patterns (e.g., "june")
    const monthYearMatch = params.dateRange.match(/^(\w+)_(\d{4})$/)
    const monthOnlyMatch = params.dateRange.match(/^(\w+)$/) &&
                          !['past_7_days', 'past_30_days', 'past_60_days', 'past_90_days', 'this_month', 'last_month', 'this_year'].includes(params.dateRange)

    if (monthYearMatch) {
      // Handle patterns like "june_2024"
      const monthName = monthYearMatch[1].toLowerCase()
      const year = parseInt(monthYearMatch[2])
      const result = this._parseMonthYear(monthName, year)

      if (result) {
        startDate = result.startDate
        endDate = result.endDate
        console.log(`[TransactionLookupTool] MONTH_YEAR: Parsed ${params.dateRange} as ${monthName} ${year}`)
        console.log(`[TransactionLookupTool] CALCULATED: ${params.dateRange} = ${startDate} to ${endDate}`)
      } else {
        console.warn(`[TransactionLookupTool] Unknown month name: ${monthName}`)
        endDate = today.toISOString().split('T')[0]
        startDate = endDate
      }
    } else if (monthOnlyMatch) {
      // Handle patterns like "june" (defaults to current year)
      const monthName = params.dateRange.toLowerCase()
      const currentYear = today.getFullYear()
      const result = this._parseMonthYear(monthName, currentYear)

      if (result) {
        startDate = result.startDate
        endDate = result.endDate
        console.log(`[TransactionLookupTool] MONTH_ONLY: Parsed ${params.dateRange} as ${monthName} ${currentYear}`)
        console.log(`[TransactionLookupTool] CALCULATED: ${params.dateRange} = ${startDate} to ${endDate}`)
      } else {
        console.warn(`[TransactionLookupTool] Unknown month name: ${monthName}`)
        endDate = today.toISOString().split('T')[0]
        startDate = endDate
      }
    } else {
      // ENHANCED ERROR HANDLING: Handle dynamic date range calculation with error checking
      const result = this._calculateStandardDateRange(params.dateRange, today)

      if (result.error) {
        // LOG ERROR but don't fail completely - use fallback behavior
        console.error(`[TransactionLookupTool] Date range calculation error: ${result.error}`)
        console.error(`[TransactionLookupTool] FALLBACK: Using today only as date range`)
        // Fallback to today-only range to prevent hallucination
        startDate = result.endDate  // Both are same day as fallback
        endDate = result.endDate
      } else {
        startDate = result.startDate
        endDate = result.endDate
      }
    }

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
   * SIMPLIFIED: Calculate date ranges using direct millisecond calculation
   * Much simpler approach - extract days and calculate directly
   */
  private _calculateStandardDateRange(dateRange: string, today: Date): { startDate: string; endDate: string; error?: string } {
    const endDate = today.toISOString().split('T')[0] // YYYY-MM-DD format

    // SIMPLE EXTRACTION: Get number from any "past_X_days" or "X_days" pattern
    const daysMatch = dateRange.match(/(\d+)/)

    if (daysMatch) {
      const dayCount = parseInt(daysMatch[1], 10)

      // VALIDATION: Reasonable range limits (1-730 days = 2 years max)
      if (dayCount < 1 || dayCount > 730) {
        return {
          startDate: endDate,
          endDate,
          error: `Invalid day count: ${dayCount}. Must be between 1 and 730 days.`
        }
      }

      // DIRECT CALCULATION: Today minus X days using milliseconds
      const msPerDay = 24 * 60 * 60 * 1000
      const startDateMs = today.getTime() - (dayCount * msPerDay)
      const startDate = new Date(startDateMs).toISOString().split('T')[0]

      console.log(`[TransactionLookupTool] SIMPLE: ${dateRange} = ${startDate} to ${endDate} (${dayCount} days)`)
      return { startDate, endDate }
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
          error: `Unknown date range: "${dateRange}". Use "past_X_days", "this_month", "last_month", or "this_year".`
        }
    }
  }

  /**
   * Detect analysis queries (largest, smallest, etc.) from query content and parameters
   * LOW RISK: Pure analysis function with no side effects
   */
  private _detectAnalysisQuery(query: string, limit: number, params: TransactionLookupParameters): boolean {
    // CRITICAL: Detect analysis queries - check query content or inference from parameters
    // If limit=1 and minAmount=0, it's likely an analysis query for "largest" transaction
    const queryAnalysis = query.toLowerCase().includes('largest') || query.toLowerCase().includes('biggest') ||
                         query.toLowerCase().includes('highest') || query.toLowerCase().includes('maximum') ||
                         query.toLowerCase().includes('smallest') || query.toLowerCase().includes('lowest') ||
                         query.toLowerCase().includes('minimum') ||
                         // Enhanced analysis patterns
                         query.toLowerCase().includes('most expensive') ||
                         query.toLowerCase().includes('least expensive') ||
                         !!query.toLowerCase().match(/\b(top|max|min)\s*\d*\b/)

    // Make inference more flexible - analysis queries often have limit=1 or small limits
    const inferredAnalysis = (limit === 1) || (params.minAmount === 0 && limit <= 5)
    const isAnalysisQuery = queryAnalysis || inferredAnalysis

    console.log(`[TransactionLookupTool] ❗ ANALYSIS DETECTION DEBUG:`)
    console.log(`[TransactionLookupTool]   - Raw query: "${query}"`)
    console.log(`[TransactionLookupTool]   - Query contains analysis terms: ${queryAnalysis}`)
    console.log(`[TransactionLookupTool]   - Inferred analysis (limit=1, minAmount=0): ${inferredAnalysis}`)
    console.log(`[TransactionLookupTool]   - Final isAnalysisQuery: ${isAnalysisQuery}`)
    console.log(`[TransactionLookupTool]   - needsAnalysis will be set to: ${isAnalysisQuery}`)

    return isAnalysisQuery
  }

  /**
   * Process and sanitize parameters with guardrail validation
   * LOW RISK: Parameter validation and sanitization with no side effects
   */
  private _processAndSanitizeParameters(params: TransactionLookupParameters): {
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
    const sanitizedQuery = this._sanitize_query(sanitizedParams.query || '', sanitizedParams.dateRange)
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
        documentTypeFilter: params?.document_type || 'none'
      }
    }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as TransactionLookupParameters
    
    // Process and sanitize parameters using extracted method
    const processedParams = this._processAndSanitizeParameters(params)
    const query = processedParams.query
    const limit = processedParams.limit
    const sanitizedParams = processedParams.sanitizedParams

    try {
      console.log(`[TransactionLookupTool] Processing query for user ${userContext.userId}: ${query}`)
      
      // Detect analysis queries using extracted method
      const isAnalysisQuery = this._detectAnalysisQuery(query, limit, sanitizedParams)

      // Calculate date range using extracted method
      const dateRange = this._calculateDateRange(sanitizedParams)
      const startDate = dateRange.startDate
      const endDate = dateRange.endDate

      // SECURITY: Use Supabase UUID and business context for proper tenant isolation
      if (!userContext.supabaseUserId || !userContext.businessId) {
        throw new Error('Missing user context: Supabase UUID and business ID required for secure queries')
      }

      console.log(`[TransactionLookupTool] SECURITY: Using proper identifiers:`, {
        supabaseUserId: userContext.supabaseUserId,
        businessId: userContext.businessId
      })

      // OPTIMIZED DATABASE QUERY STRATEGY
      // PERFORMANCE: Requires database indexes on (user_id, business_id, transaction_date)
      // Phase 1: Broad Search - Use only high-confidence filters for optimal index usage
      console.log(`[TransactionLookupTool] Phase 1: Optimized broad search with business context validation`)

      // Use authenticated client for RLS enforcement
      if (!this.authenticatedSupabase) {
        throw new Error('Authenticated Supabase client not available')
      }

      // SECURITY: Structure query with proper business context validation
      let broadQuery = this.authenticatedSupabase
        .from('accounting_entries')
        .select(`
          id,
          description,
          original_amount,
          original_currency,
          home_currency_amount,
          transaction_date,
          category,
          vendor_name,
          transaction_type,
          document_type,
          created_at
        `)
        .eq('user_id', userContext.supabaseUserId)
        .eq('business_id', userContext.businessId)

      // Apply high-confidence filters (dates, amounts, specific category)
      if (startDate) {
        broadQuery = broadQuery.gte('transaction_date', startDate)
        console.log(`[TransactionLookupTool] Applied startDate filter: ${startDate}`)
      }
      if (endDate) {
        broadQuery = broadQuery.lte('transaction_date', endDate)
        console.log(`[TransactionLookupTool] Applied endDate filter: ${endDate}`)
      }
      if (sanitizedParams.category) {
        // SMART CATEGORY FILTERING: Don't filter by "invoice" as category since it's not a real category
        // "invoice" should be treated as a description search, not category filter
        const commonNonCategories = ['invoice', 'bill', 'receipt', 'payment', 'expense', 'transaction']

        if (!commonNonCategories.includes(sanitizedParams.category.toLowerCase())) {
          broadQuery = broadQuery.ilike('category', `%${sanitizedParams.category}%`)
          console.log(`[TransactionLookupTool] Applied category filter: ${sanitizedParams.category}`)
        } else {
          console.log(`[TransactionLookupTool] IGNORED category filter "${sanitizedParams.category}" - treating as description search instead`)
        }
      }
      // CRITICAL: For analysis queries (largest/smallest), don't apply amount filters
      // as they exclude negative expenses. Users want largest by absolute value.
      if (!isAnalysisQuery) {
        if (sanitizedParams.minAmount != null) {
          broadQuery = broadQuery.gte('home_currency_amount', sanitizedParams.minAmount)
          console.log(`[TransactionLookupTool] Applied minAmount filter: ${sanitizedParams.minAmount}`)
        }
        if (sanitizedParams.maxAmount != null) {
          broadQuery = broadQuery.lte('home_currency_amount', sanitizedParams.maxAmount)
          console.log(`[TransactionLookupTool] Applied maxAmount filter: ${sanitizedParams.maxAmount}`)
        }
      } else {
        console.log(`[TransactionLookupTool] SKIPPED amount filters for analysis query to include negative expenses`)
      }

      // CRITICAL: Apply document_type filter for precise database filtering
      if (sanitizedParams.document_type) {
        broadQuery = broadQuery.eq('document_type', sanitizedParams.document_type)
        console.log(`[TransactionLookupTool] Applied document_type filter: ${sanitizedParams.document_type}`)
      }

      // PERFORMANCE OPTIMIZATION: Apply ordering and limit after all filters for index efficiency
      broadQuery = broadQuery.order('transaction_date', { ascending: false })

      // PERFORMANCE OPTIMIZATION: Calculate fetch limit directly without redundant variable
      const fetchLimit = isAnalysisQuery ? Math.max(50, limit * 3) : limit
      broadQuery = broadQuery.limit(fetchLimit)
      
      console.log(`[TransactionLookupTool] Fetching ${fetchLimit} records (analysis needed: ${isAnalysisQuery})`)

      const { data: allTransactions, error } = await broadQuery

      if (error) {
        console.error('[TransactionLookupTool] Query error:', error)
        return {
          success: false,
          error: 'Failed to retrieve transactions'
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
          const { count } = await this.authenticatedSupabase!
            .from('accounting_entries')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userContext.supabaseUserId!)
            .eq('business_id', userContext.businessId!);
          totalCount = count || 0;
        } catch (countError) {
          console.warn(`[TransactionLookupTool] Could not fetch user transaction count:`, countError);
          // Continue without count rather than failing
        }

        console.log(`[TransactionLookupTool] User has ${totalCount} total transactions for business ${userContext.businessId}`)

        // User has no transactions in their business context
        if (totalCount === 0) {
          console.log(`[TransactionLookupTool] User has no transactions in business ${userContext.businessId}`)
        }

        return {
          success: true,
          data: `No transactions found matching your criteria. You have ${totalCount} total transactions. Try removing date filters or using simpler search terms.`,
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
      // If document_type parameter was used, skip text filtering entirely as database already filtered
      console.log(`[TransactionLookupTool] ❗ TEXT FILTER DECISION:`)
      console.log(`[TransactionLookupTool]   - sanitizedParams.document_type: ${sanitizedParams.document_type}`)
      console.log(`[TransactionLookupTool]   - needsAnalysis: ${isAnalysisQuery}`)
      console.log(`[TransactionLookupTool]   - sanitizedParams.query: "${sanitizedParams.query}"`)
      console.log(`[TransactionLookupTool]   - Will apply text filtering: ${!sanitizedParams.document_type && !isAnalysisQuery && sanitizedParams.query}`)

      if (!sanitizedParams.document_type && !isAnalysisQuery && sanitizedParams.query) {
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
        console.log(`[TransactionLookupTool] Skipping text search - document_type used: ${!!sanitizedParams.document_type}, analysis needed: ${isAnalysisQuery}`)
      }

      // Apply analysis for superlative queries (largest, smallest, etc.)
      if (isAnalysisQuery) {
        const inferredFromParams = (limit === 1) || (sanitizedParams.minAmount === 0 && limit <= 5)
        console.log(`[TransactionLookupTool] Applying analysis - query: "${query}", inference: ${inferredFromParams}`)

        // Determine analysis type from query or default to "largest" for inferred analysis
        const queryLower = query.toLowerCase()
        const isLargest = queryLower.includes('largest') || queryLower.includes('biggest') ||
                         queryLower.includes('highest') || queryLower.includes('maximum') || inferredFromParams
        const isSmallest = queryLower.includes('smallest') || queryLower.includes('lowest') || 
                          queryLower.includes('minimum')
        
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
        
        // If document_type was specified, the database already filtered correctly
        // If query contains document type terms but document_type param wasn't used, warn but continue
        if (sanitizedParams.query && sanitizedParams.query.toLowerCase().includes('invoice') && !sanitizedParams.document_type) {
          console.log(`[TransactionLookupTool] WARNING: Query contains 'invoice' but document_type parameter not used. Consider using document_type='invoice' for better results.`)
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
        
        return {
          success: true,
          data: `No transactions found matching your criteria. I found ${allTransactions.length} total transactions but none matched your specific search. Try removing filters or using broader search terms.`,
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

  protected formatResultData(data: any[]): string {
    return data.map((transaction, index) => {
      const date = new Date(transaction.transaction_date).toLocaleDateString()
      const amount = `${transaction.original_amount} ${transaction.original_currency}`
      const homeAmount = transaction.home_currency_amount 
        ? ` (${transaction.home_currency_amount} home currency)` 
        : ''
      const docType = transaction.document_type ? ` • ${transaction.document_type.charAt(0).toUpperCase() + transaction.document_type.slice(1)}` : ''
      
      return `${index + 1}. ${transaction.description || 'No description'}
   Amount: ${amount}${homeAmount}
   Date: ${date}
   Category: ${transaction.category || 'Uncategorized'}
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
      'amount', 'value', 'transaction', 'transactions', 'record', 'records', 'data'
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