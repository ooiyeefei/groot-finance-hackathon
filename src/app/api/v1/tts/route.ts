/**
 * MiniMax TTS API Proxy
 *
 * Proxies text-to-speech requests to MiniMax API, keeping the API key server-side.
 * Returns MP3 audio as binary response.
 */

import { NextRequest, NextResponse } from 'next/server'

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY
const MINIMAX_GROUP_ID = process.env.MINIMAX_GROUP_ID

export async function POST(req: NextRequest) {
  if (!MINIMAX_API_KEY || !MINIMAX_GROUP_ID) {
    return NextResponse.json({ error: 'TTS not configured' }, { status: 503 })
  }

  const { text } = await req.json()

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  // Truncate to 10k chars (MiniMax limit)
  const truncated = text.slice(0, 10000)

  const response = await fetch(
    `https://api.minimax.io/v1/t2a_v2?GroupId=${MINIMAX_GROUP_ID}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'speech-02-hd',
        text: truncated,
        stream: false,
        voice_setting: {
          voice_id: 'English_Trustworth_Man',
          speed: 1.0,
          vol: 1,
          pitch: 0,
          emotion: 'neutral',
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1,
        },
        language_boost: 'English',
        output_format: 'hex',
      }),
    }
  )

  if (!response.ok) {
    console.error('[TTS] MiniMax API error:', response.status)
    return NextResponse.json({ error: 'TTS generation failed' }, { status: 502 })
  }

  const json = await response.json()

  if (json.base_resp?.status_code !== 0) {
    console.error('[TTS] MiniMax error:', json.base_resp?.status_msg)
    return NextResponse.json({ error: json.base_resp?.status_msg || 'TTS error' }, { status: 502 })
  }

  // Convert hex-encoded audio to binary buffer
  const audioBuffer = Buffer.from(json.data.audio, 'hex')

  return new NextResponse(audioBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length.toString(),
    },
  })
}
