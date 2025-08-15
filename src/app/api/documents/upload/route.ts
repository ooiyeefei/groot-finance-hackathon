import { auth, currentUser } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'

// File validation constants
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB in bytes

// Sanitize filename to prevent security issues
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase()
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const user = await currentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 401 }
      )
    }

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid file type. Only JPG, PNG, and PDF files are allowed.' 
        },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'File too large. Maximum size is 10MB.' 
        },
        { status: 400 }
      )
    }

    // Create Supabase client with service role
    const supabase = createServiceSupabaseClient()

    // Get or create user and business relationship
    const userResult = await supabase
      .from('users')
      .select('id, business_id')
      .eq('clerk_user_id', userId)
      .single()
    
    let userData = userResult.data
    const userError = userResult.error

    let businessId: string

    if (userError || !userData) {
      // Get default business
      const { data: defaultBusiness } = await supabase
        .from('businesses')
        .select('id')
        .eq('slug', 'default-business')
        .single()

      businessId = defaultBusiness?.id || ''

      // Create user record with business association
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          clerk_user_id: userId,
          email: user.emailAddresses[0]?.emailAddress || 'temp@example.com',
          full_name: user.fullName || 'User',
          business_id: businessId,
          role: 'owner'
        })
        .select('id, business_id')
        .single()

      if (createError) {
        console.error('Failed to create user:', createError)
        return NextResponse.json(
          { success: false, error: 'Failed to initialize user' },
          { status: 500 }
        )
      }
      
      userData = newUser
      businessId = newUser.business_id
    } else {
      businessId = userData.business_id
    }

    // Generate unique filename with business-based storage structure
    const sanitizedName = sanitizeFilename(file.name)
    const timestamp = Date.now()
    const uniqueFilename = `${timestamp}_${sanitizedName}`
    // Business-segmented storage: business_id/user_id/filename
    const storagePath = `${businessId}/${userId}/${uniqueFilename}`

    // Convert file to buffer for upload
    const fileBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(fileBuffer)

    // Upload to Supabase Storage using regular client with permissive policies
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to upload file to storage' 
        },
        { status: 500 }
      )
    }

    // Create database record with business_id
    const { data: documentData, error: dbError } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        business_id: businessId,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: uploadData.path,
        processing_status: 'pending'
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database insert error:', dbError)
      
      // Clean up uploaded file if database insert fails
      await supabase.storage
        .from('documents')
        .remove([storagePath])

      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to create document record' 
        },
        { status: 500 }
      )
    }

    // Return success response
    return NextResponse.json({
      success: true,
      data: {
        id: documentData.id,
        fileName: documentData.file_name,
        fileSize: documentData.file_size,
        fileType: documentData.file_type,
        status: documentData.processing_status
      }
    })

  } catch (error) {
    console.error('Upload API error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error' 
      },
      { status: 500 }
    )
  }
}