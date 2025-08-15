import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { HfInference } from '@huggingface/inference'

// Initialize Hugging Face client
const hf = new HfInference(process.env.HUGGING_FACE_API_KEY)

// Translation model
const TRANSLATION_MODEL = 'aisingapore/Gemma-SEA-LION-v3-9B'

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

    // Create translation prompt
    const prompt = `Translate the following text from ${sourceLanguage} to ${targetLanguage}. Maintain the original meaning and context, especially for financial terms and amounts.

Source text (${sourceLanguage}):
${text}

Translation (${targetLanguage}):`

    // Call SEA-LION model for translation
    const response = await hf.textGeneration({
      model: TRANSLATION_MODEL,
      inputs: prompt,
      parameters: {
        max_new_tokens: 1000,
        temperature: 0.1,
        return_full_text: false,
        stop: ['</s>', '\n\nSource text', '\n\nTranslation']
      }
    })

    const translatedText = response.generated_text || 'Translation failed'

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