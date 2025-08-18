/**
 * Secure Transaction Lookup Tool
 * Enforces RLS and proper user context validation for transaction queries
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema } from './base-tool'
import { aiConfig } from '../config/ai-config'

interface TransactionLookupParameters {
  query: string
  limit?: number
  dateRange?: {
    start?: string
    end?: string
  }
}

export class TransactionLookupTool extends BaseTool {
  getToolName(): string {
    return 'get_transactions'
  }

  getDescription(): string {
    return 'Look up transaction data from your financial records using natural language queries. Supports filtering by amount, date, vendor, category, etc.'
  }

  getToolSchema(): OpenAIToolSchema {
    return {
      type: "function",
      function: {
        name: this.getToolName(),
        description: "Lookup and analyze financial transactions with filtering options. Use this when users ask about their transactions, expenses, spending patterns, or financial summaries.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Query to filter transactions by description, category, or other attributes"
            },
            startDate: {
              type: "string",
              description: "Start date for filtering transactions (YYYY-MM-DD format)"
            },
            endDate: {
              type: "string",
              description: "End date for filtering transactions (YYYY-MM-DD format)"
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
            }
          },
          required: []
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as TransactionLookupParameters

    if (!params.query || typeof params.query !== 'string') {
      return { valid: false, error: 'Query parameter is required and must be a string' }
    }

    if (params.query.trim().length === 0) {
      return { valid: false, error: 'Query cannot be empty' }
    }

    if (params.query.length > 300) {
      return { valid: false, error: 'Query too long (max 300 characters)' }
    }

    // Validate optional limit
    if (params.limit !== undefined && (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 50)) {
      return { valid: false, error: 'Limit must be an integer between 1 and 50' }
    }

    // Validate date range if provided
    if (params.dateRange) {
      const { start, end } = params.dateRange
      
      if (start && !this.isValidDate(start)) {
        return { valid: false, error: 'Invalid start date format' }
      }
      
      if (end && !this.isValidDate(end)) {
        return { valid: false, error: 'Invalid end date format' }
      }
      
      if (start && end && new Date(start) > new Date(end)) {
        return { valid: false, error: 'Start date cannot be after end date' }
      }
    }

    return { valid: true }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as TransactionLookupParameters
    const query = params.query.trim()
    const limit = params.limit || 20

    try {
      console.log(`[TransactionLookupTool] Processing query for user ${userContext.userId}: ${query}`)

      // SECURITY: Use RLS-enabled query to fetch user's transactions
      let transactionQuery = this.supabase
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
          created_at
        `)
        .eq('user_id', userContext.userId)
        .order('transaction_date', { ascending: false })
        .limit(limit)

      // Apply date range filter if provided
      if (params.dateRange) {
        if (params.dateRange.start) {
          transactionQuery = transactionQuery.gte('transaction_date', params.dateRange.start)
        }
        if (params.dateRange.end) {
          transactionQuery = transactionQuery.lte('transaction_date', params.dateRange.end)
        }
      }

      // Attempt to enhance query with AI-generated filters
      const enhancedFilters = await this.generateSmartFilters(query)
      if (enhancedFilters) {
        transactionQuery = this.applySmartFilters(transactionQuery, enhancedFilters)
      }

      const { data: transactions, error } = await transactionQuery

      if (error) {
        console.error('[TransactionLookupTool] Query error:', error)
        return {
          success: false,
          error: 'Failed to retrieve transactions'
        }
      }

      if (!transactions || transactions.length === 0) {
        return {
          success: true,
          data: 'No transactions found matching your criteria. Try adjusting your search terms or date range.',
          metadata: {
            queryProcessed: query,
            resultsCount: 0,
            userId: userContext.userId
          }
        }
      }

      // Calculate summary statistics
      const totalAmount = transactions.reduce((sum, t) => sum + (t.home_currency_amount || 0), 0)
      const formattedResults = this.formatResultData(transactions)
      
      const summary = `Found ${transactions.length} transaction(s) for "${query}":\n\n${formattedResults}`
      const statistics = `\n\nSummary: Total amount ${totalAmount.toFixed(2)} (home currency)`

      return {
        success: true,
        data: summary + statistics,
        metadata: {
          queryProcessed: query,
          resultsCount: transactions.length,
          totalAmount,
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
      
      return `${index + 1}. ${transaction.description || 'No description'}
   Amount: ${amount}${homeAmount}
   Date: ${date}
   Category: ${transaction.category || 'Uncategorized'}
   Vendor: ${transaction.vendor_name || 'Unknown'}
   Type: ${transaction.transaction_type || 'Unknown'}`
    }).join('\n\n')
  }

  /**
   * Generate smart filters using AI to interpret natural language queries
   */
  private async generateSmartFilters(query: string): Promise<any> {
    try {
      const systemPrompt = `You are a financial query analyzer. Extract structured filters from natural language queries.
Return JSON with these optional fields: category, vendor_name, min_amount, max_amount, transaction_type.
Only include fields that are clearly specified in the query.

Examples:
"expenses over 100" -> {"min_amount": 100}
"food purchases" -> {"category": "food"}
"transactions with ABC Company" -> {"vendor_name": "ABC Company"}

Return only valid JSON, no explanations.`

      const response = await fetch(`${aiConfig.chat.endpointUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: aiConfig.chat.modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query }
          ],
          max_tokens: 200,
          temperature: 0.1
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
      const filters = JSON.parse(content)
      return this.validateFilters(filters) ? filters : null

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

    // Validate data types
    if (filters.min_amount !== undefined && typeof filters.min_amount !== 'number') return false
    if (filters.max_amount !== undefined && typeof filters.max_amount !== 'number') return false

    return true
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
      const { data: userProfile, error } = await this.supabase
        .from('users')
        .select('id, home_currency')
        .eq('id', userContext.userId)
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