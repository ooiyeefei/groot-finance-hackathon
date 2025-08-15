import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Create Supabase client with service role for bypassing RLS
    const supabase = createServiceSupabaseClient()
    
    // Debug: Check connection
    console.log('[API] List documents - User ID:', userId)
    console.log('[API] Supabase URL configured:', !!process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('[API] Service role key configured:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)

    // Fetch user's documents ordered by creation date (newest first)
    // Using Clerk user ID directly since RLS is disabled
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, file_name, file_type, file_size, storage_path, processing_status, created_at, processed_at, error_message, extracted_data')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch documents' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: documents || []
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}