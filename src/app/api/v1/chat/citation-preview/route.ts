/**
 * V1 Citation Preview API
 *
 * GET /api/v1/chat/citation-preview - Proxy government PDF documents for chat citations
 *
 * Purpose:
 * - Displays regulatory PDFs in chat AI assistant citation overlay
 * - Bypasses CORS restrictions for government document embedding
 * - Validates domain whitelist for security
 *
 * North Star Architecture:
 * - Thin wrapper delegating to chat.service.ts
 * - Handles HTTP concerns (validation, error mapping)
 * - Business logic in service layer
 */

import { NextRequest, NextResponse } from 'next/server'
import { proxyCitationDocument } from '@/domains/chat/lib/chat.service'

export async function GET(request: NextRequest) {
  try {
    // Note: This proxy serves publicly available government documents only
    // Domain restrictions provide security, no user auth required for public PDFs
    const searchParams = request.nextUrl.searchParams
    const url = searchParams.get('url')

    if (!url) {
      return NextResponse.json(
        { error: 'URL parameter required' },
        { status: 400 }
      )
    }

    console.log(`[Citation Preview V1 API] Proxying document: ${url}`)

    // Call service layer
    const response = await proxyCitationDocument(url)

    return response

  } catch (error) {
    console.error('[Citation Preview V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch document'

    // Map specific errors to HTTP status codes
    if (errorMessage.includes('not allowed')) {
      return NextResponse.json(
        { error: 'Domain not allowed' },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
