/**
 * Memory Conflict Resolution API Endpoint
 *
 * POST /api/v1/memory/resolve — resolves a memory contradiction
 *
 * Called when user clicks Replace/Keep Both/Cancel in the confirmation toast.
 * Auth: Clerk session (via cookies)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ConvexHttpClient } from 'convex/browser'

// Lazy-initialize Convex client
let convexClient: ConvexHttpClient | null = null
function getConvexClient(): ConvexHttpClient {
  if (!convexClient) {
    if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
      throw new Error('NEXT_PUBLIC_CONVEX_URL environment variable is not set')
    }
    convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL)
  }
  return convexClient
}

interface ResolveConflictRequest {
  action: 'replace' | 'keep_both' | 'cancel'
  existingMemoryId: string
  content: string
  businessId: string
  category: string
  tags: string[]
  embeddings: number[]
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: ResolveConflictRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { action, existingMemoryId, content, businessId, category, tags, embeddings } = body

  if (!action || !['replace', 'keep_both', 'cancel'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  try {
    const convex = getConvexClient()
    const result = await convex.mutation(
      'functions/memoryTools:resolveMemoryConflict' as any,
      {
        action,
        existingMemoryId,
        content,
        businessId,
        userId,
        memoryType: category || 'preference',
        source: 'conflict_resolution',
        embeddings: embeddings || [],
        topicTags: tags || [],
      }
    )

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('[Memory Resolve API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Resolution failed' },
      { status: 500 }
    )
  }
}
