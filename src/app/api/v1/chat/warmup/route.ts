/**
 * Chat Agent Warmup API
 * POST /api/v1/chat/warmup - Trigger LLM container warmup (Modal cold start mitigation)
 *
 * This endpoint sends a minimal request to the LLM to spin up the serverless container
 * before the user sends their first actual message.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import OpenAI from 'openai'

export const dynamic = 'force-dynamic'
// Allow up to 120s for cold start warmup (Vercel Pro plan)
export const maxDuration = 120

// Minimal LLM client for warmup with timeout
const getWarmupClient = () => {
  const endpoint = process.env.CHAT_MODEL_ENDPOINT_URL
  const apiKey = process.env.CHAT_MODEL_API_KEY || 'not-needed'

  if (!endpoint) {
    throw new Error('CHAT_MODEL_ENDPOINT_URL not configured')
  }

  return new OpenAI({
    baseURL: endpoint,
    apiKey: apiKey,
    timeout: 115000, // 115s timeout (slightly less than maxDuration)
  })
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Require authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const client = getWarmupClient()
    const modelId = process.env.CHAT_MODEL_MODEL_ID || 'qwen3-8b'

    console.log(`[Chat Warmup] Starting warmup request for user ${userId}`)

    // Send minimal warmup request to spin up the container
    // Using a very short prompt with low max_tokens for fast response
    const response = await client.chat.completions.create({
      model: modelId,
      messages: [
        { role: 'user', content: 'hi' }
      ],
      max_tokens: 5,
      temperature: 0,
    })

    const duration = Date.now() - startTime
    const isColdStart = duration > 5000 // If > 5s, likely was a cold start

    console.log(`[Chat Warmup] Warmup completed in ${duration}ms (cold_start: ${isColdStart})`)

    return NextResponse.json({
      success: true,
      data: {
        status: 'warm',
        duration_ms: duration,
        was_cold_start: isColdStart,
        model: modelId,
      }
    })

  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`[Chat Warmup] Error after ${duration}ms:`, error)

    // Return success anyway - container might be warming up, user can proceed
    // The actual chat will work once container is ready
    return NextResponse.json({
      success: true,
      data: {
        status: 'warming',
        duration_ms: duration,
        was_cold_start: true,
        error: 'Warmup in progress',
      }
    })
  }
}
