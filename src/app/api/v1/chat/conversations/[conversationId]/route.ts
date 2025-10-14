/**
 * V1 Conversation Detail API
 *
 * GET /api/v1/chat/conversations/[conversationId] - Get specific conversation with messages
 * DELETE /api/v1/chat/conversations/[conversationId] - Soft delete conversation
 *
 * North Star Architecture:
 * - Thin wrapper delegating to chat.service.ts
 * - Handles HTTP concerns (auth, validation, error mapping)
 * - Business logic in service layer
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserData } from '@/lib/db/supabase-server'
import { getConversation, deleteConversation } from '@/domains/chat/lib/chat.service'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
) {
  try {
    // Authenticate user
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user data
    const userData = await getUserData(userId)
    const { conversationId } = await context.params

    console.log(`[Conversation Detail V1 API] Fetching conversation ${conversationId}`)

    // Call service layer
    const conversation = await getConversation(
      conversationId,
      userId,
      userData.id
    )

    return NextResponse.json({
      conversation
    })

  } catch (error) {
    console.error('[Conversation Detail V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    // Map specific errors to HTTP status codes
    if (errorMessage.includes('not found')) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
) {
  try {
    // Authenticate user
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user data
    const userData = await getUserData(userId)
    const { conversationId } = await context.params

    console.log(`[Conversation Delete V1 API] Deleting conversation ${conversationId}`)

    // Call service layer
    await deleteConversation(
      conversationId,
      userId,
      userData.id
    )

    return NextResponse.json({
      success: true,
      message: 'Conversation deleted successfully'
    })

  } catch (error) {
    console.error('[Conversation Delete V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
