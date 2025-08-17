import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

// SEA-LION model configuration
const SEALION_ENDPOINT_URL = process.env.SEALION_ENDPOINT_URL
const SEALION_MODEL_ID = process.env.SEALION_MODEL_ID

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

    const body = await request.json()
    const { text, sourceLanguage, targetLanguage } = body

    if (!text || !sourceLanguage || !targetLanguage) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: text, sourceLanguage, targetLanguage' },
        { status: 400 }
      )
    }

    // Validate SEA-LION configuration
    if (!SEALION_ENDPOINT_URL || !SEALION_MODEL_ID) {
      throw new Error('SEA-LION endpoint or model ID not configured')
    }

    // Create translation prompt with strict instructions
    const prompt = `You are a professional translator. Translate the following text from ${sourceLanguage} to ${targetLanguage}. Maintain the original meaning and context, especially for financial terms and amounts.

IMPORTANT: Respond with ONLY the translated text. Do not include any explanations, reasoning, commentary, or meta-text. Do not describe your translation process.

Source text (${sourceLanguage}):
${text}

Translation (${targetLanguage}):`

    // Call SEA-LION model directly via endpoint
    const response = await fetch(`${SEALION_ENDPOINT_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: SEALION_MODEL_ID,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 4000,
        temperature: 0.1,
        stop: ['</s>', '\n\nSource text', '\n\nTranslation']
      })
    })

    if (!response.ok) {
      throw new Error(`SEA-LION API error: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    let translatedText = result.choices?.[0]?.message?.content || 'Translation failed'

    // Clean the response to extract only the final translation
    if (translatedText && translatedText !== 'Translation failed') {
      // SEA-LION model often includes reasoning followed by </think> and then the actual translation
      if (translatedText.includes('</think>')) {
        const parts = translatedText.split('</think>')
        if (parts.length > 1) {
          translatedText = parts[1].trim()
        }
      } else {
        // Fallback: Remove common LLM reasoning patterns for cases without </think>
        translatedText = translatedText
          .replace(/^(Okay,?\s*I need to translate.*?\.\s*)/i, '')
          .replace(/^(Let me start by.*?\.\s*)/i, '')
          .replace(/^(First,?\s*.*?\.\s*)/i, '')
          .replace(/^(The.*?section.*?\.\s*)/i, '')
          .replace(/^(That's straightforward\.?\s*)/i, '')
          .replace(/^(Next,?\s*.*?\.\s*)/i, '')
          .replace(/Translation \([^)]+\):\s*/i, '')
          .replace(/^.*?Translation \([^)]+\):\s*/i, '')
          .trim()

        // Advanced filtering for remaining reasoning text
        const lines = translatedText.split('\n').map((line: string) => line.trim()).filter((line: string) => line.length > 0)
        if (lines.length > 1) {
          const cleanLines = lines.filter((line: string) => {
            const isReasoningLine = (
              line.toLowerCase().includes('translate') ||
              line.toLowerCase().includes('keeping') ||
              line.toLowerCase().includes('accurate') ||
              line.toLowerCase().includes('section') ||
              line.toLowerCase().includes('straightforward') ||
              line.toLowerCase().includes('should stay the same') ||
              line.toLowerCase().includes('becomes') ||
              line.toLowerCase().includes('needs to be') ||
              line.toLowerCase().includes('sounds natural') ||
              line.toLowerCase().includes('written as') ||
              line.toLowerCase().includes('calculation') ||
              line.toLowerCase().includes('formatted') ||
              line.toLowerCase().includes('let me') ||
              line.toLowerCase().includes('i need') ||
              line.toLowerCase().includes('ensure') ||
              line.toLowerCase().includes('check that') ||
              line.length < 3 ||
              /^(next|first|now|for the|subtotal:|payment terms:)/i.test(line)
            )
            return !isReasoningLine
          })
          
          if (cleanLines.length > 0) {
            translatedText = cleanLines.join('\n')
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        originalText: text,
        translatedText: translatedText.trim(),
        sourceLanguage,
        targetLanguage
      }
    })

  } catch (error) {
    console.error('Translation error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Translation failed. Please try again.' 
      },
      { status: 500 }
    )
  }
}