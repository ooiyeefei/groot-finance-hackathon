import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    // Authentication check - ensures only authenticated users can access
    await createAuthenticatedSupabaseClient()
    
    // Get the request body
    const { receiptText, receiptImageUrl } = await request.json()
    
    if (!receiptText) {
      return NextResponse.json(
        { error: 'Receipt text is required' },
        { status: 400 }
      )
    }

    console.log('[Receipt Extraction API] Redirecting to DSPy extraction endpoint')

    // Redirect to the new DSPy extraction API
    const dspyResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/expense-claims/dspy-extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward authorization headers
        ...(request.headers.get('authorization') && {
          'authorization': request.headers.get('authorization')!
        })
      },
      body: JSON.stringify({
        receiptText,
        receiptImageUrl
      })
    })

    if (!dspyResponse.ok) {
      const errorData = await dspyResponse.json()
      throw new Error(errorData.error || 'DSPy extraction failed')
    }

    const result = await dspyResponse.json()
    
    return NextResponse.json(result)

  } catch (error) {
    console.error('[Receipt Extraction API] Extraction failed:', error)
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Receipt extraction failed'
      },
      { status: 500 }
    )
  }
}