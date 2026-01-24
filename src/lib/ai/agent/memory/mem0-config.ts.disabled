/**
 * Mem0 Configuration (T011)
 *
 * Supports two modes:
 * 1. Mem0 Cloud - Uses MEM0_API_KEY for hosted service (recommended)
 * 2. Direct Qdrant - Falls back to simple vector-based memory (no graph features)
 *
 * Multi-tenant isolation via app_id=businessId, user_id=clerkUserId
 */

import { getAIConfig } from '@/lib/ai/config/ai-config'

/**
 * Mem0 Cloud configuration (uses hosted service)
 */
export interface Mem0CloudConfig {
  mode: 'cloud'
  apiKey: string
  host?: string
  organizationName?: string
  projectName?: string
}

/**
 * Direct Qdrant configuration (fallback mode without graph features)
 */
export interface Mem0DirectConfig {
  mode: 'direct'
  qdrant: {
    url: string
    apiKey: string
    collectionName: string
  }
  embedding: {
    apiKey: string
    endpointUrl: string
    modelId: string
  }
}

export type Mem0Config = Mem0CloudConfig | Mem0DirectConfig

// Cached config instance
let _mem0Config: Mem0Config | null = null

/**
 * Get Mem0 configuration with lazy initialization
 *
 * Priority:
 * 1. If MEM0_API_KEY is set, use Mem0 Cloud
 * 2. Otherwise, use direct Qdrant for simple vector memory
 */
export function getMem0Config(): Mem0Config {
  if (_mem0Config) {
    return _mem0Config
  }

  const mem0ApiKey = process.env.MEM0_API_KEY

  if (mem0ApiKey) {
    // Mem0 Cloud mode - full features including graph relationships
    _mem0Config = {
      mode: 'cloud',
      apiKey: mem0ApiKey,
      host: process.env.MEM0_HOST || undefined,
      organizationName: process.env.MEM0_ORG_NAME || undefined,
      projectName: process.env.MEM0_PROJECT_NAME || undefined
    }
    console.log('[Mem0Config] Using Mem0 Cloud mode')
  } else {
    // Direct Qdrant mode - simple vector memory without graph
    const aiConfig = getAIConfig()
    _mem0Config = {
      mode: 'direct',
      qdrant: {
        url: aiConfig.qdrant.url,
        apiKey: aiConfig.qdrant.apiKey,
        collectionName: process.env.QDRANT_MEMORIES_COLLECTION || 'user_memories'
      },
      embedding: {
        apiKey: aiConfig.embedding.apiKey,
        endpointUrl: aiConfig.embedding.endpointUrl,
        modelId: aiConfig.embedding.modelId
      }
    }
    console.log('[Mem0Config] Using direct Qdrant mode (no graph features)')
  }

  return _mem0Config
}

/**
 * Check if Mem0 is properly configured and available
 * Returns status and any configuration issues
 */
export function checkMem0ConfigHealth(): { available: boolean; issues: string[]; mode: 'cloud' | 'direct' | 'unavailable' } {
  const issues: string[] = []

  const mem0ApiKey = process.env.MEM0_API_KEY

  if (mem0ApiKey) {
    // Mem0 Cloud mode - just need the API key
    return {
      available: true,
      issues: [],
      mode: 'cloud'
    }
  }

  // Direct Qdrant mode - check Qdrant and embedding config
  const aiConfig = getAIConfig()

  if (!aiConfig.qdrant.url) {
    issues.push('Qdrant URL not configured')
  }
  if (!aiConfig.qdrant.apiKey) {
    issues.push('Qdrant API key not configured')
  }
  if (!aiConfig.embedding.endpointUrl) {
    issues.push('Embedding endpoint URL not configured')
  }
  if (!aiConfig.embedding.apiKey) {
    issues.push('Embedding API key not configured')
  }

  return {
    available: issues.length === 0,
    issues,
    mode: issues.length === 0 ? 'direct' : 'unavailable'
  }
}

/**
 * Reset cached config (useful for testing)
 */
export function resetMem0Config(): void {
  _mem0Config = null
}
