import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient, getUserData } from '@/lib/supabase-server'

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

    // SECURITY: Get user data with business context for proper tenant isolation
    const userData = await getUserData(userId)
    const supabase = await createAuthenticatedSupabaseClient(userId)

    console.log('[API] List documents - User ID:', userData.id)

    // Fetch user's documents with linked transaction information ordered by creation date (newest first)
    const { data: documents, error } = await supabase
      .from('documents')
      .select(`
        id, file_name, file_type, file_size, storage_path, converted_image_path, converted_image_width, converted_image_height, processing_status, created_at, processed_at, error_message, extracted_data,
        transactions:transactions!document_id!left (
          id, description, original_amount, original_currency, created_at
        )
      `)
      .eq('user_id', userData.id) // SECURITY FIX: Use validated Supabase UUID
      .is('deleted_at', null)
      .or('deleted_at.is.null', { foreignTable: 'transactions' })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch documents' },
        { status: 500 }
      )
    }

    // Process documents to include linked transaction data
    const processedDocuments = (documents || []).map((doc: any) => ({
      ...doc,
      linked_transaction: doc.transactions && doc.transactions.length > 0 ? doc.transactions[0] : null,
      transactions: undefined // Remove the raw transactions array from the response
    }))

    return NextResponse.json({
      success: true,
      data: processedDocuments
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}