import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient, createBusinessContextSupabaseClient, getUserData } from '@/lib/supabase-server'

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
    const supabase = await createBusinessContextSupabaseClient()

    console.log('[API] List invoices - User ID:', userData.id)

    // Fetch user's invoices with linked accounting entry information ordered by creation date (newest first)
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select(`
        id, file_name, file_type, file_size, storage_path, converted_image_path, converted_image_width, converted_image_height, processing_status, created_at, processed_at, error_message, extracted_data,
        accounting_entries:accounting_entries!document_id!left (
          id, description, original_amount, original_currency, created_at
        )
      `)
      .eq('user_id', userData.id) // SECURITY FIX: Use validated Supabase UUID
      .is('deleted_at', null)
      .or('deleted_at.is.null', { foreignTable: 'accounting_entries' })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch invoices' },
        { status: 500 }
      )
    }

    // Process invoices to include linked accounting entry data
    const processedInvoices = (invoices || []).map((invoice: any) => ({
      ...invoice,
      linked_transaction: invoice.accounting_entries && invoice.accounting_entries.length > 0 ? invoice.accounting_entries[0] : null,
      accounting_entries: undefined // Remove the raw accounting_entries array from the response
    }))

    return NextResponse.json({
      success: true,
      data: processedInvoices
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}