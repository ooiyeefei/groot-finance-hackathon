/**
 * Vector Storage Service Implementation
 * Handles embedding storage and similarity search using Qdrant Cloud
 */

import { IVectorStorageService } from './interfaces'
import { ProcessingError, ServiceHealth } from './types'
import { aiConfig } from '../config/ai-config'

export class VectorStorageService implements IVectorStorageService {
  private readonly qdrantUrl: string
  private readonly apiKey: string
  private readonly collectionName: string
  
  constructor() {
    this.qdrantUrl = aiConfig.qdrant.url
    this.apiKey = aiConfig.qdrant.apiKey
    this.collectionName = aiConfig.qdrant.collectionName
  }

  async storeEmbedding(
    documentId: string,
    text: string,
    embedding: number[],
    metadata: Record<string, unknown>
  ): Promise<void> {
    try {
      // Ensure collection exists
      await this.ensureCollectionExists(embedding.length)
      
      // Prepare point for insertion
      const point = {
        id: documentId,
        vector: embedding,
        payload: {
          text: text.substring(0, 10000), // Limit text size for storage
          created_at: new Date().toISOString(),
          ...metadata
        }
      }

      console.log(`[Qdrant] Storing embedding for document ${documentId}`)

      const response = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify({
          points: [point]
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new ProcessingError(
          `Failed to store embedding: ${response.status} ${response.statusText}`,
          {
            service: 'Qdrant',
            endpoint: this.qdrantUrl,
            statusCode: response.status,
            retryable: response.status >= 500 || response.status === 429
          }
        )
      }

      const result = await response.json()
      
      if (result.status !== 'ok') {
        throw new ProcessingError('Qdrant storage operation failed', {
          service: 'Qdrant',
          retryable: true
        })
      }

      console.log(`[Qdrant] Successfully stored embedding for document ${documentId}`)

    } catch (error) {
      console.error(`[Qdrant] Failed to store embedding for document ${documentId}:`, error)
      
      if (error instanceof ProcessingError) {
        throw error
      }
      
      throw new ProcessingError(
        `Vector storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          service: 'Qdrant',
          retryable: false
        }
      )
    }
  }

  async searchSimilar(
    embedding: number[],
    limit: number = 10
  ): Promise<Array<{ id: string; score: number; metadata: Record<string, unknown> }>> {
    try {
      console.log(`[Qdrant] Searching for ${limit} similar documents`)

      const response = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify({
          vector: embedding,
          limit,
          with_payload: true,
          score_threshold: 0.3 // Minimum similarity threshold
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new ProcessingError(
          `Failed to search vectors: ${response.status} ${response.statusText}`,
          {
            service: 'Qdrant',
            endpoint: this.qdrantUrl,
            statusCode: response.status,
            retryable: response.status >= 500 || response.status === 429
          }
        )
      }

      const result = await response.json()
      
      if (result.status !== 'ok') {
        throw new ProcessingError('Qdrant search operation failed', {
          service: 'Qdrant',
          retryable: true
        })
      }

      // Transform results to expected format
      const results = (result.result || []).map((hit: { id: string | number; score: number; payload?: Record<string, unknown> }) => ({
        id: String(hit.id),
        score: hit.score,
        metadata: hit.payload || {}
      }))

      console.log(`[Qdrant] Found ${results.length} similar documents`)
      return results

    } catch (error) {
      console.error('[Qdrant] Similarity search failed:', error)
      
      if (error instanceof ProcessingError) {
        throw error
      }
      
      throw new ProcessingError(
        `Vector search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          service: 'Qdrant',
          retryable: false
        }
      )
    }
  }

