import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Note: This proxy serves publicly available government documents only
  // Domain restrictions provide security, no user auth required for public PDFs
  const searchParams = request.nextUrl.searchParams
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'URL parameter required' }, { status: 400 })
  }

  try {
    // Validate URL is from trusted domains
    const allowedDomains = ['ssm.com.my', 'gov.sg', 'jhi.gov.my', 'mida.gov.my']
    const urlObj = new URL(url)
    const isAllowed = allowedDomains.some(domain => urlObj.hostname.includes(domain))
    
    if (!isAllowed) {
      return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 })
    }

    // Fetch PDF from government server
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FinanSEAL Bot 1.0'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status}`)
    }

    const pdfBuffer = await response.arrayBuffer()

    // Return PDF with appropriate headers
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      }
    })

  } catch (error) {
    console.error('PDF proxy error:', error)
    return NextResponse.json({ error: 'Failed to fetch PDF' }, { status: 500 })
  }
}