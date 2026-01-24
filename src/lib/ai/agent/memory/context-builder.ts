/**
 * Context Builder (T045-T050)
 *
 * Manages conversation context for extended dialogues:
 * - Entity extraction and caching (vendors, amounts, dates)
 * - Conversation summarization for messages exceeding threshold
 * - Sliding window context with important message preservation
 * - Tool result caching within session
 *
 * Ensures AI maintains context quality for 30+ message conversations.
 */

import { mem0Service, Memory } from './mem0-service'

// Configuration
const SLIDING_WINDOW_SIZE = 15 // Recent messages to keep
const SUMMARIZATION_THRESHOLD = 20 // Messages before summarization
const IMPORTANT_MESSAGE_MARKERS = ['IMPORTANT', 'KEY', 'REMEMBER'] // Messages to preserve

// Entity types for extraction
interface ExtractedEntity {
  type: 'vendor' | 'amount' | 'date' | 'category' | 'currency'
  value: string
  confidence: number
  messageIndex: number
}

// Cached tool result
interface CachedToolResult {
  toolName: string
  args: Record<string, unknown>
  result: unknown
  timestamp: number
  ttlMs: number
}

// Conversation context
interface ConversationContext {
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  summary: string | null
  extractedEntities: ExtractedEntity[]
  relevantMemories: Memory[]
  toolCache: Map<string, CachedToolResult>
}

// Message for context building
export interface ContextMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: Date
  isImportant?: boolean
}

/**
 * Context Builder Class
 *
 * Maintains conversation context with intelligent summarization
 * and entity tracking for extended conversations.
 */
export class ContextBuilder {
  private context: ConversationContext
  private allMessages: ContextMessage[] = []
  private userId: string
  private businessId: string
  private sessionStartTime: number

  constructor(userId: string, businessId: string) {
    this.userId = userId
    this.businessId = businessId
    this.sessionStartTime = Date.now()
    this.context = {
      recentMessages: [],
      summary: null,
      extractedEntities: [],
      relevantMemories: [],
      toolCache: new Map()
    }
  }

  /**
   * T045: Build context for agent initialization
   * Combines recent messages, summary, memories, and entities
   */
  async buildContext(): Promise<string> {
    const parts: string[] = []

    // Add user memories if available
    if (this.context.relevantMemories.length > 0) {
      parts.push('## User Context from Memory')
      parts.push(this.formatMemories(this.context.relevantMemories))
    }

    // Add conversation summary if exists
    if (this.context.summary) {
      parts.push('## Conversation Summary')
      parts.push(this.context.summary)
    }

    // Add extracted entities
    if (this.context.extractedEntities.length > 0) {
      parts.push('## Key Entities Mentioned')
      parts.push(this.formatEntities(this.context.extractedEntities))
    }

    // Add recent messages
    if (this.context.recentMessages.length > 0) {
      parts.push('## Recent Conversation')
      parts.push(this.formatRecentMessages())
    }

    return parts.join('\n\n')
  }

  /**
   * T046: Extract entities from message
   * Identifies vendors, amounts, dates, categories
   */
  extractEntities(message: string, messageIndex: number): ExtractedEntity[] {
    const entities: ExtractedEntity[] = []

    // Extract currency amounts (e.g., $1,234.56, MYR 1000)
    const amountPatterns = [
      /\$[\d,]+(?:\.\d{2})?/g,
      /MYR\s*[\d,]+(?:\.\d{2})?/gi,
      /THB\s*[\d,]+(?:\.\d{2})?/gi,
      /IDR\s*[\d,]+/gi,
      /SGD\s*[\d,]+(?:\.\d{2})?/gi,
      /[\d,]+(?:\.\d{2})?\s*(?:dollars?|baht|ringgit)/gi
    ]

    for (const pattern of amountPatterns) {
      const matches = message.match(pattern)
      if (matches) {
        for (const match of matches) {
          entities.push({
            type: 'amount',
            value: match,
            confidence: 0.9,
            messageIndex
          })
        }
      }
    }

    // Extract dates
    const datePatterns = [
      /\d{1,2}\/\d{1,2}\/\d{2,4}/g, // MM/DD/YYYY or DD/MM/YYYY
      /\d{4}-\d{2}-\d{2}/g, // ISO format
      /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,?\s*\d{4})?/gi,
      /(?:yesterday|today|tomorrow|last\s+(?:week|month|year))/gi
    ]

