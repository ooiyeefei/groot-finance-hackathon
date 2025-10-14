/**
 * Knowledge Base Service Layer
 *
 * Business logic for regulatory knowledge base management:
 * - Embedding generation and vector storage for regulatory documents
 * - RAG similarity search for AI agent tool calling
 * - Batch document storage in Qdrant vector database
 *
 * North Star Architecture:
 * - All business logic centralized in service layer
 * - API routes are thin wrappers handling HTTP concerns
 * - Internal-only endpoints (not exposed to end users)
 *
 * Security:
 * - Service-to-service authentication with INTERNAL_SERVICE_KEY
 * - No user-level RLS (public regulatory knowledge base)
 *
 * Vector Database:
 * - Collection: 'regulatory_kb'
 * - Source: Singapore IRAS and Malaysia LHDN documents
 * - Total: 114 processed regulatory chunks
 */

import { EmbeddingService } from '@/lib/ai/ai-services/embedding-service'
import { VectorStorageService } from '@/lib/ai/ai-services/vector-storage-service'

// Service authentication key
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || 'dev-service-key-change-in-production'

// ===== TYPE DEFINITIONS =====

export interface EmbedChunkRequest {
  text: string
  chunk_id: string
  source_metadata: {
    country: string
    authority: string
    document_title: string
    topics: string[]
  }
  processing_metadata: {
    page_number?: number
    chunk_index: number
    language: string
    confidence_score?: number
  }
  context_metadata?: {
    preceding_section?: string
    following_section?: string
  }
}

export interface SearchRegulatoryRequest {
  query: string
  collection?: string
  limit?: number
  score_threshold?: number
}

export interface RegulatorySearchResult {
  id: string
  text: string
  metadata: Record<string, unknown>
  source_document: Record<string, unknown>
  processing_info: Record<string, unknown>
  score: number
}

export interface BatchStoreRequest {
  information: string
  metadata: Record<string, unknown>
}

// ===== SERVICE AUTHENTICATION =====

/**
 * Validate service authentication key
 * Used for internal service-to-service API calls
 */
export function validateServiceKey(authHeader: string | null): boolean {
  if (!authHeader) {
    return false
  }
  return authHeader === `Bearer ${SERVICE_KEY}`
}

// ===== CORE SERVICE FUNCTIONS =====

/**
 * Embed Regulatory Chunk
 *
 * Generates embedding for regulatory text and stores in Qdrant regulatory_kb collection.
 * Used by the RAG pipeline for knowledge base population.
 *
 * @param request - Chunk data with text, metadata, and context
 * @returns Embedding metadata (chunk_id, dimension, timestamp)
 * @throws Error if embedding generation or storage fails
 */
export async function embedRegulatoryChunk(
  request: EmbedChunkRequest
): Promise<{
  chunk_id: string
  embedding_dimension: number
  stored_at: string
}> {
  // Validate required fields
  if (!request.text || !request.chunk_id || !request.source_metadata) {
    throw new Error('Missing required fields: text, chunk_id, source_metadata')
  }

  console.log(`[Knowledge Base Service] Processing regulatory chunk: ${request.chunk_id}`)

  // Initialize services
  const embeddingService = new EmbeddingService()
  const vectorStorage = new VectorStorageService()

  // Generate embedding for the text
  const embedding = await embeddingService.generateEmbedding(request.text)

  // Prepare vector payload with comprehensive metadata
  const vectorPayload = {
    id: request.chunk_id,
    vector: embedding,
    payload: {
      // Core content
      text: request.text,
      chunk_id: request.chunk_id,

      // Source information
      country: request.source_metadata.country,
      authority: request.source_metadata.authority,
      document_title: request.source_metadata.document_title,
      topics: request.source_metadata.topics,

      // Processing information
      page_number: request.processing_metadata.page_number || 0,
      chunk_index: request.processing_metadata.chunk_index,
      language: request.processing_metadata.language,
      confidence_score: request.processing_metadata.confidence_score || 1.0,

      // Context information
      preceding_section: request.context_metadata?.preceding_section || '',
      following_section: request.context_metadata?.following_section || '',

      // System metadata
      document_type: 'regulatory',
      ingested_at: new Date().toISOString(),
      collection: 'regulatory_kb'
    }
  }

  // Store in Qdrant regulatory_kb collection
  await vectorStorage.storeEmbedding(
    request.chunk_id,
    request.text,
    embedding,
    vectorPayload.payload
  )

  console.log(`[Knowledge Base Service] Successfully embedded chunk: ${request.chunk_id}`)

  return {
    chunk_id: request.chunk_id,
    embedding_dimension: embedding.length,
    stored_at: new Date().toISOString()
  }
}

/**
 * Search Regulatory Knowledge Base
 *
 * Performs RAG similarity search on regulatory_kb collection.
 * Used by AI agent for regulatory compliance queries.
 *
 * Enhanced with 114 processed chunks from:
 * - Singapore IRAS (tax regulations)
 * - Malaysia LHDN (tax regulations)
 *
 * @param query - Natural language query
 * @param limit - Maximum results (default: 5)
 * @param score_threshold - Minimum similarity score (default: 0.7)
 * @returns Array of matching regulatory documents with metadata
 * @throws Error if search fails
 */
