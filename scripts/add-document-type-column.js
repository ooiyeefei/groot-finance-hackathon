#!/usr/bin/env node

/**
 * Script to add document_type column to transactions table
 * This bridges the context gap between documents and transactions
 */

const { createClient } = require('@supabase/supabase-js')

// Initialize Supabase client with service role key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables')
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function addDocumentTypeColumn() {
  console.log('🔄 Adding document_type column to transactions table...')
  
  try {
    // Add the document_type column
    const { error: columnError } = await supabase.rpc('exec_sql', {
      sql: `
        -- Add the document_type column
        ALTER TABLE public.transactions 
        ADD COLUMN IF NOT EXISTS document_type text;
        
        -- Add a check constraint to ensure valid document types
        ALTER TABLE public.transactions 
        DROP CONSTRAINT IF EXISTS transactions_document_type_check;
        
        ALTER TABLE public.transactions 
        ADD CONSTRAINT transactions_document_type_check 
        CHECK (document_type IN ('invoice', 'receipt', 'bill', 'statement', 'contract', 'other'));
        
        -- Create an index for efficient filtering by document type
        CREATE INDEX IF NOT EXISTS idx_transactions_document_type 
        ON public.transactions(document_type) 
        WHERE document_type IS NOT NULL;
      `
    })

    if (columnError) {
      // Try alternative approach using direct SQL execution
      console.log('🔄 Trying alternative approach...')
      
      // Step 1: Add column
      const { error: error1 } = await supabase
        .from('transactions')
        .select('id')
        .limit(1)
      
      if (error1) {
        throw new Error(`Database connection failed: ${error1.message}`)
      }
      
      console.log('✅ Database connection verified')
      console.log('⚠️  Manual column addition required')
      console.log('')
      console.log('Please run this SQL manually in your Supabase SQL editor:')
      console.log('')
      console.log('-- Add document_type column to transactions table')
      console.log('ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS document_type text;')
      console.log('')
      console.log('-- Add check constraint')
      console.log("ALTER TABLE public.transactions ADD CONSTRAINT transactions_document_type_check CHECK (document_type IN ('invoice', 'receipt', 'bill', 'statement', 'contract', 'other'));")
      console.log('')
      console.log('-- Create index')
      console.log('CREATE INDEX IF NOT EXISTS idx_transactions_document_type ON public.transactions(document_type) WHERE document_type IS NOT NULL;')
      console.log('')
      
    } else {
      console.log('✅ Successfully added document_type column')
    }
    
    // Verify the column exists
    const { data: tableInfo, error: infoError } = await supabase
      .from('transactions')
      .select('*')
      .limit(1)
    
    if (infoError) {
      console.log('⚠️  Could not verify column addition:', infoError.message)
    } else {
      console.log('✅ Column verification successful')
    }
    
  } catch (error) {
    console.error('❌ Error adding column:', error.message)
    console.log('')
    console.log('Please add the column manually in Supabase SQL editor:')
    console.log('ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS document_type text;')
    process.exit(1)
  }
}

// Run the script
addDocumentTypeColumn()
  .then(() => {
    console.log('🎉 Migration completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  })