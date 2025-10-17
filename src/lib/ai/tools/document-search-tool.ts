/**
 * Secure Document Search Tool
 * Enforces RLS and proper user context validation
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool'
import { EmbeddingService } from '@/lib/ai/ai-services/embedding-service'
import { VectorStorageService } from '@/lib/ai/ai-services/vector-storage-service'

interface DocumentSearchParameters {
  query: string
  limit?: number
  similarityThreshold?: number
}

export class DocumentSearchTool extends BaseTool {
  private embeddingService = new EmbeddingService()
  private vectorService = new VectorStorageService()

  getToolName(modelType: ModelType = 'openai'): string {
    return modelType === 'gemini' ? 'search_text_documents' : 'search_documents'
  }

  getDescription(modelType: ModelType = 'openai'): string {
    if (modelType === 'gemini') {
      // Abstract, sanitized description for Gemini
      return 'TEXT SEARCH TOOL for finding specific documents or text content by keywords. Use this ONLY to locate documents by vendor names, document types, or text content. NEVER use for numerical analysis, date ranges, amounts, or categories - use get_data_records for those queries instead.'
    } else {
      // Rich, descriptive description for OpenAI-compatible models
      return 'Document Search and Retrieval Tool - Find uploaded financial documents by text content ONLY. Use this tool to search for documents by vendor name, document type, or keywords. IMPORTANT: This tool does NOT support date ranges, amount filters, or transaction categories. For queries involving dates, amounts, or financial analysis, use the transaction lookup tool instead.'
    }
  }

  getToolSchema(modelType: ModelType = 'openai'): OpenAIToolSchema {
    const toolName = this.getToolName(modelType)
    const description = this.getDescription(modelType)
    
    return {
      type: "function",
      function: {
        name: toolName,
        description: modelType === 'gemini' 
          ? "TEXT SEARCH TOOL for finding specific documents by keywords only. NEVER use startDate, endDate, minAmount, maxAmount, or category parameters - use get_data_records for those queries instead."
          : description + " WARNING: Do not pass date, amount, or category parameters to this tool.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query to find relevant documents by text content. Use keywords like vendor names, document types, or content. Do NOT include date ranges or amounts - those belong in transaction lookup tool."
            },
            limit: {
              type: "integer",
              description: "Maximum number of results to return (1-20, default: 5)",
              minimum: 1,
              maximum: 20
            },
            similarityThreshold: {
              type: "number",
              description: "Similarity threshold for matching (0-1, default: 0.7)",
              minimum: 0,
              maximum: 1
            }
          },
          required: ["query"]
        }
      }
    }
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as DocumentSearchParameters

    // CRITICAL: Check for invalid parameters that should be used with transaction lookup tool instead
    const invalidParams = ['startDate', 'endDate', 'minAmount', 'maxAmount', 'category']
    const receivedInvalidParams = invalidParams.filter(param => param in parameters)
    
    if (receivedInvalidParams.length > 0) {
      console.error(`[DocumentSearchTool] Invalid parameters detected: ${receivedInvalidParams.join(', ')}`)
      return { 
        valid: false, 
        error: `Document search does not support date or amount filters (${receivedInvalidParams.join(', ')}). Use transaction lookup tool for financial data queries with date ranges, amounts, or categories.` 
      }
    }

    if (!params.query || typeof params.query !== 'string') {
      return { valid: false, error: 'Query parameter is required and must be a string' }
    }

    if (params.query.trim().length === 0) {
      return { valid: false, error: 'Query cannot be empty' }
    }

    if (params.query.length > 500) {
      return { valid: false, error: 'Query too long (max 500 characters)' }
    }

    // Validate optional parameters - handle JSON number parsing properly
    if (params.limit !== undefined) {
      // Handle edge cases: null, undefined, empty string, NaN
      if (params.limit === null || params.limit === undefined || (typeof params.limit === 'string' && params.limit === '')) {
        return { valid: false, error: `Limit cannot be null, empty, or undefined (received: ${params.limit})` }
      }
      
      const limit = Number(params.limit)
      console.log(`[DocumentSearchTool] Validating limit: ${JSON.stringify(params.limit)} (${typeof params.limit}) -> ${limit} (isInteger: ${Number.isInteger(limit)})`)
      
      // Check for NaN after conversion
      if (isNaN(limit)) {
        return { valid: false, error: `Limit must be a valid number (received: ${params.limit})` }
      }
      
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
        return { valid: false, error: `Limit must be an integer between 1 and 20 (received: ${params.limit} -> ${limit})` }
      }
    }

    if (params.similarityThreshold !== undefined && (params.similarityThreshold < 0 || params.similarityThreshold > 1)) {
      return { valid: false, error: 'Similarity threshold must be between 0 and 1' }
    }

    return { valid: true }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as DocumentSearchParameters
    const query = params.query.trim()
    const limit = params.limit || 5
    const threshold = params.similarityThreshold || 0.7

    try {
      console.log(`[DocumentSearchTool] Processing secure query for user ${userContext.userId}: ${query}`)

      // Generate embedding for the user's query with timeout and retry
      let queryEmbedding: number[]
      try {
        console.log(`[DocumentSearchTool] Generating embedding for query: "${query}"`)
        queryEmbedding = await this.embeddingService.generateEmbedding(query)
      } catch (embeddingError) {
        console.error('[DocumentSearchTool] Embedding generation failed:', embeddingError)
        
        // Fallback: Return helpful message about network issues
        return {
          success: false,
          error: 'Document search temporarily unavailable due to network issues. Please try again in a moment, or use the transaction lookup tool for financial data queries.'
        }
      }

      // SECURITY FIX: Use secure similarity search with user_id and business_id filtering at Qdrant level
      // This prevents data leakage and improves performance by filtering at the database
      let searchResults: any[]
      try {
        // SECURITY: Validate business context for document access
        if (!userContext.businessId) {
          console.error('[DocumentSearchTool] Missing business context - document search denied')
          return {
            success: false,
            error: 'Missing business context for document search. Please ensure you are logged into a business account.'
          }
        }

        console.log(`[DocumentSearchTool] Performing vector similarity search with business context`)
        searchResults = await this.vectorService.similaritySearchSecure(
          queryEmbedding,
          userContext.userId,
          userContext.businessId,
          limit,
          threshold
        )
      } catch (vectorError) {
        console.error('[DocumentSearchTool] Vector search failed:', vectorError)
        
        // Fallback: Return helpful message about search issues
        return {
          success: false,
          error: 'Document search service temporarily unavailable. Please try again later, or use the transaction lookup tool for financial queries.'
        }
      }

      if (!searchResults || searchResults.length === 0) {
        return {
          success: true,
          data: 'No relevant documents found for your query. Try using different keywords or check if your documents have been processed.'
        }
      }

      // Note: No longer need application-level filtering since Qdrant filters by user_id
      // All results are guaranteed to belong to the authenticated user
      const filteredResults = searchResults

      const formattedResults = this.formatResultData(filteredResults)

      return {
        success: true,
        data: `Found ${filteredResults.length} relevant document(s) in your files:\n\n${formattedResults}`,
        metadata: {
          queryProcessed: query,
          resultsCount: filteredResults.length,
          userId: userContext.userId
        }
      }

    } catch (error) {
      console.error('[DocumentSearchTool] Execution error:', error)
      return {
        success: false,
        error: `Document search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  protected formatResultData(data: any[]): string {
    return data.map((result, index) => {
      const metadata = result.payload || {}
      const score = result.score || 0
      const content = result.payload?.text || 'No content available'
      
      // Truncate content for display
      const truncatedContent = content.length > 200 
        ? content.substring(0, 200) + '...' 
        : content

      return `Document ${index + 1} (Relevance: ${score.toFixed(3)}):
Content: ${truncatedContent}
Document ID: ${metadata.document_id || 'Unknown'}
Upload Date: ${metadata.created_at || 'Unknown'}`
    }).join('\n\n')
  }

  /**
   * Enhanced permission check for document access with business context validation
   */
  protected async checkUserPermissions(userContext: UserContext): Promise<boolean> {
    // Call parent permission check first (now includes business context validation)
    const basePermission = await super.checkUserPermissions(userContext)
    if (!basePermission) {
      return false
    }

    try {
      // SECURITY: Business context validation already performed in parent method
      // Additional check: verify user has proper business context for document search
      if (!userContext.businessId) {
        console.error('[DocumentSearchTool] Missing business context - document search denied')
        return false
      }

      console.log(`[DocumentSearchTool] Document search access granted for business: ${userContext.businessId}`)
      return true

    } catch (error) {
      console.error('[DocumentSearchTool] Permission validation error:', error)
      return false
    }
  }
}