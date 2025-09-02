/**
 * Internal API Endpoint for Regulatory Knowledge Base Search
 * Service-to-service endpoint for RAG-powered compliance analysis
 * Searches the regulatory_kb collection in Qdrant for relevant regulatory documents
 */

import { NextRequest, NextResponse } from 'next/server'
import { EmbeddingService } from '@/lib/ai-services/embedding-service'
import { VectorStorageService } from '@/lib/ai-services/vector-storage-service'

// Service authentication key (should be set in environment variables)
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || 'dev-service-key-change-in-production'

interface SearchRegulatoryRequest {
  query: string
  collection?: string
  limit?: number
  score_threshold?: number
}

export async function POST(request: NextRequest) {
  try {
    // Service authentication
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || authHeader !== `Bearer ${SERVICE_KEY}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Invalid service key' },
        { status: 401 }
      )
    }

    const body: SearchRegulatoryRequest = await request.json()
    
    // Validate required fields
    if (!body.query || typeof body.query !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing required field: query' },
        { status: 400 }
      )
    }

    const {
      query,
      collection = 'regulatory_kb',
      limit = 5,
      score_threshold = 0.7
    } = body

    console.log(`[Internal API] Searching regulatory KB: "${query}" (limit: ${limit})`)

    // Use the finanseal-docs-search MCP to search regulatory documents
    // This leverages the existing Qdrant infrastructure
    try {
      // We'll use the existing qdrant-find function but need to adapt it for regulatory_kb
      // For now, let's create a basic search implementation
      
      const searchResults = await searchRegulatoryDocuments(query, limit, score_threshold)
      
      console.log(`[Internal API] Found ${searchResults.length} regulatory documents`)

      return NextResponse.json({
        success: true,
        data: searchResults,
        metadata: {
          query,
          collection,
          limit,
          score_threshold,
          results_count: searchResults.length,
          search_timestamp: new Date().toISOString()
        }
      })

    } catch (searchError) {
      console.error('[Internal API] Regulatory search failed:', searchError)
      return NextResponse.json(
        { success: false, error: 'Regulatory search failed' },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('[Internal API] Search error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}

/**
 * Search regulatory documents in the populated regulatory_kb collection
 */
async function searchRegulatoryDocuments(
  query: string, 
  limit: number, 
  scoreThreshold: number
): Promise<Array<{id: string, text: string, metadata: any, source_document: any, processing_info: any, score: number}>> {
  
  try {
    const embeddingService = new EmbeddingService()
    const vectorService = new VectorStorageService()
    const collectionName = 'regulatory_kb'

    console.log(`[searchRegulatoryDocuments] Generating embedding for query: "${query}"`)
    const queryEmbedding = await embeddingService.generateEmbedding(query)

    console.log(`[searchRegulatoryDocuments] Searching Qdrant collection "${collectionName}"`)
    const searchResults = await vectorService.similaritySearch(
      queryEmbedding,
      limit,
      scoreThreshold,
      collectionName
    )

    const formattedResults = searchResults.map(result => ({
      id: result.id,
      text: result.payload?.text as string || '',
      metadata: result.payload || {},
      source_document: result.payload?.source_document || {},
      processing_info: result.payload?.processing_info || {},
      score: result.score
    }))

    console.log(`[searchRegulatoryDocuments] Direct Qdrant search returned ${formattedResults.length} results for query: "${query}"`)
    return formattedResults

  } catch (error) {
    console.error('[searchRegulatoryDocuments] Direct Qdrant search failed:', error)
    throw new Error('Failed to execute regulatory document search')
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    service: 'regulatory-knowledge-base-search',
    status: 'healthy',
    collection: 'regulatory_kb',
    timestamp: new Date().toISOString(),
    note: 'Enhanced RAG-powered regulatory search with 114 processed chunks from Singapore IRAS and Malaysia LHDN documents'
  })
}