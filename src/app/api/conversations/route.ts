import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  try {
    // Authenticate the user
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Initialize Supabase client
    const supabase = createServerSupabaseClient()

    // Get user's conversations ordered by most recent
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
          created_at
        )
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Error fetching conversations:', error)
      return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
    }

    // Format conversations with latest message preview
    const formattedConversations = conversations.map(conv => ({
      id: conv.id,
      title: conv.title,
      language: conv.language,
      context_summary: conv.context_summary,
      is_active: conv.is_active,
      created_at: conv.created_at,
      updated_at: conv.updated_at,
      message_count: conv.messages?.length || 0,
      latest_message: conv.messages && conv.messages.length > 0 
        ? conv.messages[conv.messages.length - 1]
        : null
    }))

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