/**
 * AI Processing Configuration
 * Centralized configuration for all AI processing endpoints and models
 * Uses lazy initialization to avoid build-time environment variable errors
 */

export interface AIConfig {
  ocr: {
    endpointUrl: string
    modelName: string
  }
  embedding: {
    endpointUrl: string
    modelId: string
    apiKey: string
  }
  chat: {
    endpointUrl: string
    modelId: string
    apiKey?: string
  }
  gemini: {
    apiKey: string
    model: string
  }
  qdrant: {
    url: string
    apiKey: string
    collectionName: string
  }
}

// Cached config instance
let _aiConfig: AIConfig | null = null

// Validate required environment variables
function validateConfig(): void {
  const baseRequired = [
    'OCR_ENDPOINT_URL',
    'OCR_MODEL_NAME',
    'EMBEDDING_ENDPOINT_URL',
    'EMBEDDING_MODEL_ID',
    'EMBEDDING_API_KEY',
    'CHAT_MODEL_ENDPOINT_URL',
    'CHAT_MODEL_MODEL_ID',
    'QDRANT_URL',
    'QDRANT_API_KEY'
  ]

  // Only require Gemini API key if USE_GEMINI is true
  const required = process.env.USE_GEMINI === 'true'
    ? [...baseRequired, 'GEMINI_API_KEY']
    : baseRequired

  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    console.error('\n🚨 AI Configuration Error:')
    console.error('Missing required environment variables:')
    missing.forEach(key => console.error(`  - ${key}`))
    console.error('\nPlease add these variables to your .env.local file.')
    console.error('Without these, document processing will fail.\n')
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

/**
 * Get AI configuration with lazy initialization
 * Only validates and loads config when actually used at runtime
 */
export function getAIConfig(): AIConfig {
  if (_aiConfig) {
    return _aiConfig
  }

  // Skip validation during Next.js build phase
  // NEXT_PHASE is set during build to 'phase-production-build'
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'

  // Only validate on server-side and when actually needed at runtime (not build time)
  if (typeof window === 'undefined' && !isBuildPhase) {
    if (process.env.NODE_ENV === 'production') {
      validateConfig()
    } else {
      // In development, warn but don't fail
      try {
        validateConfig()
      } catch (error) {
        console.warn('⚠️  AI Configuration Warning (development mode):', error instanceof Error ? error.message : error)
        console.warn('Document processing may fail until environment variables are properly configured.')
      }
    }
  }

  _aiConfig = {
    ocr: {
      endpointUrl: process.env.OCR_ENDPOINT_URL || '',
      modelName: process.env.OCR_MODEL_NAME || ''
    },
    embedding: {
      endpointUrl: process.env.EMBEDDING_ENDPOINT_URL || '',
      modelId: process.env.EMBEDDING_MODEL_ID || '',
      apiKey: process.env.EMBEDDING_API_KEY || ''
    },
    chat: {
      endpointUrl: process.env.CHAT_MODEL_ENDPOINT_URL || '',
      modelId: process.env.CHAT_MODEL_MODEL_ID || '',
      apiKey: process.env.CHAT_MODEL_API_KEY
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    },
    qdrant: {
      url: process.env.QDRANT_URL || '',
      apiKey: process.env.QDRANT_API_KEY || '',
      collectionName: process.env.QDRANT_COLLECTION_NAME || 'financial_documents'
    }
  }

  return _aiConfig
}

/**
 * @deprecated Use getAIConfig() instead for lazy initialization
 * This export is kept for backwards compatibility but should be migrated
 */
export const aiConfig: AIConfig = {
  get ocr() { return getAIConfig().ocr },
  get embedding() { return getAIConfig().embedding },
  get chat() { return getAIConfig().chat },
  get gemini() { return getAIConfig().gemini },
  get qdrant() { return getAIConfig().qdrant }
}

// Configuration health check
export function checkAIConfigHealth(): { healthy: boolean; issues: string[] } {
  const issues: string[] = []

  try {
    validateConfig()
  } catch (error) {
    issues.push(error instanceof Error ? error.message : 'Unknown configuration error')
  }

  const config = getAIConfig()

  // Validate URL formats
  try {
    if (config.ocr.endpointUrl) new URL(config.ocr.endpointUrl)
    if (config.embedding.endpointUrl) new URL(config.embedding.endpointUrl)
    if (config.chat.endpointUrl) new URL(config.chat.endpointUrl)
    if (config.qdrant.url) new URL(config.qdrant.url)
  } catch (error) {
    issues.push('Invalid URL format in AI endpoint configuration')
  }

  return {
    healthy: issues.length === 0,
    issues
  }
}