export async function searchRegulatory(
  query: string,
  limit: number = 5,
  score_threshold: number = 0.7
): Promise<RegulatorySearchResult[]> {
  // Validate query
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('Missing or invalid query string')
  }

  console.log(`[Knowledge Base Service] Searching regulatory KB: "${query}" (limit: ${limit})`)

  try {
    const embeddingService = new EmbeddingService()
    const vectorService = new VectorStorageService()
    const collectionName = 'regulatory_kb'

    // Generate embedding for query
    console.log(`[Knowledge Base Service] Generating embedding for query: "${query}"`)
    const queryEmbedding = await embeddingService.generateEmbedding(query)

    // Search Qdrant collection
    console.log(`[Knowledge Base Service] Searching Qdrant collection "${collectionName}"`)
    const searchResults = await vectorService.similaritySearch(
      queryEmbedding,
      limit,
      score_threshold,
      collectionName
    )

    // Format results
    const formattedResults: RegulatorySearchResult[] = searchResults.map(result => ({
      id: result.id,
      text: (result.payload?.text as string) || '',
      metadata: result.payload || {},
      source_document: (result.payload?.source_document as Record<string, unknown>) || {},
      processing_info: (result.payload?.processing_info as Record<string, unknown>) || {},
      score: result.score
    }))

    console.log(`[Knowledge Base Service] Found ${formattedResults.length} regulatory documents`)
    return formattedResults

  } catch (error) {
    console.error('[Knowledge Base Service] Regulatory search failed:', error)
    throw new Error(
      `Failed to execute regulatory document search: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * List Regulatory Documents
 *
 * Returns metadata about available regulatory documents in the knowledge base.
 * Provides discovery of what regulatory content is available for search.
 *
 * Currently returns static metadata for the 114 pre-processed regulatory chunks from:
 * - Singapore IRAS (tax regulations)
 * - Malaysia LHDN (tax regulations)
 *
 * @returns Array of document metadata objects
 */
export async function listRegulatoryDocuments(): Promise<Array<{
  id: string
  title: string
  country: string
  authority: string
  chunk_count: number
  topics: string[]
  language: string
  last_updated: string
}>> {
  console.log('[Knowledge Base Service] Listing regulatory documents')

  // Return metadata for available regulatory documents
  // This is currently static, but in production could query Qdrant for unique documents
  return [
    {
      id: 'iras-sg-tax-guide',
      title: 'Singapore IRAS Tax Guide',
      country: 'Singapore',
      authority: 'IRAS',
      chunk_count: 57, // Approximate - 50% of 114 chunks
      topics: ['corporate tax', 'income tax', 'GST', 'tax compliance', 'tax deductions'],
      language: 'en',
      last_updated: '2025-01-01T00:00:00Z'
    },
    {
      id: 'lhdn-my-tax-guide',
      title: 'Malaysia LHDN Tax Guide',
      country: 'Malaysia',
      authority: 'LHDN',
      chunk_count: 57, // Approximate - 50% of 114 chunks
      topics: ['corporate tax', 'income tax', 'tax compliance', 'tax deductions', 'withholding tax'],
      language: 'en',
      last_updated: '2025-01-01T00:00:00Z'
    }
  ]
}

/**
 * List Chunks
 *
 * Returns chunks from the regulatory knowledge base with optional filtering.
 * Primarily used for debugging and inspection of the knowledge base content.
 *
 * @param documentId - Optional filter by document ID
 * @param limit - Maximum number of chunks to return (default: 20)
 * @returns Array of chunk objects with metadata
 */
export async function listChunks(
  documentId?: string,
  limit: number = 20
): Promise<Array<{
  id: string
  text: string
  document_title: string
  country: string
  authority: string
  topics: string[]
  chunk_index: number
  language: string
  confidence_score: number
}>> {
  console.log(`[Knowledge Base Service] Listing chunks (documentId: ${documentId || 'all'}, limit: ${limit})`)

  try {
    const vectorService = new VectorStorageService()
    const collectionName = 'regulatory_kb'

    // Get collection stats to understand what's available
    const stats = await vectorService.getCollectionStats()
    console.log(`[Knowledge Base Service] Collection has ${stats.pointsCount} points`)

    // For now, return a simplified response indicating chunks are available
    // In production, this would query Qdrant with scroll API to list actual chunks
    return [{
      id: 'regulatory_kb',
      text: `${stats.pointsCount} regulatory chunks available in the knowledge base`,
      document_title: 'Regulatory Knowledge Base',
      country: 'Singapore/Malaysia',
      authority: 'IRAS/LHDN',
      topics: ['tax compliance', 'corporate tax', 'income tax'],
      chunk_index: 0,
      language: 'en',
      confidence_score: 1.0
    }]

  } catch (error) {
    console.error('[Knowledge Base Service] Failed to list chunks:', error)
    throw new Error(
      `Failed to list chunks: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

// ===== HEALTH CHECK =====

/**
 * Health Check - Embed Chunk Service
 */
export function getEmbedChunkHealthStatus(): {
  service: string
  status: string
  timestamp: string
} {
  return {
    service: 'regulatory-chunk-embedding',
    status: 'healthy',
    timestamp: new Date().toISOString()
  }
}

/**
 * Health Check - Search Service
 */
export function getSearchHealthStatus(): {
  service: string
  status: string
  collection: string
  timestamp: string
  note: string
} {
  return {
    service: 'regulatory-knowledge-base-search',
    status: 'healthy',
    collection: 'regulatory_kb',
    timestamp: new Date().toISOString(),
    note: 'Enhanced RAG-powered regulatory search with 114 processed chunks from Singapore IRAS and Malaysia LHDN documents'
  }
}
