/**
 * Realtime Chat Hooks
 *
 * Provider-agnostic hooks for realtime chat functionality.
 * Internal implementation uses Convex, but the interface is generic.
 *
 * Features:
 * - Automatic realtime subscriptions (no polling)
 * - Optimistic UI updates for instant feedback
 * - Type-safe message and conversation interfaces
 *
 * Usage:
 * ```typescript
 * import { useConversations, useMessages, useSendMessage } from '@/domains/chat/hooks/use-realtime-chat'
 *
 * function ChatView({ conversationId }) {
 *   const { conversations, isLoading } = useConversations()
 *   const { messages } = useMessages(conversationId)
 *   const { sendMessage, isSending } = useSendMessage()
 *
 *   // Messages auto-update when new ones arrive - no polling needed!
 * }
 * ```
 */

'use client'

import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useCallback, useMemo } from 'react'
import type { Id } from '@/convex/_generated/dataModel'

// ============================================
// PROVIDER-AGNOSTIC TYPES
// These types don't expose Convex internals
// ============================================

export interface ChatMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  /** Raw metadata from Convex — may contain actions, citations, toolCalls, etc. */
  metadata?: Record<string, unknown>
}

export interface Citation {
  sourceType: string
  sourceId: string
  content?: string
}

export interface ToolCall {
  toolName: string
  args: unknown
  result?: unknown
}

export interface Conversation {
  id: string
  title: string
  language: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  messageCount: number
  lastMessage?: {
    content: string
    role: 'user' | 'assistant' | 'system'
    timestamp: Date
  }
}

export interface ConversationsResult {
  conversations: Conversation[]
  isLoading: boolean
  error: Error | null
  totalCount: number
}

export interface MessagesResult {
  messages: ChatMessage[]
  isLoading: boolean
  error: Error | null
  hasMore: boolean
  loadMore: () => void
}

export interface SendMessageOptions {
  conversationId?: string
  metadata?: Record<string, unknown>
}

export interface SendMessageResult {
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<string>
  isSending: boolean
  error: Error | null
}

export interface CreateConversationResult {
  createConversation: (title?: string, language?: string) => Promise<string>
  isCreating: boolean
  error: Error | null
}

// ============================================
// HOOKS
// ============================================

/**
 * Subscribe to user's conversations with realtime updates
 *
 * @param options.businessId - Optional business filter
 * @param options.activeOnly - Only show active conversations (default: true)
 * @param options.limit - Max conversations to fetch (default: 50)
 */
export function useConversations(options: {
  businessId?: string
  activeOnly?: boolean
  limit?: number
} = {}): ConversationsResult {
  const { businessId, activeOnly = true, limit = 50 } = options

  // Convex useQuery automatically subscribes to realtime updates
  const result = useQuery(
    api.functions.conversations.list,
    businessId
      ? {
          businessId: businessId as Id<'businesses'>,
          isActive: activeOnly ? true : undefined,
          limit,
        }
      : 'skip' // Skip query if no businessId (handled by auth in Convex)
  )

  // Also query without businessId filter for personal conversations
  const personalResult = useQuery(
    api.functions.conversations.list,
    !businessId
      ? {
          isActive: activeOnly ? true : undefined,
          limit,
        }
      : 'skip'
  )

  const activeResult = businessId ? result : personalResult

  // Transform Convex response to provider-agnostic format
  const conversations = useMemo<Conversation[]>(() => {
    if (!activeResult?.conversations) return []

    return activeResult.conversations.map((conv: any) => ({
      id: conv._id,
      title: conv.title || 'New Chat',
      language: conv.language || 'en',
      isActive: conv.isActive ?? true,
      createdAt: new Date(conv._creationTime),
      updatedAt: new Date(conv.updatedAt || conv._creationTime),
      messageCount: conv.messageCount ?? 0,
      lastMessage: conv.lastMessageContent
        ? {
            content: conv.lastMessageContent,
            role: conv.lastMessageRole as 'user' | 'assistant' | 'system',
            timestamp: new Date(conv.lastMessageAt || conv._creationTime),
          }
        : undefined,
    }))
  }, [activeResult])

  return {
    conversations,
    isLoading: activeResult === undefined,
    error: null, // Convex throws on error, caught by ErrorBoundary
    totalCount: activeResult?.totalCount ?? conversations.length,
  }
}

