import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAuthenticatedSupabaseClient, getUserData } from '@/lib/supabase-server'

export async function GET() {
  try {
    // Authenticate the user
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // SECURITY: Get user data with business context for proper tenant isolation
    const userData = await getUserData(userId)
    const supabase = await createAuthenticatedSupabaseClient(userId)

    console.log(`[Conversations API] Fetching conversations for user:`, {
      clerkUserId: userId,
      supabaseUserId: userData.id,
      businessId: userData.business_id
    })

    // Get user's conversations ordered by most recent (excluding deleted ones)
    // SECURITY FIX: Use Supabase UUID instead of Clerk ID
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select(`
        id,
        title,
        language,
        context_summary,
        is_active,
        created_at,
        updated_at,
        messages (
          id,
          role,
          content,
          created_at,
          deleted_at
        )
      `)
      .eq('user_id', userData.id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Error fetching conversations:', error)
      return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
    }

    // Format conversations with latest message preview (filter out deleted messages)
    const formattedConversations = conversations.map(conv => {
      // Filter out deleted messages
      const activeMessages = conv.messages?.filter(msg => !msg.deleted_at) || []
      
      return {
        id: conv.id,
        title: conv.title,
        language: conv.language,
        context_summary: conv.context_summary,
        is_active: conv.is_active,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        message_count: activeMessages.length,
        latest_message: activeMessages.length > 0 
          ? activeMessages[activeMessages.length - 1]
          : null
      }
    })

    return NextResponse.json({
      conversations: formattedConversations
    })

  } catch (error) {
    console.error('Error in conversations API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}