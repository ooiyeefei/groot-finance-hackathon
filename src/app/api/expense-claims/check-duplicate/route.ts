/**
 * Duplicate Expense Claims Detection API
 * POST /api/expense-claims/check-duplicate - Check for potential duplicate submissions
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { ensureUserProfile } from '@/lib/ensure-employee-profile'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Authentication required' 
      }, { status: 401 })
    }

    const body = await request.json()
    const { 
      reference_number, 
      transaction_date, 
      original_amount, 
      vendor_name,
      expense_category 
    } = body

    // Basic validation
    if (!reference_number || !transaction_date || !original_amount) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields for duplicate check' 
      }, { status: 400 })
    }

    console.log(`[Duplicate Check API] Checking for duplicates: ${reference_number} | ${original_amount} | ${transaction_date}`)

    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Ensure employee profile exists and get user context
    const employeeProfile = await ensureUserProfile(userId)
    if (!employeeProfile) {
      return NextResponse.json({ 
        success: false, 
        error: 'Employee profile not found' 
      }, { status: 404 })
    }

    // Smart duplicate detection with composite key approach
    // Check for exact matches first (most common duplicates)
    const { data: exactMatches, error: exactError } = await supabase
      .from('transactions')
      .select(`
        id,
        reference_number,
        transaction_date,
        original_amount,
        original_currency,
        vendor_name,
        description,
        created_at,
        expense_claims!inner (
          id,
          status,
          business_purpose,
          expense_category
        )
      `)
      .eq('user_id', userId)
      .eq('reference_number', reference_number)
      .eq('transaction_date', transaction_date)
      .eq('original_amount', original_amount)

    if (exactError) {
      console.error('[Duplicate Check API] Error checking exact matches:', exactError)
      return NextResponse.json({ 
        success: false, 
        error: 'Error checking for duplicates' 
      }, { status: 500 })
    }

    if (exactMatches && exactMatches.length > 0) {
      const duplicate = exactMatches[0]
      const expenseClaim = duplicate.expense_claims[0]
      
      return NextResponse.json({
        success: true,
        isDuplicate: true,
        matchType: 'exact',
        duplicateData: {
          transactionId: duplicate.id,
          claimId: expenseClaim.id,
          reference_number: duplicate.reference_number,
          transaction_date: duplicate.transaction_date,
          amount: duplicate.original_amount,
          currency: duplicate.original_currency,
          vendor_name: duplicate.vendor_name,
          description: duplicate.description,
          status: expenseClaim.status,
          business_purpose: expenseClaim.business_purpose,
          expense_category: expenseClaim.expense_category,
          created_at: duplicate.created_at
        }
      })
    }

    // Check for near-matches with smart detection
    // 1. Same reference number with date variance (+/- 2 days)
    const dateWindow = 2 // days
    const checkDate = new Date(transaction_date)
    const startDate = new Date(checkDate.getTime() - (dateWindow * 24 * 60 * 60 * 1000))
    const endDate = new Date(checkDate.getTime() + (dateWindow * 24 * 60 * 60 * 1000))

    const { data: nearMatches, error: nearError } = await supabase
      .from('transactions')
      .select(`
        id,
        reference_number,
        transaction_date,
        original_amount,
        original_currency,
        vendor_name,
        description,
        created_at,
        expense_claims!inner (
          id,
          status,
          business_purpose,
          expense_category
        )
      `)
      .eq('user_id', userId)
      .eq('reference_number', reference_number)
      .gte('transaction_date', startDate.toISOString().split('T')[0])
      .lte('transaction_date', endDate.toISOString().split('T')[0])

    if (nearError) {
      console.error('[Duplicate Check API] Error checking near matches:', nearError)
    }

    // 2. Check for amount variance (±1% or ±0.01, whichever is larger)
    const amountTolerance = Math.max(original_amount * 0.01, 0.01)
    const nearAmountMatches = nearMatches?.filter(match => {
      const amountDiff = Math.abs(match.original_amount - original_amount)
      return amountDiff <= amountTolerance
    }) || []

    if (nearAmountMatches.length > 0) {
      const nearDuplicate = nearAmountMatches[0]
      const expenseClaim = nearDuplicate.expense_claims[0]
      
      return NextResponse.json({
        success: true,
        isDuplicate: true,
        matchType: 'near',
        duplicateData: {
          transactionId: nearDuplicate.id,
          claimId: expenseClaim.id,
          reference_number: nearDuplicate.reference_number,
          transaction_date: nearDuplicate.transaction_date,
          amount: nearDuplicate.original_amount,
          currency: nearDuplicate.original_currency,
          vendor_name: nearDuplicate.vendor_name,
          description: nearDuplicate.description,
          status: expenseClaim.status,
          business_purpose: expenseClaim.business_purpose,
          expense_category: expenseClaim.expense_category,
          created_at: nearDuplicate.created_at
        },
        variance: {
          dateDifferenceInDays: Math.abs(
            (new Date(nearDuplicate.transaction_date).getTime() - new Date(transaction_date).getTime()) / 
            (1000 * 60 * 60 * 24)
          ),
          amountDifference: Math.abs(nearDuplicate.original_amount - original_amount)
        }
      })
    }

    // 3. Check for same reference number with different vendor (edge case)
    const { data: refMatches, error: refError } = await supabase
      .from('transactions')
      .select(`
        id,
        reference_number,
        transaction_date,
        original_amount,
        original_currency,
        vendor_name,
        description,
        created_at,
        expense_claims!inner (
          id,
          status,
          business_purpose,
          expense_category
        )
      `)
      .eq('user_id', userId)
      .eq('reference_number', reference_number)
      .neq('vendor_name', vendor_name || '')
      .limit(1)

    if (!refError && refMatches && refMatches.length > 0) {
      const refDuplicate = refMatches[0]
      const expenseClaim = refDuplicate.expense_claims[0]
      
      return NextResponse.json({
        success: true,
        isDuplicate: true,
        matchType: 'reference_conflict',
        duplicateData: {
          transactionId: refDuplicate.id,
          claimId: expenseClaim.id,
          reference_number: refDuplicate.reference_number,
          transaction_date: refDuplicate.transaction_date,
          amount: refDuplicate.original_amount,
          currency: refDuplicate.original_currency,
          vendor_name: refDuplicate.vendor_name,
          description: refDuplicate.description,
          status: expenseClaim.status,
          business_purpose: expenseClaim.business_purpose,
          expense_category: expenseClaim.expense_category,
          created_at: refDuplicate.created_at
        },
        warning: 'Same reference number but different vendor - please verify this is not a duplicate'
      })
    }

    // No duplicates found
    console.log(`[Duplicate Check API] No duplicates found for ${reference_number}`)
    return NextResponse.json({
      success: true,
      isDuplicate: false
    })

  } catch (error) {
    console.error('[Duplicate Check API] Unexpected error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}