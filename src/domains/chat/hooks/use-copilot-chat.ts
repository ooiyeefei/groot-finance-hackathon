'use client'

/**
 * Chat Bridge Hook — SSE Streaming
 *
 * Bridges the chat API with Convex persistent storage using Server-Sent Events.
 *
 * Pattern:
 * - Convex is the source of truth for conversation history
 * - API calls go to /api/copilotkit which streams SSE events
 * - Streaming state accumulates text/actions progressively
 * - Final message is persisted to Convex after stream completes
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
import { parseSSEStream, type StreamEvent, type ChatAction } from '../lib/sse-parser'
import type { CitationData } from '@/lib/ai/tools/base-tool'

export interface UseCopilotBridgeOptions {
  businessId?: string
  language?: string
}

export interface UseCopilotBridgeReturn {
  // Chat state
  isLoading: boolean
  error: string | null

  // Streaming state
  streamingText: string
  streamingStatus: string
  streamingActions: ChatAction[]

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

/** Inactivity timeout before showing retry prompt (ms).
 *  Set to 180s to accommodate cold starts on serverless LLM endpoints (e.g. Modal). */
const STREAM_TIMEOUT_MS = 180_000

/**
 * Bridge hook: sends messages to the chat API via SSE and syncs with Convex.
 */
