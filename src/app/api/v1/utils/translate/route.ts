/**
 * Translation API Route
 *
 * POST /api/v1/utils/translate
 *
 * Translates text between Southeast Asian languages using SEA-LION AI model.
 * Supports: English, Thai, Indonesian, Malay, Vietnamese
 *
 * Authentication: Clerk user authentication required
 * Use Case: Invoice translation, multi-language support
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { translateText } from '@/domains/utilities/lib/translation.service'

/**
 * POST - Translate Text
 *
 * Request Body:
 * {
 *   "text": "string (required)",
 *   "sourceLanguage": "string (required)",
 *   "targetLanguage": "string (required)"
 * }
 */
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

    // Parse request body
    const body = await request.json()
    const { text, sourceLanguage, targetLanguage } = body

    // Validate required fields
    if (!text || !sourceLanguage || !targetLanguage) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: text, sourceLanguage, targetLanguage' },
        { status: 400 }
      )
    }

    console.log(`[Translation API] Translating from ${sourceLanguage} to ${targetLanguage}`)

    // Call service layer
    const result = await translateText({
      text,
      sourceLanguage,
      targetLanguage
    })

    return NextResponse.json({
      success: true,
      data: result
    })

  } catch (error) {
    console.error('[Translation API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Translation failed. Please try again.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
