/**
 * Mem0 Memory Service (T012)
 *
 * Provides memory operations with two modes:
 * 1. Mem0 Cloud - Full features via mem0ai npm package
 * 2. Direct Qdrant - Simple vector-based memory (fallback)
 *
 * Operations:
 * - addConversationMemories: Extract and store memories from conversations
 * - searchMemories: Semantic search for relevant memories
 * - getAllUserMemories: Retrieve all memories for a user
 * - deleteMemory: Remove a specific memory
 *
 * Multi-tenant isolation via app_id=businessId, user_id=clerkUserId
 */

import { getMem0Config, checkMem0ConfigHealth, type Mem0CloudConfig, type Mem0DirectConfig } from './mem0-config'

// Type definitions for memory operations
export interface Memory {
  id: string
  memory: string
  user_id: string
  hash?: string
  metadata?: Record<string, unknown>
  categories?: string[]
  created_at: string
  updated_at?: string
  score?: number
}

export interface AddMemoryResult {
  results: Array<{
    id: string
    memory: string
    event: 'ADD' | 'UPDATE' | 'DELETE' | 'NONE'
  }>
}

export interface SearchResult {
  results: Memory[]
}

export interface GetAllResult {
  results: Memory[]
}

// Message format for conversation input
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/**
 * Abstract memory client interface
 */
interface MemoryClient {
  add(messages: ConversationMessage[], options: Record<string, unknown>): Promise<AddMemoryResult>
  search(query: string, options: Record<string, unknown>): Promise<SearchResult>
  getAll(options: Record<string, unknown>): Promise<GetAllResult>
  get(memoryId: string): Promise<Memory>
  delete(memoryId: string): Promise<{ message: string }>
}

/**
 * Mem0 Cloud client wrapper
 */
class Mem0CloudClient implements MemoryClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any

  constructor(config: Mem0CloudConfig) {
    // Will be initialized lazily
    this.initClient(config)
  }

  private async initClient(config: Mem0CloudConfig): Promise<void> {
    const mem0Module = await import('mem0ai')
    const MemoryClient = mem0Module.default || mem0Module.MemoryClient
    this.client = new MemoryClient({
      apiKey: config.apiKey,
      host: config.host,
      organizationName: config.organizationName,
      projectName: config.projectName
    })
  }

  async add(messages: ConversationMessage[], options: Record<string, unknown>): Promise<AddMemoryResult> {
    if (!this.client) await this.waitForClient()
    const result = await this.client.add(messages, options)
    return { results: result || [] }
  }

  async search(query: string, options: Record<string, unknown>): Promise<SearchResult> {
    if (!this.client) await this.waitForClient()
    const result = await this.client.search(query, options)
    return { results: result || [] }
  }

  async getAll(options: Record<string, unknown>): Promise<GetAllResult> {
    if (!this.client) await this.waitForClient()
    const result = await this.client.getAll(options)
    return { results: result || [] }
  }

  async get(memoryId: string): Promise<Memory> {
    if (!this.client) await this.waitForClient()
    return this.client.get(memoryId)
  }

  async delete(memoryId: string): Promise<{ message: string }> {
    if (!this.client) await this.waitForClient()
    return this.client.delete(memoryId)
  }

  private async waitForClient(): Promise<void> {
    // Wait for client initialization
    let attempts = 0
    while (!this.client && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100))
      attempts++
    }
    if (!this.client) {
      throw new Error('Mem0 Cloud client failed to initialize')
    }
  }
}

/**
 * Direct Qdrant client for simple vector memory
 * This is a fallback when Mem0 Cloud is not configured
 */
class DirectQdrantClient implements MemoryClient {
  private config: Mem0DirectConfig
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private qdrantClient: any = null

  constructor(config: Mem0DirectConfig) {
    this.config = config
  }

  private async getQdrantClient() {
    if (!this.qdrantClient) {
      const { QdrantClient } = await import('@qdrant/js-client-rest')
      this.qdrantClient = new QdrantClient({
        url: this.config.qdrant.url,
        apiKey: this.config.qdrant.apiKey
      })
      // Ensure collection exists
      await this.ensureCollection()
    }
    return this.qdrantClient
  }

  private async ensureCollection(): Promise<void> {
    try {
      const collections = await this.qdrantClient.getCollections()
      const exists = collections.collections.some(
        (c: { name: string }) => c.name === this.config.qdrant.collectionName
      )
      if (!exists) {
        await this.qdrantClient.createCollection(this.config.qdrant.collectionName, {
          vectors: {
            size: 1536, // text-embedding-3-small dimension
            distance: 'Cosine'
          }
        })
        console.log(`[DirectQdrant] Created collection: ${this.config.qdrant.collectionName}`)
      }
    } catch (error) {
      console.warn('[DirectQdrant] Could not ensure collection exists:', error)
    }
  }

