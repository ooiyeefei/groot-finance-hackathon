/**
 * Business Profile Logo Upload API V1
 * POST /api/v1/account-management/businesses/profile/upload-logo - Upload business logo
 * DELETE /api/v1/account-management/businesses/profile/upload-logo - Remove business logo
 *
 * ✅ S3 MIGRATION: Uses AWS S3 for storage instead of Supabase Storage
 * ✅ CONVEX MIGRATION (2026-01-03): Uses Convex for business profile storage
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'
import { uploadFile, deleteFile } from '@/lib/aws-s3'

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

    // Get authenticated Convex client
    const { client: convex } = await getAuthenticatedConvex()
    if (!convex) {
      return NextResponse.json(
        { success: false, error: 'Failed to connect to database' },
        { status: 500 }
      )
    }

    // Generate unique filename with business ID
    const fileExtension = file.name.split('.').pop() || 'jpg'
    const filename = `${userProfile.business_id}/logo_${Date.now()}.${fileExtension}`

    console.log(`[Logo Upload] Uploading logo for business ${userProfile.business_id}: ${filename}`)

    // ✅ S3 MIGRATION: Upload to AWS S3 instead of Supabase Storage
    // Convert File to Buffer for S3 upload
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const uploadResult = await uploadFile(
      'business_profiles',
      filename,
      fileBuffer,
      file.type
    )

    if (!uploadResult.success) {
      console.error('[Logo Upload] S3 upload error:', uploadResult.error)
      return NextResponse.json(
        { success: false, error: 'Failed to upload logo to storage' },
        { status: 500 }
      )
    }

    // ✅ CONVEX MIGRATION: Store S3 path in Convex (presigned URLs generated on-demand)
    try {
      await convex.mutation(api.functions.businesses.updateBusinessByStringId, {
        businessId: userProfile.business_id,
        logo_url: filename // Store S3 path (e.g., "business-id/logo_timestamp.jpg")
      })
    } catch (updateError) {
      console.error('[Logo Upload] Convex update error:', updateError)
      // Clean up uploaded file if database update fails
      await deleteFile('business_profiles', filename)

      return NextResponse.json(
        { success: false, error: 'Failed to update business profile' },
        { status: 500 }
      )
    }

    console.log(`[Logo Upload] Successfully uploaded logo for business ${userProfile.business_id}`)

    // ✅ S3 MIGRATION: Return S3 path (presigned URLs generated on-demand when displaying)
    return NextResponse.json({
      success: true,
      data: {
        logo_url: filename, // S3 path - frontend generates presigned URL for display
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

    // Get authenticated Convex client
    const { client: convex } = await getAuthenticatedConvex()
    if (!convex) {
      return NextResponse.json(
        { success: false, error: 'Failed to connect to database' },
        { status: 500 }
      )
    }

    // Get current business profile to find existing logo (from Convex)
    const business = await convex.query(api.functions.businesses.getCurrentBusiness, {})

    if (!business) {
      return NextResponse.json(
        { success: false, error: 'Business profile not found' },
        { status: 404 }
      )
    }

    // ✅ S3 MIGRATION: If there's a logo path, remove from S3 storage
    const logoPath = business.logoStoragePath || business.logoUrl
    if (logoPath) {
      try {
        // logoStoragePath stores the S3 path directly (e.g., "business-id/logo_timestamp.jpg")
        console.log(`[Logo Remove] Deleting logo from S3: business_profiles/${logoPath}`)

        const deleteResult = await deleteFile('business_profiles', logoPath)

        if (!deleteResult.success) {
          console.warn('[Logo Remove] Failed to delete from S3:', deleteResult.error)
          // Continue with database update even if storage deletion fails
        } else {
          console.log(`[Logo Remove] Successfully deleted from S3: ${logoPath}`)
        }
      } catch (error) {
        console.warn('[Logo Remove] Failed to delete logo from S3:', error)
        // Continue with database update even if we can't delete the file
      }
    }

    // ✅ CONVEX MIGRATION: Update business profile to remove logo URL
    try {
      await convex.mutation(api.functions.businesses.updateBusinessByStringId, {
        businessId: userProfile.business_id,
        logo_url: '' // Clear the logo path (empty string instead of null for Convex)
      })
    } catch (updateError) {
      console.error('[Logo Remove] Convex update error:', updateError)
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