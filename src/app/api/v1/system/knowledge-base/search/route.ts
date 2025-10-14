/**
 * Regulatory Search API Route
 *
 * POST /api/v1/system/knowledge-base/search
 *
 * RAG similarity search on regulatory knowledge base.
 * Used by AI agent for regulatory compliance queries.
 *
 * Enhanced with 114 processed chunks from:
 * - Singapore IRAS (tax regulations)
 * - Malaysia LHDN (tax regulations)
 *
 * Authentication: Service-to-service with INTERNAL_SERVICE_KEY
 * Use Case: AI agent tool calling, regulatory knowledge retrieval
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  searchRegulatory,
  validateServiceKey
} from '@/domains/system/lib/knowledge-base.service'

/**
 * POST - Search Regulatory Knowledge Base
 *
 * Request Body:
 * {
 *   "query": "string (required) - Natural language query",
 *   "limit": "number (optional) - Max results (default: 5)",
 *   "score_threshold": "number (optional) - Min similarity score (default: 0.7)"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": "chunk_id",
 *       "text": "regulatory content",
 *       "metadata": { country, authority, topics, etc. },
 *       "score": 0.85
 *     }
 *   ]
 * }
 */
export async function POST(request: NextRequest) {
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

    // Parse request body
    const body = await request.json()
    const { query, limit = 5, score_threshold = 0.7 } = body

    // Validate required fields
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing or invalid query string'
        },
        { status: 400 }
      )
    }

    console.log(`[Search API] Searching regulatory KB: "${query}" (limit: ${limit}, threshold: ${score_threshold})`)

    // Call service layer
    const results = await searchRegulatory(query, limit, score_threshold)

    console.log(`[Search API] Found ${results.length} regulatory documents`)

    return NextResponse.json({
      success: true,
      data: results,
      metadata: {
        query,
        result_count: results.length,
        limit,
        score_threshold,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('[Search API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search regulatory knowledge base'
      },
      { status: 500 }
    )
  }
}
