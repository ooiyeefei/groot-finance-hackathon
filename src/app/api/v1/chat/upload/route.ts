/**
 * Chat Image Upload Endpoint
 *
 * POST /api/v1/chat/upload — accepts multipart file upload, validates,
 * uploads to S3 under chat-attachments/{businessId}/{conversationId}/{uuid}.{ext},
 * returns S3 key + metadata.
 *
 * Auth: Clerk session
 * Max file size: 10 MB
 * Accepted types: JPEG, PNG, HEIC, PDF
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { uploadFile } from '@/lib/aws-s3'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/pdf',
])

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'application/pdf': 'pdf',
  }
  return map[mimeType] || 'bin'
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  // 2. Parse multipart form data
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json(
      { error: 'Invalid form data', code: 'INVALID_REQUEST' },
      { status: 400 }
    )
  }

  const file = formData.get('file') as File | null
  const conversationId = formData.get('conversationId') as string | null
  const businessId = formData.get('businessId') as string | null

  if (!file || !conversationId || !businessId) {
    return NextResponse.json(
      { error: 'Missing required fields: file, conversationId, businessId', code: 'MISSING_FIELDS' },
      { status: 400 }
    )
  }

  // 3. Validate file type
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      {
        error: `Unsupported file type: ${file.type}. Accepted: JPEG, PNG, HEIC, PDF`,
        code: 'INVALID_FILE_TYPE',
      },
      { status: 400 }
    )
  }

  // 4. Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      {
        error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum: 10 MB`,
        code: 'FILE_TOO_LARGE',
      },
      { status: 400 }
    )
  }

  // 5. Upload to S3
  const attachmentId = crypto.randomUUID()
  const ext = getExtension(file.type)
  const s3Path = `${businessId}/${conversationId}/${attachmentId}.${ext}`

  try {
    const result = await uploadFile(
      'chat_attachments',
      s3Path,
      file,
      file.type,
      {
        userId,
        businessId,
        conversationId,
        originalFilename: file.name,
      }
    )

    if (!result.success) {
      console.error('[Chat Upload] S3 upload failed:', result.error)
      return NextResponse.json(
        { error: 'Upload failed', code: 'UPLOAD_FAILED' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      id: attachmentId,
      s3Path: result.key,
      mimeType: file.type,
      filename: file.name,
      size: file.size,
      uploadedAt: Date.now(),
    })
  } catch (error) {
    console.error('[Chat Upload] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Upload failed', code: 'UPLOAD_FAILED' },
      { status: 500 }
    )
  }
}
