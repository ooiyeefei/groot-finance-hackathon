/**
 * Accounting Entry Status Update API
 * Updates P&L entry status, payment details, and tracking information
 * REFACTOR: Updated from transactions to use accounting_entries table
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAuthenticatedSupabaseClient, getUserData } from '@/lib/supabase-server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { entryId } = await params
    const body = await request.json()
    const { status, due_date, payment_date, payment_method, notes } = body

    console.log(`[Accounting Entry Status API] Updating status for entry ${entryId}`)

    // Validate status
    const validStatuses = ['pending', 'awaiting_payment', 'paid', 'overdue', 'cancelled', 'disputed']
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    // SECURITY: Get user data and create authenticated client
    const userData = await getUserData(userId)
    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Build update object with only provided fields
    const updateData: any = { updated_at: new Date().toISOString() }

    if (status) updateData.status = status
    if (due_date !== undefined) updateData.due_date = due_date
    if (payment_date !== undefined) updateData.payment_date = payment_date
    if (payment_method !== undefined) updateData.payment_method = payment_method
    if (notes !== undefined) updateData.notes = notes

    // SECURITY: Update entry with proper authentication and business context validation
    const { data: accountingEntry, error } = await supabase
      .from('accounting_entries')
      .update(updateData)
      .eq('id', entryId)
      .eq('user_id', userData.id) // SECURITY: Use Supabase UUID instead of Clerk ID
      .select('*')
      .single()

    if (error) {
      console.error('[Accounting Entry Status API] Update error:', error)
      return NextResponse.json({ error: 'Failed to update accounting entry status' }, { status: 500 })
    }

    if (!accountingEntry) {
      return NextResponse.json({ error: 'Accounting entry not found or access denied' }, { status: 404 })
    }

    console.log(`[Accounting Entry Status API] Successfully updated entry ${entryId} status to ${status}`)

    return NextResponse.json({
      success: true,
      data: accountingEntry
    })

  } catch (error) {
    console.error('[Accounting Entry Status API] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}