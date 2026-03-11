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
  const activeConversationIdRef = useRef<string | undefined>(activeConversationId)
  activeConversationIdRef.current = activeConversationId

  // Keep a ref to convexMessages so the sendMessage callback always reads the
  // latest messages without needing convexMessages in its dependency array.
  const convexMessagesRef = useRef<ChatMessage[]>([])

  // Per-conversation stream tracking — supports concurrent streams.
  // Each conversation can have its own active stream, abort controller, and accumulated data.
  interface StreamState {
    controller: AbortController
    text: string
    actions: ChatAction[]
    status: string
  }
  const activeStreamsRef = useRef<Map<string, StreamState>>(new Map())

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
  convexMessagesRef.current = convexMessages
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
  // NOTE: We do NOT abort any in-flight stream. Streams continue in the
  // background and persist via server-side when done.
  const handleCreateConversation = useCallback(async () => {
    const newId = await convexCreateConversation(undefined, language)
    setActiveConversationId(newId)
    // New conversation has no stream — clear UI
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

      // Check if the target conversation has an active stream
      const stream = activeStreamsRef.current.get(conversationId)
      if (stream) {
        // Restore streaming UI state from the active stream
        setIsLoading(true)
        setStreamingText(stream.text)
        setStreamingStatus(stream.status)
        setStreamingActions(stream.actions)
      } else {
        // No active stream — clear streaming state
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

  // Stop in-flight request for the currently viewed conversation
  const handleStopGeneration = useCallback(() => {
    const convId = activeConversationIdRef.current
    if (convId) {
      const stream = activeStreamsRef.current.get(convId)
      if (stream) {
        stream.controller.abort()
        activeStreamsRef.current.delete(convId)
        setIsLoading(false)
        setStreamingStatus('')
      }
    }
  }, [])

  // Send message: persist user message, stream API response, persist final response.
  // Supports concurrent streams — each conversation gets its own stream lifecycle.
  const handleSendMessage = useCallback(
    async (content: string) => {
      // Read from ref to always get the latest conversation ID,
      // even if the callback hasn't been recreated yet after a switch.
      let conversationId = activeConversationIdRef.current

      // Auto-create conversation if none active
      if (!conversationId) {
        conversationId = await handleCreateConversation()
      }

      const convId = conversationId!

      // Abort any previous stream for THIS conversation only (re-sending in same chat)
      const existingStream = activeStreamsRef.current.get(convId)
      if (existingStream) {
        existingStream.controller.abort()
        activeStreamsRef.current.delete(convId)
      }

      // Register this stream in the active streams map
      const controller = new AbortController()
      const streamState: StreamState = {
        controller,
        text: '',
        actions: [],
        status: '',
      }
      activeStreamsRef.current.set(convId, streamState)

      setIsLoading(true)
      setError(null)
      setStreamingText('')
      setStreamingStatus('')
      setStreamingActions([])

      // Persist user message to Convex immediately
      await createMessage({
        conversationId: convId,
        role: 'user',
        content,
      })

      // Build conversation history from Convex messages (read from ref for latest)
      const history = convexMessagesRef.current.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }))

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
            if (activeConversationIdRef.current === convId) {
              setError('Response timed out. Please try again.')
            }
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
            conversationId: convId,
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

          // Only update UI if user is currently viewing THIS conversation
          const isViewing = activeConversationIdRef.current === convId

          switch (event.event) {
            case 'status':
              streamState.status = event.data.phase
              if (isViewing) setStreamingStatus(event.data.phase)
              break

            case 'text':
              accumulatedText += event.data.token
              streamState.text = accumulatedText
              if (isViewing) setStreamingText(accumulatedText)
              break

            case 'action':
              accumulatedActions = [...accumulatedActions, event.data as ChatAction]
              streamState.actions = accumulatedActions
              if (isViewing) setStreamingActions(accumulatedActions)
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
            conversationId: convId,
            role: 'assistant',
            content: accumulatedText,
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          })
        }
      } catch (err) {
        if (timeoutId) clearTimeout(timeoutId)

        if ((err as Error).name === 'AbortError') {
          // User cancelled or re-sent in same conversation — persist partial content
          if (accumulatedText) {
            await createMessage({
              conversationId: convId,
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
        if (activeConversationIdRef.current === convId) {
          setError(errorMessage)
        }
        console.error('[ChatBridge] Stream error:', err)
      } finally {
        // Remove from active streams
        activeStreamsRef.current.delete(convId)
        // Only clear UI state if user is still viewing this conversation
        if (activeConversationIdRef.current === convId) {
          setIsLoading(false)
          setStreamingText('')
          setStreamingStatus('')
          setStreamingActions([])
        }
      }
    },
    [handleCreateConversation, createMessage, language]
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
