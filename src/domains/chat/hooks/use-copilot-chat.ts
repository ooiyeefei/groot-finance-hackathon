'use client'

/**
 * Chat Bridge Hook
 *
 * Bridges the chat API with Convex persistent storage.
 *
 * Pattern:
 * - Convex is the source of truth for conversation history
 * - API calls go to /api/copilotkit which invokes the LangGraph agent
 * - New messages are persisted to Convex after API response
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  useConversations,
  useMessages,
  useCreateConversation,
  useArchiveConversation,
  type Conversation,
  type ChatMessage,
} from './use-realtime-chat'
import { useUser } from '@clerk/nextjs'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { CitationData } from '@/lib/ai/tools/base-tool'

export interface UseCopilotBridgeOptions {
  businessId?: string
  language?: string
}

export interface ChatApiResponse {
  content: string
  citations: CitationData[]
  needsClarification: boolean
  clarificationQuestions: string[]
  confidence: number
}

export interface UseCopilotBridgeReturn {
  // Chat state
  isLoading: boolean
  error: string | null

  // Conversation management
  conversations: Conversation[]
  activeConversationId: string | undefined
  isLoadingConversations: boolean

  // Actions
  createConversation: () => Promise<string>
  switchConversation: (conversationId: string) => void
  archiveConversation: (conversationId: string) => Promise<void>

  // Convex messages for the active conversation
  convexMessages: ChatMessage[]
  isLoadingMessages: boolean

  // Send a message and get AI response
  sendMessage: (content: string) => Promise<void>

  // Stop generation (abort in-flight request)
  stopGeneration: () => void
}

/**
 * Bridge hook: sends messages to the chat API and syncs with Convex.
 */
export function useCopilotBridge(
  options: UseCopilotBridgeOptions = {}
): UseCopilotBridgeReturn {
  const { businessId, language = 'en' } = options
  const { user } = useUser()

  // Active conversation tracking
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Convex hooks for persistence
  const { conversations, isLoading: isLoadingConversations } = useConversations({
    businessId,
    activeOnly: true,
  })
  const { messages: convexMessages, isLoading: isLoadingMessages } = useMessages(
    activeConversationId
  )
  const { createConversation: convexCreateConversation } = useCreateConversation(businessId)
  const { archiveConversation: convexArchiveConversation } = useArchiveConversation()

  // Convex mutation for persisting messages
  const createMessage = useMutation(api.functions.messages.create)

  // Auto-select the most recent conversation on first load
  useEffect(() => {
    if (!activeConversationId && conversations.length > 0) {
      setActiveConversationId(conversations[0].id)
    }
  }, [activeConversationId, conversations])

  // Create a new conversation
  const handleCreateConversation = useCallback(async () => {
    const newId = await convexCreateConversation(undefined, language)
    setActiveConversationId(newId)
    setError(null)
    return newId
  }, [convexCreateConversation, language])

  // Switch to an existing conversation
  const handleSwitchConversation = useCallback(
    (conversationId: string) => {
      if (conversationId === activeConversationId) return
      setActiveConversationId(conversationId)
      setError(null)
    },
    [activeConversationId]
  )

  // Archive a conversation
  const handleArchiveConversation = useCallback(
    async (conversationId: string) => {
      await convexArchiveConversation(conversationId)
      if (conversationId === activeConversationId) {
        const remaining = conversations.filter((c) => c.id !== conversationId)
        if (remaining.length > 0) {
          handleSwitchConversation(remaining[0].id)
        } else {
          setActiveConversationId(undefined)
        }
      }
    },
    [
      convexArchiveConversation,
      activeConversationId,
      conversations,
      handleSwitchConversation,
    ]
  )

  // Stop in-flight request
  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsLoading(false)
    }
  }, [])

  // Send message: persist user message, call API, persist response
  const handleSendMessage = useCallback(
    async (content: string) => {
      let conversationId = activeConversationId

      // Auto-create conversation if none active
      if (!conversationId) {
        conversationId = await handleCreateConversation()
      }

      setIsLoading(true)
      setError(null)

      // Persist user message to Convex immediately
      await createMessage({
        conversationId: conversationId!,
        role: 'user',
        content,
      })

      // Build conversation history from Convex messages
      const history = convexMessages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }))

      // Call the chat API
      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        const response = await fetch('/api/copilotkit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: content,
            conversationId,
            conversationHistory: history,
            language,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => null)
          throw new Error(errorData?.error || `Request failed: ${response.status}`)
        }

        const result: ChatApiResponse = await response.json()

        // Persist assistant response to Convex
        await createMessage({
          conversationId: conversationId!,
          role: 'assistant',
          content: result.content,
          metadata: result.citations.length > 0 ? { citations: result.citations } : undefined,
        })
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          // User cancelled — not an error
          return
        }
        const errorMessage = err instanceof Error ? err.message : 'Failed to get response'
        setError(errorMessage)
        console.error('[ChatBridge] API error:', err)
      } finally {
        abortControllerRef.current = null
        setIsLoading(false)
      }
    },
    [activeConversationId, handleCreateConversation, createMessage, convexMessages, language]
  )

  return {
    isLoading,
    error,

    conversations,
    activeConversationId,
    isLoadingConversations,

    createConversation: handleCreateConversation,
    switchConversation: handleSwitchConversation,
    archiveConversation: handleArchiveConversation,

    convexMessages,
    isLoadingMessages,

    sendMessage: handleSendMessage,
    stopGeneration: handleStopGeneration,
  }
}
