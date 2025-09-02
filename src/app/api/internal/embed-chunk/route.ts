/**
 * Internal API Endpoint for Regulatory Chunk Embedding
 * Service-to-service endpoint for the RAG pipeline
 * Handles embedding generation and vector storage for regulatory documents
 */

import { NextRequest, NextResponse } from 'next/server'
import { EmbeddingService } from '@/lib/ai-services/embedding-service'
import { VectorStorageService } from '@/lib/ai-services/vector-storage-service'

// Service authentication key (should be set in environment variables)
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || 'dev-service-key-change-in-production'

interface EmbedChunkRequest {
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

    const body: EmbedChunkRequest = await request.json()
    
    // Validate required fields
    if (!body.text || !body.chunk_id || !body.source_metadata) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: text, chunk_id, source_metadata' },
        { status: 400 }
      )
    }

    console.log(`[Internal API] Processing regulatory chunk: ${body.chunk_id}`)

    // Initialize services
    const embeddingService = new EmbeddingService()
    const vectorStorage = new VectorStorageService()

    // Generate embedding for the text
    const embedding = await embeddingService.generateEmbedding(body.text)
    
    // Prepare vector payload with comprehensive metadata
    const vectorPayload = {
      id: body.chunk_id,
      vector: embedding,
      payload: {
        // Core content
        text: body.text,
        chunk_id: body.chunk_id,
        
        // Source information
        country: body.source_metadata.country,
        authority: body.source_metadata.authority,
        document_title: body.source_metadata.document_title,
        topics: body.source_metadata.topics,
        
        // Processing information
        page_number: body.processing_metadata.page_number || 0,
        chunk_index: body.processing_metadata.chunk_index,
        language: body.processing_metadata.language,
        confidence_score: body.processing_metadata.confidence_score || 1.0,
        
        // Context information
        preceding_section: body.context_metadata?.preceding_section || '',
        following_section: body.context_metadata?.following_section || '',
        
        // System metadata
        document_type: 'regulatory',
        ingested_at: new Date().toISOString(),
        collection: 'regulatory_kb'
      }
    }

    // Store in Qdrant regulatory_kb collection using existing method
    await vectorStorage.storeEmbedding(
      body.chunk_id,
      body.text,
      embedding,
      vectorPayload.payload
    )

    console.log(`[Internal API] Successfully embedded chunk: ${body.chunk_id}`)

    return NextResponse.json({
      success: true,
      data: {
        chunk_id: body.chunk_id,
        embedding_dimension: embedding.length,
        stored_at: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('[Internal API] Embedding error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    service: 'regulatory-chunk-embedding',
    status: 'healthy',
    timestamp: new Date().toISOString()
  })
}