/**
 * Subscribe to messages in a conversation with realtime updates
 *
 * Messages auto-update when:
 * - User sends a message
 * - AI assistant responds
 * - Another user in a shared conversation sends a message
 *
 * @param conversationId - The conversation to subscribe to
 * @param options.limit - Messages per page (default: 100)
 */
export function useMessages(
  conversationId: string | undefined,
  options: { limit?: number } = {}
): MessagesResult {
  const { limit = 100 } = options

  // Convex useQuery with realtime subscription
  const result = useQuery(
    api.functions.messages.list,
    conversationId
      ? {
          conversationId,
          limit,
        }
      : 'skip'
  )

  // Transform to provider-agnostic format
  const messages = useMemo<ChatMessage[]>(() => {
    if (!result?.messages) return []

    return result.messages.map((msg: any) => ({
      id: msg._id,
      conversationId: msg.conversationId,
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
      timestamp: new Date(msg._creationTime),
      // Use raw metadata from Convex (contains actions, citations from copilot bridge).
      // Fall back to legacy typed fields for backward compatibility with older messages.
      metadata: msg.metadata ?? (msg.citations || msg.toolCalls
        ? { citations: msg.citations, toolCalls: msg.toolCalls }
        : undefined),
    }))
  }, [result])

  const loadMore = useCallback(() => {
    // Convex pagination handled via cursor - for now, increase limit
    // Future: implement cursor-based infinite scroll
    console.log('[useMessages] Load more not yet implemented')
  }, [])

  return {
    messages,
    isLoading: result === undefined,
    error: null,
    hasMore: !result?.isDone,
    loadMore,
  }
}

/**
 * Send a message to a conversation
 *
 * Note: This creates the message in the database.
 * For AI responses, you still need to call the chat API endpoint
 * which triggers the LangGraph agent.
 */
export function useSendMessage(): SendMessageResult {
  const createMessage = useMutation(api.functions.messages.create)

  const sendMessage = useCallback(
    async (content: string, options: SendMessageOptions = {}) => {
      const { conversationId, metadata } = options

      if (!conversationId) {
        throw new Error('conversationId is required')
      }

      const messageId = await createMessage({
        conversationId,
        role: 'user',
        content,
        metadata,
      })

      return messageId
    },
    [createMessage]
  )

  return {
    sendMessage,
    isSending: false, // Convex mutations are synchronous in the hook
    error: null,
  }
}

/**
 * Create a new conversation
 */
export function useCreateConversation(businessId?: string): CreateConversationResult {
  const createConv = useMutation(api.functions.conversations.create)

  const createConversation = useCallback(
    async (title?: string, language: string = 'en') => {
      const conversationId = await createConv({
        businessId: businessId as Id<'businesses'> | undefined,
        title,
        language,
      })

      return conversationId
    },
    [createConv, businessId]
  )

  return {
    createConversation,
    isCreating: false,
    error: null,
  }
}

/**
 * Archive (soft-delete) a conversation
 */
export function useArchiveConversation() {
  const archiveConv = useMutation(api.functions.conversations.archive)

  const archiveConversation = useCallback(
    async (conversationId: string) => {
      await archiveConv({ id: conversationId })
      return true
    },
    [archiveConv]
  )

  return { archiveConversation }
}

/**
 * Delete a conversation permanently
 */
export function useDeleteConversation() {
  const deleteConv = useMutation(api.functions.conversations.remove)

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      await deleteConv({ id: conversationId })
      return true
    },
    [deleteConv]
  )

  return { deleteConversation }
}

/**
 * Get a single conversation by ID with realtime updates
 */
export function useConversation(conversationId: string | undefined) {
  const result = useQuery(
    api.functions.conversations.getById,
    conversationId ? { id: conversationId } : 'skip'
  )

  const conversation = useMemo<Conversation | null>(() => {
    if (!result) return null

    return {
      id: result._id,
      title: result.title || 'New Chat',
      language: result.language || 'en',
      isActive: result.isActive ?? true,
      createdAt: new Date(result._creationTime),
      updatedAt: new Date(result.updatedAt || result._creationTime),
      messageCount: result.messageCount ?? 0,
      lastMessage: result.lastMessageContent
        ? {
            content: result.lastMessageContent,
            role: result.lastMessageRole as 'user' | 'assistant' | 'system',
            timestamp: new Date(result.lastMessageAt || result._creationTime),
          }
        : undefined,
    }
  }, [result])

  return {
    conversation,
    isLoading: result === undefined,
  }
}
