import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate the user
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: conversationId } = await params

    // Initialize Supabase client
    const supabase = createServerSupabaseClient()

    // Get specific conversation with all messages
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select(`
        id,
        title,
        language,
        context_summary,
        is_active,
        created_at,
        updated_at
      `)
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single()

    if (conversationError) {
      if (conversationError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      }
      console.error('Error fetching conversation:', conversationError)
      return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 })
    }

    // Get all messages for this conversation
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select(`
        id,
        role,
        content,
        metadata,
        token_count,
        created_at
      `)
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (messagesError) {
      console.error('Error fetching messages:', messagesError)
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    return NextResponse.json({
      conversation: {
        ...conversation,
        messages: messages || []
      }
    })

  } catch (error) {
    console.error('Error in conversation API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}