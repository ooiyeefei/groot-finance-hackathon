/**
 * Knowledge Base Chunks API Route
 *
 * GET /api/v1/system/knowledge-base/chunks
 *
 * Returns chunks from the regulatory knowledge base for debugging and inspection.
 * Query Qdrant collection stats and chunk metadata.
 *
 * Authentication: Service-to-service with INTERNAL_SERVICE_KEY
 * Use Case: Debugging, inspection, quality assurance
 *
 * Query Parameters:
 * - documentId: Optional filter by document ID (not currently supported)
 * - limit: Maximum chunks to return (default: 20)
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  listChunks,
  validateServiceKey
} from '@/domains/system/lib/knowledge-base.service'

/**
 * GET - List Knowledge Base Chunks
 *
 * Returns chunks with metadata for debugging and inspection.
 * Currently returns collection stats from Qdrant.
 */
export async function GET(request: NextRequest) {
  try {
    // Service authentication
    const authHeader = request.headers.get('Authorization')
    if (!validateServiceKey(authHeader)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized - Invalid service key'
        },
        { status: 401 }
      )
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('documentId') || undefined
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    console.log(`[Chunks API] Listing chunks (documentId: ${documentId || 'all'}, limit: ${limit})`)

    // Call service layer
    const chunks = await listChunks(documentId, limit)

    console.log(`[Chunks API] Retrieved ${chunks.length} chunk records`)

    return NextResponse.json({
      success: true,
      data: chunks,
      metadata: {
        count: chunks.length,
        document_id: documentId || null,
        limit,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('[Chunks API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list chunks'
      },
      { status: 500 }
    )
  }
}
