/**
 * Chat Attachment URL Endpoint
 *
 * GET /api/v1/chat/attachment-url?s3Path=chat-attachments/...
 * Returns a pre-signed download URL for a chat attachment image.
 *
 * Auth: Clerk session
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/demo-server-auth'
import { getPresignedDownloadUrl } from '@/lib/aws-s3'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const s3Path = req.nextUrl.searchParams.get('s3Path')
  if (!s3Path) {
    return NextResponse.json({ error: 'Missing s3Path parameter' }, { status: 400 })
  }

  // Determine the S3 prefix and extract relative path
  // Files may be under expense_claims/ (new) or chat-attachments/ (legacy)
  let prefix: 'expense_claims' | 'chat_attachments' = 'expense_claims'
  let pathAfterPrefix = s3Path

  if (s3Path.startsWith('expense_claims/')) {
    prefix = 'expense_claims'
    pathAfterPrefix = s3Path.slice('expense_claims/'.length)
  } else if (s3Path.startsWith('chat-attachments/')) {
    prefix = 'chat_attachments'
    pathAfterPrefix = s3Path.slice('chat-attachments/'.length)
  }

  try {
    const url = await getPresignedDownloadUrl(prefix, pathAfterPrefix, 3600)
    return NextResponse.json({ url })
  } catch (error) {
    console.error('[Chat Attachment URL] Failed to generate URL:', error)
    return NextResponse.json({ error: 'Failed to generate URL' }, { status: 500 })
  }
}
