import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAuthenticatedSupabaseClient, getUserData } from '@/lib/supabase-server'

// GET - Fetch specific conversation
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

    // SECURITY: Get user data with business context for proper tenant isolation
    const userData = await getUserData(userId)
    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Get specific conversation with all messages
    // SECURITY FIX: Use Supabase UUID instead of Clerk ID
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
      .eq('user_id', userData.id)
      .is('deleted_at', null)
      .single()

    if (conversationError) {
      if (conversationError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      }
      console.error('Error fetching conversation:', conversationError)
      return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 })
    }

    // Get all messages for this conversation
    // SECURITY FIX: Use Supabase UUID instead of Clerk ID
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
      .eq('user_id', userData.id)
      .is('deleted_at', null)
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

// DELETE - Soft delete conversation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: conversationId } = await params

    // SECURITY: Get user data with business context for proper tenant isolation
    const userData = await getUserData(userId)
    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Soft delete the conversation (updates deleted_at timestamp)
    // SECURITY FIX: Use Supabase UUID instead of Clerk ID
    const { error: conversationError } = await supabase
      .from('conversations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', conversationId)
      .eq('user_id', userData.id)
      .is('deleted_at', null)

    if (conversationError) {
      console.error('Failed to delete conversation:', conversationError)
      return NextResponse.json(
        { success: false, error: 'Failed to delete conversation' },
        { status: 500 }
      )
    }

    // Soft delete all messages in the conversation
    // SECURITY FIX: Use Supabase UUID instead of Clerk ID
    const { error: messagesError } = await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', userData.id)
      .is('deleted_at', null)

    if (messagesError) {
      console.error('Failed to delete messages:', messagesError)
      // Continue execution - conversation deletion is more important than message cleanup
    }

    return NextResponse.json({
      success: true,
      message: 'Conversation deleted successfully'
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}