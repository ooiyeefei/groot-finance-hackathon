/**
 * V1 Conversations API
 *
 * GET /api/v1/chat/conversations - List user's conversations
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserData } from '@/lib/db/supabase-server'
import { listConversations } from '@/domains/chat/lib/chat.service'

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

    console.log(`[Conversations V1 API] Fetching conversations for user: ${userId}, business: ${userData.business_id}`)

    // Call service layer to get conversations
    const conversations = await listConversations(
      userId,
      userData.id,
      userData.business_id
    )

    return NextResponse.json({
      conversations
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
