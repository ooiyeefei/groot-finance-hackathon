/**
 * V1 Message API
 *
 * DELETE /api/v1/chat/messages/[messageId] - Soft delete message
 *
 * North Star Architecture:
 * - Thin wrapper delegating to chat.service.ts
 * - Handles HTTP concerns (auth, validation, error mapping)
 * - Business logic in service layer
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserData } from '@/lib/db/supabase-server'
import { deleteMessage } from '@/domains/chat/lib/chat.service'

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ messageId: string }> }
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
    const { messageId } = await context.params

    console.log(`[Message Delete V1 API] Deleting message ${messageId}`)

    // Call service layer
    await deleteMessage(
      messageId,
      userId,
      userData.id
    )

    return NextResponse.json({
      success: true,
      message: 'Message deleted successfully'
    })

  } catch (error) {
    console.error('[Message Delete V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    // Map specific errors to HTTP status codes
    if (errorMessage.includes('not found')) {
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
