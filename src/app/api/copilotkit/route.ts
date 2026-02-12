/**
 * Chat Runtime Endpoint
 *
 * POST /api/copilotkit — handles AI chat requests.
 * Invokes the in-process LangGraph financial agent directly.
 *
 * Auth: Clerk session (via cookies)
 * Rate limit: 30 messages/hour/user
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserDataConvex } from '@/lib/convex'
import { rateLimit } from '@/domains/security/lib/rate-limit'
import { invokeLangGraphAgent } from '@/lib/ai/copilotkit-adapter'

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

  // 5. Invoke the LangGraph agent
  try {
    console.log(`[Chat API] Invoking agent for user ${userId}, conversation ${conversationId}`)

    const result = await invokeLangGraphAgent({
      message,
      conversationHistory,
      userContext: {
        userId,
        convexUserId: userData.id,
        businessId: userData.business_id,
        conversationId: conversationId || 'new',
      },
      language,
    })

    return NextResponse.json({
      content: result.content,
      citations: result.citations,
      needsClarification: result.needsClarification,
      clarificationQuestions: result.clarificationQuestions,
      confidence: result.confidence,
    })
  } catch (error) {
    console.error('[Chat API] Agent error:', error)
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    )
  }
}
