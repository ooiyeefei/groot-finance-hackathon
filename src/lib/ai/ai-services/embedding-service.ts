/**
 * Embedding Service Implementation
 * Uses Gemini embedding-001 with task_type for optimized embeddings.
 *
 * Task types improve retrieval quality:
 * - RETRIEVAL_QUERY: for search queries (user questions)
 * - RETRIEVAL_DOCUMENT: for document indexing (KB ingestion)
 * - SEMANTIC_SIMILARITY: for text comparison
 */

import { IEmbeddingService, EmbeddingTaskType } from './interfaces'
import { ProcessingError, ServiceHealth } from './types'
import { aiConfig } from '../config/ai-config'

export class EmbeddingService implements IEmbeddingService {
  private readonly apiKey: string
  private readonly modelId: string

  constructor() {
    this.apiKey = aiConfig.embedding.apiKey
    this.modelId = aiConfig.embedding.modelId // "gemini-embedding-001"
  }

  async generateEmbedding(text: string, taskType?: EmbeddingTaskType): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new ProcessingError('Empty text provided for embedding generation', {
        service: 'Embedding',
        retryable: false
      })
    }

    try {
      const effectiveTaskType = taskType || 'RETRIEVAL_QUERY' // Default to query for backward compat
      console.log(`[Embedding] Generating ${effectiveTaskType} embedding for text (${text.length} chars)`)

      // Use Gemini native API for task_type support
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.modelId}:embedContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: { parts: [{ text: text.trim() }] },
            taskType: effectiveTaskType,
          })
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new ProcessingError(
          `Gemini Embedding API error: ${response.status} ${response.statusText} — ${errorText.slice(0, 200)}`,
          {
            service: 'Embedding',
            statusCode: response.status,
            retryable: response.status >= 500 || response.status === 429
          }
        )
      }

      const result = await response.json()
      const embedding = result.embedding?.values

      if (!embedding || !Array.isArray(embedding)) {
        throw new ProcessingError('Invalid Gemini embedding response format', {
          service: 'Embedding',
          retryable: true
        })
      }

      console.log(`[Embedding] Generated ${effectiveTaskType} vector of length ${embedding.length}`)
      return embedding

    } catch (error) {
      console.error('[Embedding] Generation failed:', error)
      if (error instanceof ProcessingError) throw error
      throw new ProcessingError(
        `Embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { service: 'Embedding', retryable: false }
      )
    }
  }

  async generateEmbeddings(texts: string[], taskType?: EmbeddingTaskType): Promise<number[][]> {
    if (!texts || texts.length === 0) return []

    const validTexts = texts.filter(text => text && text.trim().length > 0)
    if (validTexts.length === 0) return []

    const effectiveTaskType = taskType || 'RETRIEVAL_DOCUMENT'

    try {
      // Gemini batch embedding via batchEmbedContents
      console.log(`[Embedding] Batch generating ${effectiveTaskType} embeddings for ${validTexts.length} texts`)

      const requests = validTexts.map(text => ({
        model: `models/${this.modelId}`,
        content: { parts: [{ text: text.trim() }] },
        taskType: effectiveTaskType,
      }))

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.modelId}:batchEmbedContents?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests })
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new ProcessingError(
          `Gemini batch embedding error: ${response.status} — ${errorText.slice(0, 200)}`,
          { service: 'Embedding', retryable: response.status >= 500 }
        )
      }

      const result = await response.json()
      const embeddings = result.embeddings?.map(
        (e: { values: number[] }) => e.values
      )

      if (!embeddings || !Array.isArray(embeddings)) {
        throw new ProcessingError('Invalid batch embedding response', {
          service: 'Embedding', retryable: true
        })
      }

      console.log(`[Embedding] Generated ${embeddings.length} ${effectiveTaskType} vectors`)
      return embeddings

    } catch (error) {
      console.error('[Embedding] Batch generation failed:', error)
      if (error instanceof ProcessingError) throw error

      // Fallback to individual processing
      console.log('[Embedding] Falling back to individual embedding generation')
      const embeddings: number[][] = []
      for (const text of validTexts) {
        const embedding = await this.generateEmbedding(text, effectiveTaskType)
        embeddings.push(embedding)
      }
      return embeddings
    }
  }

  async checkHealth(): Promise<ServiceHealth> {
    const startTime = Date.now()

    try {
      const embedding = await this.generateEmbedding('Health check test', 'RETRIEVAL_QUERY')
      const latency = Date.now() - startTime

      return {
        healthy: embedding.length > 0,
        latency,
        lastCheck: new Date(),
        error: embedding.length > 0 ? undefined : 'Empty embedding returned'
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
}