export function useCopilotBridge(
  options: UseCopilotBridgeOptions = {}
): UseCopilotBridgeReturn {
  const { businessId, language = 'en' } = options
  // Capture businessId in a ref so the sendMessage callback always uses the latest value
  // without triggering re-creation of the callback on every business switch.
  const businessIdRef = useRef(businessId)
  businessIdRef.current = businessId
  const { user } = useUser()

  // Active conversation tracking
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Track which conversation the current stream belongs to, so we can
  // suppress UI updates and avoid aborting when the user switches away.
  const streamConversationRef = useRef<string | null>(null)
  const activeConversationIdRef = useRef<string | undefined>(activeConversationId)
  activeConversationIdRef.current = activeConversationId

  // Keep a ref copy of accumulated text/actions so we can restore UI when
  // the user navigates back to a conversation with an active stream.
  const accumulatedTextRef = useRef('')
  const accumulatedActionsRef = useRef<ChatAction[]>([])
  const accumulatedStatusRef = useRef('')

  // Streaming state
  const [streamingText, setStreamingText] = useState('')
  const [streamingStatus, setStreamingStatus] = useState('')
  const [streamingActions, setStreamingActions] = useState<ChatAction[]>([])

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
  // NOTE: We do NOT abort the in-flight stream here. The stream continues
  // in the background and persists to the original conversation when done.
  const handleCreateConversation = useCallback(async () => {
    const newId = await convexCreateConversation(undefined, language)
    setActiveConversationId(newId)
    setIsLoading(false)
    setStreamingText('')
    setStreamingStatus('')
    setStreamingActions([])
    setError(null)
    return newId
  }, [convexCreateConversation, language])

  // Switch to an existing conversation.
  // If the target conversation has an active stream, restore its UI state.
  // Otherwise clear streaming state for a fresh view.
  const handleSwitchConversation = useCallback(
    (conversationId: string) => {
      if (conversationId === activeConversationId) return
      setActiveConversationId(conversationId)
      setError(null)

      // Check if we're switching back to a conversation that's still streaming
      if (streamConversationRef.current === conversationId) {
        // Restore streaming UI state
        setIsLoading(true)
        setStreamingText(accumulatedTextRef.current)
        setStreamingStatus(accumulatedStatusRef.current)
        setStreamingActions(accumulatedActionsRef.current)
      } else {
        // Different conversation — clear streaming state
        setIsLoading(false)
        setStreamingText('')
        setStreamingStatus('')
        setStreamingActions([])
      }
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
      setStreamingStatus('')
    }
  }, [])

  // Send message: persist user message, stream API response, persist final response
  const handleSendMessage = useCallback(
    async (content: string) => {
      let conversationId = activeConversationId

      // Auto-create conversation if none active
      if (!conversationId) {
        conversationId = await handleCreateConversation()
      }

      // Abort any previous in-flight stream (we're starting a new message)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }

      // Track which conversation this stream belongs to
      streamConversationRef.current = conversationId!
      accumulatedTextRef.current = ''
      accumulatedActionsRef.current = []
      accumulatedStatusRef.current = ''

      setIsLoading(true)
      setError(null)
      setStreamingText('')
      setStreamingStatus('')
      setStreamingActions([])

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

      // Call the chat API with SSE streaming
      const controller = new AbortController()
      abortControllerRef.current = controller

      let accumulatedText = ''
      let accumulatedActions: ChatAction[] = []
      let accumulatedCitations: CitationData[] = []
      let streamCompleted = false
      let serverPersisted = false

      // Inactivity timeout
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      const resetTimeout = () => {
        if (timeoutId) clearTimeout(timeoutId)
        timeoutId = setTimeout(() => {
          if (!streamCompleted) {
            setError('Response timed out. Please try again.')
            controller.abort()
          }
        }, STREAM_TIMEOUT_MS)
      }

      try {
        const response = await fetch('/api/copilotkit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: content,
            conversationId,
            conversationHistory: history,
            language,
            businessId: businessIdRef.current,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => null)
          throw new Error(errorData?.error || `Request failed: ${response.status}`)
        }

        // Consume SSE stream
        resetTimeout()

        for await (const event of parseSSEStream(response)) {
          resetTimeout()

          // Only update UI if user is still viewing the conversation this stream belongs to
          const isActiveStream = activeConversationIdRef.current === streamConversationRef.current

          switch (event.event) {
            case 'status':
              accumulatedStatusRef.current = event.data.phase
              if (isActiveStream) setStreamingStatus(event.data.phase)
              break

            case 'text':
              accumulatedText += event.data.token
              accumulatedTextRef.current = accumulatedText
              if (isActiveStream) setStreamingText(accumulatedText)
              break

            case 'action':
              accumulatedActions = [...accumulatedActions, event.data as ChatAction]
              accumulatedActionsRef.current = accumulatedActions
              if (isActiveStream) setStreamingActions(accumulatedActions)
              break

            case 'citation':
              accumulatedCitations = event.data.citations
              break

            case 'done':
              streamCompleted = true
              // Server already persisted the assistant message — skip client-side write
              if (event.data?.serverPersisted) {
                serverPersisted = true
              }
              break

            case 'error':
              throw new Error(event.data.message)
          }
        }

        if (timeoutId) clearTimeout(timeoutId)

        // Persist the final assistant message to Convex (single write)
        // Skip if the server already persisted (prevents duplicate messages)
        if (accumulatedText && !serverPersisted) {
          const metadata: Record<string, unknown> = {}
          if (accumulatedCitations.length > 0) {
            metadata.citations = accumulatedCitations
          }
          if (accumulatedActions.length > 0) {
            metadata.actions = accumulatedActions
          }

          await createMessage({
            conversationId: conversationId!,
            role: 'assistant',
            content: accumulatedText,
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          })
        }
      } catch (err) {
        if (timeoutId) clearTimeout(timeoutId)

        if ((err as Error).name === 'AbortError') {
          // User cancelled — persist partial content if available
          if (accumulatedText) {
            await createMessage({
              conversationId: conversationId!,
              role: 'assistant',
              content: accumulatedText + '\n\n*[Response interrupted]*',
              metadata:
                accumulatedCitations.length > 0
                  ? { citations: accumulatedCitations }
                  : undefined,
            })
          }
          return
        }

        const errorMessage = err instanceof Error ? err.message : 'Failed to get response'
        // Only show error if user is still viewing this conversation
        if (activeConversationIdRef.current === streamConversationRef.current) {
          setError(errorMessage)
        }
        console.error('[ChatBridge] Stream error:', err)
      } finally {
        abortControllerRef.current = null
        // Clear accumulated refs — stream is done
        accumulatedTextRef.current = ''
        accumulatedActionsRef.current = []
        accumulatedStatusRef.current = ''
        // Only clear UI state if user is still viewing this conversation
        if (activeConversationIdRef.current === streamConversationRef.current) {
          setIsLoading(false)
          setStreamingText('')
          setStreamingStatus('')
          setStreamingActions([])
        }
        streamConversationRef.current = null
      }
    },
    [activeConversationId, handleCreateConversation, createMessage, convexMessages, language]
  )

  return {
    isLoading,
    error,

    streamingText,
    streamingStatus,
    streamingActions,

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
