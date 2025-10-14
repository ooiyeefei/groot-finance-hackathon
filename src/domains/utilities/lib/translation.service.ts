/**
 * Translation Service Layer
 *
 * Business logic for AI-powered translation:
 * - SEA-LION model integration for Southeast Asian languages
 * - Response cleaning and post-processing
 * - Multi-language support
 *
 * North Star Architecture:
 * - All business logic centralized in service layer
 * - API routes are thin wrappers handling HTTP concerns
 *
 * Languages Supported:
 * - English, Thai, Indonesian, Malay, Vietnamese
 */

// ===== TYPE DEFINITIONS =====

export interface TranslationRequest {
  text: string
  sourceLanguage: string
  targetLanguage: string
}

export interface TranslationResult {
  originalText: string
  translatedText: string
  sourceLanguage: string
  targetLanguage: string
}

// ===== CORE SERVICE FUNCTIONS =====

/**
 * Translate Text using SEA-LION Model
 *
 * Translates text between Southeast Asian languages using the SEA-LION AI model.
 * Includes advanced post-processing to remove reasoning artifacts.
 *
 * @param request - Translation request with text and language pair
 * @returns Translation result with cleaned text
 * @throws Error if translation fails or configuration is missing
 */
export async function translateText(request: TranslationRequest): Promise<TranslationResult> {
  const { text, sourceLanguage, targetLanguage } = request

  // Validate required fields
  if (!text || !sourceLanguage || !targetLanguage) {
    throw new Error('Missing required fields: text, sourceLanguage, targetLanguage')
  }

  // Validate SEA-LION configuration
  const SEALION_ENDPOINT_URL = process.env.SEALION_ENDPOINT_URL
  const SEALION_MODEL_ID = process.env.SEALION_MODEL_ID

  if (!SEALION_ENDPOINT_URL || !SEALION_MODEL_ID) {
    throw new Error('SEA-LION endpoint or model ID not configured')
  }

  // Ensure proper URL format
  let sealionUrl = SEALION_ENDPOINT_URL
  if (!sealionUrl.startsWith('http://') && !sealionUrl.startsWith('https://')) {
    sealionUrl = `https://${sealionUrl}`
  }

  // Remove trailing /v1 if present
  if (sealionUrl.endsWith('/v1')) {
    sealionUrl = sealionUrl.slice(0, -3)
  }

  // Create translation prompt
  const prompt = `You are a professional translator. Translate the following text from ${sourceLanguage} to ${targetLanguage}. Maintain the original meaning and context, especially for financial terms and amounts.

IMPORTANT: Respond with ONLY the translated text. Do not include any explanations, reasoning, commentary, or meta-text. Do not describe your translation process.

Source text (${sourceLanguage}):
${text}

Translation (${targetLanguage}):`

  // Call SEA-LION model
  console.log(`[Translation Service] Calling SEA-LION at: ${sealionUrl}/v1/completions`)
  const response = await fetch(`${sealionUrl}/v1/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: SEALION_MODEL_ID,
      prompt: prompt,
      max_tokens: 4000,
      temperature: 0.1,
      stop: ['</s>', '\n\nSource text', '\n\nTranslation']
    })
  })

  if (!response.ok) {
    throw new Error(`SEA-LION API error: ${response.status} ${response.statusText}`)
  }

  const result = await response.json()
  let translatedText = result.choices?.[0]?.text || result.choices?.[0]?.message?.content || 'Translation failed'

  // Clean the response
  if (translatedText && translatedText !== 'Translation failed') {
    translatedText = cleanTranslationResponse(translatedText)
  }

  return {
    originalText: text,
    translatedText: translatedText.trim(),
    sourceLanguage,
    targetLanguage
  }
}

/**
 * Clean Translation Response
 *
 * Removes reasoning artifacts and meta-text from LLM responses.
 * Handles both </think> tags and general reasoning patterns.
 *
 * @param text - Raw translation response
 * @returns Cleaned translation text
 */
function cleanTranslationResponse(text: string): string {
  // Handle </think> tag pattern
  if (text.includes('</think>')) {
    const parts = text.split('</think>')
    if (parts.length > 1) {
      return parts[1].trim()
    }
  }

  // Remove common LLM reasoning patterns
  let cleaned = text
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
  const lines = cleaned.split('\n').map((line: string) => line.trim()).filter((line: string) => line.length > 0)
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
      return cleanLines.join('\n')
    }
  }

  return cleaned
}
