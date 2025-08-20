/**
 * Secure Transaction Lookup Tool
 * Enforces RLS and proper user context validation for transaction queries
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { aiConfig } from '../config/ai-config'

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
  getToolName(modelType: ModelType = 'openai'): string {
    return modelType === 'gemini' ? 'get_data_records' : 'get_transactions'
  }

  getDescription(modelType: ModelType = 'openai'): string {
    if (modelType === 'gemini') {
      // Detailed instructions for Gemini - explicitly mention Supabase transactions table
      return 'FINANCIAL DATA RETRIEVAL TOOL that queries the Supabase transactions table for numerical analysis and record retrieval. Use this to find highest/largest, lowest/smallest, totals, averages, or any specific values from the user\'s financial transactions stored in the database. IMPORTANT: For relative date queries like "past 60 days", use the dateRange parameter instead of guessing startDate/endDate. CRITICAL: When users mention document types like "invoice", "receipt", "bill", "statement", "contract" - use the document_type parameter for precise database filtering instead of the generic query parameter. This ensures fast, accurate results by querying the transactions table directly. Examples: "largest invoice" → use document_type:"invoice" + analysis; "receipt from last month" → use document_type:"receipt" + dateRange. Perfect for answering questions about maximum values, minimum values, totals, counts, and finding specific document types from the user\'s transaction records.'
    } else {
      // Rich, descriptive description for OpenAI-compatible models
      return 'Transaction Lookup and Analysis Tool - Search, filter, and analyze financial transactions with intelligent query processing. This tool can find specific transactions, calculate totals and averages, identify highest/lowest amounts, and perform complex financial analysis. IMPORTANT: For relative date queries like "past 60 days", use the dateRange parameter instead of guessing startDate/endDate. CRITICAL: When users mention document types like "invoice", "receipt", "bill", "statement", "contract" - use the document_type parameter for precise database filtering instead of the generic query parameter. For analysis queries like "largest transaction", "biggest expense", "highest amount" - you MUST include query: "largest transaction" or similar meaningful search terms. Examples: "largest invoice" → use document_type:"invoice" + query:"largest"; "what is my biggest transaction in past 60 days" → use dateRange:"past_60_days" + query:"biggest transaction"; "receipt from last month" → use document_type:"receipt" + dateRange. Perfect for answering questions like "What is my largest invoice?" or "Show me all receipts from this vendor".'
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
              description: "Query to filter transactions by description, category, vendor name, or other attributes"
            },
            dateRange: {
              type: "string",
              description: "Relative date range for filtering transactions. Use this for queries like 'past 60 days' instead of calculating specific dates. PREFERRED over startDate/endDate for relative queries.",
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
      if (params.query.trim().length === 0) {
        return { valid: false, error: 'Query cannot be empty' }
      }
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

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as TransactionLookupParameters
    const query = params.query?.trim() || 'all transactions'
    const limit = params.limit || 20

    try {
      console.log(`[TransactionLookupTool] Processing query for user ${userContext.userId}: ${query}`)
      
      // CRITICAL: Detect analysis queries - check query content or inference from parameters
      // If limit=1 and minAmount=0, it's likely an analysis query for "largest" transaction
      const queryAnalysis = query.toLowerCase().includes('largest') || query.toLowerCase().includes('biggest') || 
                           query.toLowerCase().includes('highest') || query.toLowerCase().includes('maximum') ||
                           query.toLowerCase().includes('smallest') || query.toLowerCase().includes('lowest') || 
                           query.toLowerCase().includes('minimum') ||
                           // Enhanced analysis patterns
                           query.toLowerCase().includes('most expensive') || 
                           query.toLowerCase().includes('least expensive') ||
                           query.toLowerCase().match(/\b(top|max|min)\s*\d*\b/)
      
      // Make inference more flexible - analysis queries often have limit=1 or small limits
      const inferredAnalysis = (limit === 1) || (params.minAmount === 0 && limit <= 5)
      const isAnalysisQuery = queryAnalysis || inferredAnalysis
      
      console.log(`[TransactionLookupTool] ❗ ANALYSIS DETECTION DEBUG:`)
      console.log(`[TransactionLookupTool]   - Raw query: "${query}"`)
      console.log(`[TransactionLookupTool]   - Query contains analysis terms: ${queryAnalysis}`)
      console.log(`[TransactionLookupTool]   - Inferred analysis (limit=1, minAmount=0): ${inferredAnalysis}`)
      console.log(`[TransactionLookupTool]   - Final isAnalysisQuery: ${isAnalysisQuery}`)
      console.log(`[TransactionLookupTool]   - needsAnalysis will be set to: ${isAnalysisQuery}`)

      // DETERMINISTIC DATE CALCULATION - Prevent LLM date hallucination
      let startDate: string | undefined = params.startDate
      let endDate: string | undefined = params.endDate

      if (params.dateRange) {
        console.log(`[TransactionLookupTool] DETERMINISTIC: Calculating dates for range: ${params.dateRange}`)
        const today = new Date() // Current date - reliable!
        endDate = today.toISOString().split('T')[0] // YYYY-MM-DD format
        
        const startDateObj = new Date()
        
        switch (params.dateRange) {
          case 'past_7_days':
            startDateObj.setDate(today.getDate() - 7)
            break
          case 'past_30_days':
            startDateObj.setDate(today.getDate() - 30)
            break  
          case 'past_60_days':
            startDateObj.setDate(today.getDate() - 60)
            break
          case 'past_90_days':
            startDateObj.setDate(today.getDate() - 90)
            break
          case 'this_month':
            startDateObj.setDate(1) // First day of current month
            break
          case 'last_month':
            startDateObj.setMonth(today.getMonth() - 1)
            startDateObj.setDate(1)
            endDate = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0] // Last day of previous month
            break
          case 'this_year':
            startDateObj.setMonth(0, 1) // January 1st of current year
            break
        }
        
        startDate = startDateObj.toISOString().split('T')[0]
        console.log(`[TransactionLookupTool] CALCULATED: ${params.dateRange} = ${startDate} to ${endDate}`)
        console.log(`[TransactionLookupTool] Current timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`)
        console.log(`[TransactionLookupTool] Start date object: ${startDateObj.toISOString()}`)
        console.log(`[TransactionLookupTool] End date object: ${new Date(endDate + 'T23:59:59').toISOString()}`)
      }

      // CRITICAL: Use consistent user_id column (from CLAUDE.md: Users → All entities via user_id)
      // Based on architecture docs, all entities use user_id column for relationships
      console.log(`[TransactionLookupTool] Using user_id column for transactions query: ${userContext.userId}`)

      // TWO-PHASE QUERY STRATEGY
      // Phase 1: Broad Search - Use only high-confidence filters
      console.log(`[TransactionLookupTool] Phase 1: Broad search with high-confidence filters`)
      
      let broadQuery = this.supabase
        .from('transactions')
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
        .eq('user_id', userContext.userId)
        .order('transaction_date', { ascending: false })

      // Apply high-confidence filters (dates, amounts, specific category)
      if (startDate) {
        broadQuery = broadQuery.gte('transaction_date', startDate)
        console.log(`[TransactionLookupTool] Applied startDate filter: ${startDate}`)
      }
      if (endDate) {
        broadQuery = broadQuery.lte('transaction_date', endDate)
        console.log(`[TransactionLookupTool] Applied endDate filter: ${endDate}`)
      }
      if (params.category) {
        // SMART CATEGORY FILTERING: Don't filter by "invoice" as category since it's not a real category
        // "invoice" should be treated as a description search, not category filter
        const commonNonCategories = ['invoice', 'bill', 'receipt', 'payment', 'expense', 'transaction']
        
        if (!commonNonCategories.includes(params.category.toLowerCase())) {
          broadQuery = broadQuery.ilike('category', `%${params.category}%`)
          console.log(`[TransactionLookupTool] Applied category filter: ${params.category}`)
        } else {
          console.log(`[TransactionLookupTool] IGNORED category filter "${params.category}" - treating as description search instead`)
        }
      }
      // CRITICAL: For analysis queries (largest/smallest), don't apply amount filters 
      // as they exclude negative expenses. Users want largest by absolute value.
      if (!isAnalysisQuery) {
        if (params.minAmount != null) {
          broadQuery = broadQuery.gte('home_currency_amount', params.minAmount)
          console.log(`[TransactionLookupTool] Applied minAmount filter: ${params.minAmount}`)
        }
        if (params.maxAmount != null) {
          broadQuery = broadQuery.lte('home_currency_amount', params.maxAmount)
          console.log(`[TransactionLookupTool] Applied maxAmount filter: ${params.maxAmount}`)
        }
      } else {
        console.log(`[TransactionLookupTool] SKIPPED amount filters for analysis query to include negative expenses`)
      }
      
      // CRITICAL: Apply document_type filter for precise database filtering
      if (params.document_type) {
        broadQuery = broadQuery.eq('document_type', params.document_type)
        console.log(`[TransactionLookupTool] Applied document_type filter: ${params.document_type}`)
      }

      // Use the analysis detection we calculated earlier
      const needsAnalysis = isAnalysisQuery

      const fetchLimit = needsAnalysis ? Math.max(50, limit * 3) : limit
      broadQuery = broadQuery.limit(fetchLimit)
      
      console.log(`[TransactionLookupTool] Fetching ${fetchLimit} records (analysis needed: ${needsAnalysis})`)

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
        console.log(`[TransactionLookupTool] Query parameters:`, JSON.stringify(params, null, 2))
        console.log(`[TransactionLookupTool] Analysis detection: ${isAnalysisQuery}`)
        console.log(`[TransactionLookupTool] Current timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`)
        
        // Try to get total count with user_id
        const { count: totalCount } = await this.supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userContext.userId);
        
        console.log(`[TransactionLookupTool] User has ${totalCount} total transactions with user_id=${userContext.userId}`)
        
        // If no transactions with user_id, try clerk_user_id (fallback check)
        if (totalCount === 0) {
          const { count: clerkIdCount } = await this.supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('clerk_user_id', userContext.userId);
          
          console.log(`[TransactionLookupTool] FALLBACK: User has ${clerkIdCount || 0} total transactions with clerk_user_id=${userContext.userId}`)
          
          if ((clerkIdCount || 0) > 0) {
            console.error(`[TransactionLookupTool] ⚠️ COLUMN MISMATCH DETECTED: Transactions exist under clerk_user_id but query uses user_id`)
          }
        }
        
        return {
          success: true,
          data: `No transactions found matching your criteria. You have ${totalCount || 0} total transactions. Try removing date filters or using simpler search terms.`,
          metadata: {
            queryProcessed: query,
            resultsCount: 0,
            totalUserTransactions: totalCount || 0,
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
      console.log(`[TransactionLookupTool]   - params.document_type: ${params.document_type}`)
      console.log(`[TransactionLookupTool]   - needsAnalysis: ${needsAnalysis}`)
      console.log(`[TransactionLookupTool]   - params.query: "${params.query}"`)
      console.log(`[TransactionLookupTool]   - Will apply text filtering: ${!params.document_type && !needsAnalysis && params.query}`)
      
      if (!params.document_type && !needsAnalysis && params.query) {
        // SAFETY: For analysis queries that might have been missed, double-check
        if (query.toLowerCase().match(/\b(largest|biggest|highest|maximum|smallest|lowest|minimum)\b/)) {
          console.log(`[TransactionLookupTool] SAFETY: Detected analysis terms in query, skipping text filtering`)
        } else {
          // Extract only meaningful filter terms (not analysis terms, not document types)
          const { filterTerms } = this.separateAnalysisAndFilter(params.query)
          
          // Remove document type terms that should have been passed as document_type parameter
          const documentTypeTerms = ['invoice', 'receipt', 'bill', 'statement', 'contract']
          const meaningfulFilterTerms = filterTerms.filter(term => 
            !documentTypeTerms.includes(term.toLowerCase())
          )
          
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
            console.log(`[TransactionLookupTool] No meaningful filter terms found, skipping text search`)
          }
        }
      } else {
        console.log(`[TransactionLookupTool] Skipping text search - document_type used: ${!!params.document_type}, analysis needed: ${needsAnalysis}`)
      }

      // Apply analysis for superlative queries (largest, smallest, etc.)
      if (needsAnalysis) {
        console.log(`[TransactionLookupTool] Applying analysis - query: "${query}", inference: ${inferredAnalysis}`)
        
        // Determine analysis type from query or default to "largest" for inferred analysis
        const queryLower = query.toLowerCase()
        const isLargest = queryLower.includes('largest') || queryLower.includes('biggest') || 
                         queryLower.includes('highest') || queryLower.includes('maximum') || inferredAnalysis
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
        if (params.query && params.query.toLowerCase().includes('invoice') && !params.document_type) {
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
        console.log(`[TransactionLookupTool] Analysis type: ${needsAnalysis ? 'YES (largest/smallest)' : 'NO (regular search)'}`)
        
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
      
      // Log first 3 transactions for debugging
      transactions.slice(0, 3).forEach((t, idx) => {
        console.log(`[TransactionLookupTool]   ${idx + 1}. ${t.description} - ${t.original_amount} ${t.original_currency} (${t.transaction_date})`)
      })
      
      if (transactions.length > 3) {
        console.log(`[TransactionLookupTool]   ... and ${transactions.length - 3} more transactions`)
      }
      
      console.log(`[TransactionLookupTool] Response Length: ${finalResult.length} characters`)

      return {
        success: true,
        data: finalResult,
        metadata: {
          queryProcessed: query,
          resultsCount: transactions.length,
          totalAmount,
          userId: userContext.userId,
          dateRangeCalculated: params.dateRange ? `${startDate} to ${endDate}` : 'none',
          documentTypeFilter: params.document_type || 'none'
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
   * Separate analysis terms from actual filter terms in queries
   * Analysis terms: largest, biggest, highest, smallest, lowest, minimum, maximum, etc.
   * Filter terms: invoice, company names, categories, etc.
   */
  private separateAnalysisAndFilter(query: string): { analysisTerms: string[]; filterTerms: string[] } {
    const queryLower = query.toLowerCase()
    const words = queryLower.split(/\s+/)
    
    // Define analysis terms that should NOT be used for text filtering
    const analysisTerms = [
      'largest', 'biggest', 'highest', 'maximum', 'max', 'most', 'greatest',
      'smallest', 'lowest', 'minimum', 'min', 'least', 'fewest',
      'total', 'sum', 'average', 'mean', 'count', 'number'
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
    const filterWords: string[] = []
    
    for (const word of words) {
      const cleanWord = word.replace(/[^\w]/g, '') // Remove punctuation
      
      if (analysisTerms.includes(cleanWord)) {
        foundAnalysisTerms.push(cleanWord)
      } else if (!commonWords.includes(cleanWord) && cleanWord.length > 2) {
        // Only include meaningful words that could be used for filtering
        filterWords.push(cleanWord)
      }
    }
    
    // Also extract quoted phrases as filter terms
    const quotedPhrases = query.match(/"([^"]+)"/g)
    if (quotedPhrases) {
      quotedPhrases.forEach(phrase => {
        const cleanPhrase = phrase.replace(/"/g, '').trim()
        if (cleanPhrase.length > 0) {
          filterWords.push(cleanPhrase)
        }
      })
    }
    
    return {
      analysisTerms: foundAnalysisTerms,
      filterTerms: filterWords
    }
  }

  /**
   * Validate date string format
   */
  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString)
    return !isNaN(date.getTime()) && dateString.length >= 8 // Basic validation
  }

  /**
   * Enhanced permission check for transaction access
   */
  protected async checkUserPermissions(userContext: UserContext): Promise<boolean> {
    // Call parent permission check first
    const basePermission = await super.checkUserPermissions(userContext)
    if (!basePermission) {
      return false
    }

    try {
      // Additional check: verify user has access to transactions
      // Query by clerk_user_id since that's the actual column in users table
      const { data: userProfile, error } = await this.supabase
        .from('users')
        .select('id, home_currency, clerk_user_id')
        .eq('clerk_user_id', userContext.userId)
        .single()

      if (error || !userProfile) {
        console.error('[TransactionLookupTool] User profile check failed:', error)
        return false
      }

      return true

    } catch (error) {
      console.error('[TransactionLookupTool] Permission validation error:', error)
      return false
    }
  }
}