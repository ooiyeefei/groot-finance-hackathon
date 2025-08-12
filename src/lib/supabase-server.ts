import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'

// Create a Supabase client with Clerk authentication
export async function createServerSupabaseClient() {
  const { getToken } = await auth()
  const supabaseAccessToken = await getToken({ template: 'supabase' })
  
  if (!supabaseAccessToken) {
    throw new Error('No Supabase access token available')
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${supabaseAccessToken}`,
        },
      },
    }
  )
}