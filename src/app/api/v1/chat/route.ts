/**
 * V1 Chat API - LangGraph Financial Agent
 *
 * POST /api/v1/chat - Send message to AI agent and get response
 *
 * North Star Architecture:
 * - Thin wrapper delegating to chat.service.ts
 * - Handles HTTP concerns (auth, validation, error mapping)
 * - Business logic in service layer
 * - Rate limited for AI usage (30 messages/hour per user)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserData } from '@/lib/db/supabase-server'
import { sendChatMessage } from '@/domains/chat/lib/chat.service'
import { rateLimit, RATE_LIMIT_CONFIGS } from '@/domains/security/lib/rate-limit'

export async function POST(request: NextRequest) {
  // Apply rate limiting for AI chat interactions (30 messages per hour)
  const chatRateLimit = await rateLimit(request, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 30 // 30 messages per hour
  })

  if (chatRateLimit) {
    return chatRateLimit // Return rate limit error response
  }
  try {
    // Authenticate user
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user data with business context
    const userData = await getUserData(userId)

    if (!userData.business_id) {
      return NextResponse.json({ error: 'No business context found' }, { status: 400 })
    }

    // Parse and validate request
    const body = await request.json()
    const { message, conversationId, language } = body

    if (!message || message.trim() === '') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    console.log(`[Chat V1 API] Processing message for user ${userId}`)

    // Call service layer
    const result = await sendChatMessage(
      userId,
      userData.id,
      userData.business_id,
      {
        message,
        conversationId,
        language
      }
    )

    console.log(`[Chat V1 API] Successfully completed with ${result.citations.length} citations`)

    return NextResponse.json(result)

  } catch (error) {
    console.error('[Chat V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
