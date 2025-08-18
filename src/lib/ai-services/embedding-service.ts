/**
 * Embedding Service Implementation
 * Handles text embedding generation using LiteLLM endpoint
 */

import { IEmbeddingService } from './interfaces'
import { ProcessingError, ServiceHealth } from './types'
import { aiConfig } from '../config/ai-config'

export class EmbeddingService implements IEmbeddingService {
  private readonly endpoint: string
  private readonly modelId: string
  private readonly apiKey: string
  
  constructor() {
    this.endpoint = aiConfig.embedding.endpointUrl
    this.modelId = aiConfig.embedding.modelId
    this.apiKey = aiConfig.embedding.apiKey
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new ProcessingError('Empty text provided for embedding generation', {
        service: 'Embedding',
        retryable: false
      })
    }

    try {
      const requestBody = {
        model: this.modelId,
        input: text.trim(),
        encoding_format: "float"
      }

      console.log(`[Embedding] Generating embedding for text (${text.length} chars)`)

      const response = await fetch(`${this.endpoint}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new ProcessingError(
          `Embedding API request failed: ${response.status} ${response.statusText}`,
          {
            service: 'Embedding',
            endpoint: this.endpoint,
            statusCode: response.status,
            retryable: response.status >= 500 || response.status === 429
          }
        )
      }

      const result = await response.json()
      
      // Extract embedding from API response format
      const embedding = result.data?.[0]?.embedding
      
      if (!embedding || !Array.isArray(embedding)) {
        throw new ProcessingError('Invalid embedding response format', {
          service: 'Embedding',
          retryable: true
        })
      }

      console.log(`[Embedding] Generated embedding vector of length ${embedding.length}`)
      return embedding

    } catch (error) {
      console.error('[Embedding] Generation failed:', error)
      
      if (error instanceof ProcessingError) {
        throw error
      }
      
      throw new ProcessingError(
        `Embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          service: 'Embedding',
          retryable: false
        }
      )
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return []
    }

    // Filter out empty texts
    const validTexts = texts.filter(text => text && text.trim().length > 0)
    
    if (validTexts.length === 0) {
      return []
    }

    try {
      // For batch processing, we can send multiple texts at once
      const requestBody = {
        model: this.modelId,
        input: validTexts.map(text => text.trim()),
        encoding_format: "float"
      }

      console.log(`[Embedding] Generating embeddings for ${validTexts.length} texts`)

      const response = await fetch(`${this.endpoint}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new ProcessingError(
          `Batch embedding API request failed: ${response.status} ${response.statusText}`,
          {
            service: 'Embedding',
            endpoint: this.endpoint,
            statusCode: response.status,
            retryable: response.status >= 500 || response.status === 429
          }
        )
      }

      const result = await response.json()
      
      // Extract embeddings from API response format
      if (!result.data || !Array.isArray(result.data)) {
        throw new ProcessingError('Invalid batch embedding response format', {
          service: 'Embedding',
          retryable: true
        })
      }

      const embeddings = result.data.map((item: { embedding: number[] }) => item.embedding)
      
      // Validate all embeddings
      for (const embedding of embeddings) {
        if (!embedding || !Array.isArray(embedding)) {
          throw new ProcessingError('Invalid embedding in batch response', {
            service: 'Embedding',
            retryable: true
          })
        }
      }

      console.log(`[Embedding] Generated ${embeddings.length} embedding vectors`)
      return embeddings

    } catch (error) {
      console.error('[Embedding] Batch generation failed:', error)
      
      if (error instanceof ProcessingError) {
        throw error
      }
      
      // Fallback to individual processing
      console.log('[Embedding] Falling back to individual embedding generation')
      return this.generateEmbeddingsIndividually(validTexts)
    }
  }

  async checkHealth(): Promise<ServiceHealth> {
    const startTime = Date.now()
    
    try {
      // Test with a small embedding request
      const testText = "Health check test"
      
      const response = await fetch(`${this.endpoint}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          model: this.modelId,
          input: testText,
          encoding_format: "float"
        }),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      })
      
      const latency = Date.now() - startTime
      
      if (response.ok) {
        const result = await response.json()
        const hasValidEmbedding = result.data?.[0]?.embedding && Array.isArray(result.data[0].embedding)
        
        return {
          healthy: hasValidEmbedding,
          latency,
          lastCheck: new Date(),
          error: hasValidEmbedding ? undefined : 'Invalid response format'
        }
      } else {
        return {
          healthy: false,
          latency,
          lastCheck: new Date(),
          error: `HTTP ${response.status}: ${response.statusText}`
        }
      }
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  private async generateEmbeddingsIndividually(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = []
    
    for (const text of texts) {
      try {
        const embedding = await this.generateEmbedding(text)
        embeddings.push(embedding)
      } catch (error) {
        console.error(`[Embedding] Failed to generate embedding for text: ${text.substring(0, 100)}...`, error)
        // Continue with other texts, but this will result in fewer embeddings than texts
        throw error // Re-throw to maintain error handling consistency
      }
    }
    
    return embeddings
  }
}