  private async getEmbedding(text: string): Promise<number[]> {
    const response = await fetch(this.config.embedding.endpointUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.embedding.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.embedding.modelId,
        input: text
      })
    })

    if (!response.ok) {
      throw new Error(`Embedding request failed: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data[0].embedding
  }

  async add(messages: ConversationMessage[], options: Record<string, unknown>): Promise<AddMemoryResult> {
    const client = await this.getQdrantClient()
    const results: AddMemoryResult['results'] = []

    // Simple approach: store each message as a memory
    for (const message of messages) {
      if (message.role === 'user' || message.role === 'assistant') {
        const id = crypto.randomUUID()
        const embedding = await this.getEmbedding(message.content)

        await client.upsert(this.config.qdrant.collectionName, {
          wait: true,
          points: [{
            id,
            vector: embedding,
            payload: {
              memory: message.content,
              role: message.role,
              user_id: options.user_id as string,
              app_id: options.app_id as string,
              metadata: options.metadata,
              created_at: new Date().toISOString()
            }
          }]
        })

        results.push({
          id,
          memory: message.content,
          event: 'ADD'
        })
      }
    }

    return { results }
  }

  async search(query: string, options: Record<string, unknown>): Promise<SearchResult> {
    const client = await this.getQdrantClient()
    const embedding = await this.getEmbedding(query)

    const searchResult = await client.search(this.config.qdrant.collectionName, {
      vector: embedding,
      limit: (options.limit as number) || 10,
      filter: {
        must: [
          { key: 'user_id', match: { value: options.user_id as string } },
          { key: 'app_id', match: { value: options.app_id as string } }
        ]
      }
    })

    const memories: Memory[] = searchResult.map((result: { id: string; score: number; payload: Record<string, unknown> }) => ({
      id: String(result.id),
      memory: result.payload.memory as string,
      user_id: result.payload.user_id as string,
      created_at: result.payload.created_at as string,
      metadata: result.payload.metadata as Record<string, unknown>,
      score: result.score
    }))

    return { results: memories }
  }

  async getAll(options: Record<string, unknown>): Promise<GetAllResult> {
    const client = await this.getQdrantClient()

    const scrollResult = await client.scroll(this.config.qdrant.collectionName, {
      filter: {
        must: [
          { key: 'user_id', match: { value: options.user_id as string } },
          { key: 'app_id', match: { value: options.app_id as string } }
        ]
      },
      limit: 100,
      with_payload: true
    })

    const memories: Memory[] = scrollResult.points.map((point: { id: string; payload: Record<string, unknown> }) => ({
      id: String(point.id),
      memory: point.payload.memory as string,
      user_id: point.payload.user_id as string,
      created_at: point.payload.created_at as string,
      metadata: point.payload.metadata as Record<string, unknown>
    }))

    return { results: memories }
  }

  async get(memoryId: string): Promise<Memory> {
    const client = await this.getQdrantClient()

    const points = await client.retrieve(this.config.qdrant.collectionName, {
      ids: [memoryId],
      with_payload: true
    })

    if (!points || points.length === 0) {
      throw new Error(`Memory not found: ${memoryId}`)
    }

    const point = points[0]
    return {
      id: String(point.id),
      memory: point.payload.memory as string,
      user_id: point.payload.user_id as string,
      created_at: point.payload.created_at as string,
      metadata: point.payload.metadata as Record<string, unknown>
    }
  }

  async delete(memoryId: string): Promise<{ message: string }> {
    const client = await this.getQdrantClient()

    await client.delete(this.config.qdrant.collectionName, {
      wait: true,
      points: [memoryId]
    })

    return { message: `Deleted memory ${memoryId}` }
  }
}

/**
 * Memory service wrapper
 * Handles initialization and provides graceful degradation when memory is unavailable
 */
class Mem0Service {
  private client: MemoryClient | null = null
  private initialized = false
  private initError: string | null = null
  private mode: 'cloud' | 'direct' | 'unavailable' = 'unavailable'

  /**
   * Initialize memory client lazily on first use
   * This allows the app to run even if memory is not configured
   */
  private async initialize(): Promise<boolean> {
    if (this.initialized) {
      return this.client !== null
    }

    // Check configuration health first
    const health = checkMem0ConfigHealth()
    if (!health.available) {
      this.initError = `Memory not available: ${health.issues.join(', ')}`
      console.warn(`[Mem0Service] ${this.initError}`)
      this.initialized = true
      this.mode = 'unavailable'
      return false
    }

    try {
      const config = getMem0Config()

      if (config.mode === 'cloud') {
        this.client = new Mem0CloudClient(config)
        this.mode = 'cloud'
        console.log('[Mem0Service] Initialized with Mem0 Cloud')
      } else {
        this.client = new DirectQdrantClient(config)
        this.mode = 'direct'
        console.log('[Mem0Service] Initialized with Direct Qdrant')
      }

      this.initialized = true
      return true
    } catch (error) {
      this.initError = error instanceof Error ? error.message : 'Unknown initialization error'
      console.error(`[Mem0Service] Failed to initialize: ${this.initError}`)
      this.initialized = true
      this.mode = 'unavailable'
      return false
    }
  }

  /**
   * Add memories from a conversation
   * Mem0 Cloud automatically extracts facts and deduplicates
   * Direct mode stores messages as-is
   *
   * @param messages - Array of conversation messages
   * @param userId - Clerk user ID for memory isolation
   * @param businessId - Business ID for multi-tenant isolation
   * @param metadata - Optional metadata to attach to memories
   */
  async addConversationMemories(
    messages: ConversationMessage[],
    userId: string,
    businessId: string,
    metadata?: Record<string, unknown>
  ): Promise<AddMemoryResult | null> {
    const isReady = await this.initialize()
    if (!isReady || !this.client) {
      console.warn('[Mem0Service] Cannot add memories - service not available')
      return null
    }

    try {
      const result = await this.client.add(messages, {
        user_id: userId,
        app_id: businessId,
        metadata: {
          ...metadata,
          source: 'conversation',
          timestamp: new Date().toISOString()
        }
      })

      console.log(`[Mem0Service] Added ${result.results?.length || 0} memories for user ${userId}`)
      return result
    } catch (error) {
      console.error('[Mem0Service] Error adding memories:', error)
      return null
    }
  }

  /**
   * Search for relevant memories using semantic similarity
   *
   * @param query - Search query text
   * @param userId - Clerk user ID for memory isolation
   * @param businessId - Business ID for multi-tenant isolation
   * @param limit - Maximum number of results (default: 10)
   */
  async searchMemories(
    query: string,
    userId: string,
    businessId: string,
    limit: number = 10,
    threshold: number = 0.7  // Similarity threshold (0.0-1.0), default 0.7 per research.md
  ): Promise<Memory[]> {
    const isReady = await this.initialize()
    if (!isReady || !this.client) {
      console.warn('[Mem0Service] Cannot search memories - service not available')
      return []
    }

    try {
      // Fetch more results than limit to account for threshold filtering
      const fetchLimit = Math.max(limit * 2, 20)

      const result = await this.client.search(query, {
        user_id: userId,
        app_id: businessId,
        limit: fetchLimit
      })

      // Filter by similarity threshold and limit results
      const filtered = (result.results || [])
        .filter(memory => (memory.score !== undefined && memory.score >= threshold))
        .slice(0, limit)

      console.log(`[Mem0Service] Found ${result.results?.length || 0} memories, ${filtered.length} above threshold ${threshold}`)
      return filtered
    } catch (error) {
      console.error('[Mem0Service] Error searching memories:', error)
      return []
    }
  }

  /**
   * Get all memories for a user
   *
   * @param userId - Clerk user ID for memory isolation
   * @param businessId - Business ID for multi-tenant isolation
   */
  async getAllUserMemories(
    userId: string,
    businessId: string
  ): Promise<Memory[]> {
    const isReady = await this.initialize()
    if (!isReady || !this.client) {
      console.warn('[Mem0Service] Cannot get memories - service not available')
      return []
    }

    try {
      const result = await this.client.getAll({
        user_id: userId,
        app_id: businessId
      })

      console.log(`[Mem0Service] Retrieved ${result.results?.length || 0} memories for user ${userId}`)
      return result.results || []
    } catch (error) {
      console.error('[Mem0Service] Error getting all memories:', error)
      return []
    }
  }

  /**
   * Delete a specific memory by ID
   *
   * @param memoryId - The ID of the memory to delete
   */
  async deleteMemory(memoryId: string): Promise<boolean> {
    const isReady = await this.initialize()
    if (!isReady || !this.client) {
      console.warn('[Mem0Service] Cannot delete memory - service not available')
      return false
    }

    try {
      await this.client.delete(memoryId)
      console.log(`[Mem0Service] Deleted memory ${memoryId}`)
      return true
    } catch (error) {
      console.error('[Mem0Service] Error deleting memory:', error)
      return false
    }
  }

  /**
   * Get a specific memory by ID
   *
   * @param memoryId - The ID of the memory to retrieve
   */
  async getMemory(memoryId: string): Promise<Memory | null> {
    const isReady = await this.initialize()
    if (!isReady || !this.client) {
      console.warn('[Mem0Service] Cannot get memory - service not available')
      return null
    }

    try {
      return await this.client.get(memoryId)
    } catch (error) {
      console.error('[Mem0Service] Error getting memory:', error)
      return null
    }
  }

  /**
   * Check if memory service is available
   */
  async isAvailable(): Promise<boolean> {
    return await this.initialize()
  }

  /**
   * Get initialization error if any
   */
  getInitError(): string | null {
    return this.initError
  }

  /**
   * Get current mode
   */
  getMode(): 'cloud' | 'direct' | 'unavailable' {
    return this.mode
  }
}

// Singleton instance
export const mem0Service = new Mem0Service()

// Export individual functions for convenience
export const addConversationMemories = mem0Service.addConversationMemories.bind(mem0Service)
export const searchMemories = mem0Service.searchMemories.bind(mem0Service)
export const getAllUserMemories = mem0Service.getAllUserMemories.bind(mem0Service)
export const deleteMemory = mem0Service.deleteMemory.bind(mem0Service)
export const getMemory = mem0Service.getMemory.bind(mem0Service)
