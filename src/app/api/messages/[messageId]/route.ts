import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createBusinessContextSupabaseClient, getUserData } from '@/lib/supabase-server'

// DELETE - Soft delete message
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // SECURITY: Get user data with business context for proper tenant isolation
    const userData = await getUserData(userId)
    const { messageId } = await params
    const supabase = await createBusinessContextSupabaseClient()

    // SECURITY: Verify the message belongs to the user by checking conversation ownership using Supabase UUID
    const { data: message, error: fetchError } = await supabase
      .from('messages')
      .select(`
        id,
        conversation_id,
        conversations!inner (
          user_id
        )
      `)
      .eq('id', messageId)
      .eq('conversations.user_id', userData.id)
      .is('deleted_at', null)
      .single()

    if (fetchError || !message) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      )
    }

    // Soft delete the message
    const { error: deleteError } = await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', messageId)
      .is('deleted_at', null)

    if (deleteError) {
      console.error('Failed to delete message:', deleteError)
      return NextResponse.json(
        { success: false, error: 'Failed to delete message' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Message deleted successfully'
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}