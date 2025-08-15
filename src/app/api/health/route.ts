import { NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    console.log('[Health] Checking Supabase connection...')
    console.log('[Health] Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('[Health] Service key exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)
    
    // Temporarily test with anon client to verify connection
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    
    // Test basic query
    const { data, error } = await supabase
      .from('documents')
      .select('count')
      .limit(1)
    
    if (error) {
      console.error('[Health] Database error:', error)
      return NextResponse.json({
        success: false,
        error: 'Database connection failed',
        details: error.message
      }, { status: 500 })
    }
    
    console.log('[Health] Connection successful')
    
    return NextResponse.json({
      success: true,
      message: 'Database connection working',
      timestamp: new Date().toISOString(),
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    })
    
  } catch (error) {
    console.error('[Health] Health check failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}