    for (const pattern of datePatterns) {
      const matches = message.match(pattern)
      if (matches) {
        for (const match of matches) {
          entities.push({
            type: 'date',
            value: match,
            confidence: 0.85,
            messageIndex
          })
        }
      }
    }

    // Extract potential vendor names (capitalized words/phrases)
    const vendorPattern = /(?:from|to|at|with|vendor|supplier|company)\s+([A-Z][a-zA-Z0-9\s&]+(?:Co\.?|Inc\.?|Ltd\.?|LLC)?)/gi
    let vendorMatch
    while ((vendorMatch = vendorPattern.exec(message)) !== null) {
      entities.push({
        type: 'vendor',
        value: vendorMatch[1].trim(),
        confidence: 0.7,
        messageIndex
      })
    }

    // Extract expense categories
    const categoryKeywords = [
      'travel', 'food', 'supplies', 'utilities', 'rent', 'salary',
      'marketing', 'advertising', 'equipment', 'software', 'insurance',
      'transportation', 'entertainment', 'office', 'professional'
    ]
    const lowerMessage = message.toLowerCase()
    for (const category of categoryKeywords) {
      if (lowerMessage.includes(category)) {
        entities.push({
          type: 'category',
          value: category,
          confidence: 0.75,
          messageIndex
        })
      }
    }

