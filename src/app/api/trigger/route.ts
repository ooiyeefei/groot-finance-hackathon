/**
 * Trigger.dev v3 API Handler
 *
 * ⚠️ IMPORTANT: This endpoint MUST stay at /api/trigger (root level)
 *
 * REASON: Trigger.dev framework requires webhook at /api/trigger - this is a
 * framework constraint, not a design choice. The Trigger.dev CLI and runtime
 * expect this exact path and cannot be configured to use a different location.
 *
 * DO NOT MOVE THIS TO /api/v1/system/trigger or any other location.
 *
 * This endpoint is required by the Trigger.dev CLI for:
 * - Development server integration
 * - Background job triggering
 * - Task execution callbacks
 * - Runtime configuration
 */

import { NextRequest, NextResponse } from 'next/server'

// Simple endpoint first to test connectivity
export async function POST(request: NextRequest) {
  try {
    console.log('[Trigger.dev API] POST request received from CLI')
    
    return NextResponse.json({
      success: true,
      message: 'Trigger.dev v3 endpoint is active',
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('[Trigger.dev API] Error:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  console.log('[Trigger.dev API] GET request received from CLI')
  
  return NextResponse.json({
    status: 'ok',
    service: 'trigger.dev',
    timestamp: new Date().toISOString(),
    message: 'Trigger.dev API endpoint is running successfully'
  })
}