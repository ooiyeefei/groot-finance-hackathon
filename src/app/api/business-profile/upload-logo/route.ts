import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserData, createServerSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user data including business_id (bypasses RLS)
    const user = await getUserData(userId)

    if (!user.business_id) {
      return NextResponse.json({ error: 'No business associated with user' }, { status: 404 })
    }

    const supabase = createServerSupabaseClient()
    const serviceSupabase = createServiceSupabaseClient() // Service role for storage
    const businessProfile = { id: user.business_id }

    const formData = await request.formData()
    const file = formData.get('logo') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({
        error: 'Invalid file type. Please upload JPG, PNG, or WebP images.'
      }, { status: 400 })
    }

    // Validate file size (5MB limit)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      return NextResponse.json({
        error: 'File too large. Please upload an image under 5MB.'
      }, { status: 400 })
    }

    // Generate unique filename
    const fileExtension = file.type.split('/')[1]
    const fileName = `business_logo_${businessProfile.id}_${Date.now()}.${fileExtension}`
    const filePath = `business_profiles/${businessProfile.id}/${fileName}`

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    // Upload to Supabase Storage using service role
    const { data: uploadData, error: uploadError } = await serviceSupabase.storage
      .from('business-profiles')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = serviceSupabase.storage
      .from('business-profiles')
      .getPublicUrl(filePath)

    const logoUrl = urlData.publicUrl

    // Update business profile with new logo URL
    const { error: updateError } = await supabase
      .from('businesses')
      .update({
        logo_url: logoUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', businessProfile.id)

    if (updateError) {
      console.error('Database update error:', updateError)
      // Try to clean up uploaded file
      await serviceSupabase.storage.from('business-profiles').remove([filePath])
      return NextResponse.json({ error: 'Failed to update profile with logo' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: { logo_url: logoUrl }
    })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user data including business_id (bypasses RLS)
    const user = await getUserData(userId)

    if (!user.business_id) {
      return NextResponse.json({ error: 'No business associated with user' }, { status: 404 })
    }

    const supabase = createServerSupabaseClient()
    const serviceSupabase = createServiceSupabaseClient() // Service role for storage

    // Get current business profile with logo_url
    const { data: businessProfile, error: profileError } = await supabase
      .from('businesses')
      .select('id, logo_url')
      .eq('id', user.business_id)
      .single()

    if (profileError || !businessProfile) {
      return NextResponse.json({ error: 'Business profile not found' }, { status: 404 })
    }

    // Remove logo from storage if exists
    if (businessProfile.logo_url) {
      try {
        // Extract file path from URL
        const url = new URL(businessProfile.logo_url)
        const pathParts = url.pathname.split('/')
        const bucketIndex = pathParts.findIndex(part => part === 'business-profiles')
        if (bucketIndex > 0) {
          const filePath = pathParts.slice(bucketIndex + 1).join('/')
          await serviceSupabase.storage.from('business-profiles').remove([filePath])
        }
      } catch (error) {
        console.error('Error removing logo file:', error)
      }
    }

    // Update business profile to remove logo URL
    const { error: updateError } = await supabase
      .from('businesses')
      .update({
        logo_url: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', businessProfile.id)

    if (updateError) {
      console.error('Database update error:', updateError)
      return NextResponse.json({ error: 'Failed to remove logo' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}