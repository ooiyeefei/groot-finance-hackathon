/**
 * Chat Attachment URL Endpoint
 *
 * GET /api/v1/chat/attachment-url?s3Path=chat-attachments/...
 * Returns a pre-signed download URL for a chat attachment image.
 *
 * Auth: Clerk session
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
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

  // Extract the path portion after the prefix (chat-attachments/)
  const prefixStr = 'chat-attachments/'
  const pathAfterPrefix = s3Path.startsWith(prefixStr)
    ? s3Path.slice(prefixStr.length)
    : s3Path

  try {
    const url = await getPresignedDownloadUrl('chat_attachments', pathAfterPrefix, 3600)
    return NextResponse.json({ url })
  } catch (error) {
    console.error('[Chat Attachment URL] Failed to generate URL:', error)
    return NextResponse.json({ error: 'Failed to generate URL' }, { status: 500 })
  }
}
