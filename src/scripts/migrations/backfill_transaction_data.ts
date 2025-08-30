#!/usr/bin/env tsx

/**
 * One-Time Data Migration Script: Backfill Transaction Data
 * 
 * Purpose: Fix existing transactions that lack proper status and category fields
 * to make the Financial Analytics Dashboard operational.
 * 
 * This script:
 * 1. Connects to Supabase database
 * 2. Finds all transactions with status 'pending' or null
 * 3. Updates expense transactions to 'paid' status
 * 4. Assigns default category 'General Expenses'
 * 5. Logs progress and results
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:')
  console.error('- NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl)
  console.error('- SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey)
  process.exit(1)
}

// Create Supabase client with service role key for admin access
const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface Transaction {
  id: string
  transaction_type: string
  status: string | null
  category: string | null
  amount: number
  currency: string
  description: string
  created_at: string
}

async function backfillTransactionData() {
  console.log('🚀 Starting transaction data backfill migration...\n')
  
  try {
    // Step 1: Query all transactions that need fixing
    console.log('📊 Querying transactions that need status/category updates...')
    
    const { data: transactions, error: fetchError } = await supabase
      .from('transactions')
      .select('id, transaction_type, status, category, amount, currency, description, created_at')
      .or('status.is.null,status.eq.pending')
    
    if (fetchError) {
      throw new Error(`Failed to fetch transactions: ${fetchError.message}`)
    }
    
    if (!transactions || transactions.length === 0) {
      console.log('✅ No transactions found that need updating. Migration complete!')
      return
    }
    
    console.log(`📋 Found ${transactions.length} transactions to update:\n`)
    
    // Step 2: Process each transaction
    let updatedCount = 0
    let errorCount = 0
    
    for (const transaction of transactions) {
      try {
        console.log(`Processing transaction ${transaction.id}:`)
        console.log(`  Type: ${transaction.transaction_type}`)
        console.log(`  Current Status: ${transaction.status || 'null'}`)
        console.log(`  Current Category: ${transaction.category || 'null'}`)
        console.log(`  Amount: ${transaction.currency} ${transaction.amount}`)
        
        // Determine new status based on transaction type
        let newStatus = transaction.status
        if (!newStatus || newStatus === 'pending') {
          if (transaction.transaction_type === 'expense') {
            newStatus = 'paid' // Assume existing expenses from OCR are already paid (receipts)
          } else if (transaction.transaction_type === 'income') {
            newStatus = 'paid' // Assume existing income is received
          } else {
            newStatus = 'paid' // Default to paid for other types
          }
        }
        
        // Set default category if missing
        let newCategory = transaction.category
        if (!newCategory) {
          if (transaction.transaction_type === 'expense') {
            newCategory = 'General Expenses'
          } else if (transaction.transaction_type === 'income') {
            newCategory = 'General Income'
          } else {
            newCategory = 'Other'
          }
        }
        
        // Update the transaction
        const { error: updateError } = await supabase
          .from('transactions')
          .update({
            status: newStatus,
            category: newCategory,
            updated_at: new Date().toISOString()
          })
          .eq('id', transaction.id)
        
        if (updateError) {
          throw new Error(`Failed to update transaction ${transaction.id}: ${updateError.message}`)
        }
        
        console.log(`  ✅ Updated: status → '${newStatus}', category → '${newCategory}'`)
        updatedCount++
        
      } catch (error) {
        console.error(`  ❌ Error updating transaction ${transaction.id}:`, error)
        errorCount++
      }
      
      console.log() // Empty line for readability
    }
    
    // Step 3: Report results
    console.log('📈 Migration Results:')
    console.log(`✅ Successfully updated: ${updatedCount} transactions`)
    if (errorCount > 0) {
      console.log(`❌ Failed to update: ${errorCount} transactions`)
    }
    console.log(`📊 Total processed: ${transactions.length} transactions`)
    
    // Step 4: Verify the updates
    console.log('\n🔍 Verifying updates...')
    
    const { data: verifyData, error: verifyError } = await supabase
      .from('transactions')
      .select('status, category')
      .or('status.is.null,status.eq.pending')
    
    if (verifyError) {
      console.warn('⚠️ Could not verify updates:', verifyError.message)
    } else {
      const remainingIssues = verifyData?.length || 0
      if (remainingIssues === 0) {
        console.log('✅ Verification complete: All transactions now have valid status and category!')
      } else {
        console.log(`⚠️ Warning: ${remainingIssues} transactions still need attention`)
      }
    }
    
    console.log('\n🎉 Transaction data backfill migration completed!')
    
  } catch (error) {
    console.error('💥 Migration failed:', error)
    process.exit(1)
  }
}

// Execute the migration
if (require.main === module) {
  backfillTransactionData()
    .then(() => {
      console.log('🏁 Migration script finished')
      process.exit(0)
    })
    .catch((error) => {
      console.error('💥 Migration script failed:', error)
      process.exit(1)
    })
}

export default backfillTransactionData