/**
 * AI Processing Configuration
 * Centralized configuration for all AI processing endpoints and models
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
  seaLion: {
    endpointUrl: string
    modelId: string
  }
  qdrant: {
    url: string
    apiKey: string
    collectionName: string
  }
}

// Validate required environment variables
function validateConfig(): void {
  const required = [
    'OCR_ENDPOINT_URL',
    'OCR_MODEL_NAME', 
    'EMBEDDING_ENDPOINT_URL',
    'EMBEDDING_MODEL_ID',
    'EMBEDDING_API_KEY',
    'SEALION_ENDPOINT_URL',
    'SEALION_MODEL_ID',
    'QDRANT_URL',
    'QDRANT_API_KEY'
  ]

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

// Initialize and export configuration (skip validation in development mode if variables are missing)
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

export const aiConfig: AIConfig = {
  ocr: {
    endpointUrl: process.env.OCR_ENDPOINT_URL!,
    modelName: process.env.OCR_MODEL_NAME!
  },
  embedding: {
    endpointUrl: process.env.EMBEDDING_ENDPOINT_URL!,
    modelId: process.env.EMBEDDING_MODEL_ID!,
    apiKey: process.env.EMBEDDING_API_KEY!
  },
  seaLion: {
    endpointUrl: process.env.SEALION_ENDPOINT_URL!,
    modelId: process.env.SEALION_MODEL_ID!
  },
  qdrant: {
    url: process.env.QDRANT_URL!,
    apiKey: process.env.QDRANT_API_KEY!,
    collectionName: process.env.QDRANT_COLLECTION_NAME || 'financial_documents'
  }
}

// Configuration health check
export function checkAIConfigHealth(): { healthy: boolean; issues: string[] } {
  const issues: string[] = []
  
  try {
    validateConfig()
  } catch (error) {
    issues.push(error instanceof Error ? error.message : 'Unknown configuration error')
  }
  
  // Validate URL formats
  try {
    new URL(aiConfig.ocr.endpointUrl)
    new URL(aiConfig.embedding.endpointUrl)
    new URL(aiConfig.seaLion.endpointUrl)
    new URL(aiConfig.qdrant.url)
  } catch (error) {
    issues.push('Invalid URL format in AI endpoint configuration')
  }
  
  return {
    healthy: issues.length === 0,
    issues
  }
}