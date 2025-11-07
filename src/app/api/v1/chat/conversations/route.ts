/**
 * V1 Conversations API
 *
 * GET /api/v1/chat/conversations - List user's conversations
 * POST /api/v1/chat/conversations - Create new conversation
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserData } from '@/lib/db/supabase-server'
import { listConversations, createConversation } from '@/domains/chat/lib/chat.service'

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user data and business context
    const userData = await getUserData(userId)

    if (!userData.business_id) {
      return NextResponse.json({ error: 'No business context found' }, { status: 400 })
    }

    // Parse pagination parameters (backward compatible)
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '50'),
      100 // Max 100 conversations per page
    )

    console.log(`[Conversations V1 API] Fetching conversations for user: ${userId}, business: ${userData.business_id}, limit: ${limit}`)

    // Call service layer to get conversations with pagination
    const conversations = await listConversations(
      userId,
      userData.id,
      userData.business_id,
      limit
    )

    return NextResponse.json({
      conversations,
      pagination: {
        limit,
        count: conversations.length,
        has_more: conversations.length === limit
      }
    })

  } catch (error) {
    console.error('[Conversations V1 API] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user data and business context
    const userData = await getUserData(userId)

    if (!userData.business_id) {
      return NextResponse.json({ error: 'No business context found' }, { status: 400 })
    }

    // Parse request body for language
    const body = await request.json().catch(() => ({}))
    const language = body.language || 'en'

    console.log(`[Conversations V1 API] Creating new conversation for user: ${userId}, business: ${userData.business_id}`)

    // Call service layer to create conversation
    const newConversation = await createConversation(
      userId,
      userData.id,
      userData.business_id,
      language
    )

    return NextResponse.json({
      conversation: newConversation
    }, { status: 201 })

  } catch (error) {
    console.error('[Conversations V1 API] Create Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