    return entities
  }

  /**
   * T047: Summarize conversation when threshold exceeded
   */
  async summarizeConversation(messages: ContextMessage[]): Promise<string> {
    if (messages.length < SUMMARIZATION_THRESHOLD) {
      return '' // No summarization needed
    }

    // Build summary
    const summary: string[] = []

    // Count entity mentions
    const entityCounts = new Map<string, number>()
    for (const entity of this.context.extractedEntities) {
      const key = `${entity.type}:${entity.value}`
      entityCounts.set(key, (entityCounts.get(key) || 0) + 1)
    }

    // Include frequently mentioned entities
    const frequentEntities = Array.from(entityCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([key]) => key.split(':')[1])

    if (frequentEntities.length > 0) {
      summary.push(`Key topics discussed: ${frequentEntities.join(', ')}`)
    }

    // Count question/answer patterns
    const questionsAsked = messages.filter(m =>
      m.role === 'user' && m.content.includes('?')
    ).length

    if (questionsAsked > 3) {
      summary.push(`User asked ${questionsAsked} questions during the conversation`)
    }

    // Note any action items or decisions
    const actionPhrases = messages
      .filter(m => m.content.toLowerCase().match(/(?:will|should|need to|must|going to)/))
      .map(m => this.extractKeyPoints(m.content))
      .filter(Boolean)
      .slice(0, 3)

    if (actionPhrases.length > 0) {
      summary.push(`Action items discussed: ${actionPhrases.join('; ')}`)
    }

    return summary.join('\n')
  }

  /**
   * T048: Implement sliding window with important message preservation
   */
  applySlidingWindow(): ContextMessage[] {
    if (this.allMessages.length <= SLIDING_WINDOW_SIZE) {
      return this.allMessages
    }

    // Find important messages to preserve
    const importantMessages = this.allMessages.filter((msg, idx) => {
      // Check explicit importance markers
      if (msg.isImportant) return true

      // Check content for importance markers
      const upperContent = msg.content.toUpperCase()
      if (IMPORTANT_MESSAGE_MARKERS.some(marker => upperContent.includes(marker))) {
        return true
      }

      // Keep first user message (sets context)
      if (idx === 0 && msg.role === 'user') return true

      // Keep messages with high entity density
      const entityCount = this.context.extractedEntities
        .filter(e => e.messageIndex === idx).length
      if (entityCount >= 3) return true

      return false
    })

    // Get recent messages
    const recentMessages = this.allMessages.slice(-SLIDING_WINDOW_SIZE)

    // Merge important + recent, avoiding duplicates
    const preservedIndices = new Set<number>()
    const result: ContextMessage[] = []

    // Add important messages first
    for (const msg of importantMessages) {
      const idx = this.allMessages.indexOf(msg)
      if (!preservedIndices.has(idx)) {
        result.push(msg)
        preservedIndices.add(idx)
      }
    }

    // Add recent messages
    for (const msg of recentMessages) {
      const idx = this.allMessages.indexOf(msg)
      if (!preservedIndices.has(idx)) {
        result.push(msg)
        preservedIndices.add(idx)
      }
    }

    return result
  }

  /**
   * Add a new message to the conversation
   */
  async addMessage(message: ContextMessage): Promise<void> {
    const messageIndex = this.allMessages.length
    this.allMessages.push(message)

    // Extract entities from the message
    const entities = this.extractEntities(message.content, messageIndex)
    this.context.extractedEntities.push(...entities)

    // Update recent messages using sliding window
    const windowedMessages = this.applySlidingWindow()
    this.context.recentMessages = windowedMessages.map(m => ({
      role: m.role,
      content: m.content
    }))

    // Trigger summarization if threshold exceeded
    if (this.allMessages.length >= SUMMARIZATION_THRESHOLD && !this.context.summary) {
      this.context.summary = await this.summarizeConversation(this.allMessages)
    }
  }

  /**
   * T049: Load user memories for context enrichment
   */
  async loadUserMemories(): Promise<void> {
    try {
      const isAvailable = await mem0Service.isAvailable()
      if (!isAvailable) {
        console.log('[ContextBuilder] Memory service not available')
        return
      }

      const memories = await mem0Service.getAllUserMemories(
        this.userId,
        this.businessId
      )

      if (memories && memories.length > 0) {
        // Sort by recency and relevance
        this.context.relevantMemories = memories
          .sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
            return dateB - dateA
          })
          .slice(0, 10) // Keep top 10 most recent

        console.log(`[ContextBuilder] Loaded ${this.context.relevantMemories.length} memories`)
      }
    } catch (error) {
      console.error('[ContextBuilder] Failed to load memories:', error)
    }
  }

  /**
   * T050: Cache tool results within session
   */
  cacheToolResult(
    toolName: string,
    args: Record<string, unknown>,
    result: unknown,
    ttlMs: number = 5 * 60 * 1000 // 5 minute default TTL
  ): void {
    const cacheKey = this.generateToolCacheKey(toolName, args)
    this.context.toolCache.set(cacheKey, {
      toolName,
      args,
      result,
      timestamp: Date.now(),
      ttlMs
    })
  }

  /**
   * Get cached tool result if valid
   */
  getCachedToolResult(toolName: string, args: Record<string, unknown>): unknown | null {
    const cacheKey = this.generateToolCacheKey(toolName, args)
    const cached = this.context.toolCache.get(cacheKey)

    if (!cached) return null

    // Check if still valid
    if (Date.now() - cached.timestamp > cached.ttlMs) {
      this.context.toolCache.delete(cacheKey)
      return null
    }

    return cached.result
  }

  /**
   * Clear expired tool cache entries
   */
  clearExpiredCache(): void {
    const now = Date.now()
    for (const [key, cached] of this.context.toolCache.entries()) {
      if (now - cached.timestamp > cached.ttlMs) {
        this.context.toolCache.delete(key)
      }
    }
  }

  // ==================== Private Helpers ====================

  private generateToolCacheKey(toolName: string, args: Record<string, unknown>): string {
    const sortedArgs = Object.keys(args)
      .sort()
      .map(k => `${k}:${JSON.stringify(args[k])}`)
      .join('|')
    return `${toolName}::${sortedArgs}`
  }

  private formatMemories(memories: Memory[]): string {
    return memories
      .map((m, i) => {
        const category = (m.metadata?.category as string) || 'general'
        return `${i + 1}. [${category}] ${m.memory}`
      })
      .join('\n')
  }

  private formatEntities(entities: ExtractedEntity[]): string {
    const grouped = new Map<string, Set<string>>()

    for (const entity of entities) {
      if (!grouped.has(entity.type)) {
        grouped.set(entity.type, new Set())
      }
      grouped.get(entity.type)!.add(entity.value)
    }

    const lines: string[] = []
    for (const [type, values] of grouped.entries()) {
      lines.push(`- ${type}: ${Array.from(values).join(', ')}`)
    }
    return lines.join('\n')
  }

  private formatRecentMessages(): string {
    return this.context.recentMessages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 200)}${m.content.length > 200 ? '...' : ''}`)
      .join('\n')
  }

  private extractKeyPoints(content: string): string {
    // Extract first sentence or key phrase
    const sentences = content.match(/[^.!?]+[.!?]+/g)
    if (sentences && sentences.length > 0) {
      return sentences[0].trim()
    }
    return content.slice(0, 100)
  }
}

/**
 * Factory function to create context builder
 */
export function createContextBuilder(userId: string, businessId: string): ContextBuilder {
  return new ContextBuilder(userId, businessId)
}
