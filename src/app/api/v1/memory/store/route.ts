/**
 * Memory Store API Endpoint
 *
 * POST /api/v1/memory/store — stores a user memory via the memory_store tool
 *
 * Auth: Clerk session (via cookies)
 * Body: { memory: string, businessId?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { executeTool } from '@/lib/ai/tools/mcp-tool-registry'
import { getUserDataConvex } from '@/lib/convex'

interface StoreMemoryRequest {
  memory: string
  businessId?: string
}

export async function POST(req: NextRequest) {
  // 1. Authenticate via Clerk
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse request body
  let body: StoreMemoryRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const { memory, businessId: requestBusinessId } = body

  if (!memory || typeof memory !== 'string') {
    return NextResponse.json(
      { error: 'Memory content is required' },
      { status: 400 }
    )
  }

  // 3. Resolve businessId
  let resolvedBusinessId = requestBusinessId
  if (!resolvedBusinessId) {
    try {
      const userData = await getUserDataConvex(userId)
      resolvedBusinessId = userData.business_id ?? undefined
    } catch {
      return NextResponse.json(
        { error: 'Failed to resolve business context' },
        { status: 500 }
      )
    }
  }

  if (!resolvedBusinessId) {
    return NextResponse.json(
      { error: 'No business context found' },
      { status: 400 }
    )
  }

  // 4. Execute memory_store tool
  try {
    const result = await executeTool(
      'memory_store',
      { memory },
      {
        userId,
        businessId: resolvedBusinessId,
        role: undefined, // Memory tools don't require role
      }
    )

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Memory stored successfully',
        data: result.data,
      })
    } else if (result.error === 'CONTRADICTION_DETECTED') {
      // Return conflict data with 200 status (not a server error, needs user action)
      return NextResponse.json({
        success: false,
        error: 'CONTRADICTION_DETECTED',
        metadata: result.metadata,
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to store memory',
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('[Memory Store API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
