/**
 * Regulatory Documents API Route
 *
 * GET /api/v1/system/knowledge-base/regulatory-documents
 *
 * Returns metadata about available regulatory documents in the knowledge base.
 * Provides discovery of what regulatory content is available for search.
 *
 * Authentication: Service-to-service with INTERNAL_SERVICE_KEY
 * Use Case: AI agent discovery, documentation, debugging
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  listRegulatoryDocuments,
  validateServiceKey
} from '@/domains/system/lib/knowledge-base.service'

/**
 * GET - List Regulatory Documents
 *
 * Returns metadata for all available regulatory documents:
 * - Singapore IRAS Tax Guide (57 chunks)
 * - Malaysia LHDN Tax Guide (57 chunks)
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

    console.log('[Regulatory Documents API] Listing available documents')

    // Call service layer
    const documents = await listRegulatoryDocuments()

    console.log(`[Regulatory Documents API] Found ${documents.length} regulatory documents`)

    return NextResponse.json({
      success: true,
      data: documents,
      metadata: {
        total_documents: documents.length,
        total_chunks: documents.reduce((sum, doc) => sum + doc.chunk_count, 0),
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('[Regulatory Documents API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list regulatory documents'
      },
      { status: 500 }
    )
  }
}
