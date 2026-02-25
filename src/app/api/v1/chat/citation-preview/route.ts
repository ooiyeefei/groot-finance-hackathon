/**
 * V1 Citation Preview API
 *
 * GET /api/v1/chat/citation-preview - Proxy government PDF documents for chat citations
 *
 * Purpose:
 * - Displays regulatory PDFs in chat AI assistant citation overlay
 * - Bypasses CORS restrictions for government document embedding
 * - Validates domain whitelist for security
 */

import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_DOMAINS = ['ssm.com.my', 'gov.sg', 'jhi.gov.my', 'mida.gov.my']

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

    // Validate URL is from trusted government domains
    const urlObj = new URL(url)
    const isAllowed = ALLOWED_DOMAINS.some(domain => urlObj.hostname.includes(domain))

    if (!isAllowed) {
      return NextResponse.json(
        { error: 'Domain not allowed' },
        { status: 403 }
      )
    }

    console.log(`[Citation Preview V1 API] Proxying document: ${url}`)

    // Fetch PDF from government server
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Groot Finance Bot 1.0'
      }
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch PDF: ${response.status}` },
        { status: 502 }
      )
    }

    const pdfBuffer = await response.arrayBuffer()

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'public, max-age=3600'
      }
    })

  } catch (error) {
    console.error('[Citation Preview V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch document'

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
