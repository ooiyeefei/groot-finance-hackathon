/**
 * Chat Runtime Endpoint — SSE Streaming
 *
 * POST /api/copilotkit — handles AI chat requests via Server-Sent Events.
 * Invokes the in-process LangGraph financial agent and streams events progressively.
 *
 * Auth: Clerk session (via cookies)
 * Rate limit: 30 messages/hour/user
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserDataConvex } from '@/lib/convex'
import { rateLimit } from '@/domains/security/lib/rate-limit'
import { streamLangGraphAgent } from '@/lib/ai/copilotkit-adapter'

interface ChatRequestBody {
  message: string
  conversationId?: string
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  language?: string
}

export async function POST(req: NextRequest) {
  // 1. Rate limit (30 messages/hour/user)
  const rateLimitResponse = await rateLimit(req, {
    windowMs: 60 * 60 * 1000,
    maxRequests: 30,
  })
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  // 2. Authenticate via Clerk
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3. Get user context from Convex
  let userData
  try {
    userData = await getUserDataConvex(userId)
  } catch {
    return NextResponse.json(
      { error: 'Failed to resolve user context' },
      { status: 500 }
    )
  }

  if (!userData.business_id) {
    return NextResponse.json(
      { error: 'No business context found' },
      { status: 400 }
    )
  }

  // 4. Parse request body
  let body: ChatRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const { message, conversationId, conversationHistory = [], language = 'en' } = body

  if (!message || typeof message !== 'string') {
    return NextResponse.json(
      { error: 'Message is required' },
      { status: 400 }
    )
  }

  // 5. Create SSE stream from the LangGraph agent
  console.log(`[Chat API] Streaming agent for user ${userId}, conversation ${conversationId}`)

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      function writeEvent(event: string, data: unknown) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(payload))
      }

      try {
        // Emit an immediate status event so the client knows the stream is alive.
        // This resets the inactivity timeout while the LLM endpoint cold-starts.
        writeEvent('status', { phase: 'Connecting to AI agent...' })

        const eventStream = streamLangGraphAgent({
          message,
          conversationHistory,
          userContext: {
            userId,
            convexUserId: userData.id,
            businessId: userData.business_id!,
            conversationId: conversationId || 'new',
          },
          language,
        })

        for await (const event of eventStream) {
          writeEvent(event.event, event.data)
        }
      } catch (error) {
        console.error('[Chat API] Stream error:', error)
        writeEvent('error', {
          message: 'Failed to process message',
          code: 'STREAM_ERROR',
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
