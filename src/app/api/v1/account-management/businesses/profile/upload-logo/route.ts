/**
 * Business Profile Logo Upload API V1
 * POST /api/v1/account-management/businesses/profile/upload-logo - Upload business logo
 * DELETE /api/v1/account-management/businesses/profile/upload-logo - Remove business logo
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createBusinessContextSupabaseClient } from '@/lib/db/supabase-server'
import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'

// Supported image types for business logos
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_LOGO_SIZE = 5 * 1024 * 1024 // 5MB (matches frontend validation)

/**
 * Upload business logo
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user profile with business context
    const userProfile = await ensureUserProfile(userId)
    if (!userProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to get user profile' },
        { status: 400 }
      )
    }

    // Only admins can upload business logos
    if (!userProfile.role_permissions.admin) {
      return NextResponse.json(
        { success: false, error: 'Only administrators can upload business logos' },
        { status: 403 }
      )
    }

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('logo') as File

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No logo file provided' },
        { status: 400 }
      )
    }

    // Validate file type
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Please upload JPG, PNG, or WebP images.' },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_LOGO_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File too large. Please upload images under 5MB.' },
        { status: 400 }
      )
    }

    const supabase = await createBusinessContextSupabaseClient()

    // Generate unique filename with business ID
    const fileExtension = file.name.split('.').pop() || 'jpg'
    const filename = `${userProfile.business_id}/logo_${Date.now()}.${fileExtension}`

    console.log(`[Logo Upload] Uploading logo for business ${userProfile.business_id}: ${filename}`)

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('business-profiles')
      .upload(filename, file, {
        cacheControl: '3600',
        upsert: true // Allow overwriting existing logos
      })

    if (uploadError) {
      console.error('[Logo Upload] Supabase upload error:', uploadError)
      return NextResponse.json(
        { success: false, error: 'Failed to upload logo to storage' },
        { status: 500 }
      )
    }

    // Get public URL for the uploaded logo
    const { data: urlData } = supabase.storage
      .from('business-profiles')
      .getPublicUrl(filename)

    if (!urlData.publicUrl) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate logo URL' },
        { status: 500 }
      )
    }

    // Update business profile with logo URL
    const { error: updateError } = await supabase
      .from('businesses')
      .update({
        logo_url: urlData.publicUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', userProfile.business_id)

    if (updateError) {
      console.error('[Logo Upload] Database update error:', updateError)
      // Try to clean up uploaded file if database update fails
      await supabase.storage
        .from('business-profiles')
        .remove([filename])

      return NextResponse.json(
        { success: false, error: 'Failed to update business profile' },
        { status: 500 }
      )
    }

    console.log(`[Logo Upload] Successfully uploaded logo for business ${userProfile.business_id}`)

    return NextResponse.json({
      success: true,
      data: {
        logo_url: urlData.publicUrl,
        filename: filename
      }
    })

  } catch (error) {
    console.error('[Logo Upload] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Remove business logo
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user profile with business context
    const userProfile = await ensureUserProfile(userId)
    if (!userProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to get user profile' },
        { status: 400 }
      )
    }

    // Only admins can remove business logos
    if (!userProfile.role_permissions.admin) {
      return NextResponse.json(
        { success: false, error: 'Only administrators can remove business logos' },
        { status: 403 }
      )
    }

    const supabase = await createBusinessContextSupabaseClient()

    // Get current business profile to find existing logo
    const { data: business, error: fetchError } = await supabase
      .from('businesses')
      .select('logo_url')
      .eq('id', userProfile.business_id)
      .single()

    if (fetchError || !business) {
      return NextResponse.json(
        { success: false, error: 'Business profile not found' },
        { status: 404 }
      )
    }

    // If there's a logo URL, try to extract filename and remove from storage
    if (business.logo_url) {
      try {
        // Extract filename from URL (assumes URL format: .../storage/v1/object/public/business-profiles/filename)
        const urlPath = new URL(business.logo_url).pathname
        const filename = urlPath.split('/').pop()

        if (filename && filename.includes(userProfile.business_id)) {
          // Remove from storage
          const { error: deleteError } = await supabase.storage
            .from('business-profiles')
            .remove([`${userProfile.business_id}/${filename}`])

          if (deleteError) {
            console.warn('[Logo Remove] Failed to delete from storage:', deleteError)
            // Continue with database update even if storage deletion fails
          }
        }
      } catch (error) {
        console.warn('[Logo Remove] Failed to parse logo URL for deletion:', error)
        // Continue with database update even if we can't delete the file
      }
    }

    // Update business profile to remove logo URL
    const { error: updateError } = await supabase
      .from('businesses')
      .update({
        logo_url: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', userProfile.business_id)

    if (updateError) {
      console.error('[Logo Remove] Database update error:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to update business profile' },
        { status: 500 }
      )
    }

    console.log(`[Logo Remove] Successfully removed logo for business ${userProfile.business_id}`)

    return NextResponse.json({
      success: true,
      message: 'Business logo removed successfully'
    })

  } catch (error) {
    console.error('[Logo Remove] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}