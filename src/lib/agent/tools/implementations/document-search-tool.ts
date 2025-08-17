/**
 * Secure Document Search Tool - RAG with User Filtering
 * Enforces RLS and proper user context validation for document search
 */

import { BaseTool } from '../base/base-tool'
import { UserContext, ToolParameters, ToolResult, SecurityValidator } from '../base/tool-interfaces'
import { EmbeddingService } from '@/lib/ai-services/embedding-service'
import { VectorStorageService } from '@/lib/ai-services/vector-storage-service'

interface DocumentSearchParameters {
  query: string
  limit?: number
  similarityThreshold?: number
}

export class DocumentSearchTool extends BaseTool {
  private embeddingService = new EmbeddingService()
  private vectorService = new VectorStorageService()

  getToolName(): string {
    return 'search_documents'
  }

  getDescription(): string {
    return 'Search uploaded financial documents (invoices, receipts, reports) using semantic similarity. Requires a search query parameter.'
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as DocumentSearchParameters

    // Validate query
    const queryValidation = SecurityValidator.validateQuery(params.query, 500)
    if (!queryValidation.valid) {
      return queryValidation
    }

    // Validate optional parameters
    if (params.limit !== undefined && (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 20)) {
      return { valid: false, error: 'Limit must be an integer between 1 and 20' }
    }

    if (params.similarityThreshold !== undefined && (params.similarityThreshold < 0 || params.similarityThreshold > 1)) {
      return { valid: false, error: 'Similarity threshold must be between 0 and 1' }
    }

    return { valid: true }
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as DocumentSearchParameters
    const query = SecurityValidator.sanitizeString(params.query)
    const limit = params.limit || 5
    const threshold = params.similarityThreshold || 0.7

    try {
      this.secureLog(`Processing document search query: ${query}`, userContext)

      // SECURITY: First verify user has uploaded documents
      const { data: userDocuments, error: docError } = await this.supabase
        .from('documents')
        .select('id')
        .eq('user_id', userContext.userId)
        .eq('processing_status', 'completed')

      if (docError) {
        this.secureLog(`Error checking user documents: ${docError.message}`, userContext, 'error')
        return {
          success: false,
          error: 'Failed to verify document access'
        }
      }

      if (!userDocuments || userDocuments.length === 0) {
        return {
          success: true,
          data: 'No processed documents found for your account. Please upload and process documents first.'
        }
      }

      // Generate embedding for the user's query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query)

      // Perform similarity search against Qdrant
      // NOTE: The vector service should be enhanced to include user_id filtering
      const searchResults = await this.vectorService.similaritySearch(
        queryEmbedding,
        limit,
        threshold
      )

      if (!searchResults || searchResults.length === 0) {
        return {
          success: true,
          data: 'No relevant documents found for your query. Try using different keywords or check if your documents have been processed.'
        }
      }

      // SECURITY: Filter results to only include user's documents
      const userDocumentIds = new Set(userDocuments.map(doc => doc.id))
      const filteredResults = searchResults.filter(result => {
        const documentId = result.payload?.document_id
        return documentId && userDocumentIds.has(documentId)
      })

      if (filteredResults.length === 0) {
        return {
          success: true,
          data: 'No relevant documents found in your uploaded files for this query.'
        }
      }

      const formattedResults = this.formatResultData(filteredResults)

      this.secureLog(`Document search completed: ${filteredResults.length} results`, userContext)

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
      this.secureLog(`Document search execution error: ${error}`, userContext, 'error')
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
   * Enhanced permission check for document access
   */
  protected async checkUserPermissions(userContext: UserContext): Promise<{ authorized: boolean; reason?: string }> {
    // Call parent permission check first
    const basePermission = await super.checkUserPermissions(userContext)
    if (!basePermission.authorized) {
      return basePermission
    }

    try {
      // Check if user has any documents (additional validation)
      const { data: documents, error } = await this.supabase
        .from('documents')
        .select('id')
        .eq('user_id', userContext.userId)
        .limit(1)

      if (error) {
        this.secureLog(`Permission check error: ${error.message}`, userContext, 'error')
        return {
          authorized: false,
          reason: 'Document access validation failed'
        }
      }

      // Allow access even if no documents (they'll get an appropriate message)
      return { authorized: true }

    } catch (error) {
      this.secureLog(`Permission validation error: ${error}`, userContext, 'error')
      return {
        authorized: false,
        reason: 'Permission validation failed'
      }
    }
  }
}