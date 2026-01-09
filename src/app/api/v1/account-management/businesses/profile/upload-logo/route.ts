/**
 * Business Profile Logo Upload API V1
 * POST /api/v1/account-management/businesses/profile/upload-logo - Upload business logo
 * DELETE /api/v1/account-management/businesses/profile/upload-logo - Remove business logo
 *
 * ✅ PUBLIC BUCKET: Uses finanseal-public S3 bucket for public logo access
 * ✅ CONVEX MIGRATION (2026-01-03): Uses Convex for business profile storage
 *
 * Structure: business-logos/{businessId}/{uploaderId}/logo.{ext}
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'
import { uploadBusinessLogo, deleteBusinessLogo, PUBLIC_BUCKET_URL } from '@/lib/aws-s3-public'

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

    console.log(`[Logo Upload] Uploading logo for business ${userProfile.business_id} by user ${userProfile.user_id}`)

    // ✅ PUBLIC BUCKET: Upload to finanseal-public for direct public access
    // Structure: business-logos/{businessId}/{uploaderId}/logo.{ext}
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const uploadResult = await uploadBusinessLogo(
      userProfile.business_id,
      userProfile.user_id,
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

    // ✅ CONVEX: Store the public URL directly (no presigned URLs needed)
    try {
      await convex.mutation(api.functions.businesses.updateBusinessByStringId, {
        businessId: userProfile.business_id,
        logo_url: uploadResult.url // Store public URL directly
      })
    } catch (updateError) {
      console.error('[Logo Upload] Convex update error:', updateError)
      // Clean up uploaded file if database update fails
      await deleteBusinessLogo(uploadResult.key)

      return NextResponse.json(
        { success: false, error: 'Failed to update business profile' },
        { status: 500 }
      )
    }

    console.log(`[Logo Upload] Successfully uploaded logo: ${uploadResult.url}`)

    // Return the public URL (directly accessible, no presigned URL needed)
    return NextResponse.json({
      success: true,
      data: {
        logo_url: uploadResult.url, // Public URL - directly accessible
        key: uploadResult.key
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

    // ✅ PUBLIC BUCKET: Extract S3 key from stored URL and delete
    const logoUrl = business.logoStoragePath || business.logoUrl
    if (logoUrl) {
      try {
        // Extract key from URL (e.g., "https://finanseal-public.s3.../business-logos/bid/uid/logo.png" -> "business-logos/bid/uid/logo.png")
        let key = logoUrl
        if (logoUrl.startsWith(PUBLIC_BUCKET_URL)) {
          key = logoUrl.replace(`${PUBLIC_BUCKET_URL}/`, '')
        } else if (logoUrl.includes('finanseal-public')) {
          // Handle other URL formats
          const match = logoUrl.match(/finanseal-public[^/]*\/(.+)/)
          if (match) key = match[1]
        }

        console.log(`[Logo Remove] Deleting logo from public bucket: ${key}`)

        const deleteResult = await deleteBusinessLogo(key)

        if (!deleteResult.success) {
          console.warn('[Logo Remove] Failed to delete from S3:', deleteResult.error)
          // Continue with database update even if storage deletion fails
        } else {
          console.log(`[Logo Remove] Successfully deleted from S3: ${key}`)
        }
      } catch (error) {
        console.warn('[Logo Remove] Failed to delete logo from S3:', error)
        // Continue with database update even if we can't delete the file
      }
    }

    // ✅ CONVEX: Clear the logo URL
    try {
      await convex.mutation(api.functions.businesses.updateBusinessByStringId, {
        businessId: userProfile.business_id,
        logo_url: '' // Clear the logo URL
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