  async checkHealth(): Promise<ServiceHealth> {
    const startTime = Date.now()
    
    try {
      // Check cluster info endpoint
      const response = await fetch(`${this.qdrantUrl}/cluster`, {
        method: 'GET',
        headers: {
          'api-key': this.apiKey
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      })
      
      const latency = Date.now() - startTime
      
      if (response.ok) {
        const clusterInfo = await response.json()
        const isHealthy = clusterInfo.status === 'ok'
        
        return {
          healthy: isHealthy,
          latency,
          lastCheck: new Date(),
          error: isHealthy ? undefined : 'Cluster not healthy'
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

  /**
   * Ensure the collection exists with proper configuration
   */
  private async ensureCollectionExists(vectorSize: number): Promise<void> {
    try {
      // Check if collection exists
      const checkResponse = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}`, {
        method: 'GET',
        headers: {
          'api-key': this.apiKey
        }
      })

      if (checkResponse.ok) {
        // Collection exists, verify configuration
        const collectionInfo = await checkResponse.json()
        const existingSize = collectionInfo.result?.config?.params?.vectors?.size
        
        if (existingSize && existingSize !== vectorSize) {
          console.warn(`[Qdrant] Collection vector size mismatch: expected ${vectorSize}, got ${existingSize}`)
        }
        
        return // Collection exists and is compatible
      }

      // Collection doesn't exist, create it
      console.log(`[Qdrant] Creating collection ${this.collectionName} with vector size ${vectorSize}`)

      const createResponse = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify({
          vectors: {
            size: vectorSize,
            distance: 'Cosine' // Use cosine similarity for text embeddings
          },
          optimizers_config: {
            default_segment_number: 2
          },
          replication_factor: 1
        })
      })

      if (!createResponse.ok) {
        const errorText = await createResponse.text()
        throw new ProcessingError(
          `Failed to create collection: ${createResponse.status} ${createResponse.statusText}`,
          {
            service: 'Qdrant',
            statusCode: createResponse.status,
            retryable: false
          }
        )
      }

      const createResult = await createResponse.json()
      
      if (createResult.status !== 'ok') {
        throw new ProcessingError('Failed to create Qdrant collection', {
          service: 'Qdrant',
          retryable: false
        })
      }

      console.log(`[Qdrant] Successfully created collection ${this.collectionName}`)

    } catch (error) {
      console.error('[Qdrant] Collection creation/check failed:', error)
      
      if (error instanceof ProcessingError) {
        throw error
      }
      
      throw new ProcessingError(
        `Collection management failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          service: 'Qdrant',
          retryable: false
        }
      )
    }
  }

  /**
   * Delete a document from the vector store
   */
  async deleteDocument(documentId: string): Promise<void> {
    try {
      console.log(`[Qdrant] Deleting document ${documentId}`)

      const response = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify({
          points: [documentId]
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new ProcessingError(
          `Failed to delete document: ${response.status} ${response.statusText}`,
          {
            service: 'Qdrant',
            statusCode: response.status,
            retryable: response.status >= 500
          }
        )
      }

      const result = await response.json()
      
      if (result.status !== 'ok') {
        throw new ProcessingError('Qdrant delete operation failed', {
          service: 'Qdrant',
          retryable: true
        })
      }

      console.log(`[Qdrant] Successfully deleted document ${documentId}`)

    } catch (error) {
      console.error(`[Qdrant] Failed to delete document ${documentId}:`, error)
      
      if (error instanceof ProcessingError) {
        throw error
      }
      
      throw new ProcessingError(
        `Document deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          service: 'Qdrant',
          retryable: false
        }
      )
    }
  }

  /**
   * SECURE similarity search with user_id filtering at Qdrant level
   * This prevents data leakage by filtering documents at the database level
   */
  async similaritySearchSecure(
    embedding: number[],
    userId: string,
    limit: number = 10,
    scoreThreshold: number = 0.3
  ): Promise<Array<{ id: string; score: number; payload?: Record<string, unknown> }>> {
    try {
      console.log(`[Qdrant] SECURE similarity search for user ${userId}: ${limit} documents with threshold ${scoreThreshold}`)

      const response = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}/points/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify({
          vector: embedding,
          limit,
          with_payload: true,
          score_threshold: scoreThreshold,
          // CRITICAL SECURITY FIX: Filter by user_id at Qdrant level
          filter: {
            must: [
              {
                key: "user_id",
                match: {
                  value: userId
                }
              }
            ]
          }
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new ProcessingError(
          `Failed to search vectors: ${response.status} ${response.statusText}`,
          {
            service: 'Qdrant',
            endpoint: this.qdrantUrl,
            statusCode: response.status,
            retryable: response.status >= 500 || response.status === 429
          }
        )
      }

      const result = await response.json()
      
      if (result.status !== 'ok') {
        throw new ProcessingError('Qdrant search operation failed', {
          service: 'Qdrant',
          retryable: true
        })
      }

      // Transform results to expected format for LangGraph agent
      const results = (result.result || []).map((hit: { id: string | number; score: number; payload?: Record<string, unknown> }) => ({
        id: String(hit.id),
        score: hit.score,
        payload: hit.payload || {}
      }))

      console.log(`[Qdrant] SECURE search found ${results.length} documents for user ${userId}`)
      return results

    } catch (error) {
      console.error(`[Qdrant] Secure similarity search failed for user ${userId}:`, error)
      
      if (error instanceof ProcessingError) {
        throw error
      }
      
      throw new ProcessingError(
        `Secure vector similarity search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          service: 'Qdrant',
          retryable: false
        }
      )
    }
  }

  /**
   * Similarity search with customizable threshold (for LangGraph agent compatibility)
   * @deprecated Use similaritySearchSecure() instead for security
   */
  async similaritySearch(
    embedding: number[],
    limit: number = 10,
    scoreThreshold: number = 0.3,
    collectionName?: string
  ): Promise<Array<{ id: string; score: number; payload?: Record<string, unknown> }>> {
    try {
      const targetCollection = collectionName || this.collectionName;
      console.log(`[Qdrant] Similarity search on collection "${targetCollection}" for ${limit} documents with threshold ${scoreThreshold}`)

      const response = await fetch(`${this.qdrantUrl}/collections/${targetCollection}/points/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify({
          vector: embedding,
          limit,
          with_payload: true,
          score_threshold: scoreThreshold
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new ProcessingError(
          `Failed to search vectors: ${response.status} ${response.statusText}`,
          {
            service: 'Qdrant',
            endpoint: this.qdrantUrl,
            statusCode: response.status,
            retryable: response.status >= 500 || response.status === 429
          }
        )
      }

      const result = await response.json()
      
      if (result.status !== 'ok') {
        throw new ProcessingError('Qdrant search operation failed', {
          service: 'Qdrant',
          retryable: true
        })
      }

      // Transform results to expected format for LangGraph agent
      const results = (result.result || []).map((hit: { id: string | number; score: number; payload?: Record<string, unknown> }) => ({
        id: String(hit.id),
        score: hit.score,
        payload: hit.payload || {}
      }))

      console.log(`[Qdrant] Similarity search found ${results.length} documents`)
      return results

    } catch (error) {
      console.error('[Qdrant] Similarity search failed:', error)
      
      if (error instanceof ProcessingError) {
        throw error
      }
      
      throw new ProcessingError(
        `Vector similarity search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          service: 'Qdrant',
          retryable: false
        }
      )
    }
  }

  /**
   * Search the PUBLIC regulatory knowledge base.
   * This is a separate, unsecured search against the 'regulatory_kb' collection.
   */
  async searchRegulatoryKb(
    embedding: number[],
    limit: number = 5,
    scoreThreshold: number = 0.3
  ): Promise<Array<{ id: string; score: number; payload?: Record<string, unknown> }>> {
    const regulatoryCollection = "regulatory_kb"; // HARDCODED for this specific function
    console.log(`[Qdrant] Searching REGULATORY KB for ${limit} documents with threshold ${scoreThreshold}`);

    try {
      const response = await fetch(`${this.qdrantUrl}/collections/${regulatoryCollection}/points/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify({
          vector: embedding,
          limit,
          with_payload: true,
          score_threshold: scoreThreshold
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ProcessingError(
          `Failed to search regulatory KB: ${response.status} ${response.statusText}`,
          {
            service: 'Qdrant',
            statusCode: response.status,
            retryable: response.status >= 500
          }
        );
      }

      const result = await response.json();
      if (result.status !== 'ok') {
        throw new ProcessingError('Qdrant regulatory search failed', { service: 'Qdrant', retryable: true });
      }

      const results = (result.result || []).map((hit: any) => ({
        id: String(hit.id),
        score: hit.score,
        payload: hit.payload || {}
      }));

      console.log(`[Qdrant] Found ${results.length} relevant regulatory documents.`);
      return results;

    } catch (error) {
      console.error('[Qdrant] Regulatory KB search failed:', error);
      if (error instanceof ProcessingError) throw error;
      throw new ProcessingError(
        `Regulatory KB search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { service: 'Qdrant', retryable: false }
      );
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(): Promise<{
    pointsCount: number
    segmentsCount: number
    vectorsCount: number
  }> {
    try {
      const response = await fetch(`${this.qdrantUrl}/collections/${this.collectionName}`, {
        method: 'GET',
        headers: {
          'api-key': this.apiKey
        }
      })

      if (!response.ok) {
        throw new ProcessingError(
          `Failed to get collection stats: ${response.status} ${response.statusText}`,
          {
            service: 'Qdrant',
            statusCode: response.status,
            retryable: true
          }
        )
      }

      const result = await response.json()
      const stats = result.result?.points_count || 0

      return {
        pointsCount: stats,
        segmentsCount: result.result?.segments_count || 0,
        vectorsCount: stats // Same as points count for this use case
      }

    } catch (error) {
      console.error('[Qdrant] Failed to get collection stats:', error)
      
      if (error instanceof ProcessingError) {
        throw error
      }
      
      return {
        pointsCount: 0,
        segmentsCount: 0,
        vectorsCount: 0
      }
    }
  }
}