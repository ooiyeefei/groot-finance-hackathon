import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('[Test Chat API] Simple test endpoint hit')
    
    const body = await request.json()
    console.log('[Test Chat API] Received body:', body)
    
    return NextResponse.json({
      message: "Test response from chat API",
      receivedMessage: body.message,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[Test Chat API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error in test route' },
      { status: 500 }
    )
  }
}