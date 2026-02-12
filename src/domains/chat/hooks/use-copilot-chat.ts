'use client'

/**
 * CopilotKit ↔ Convex Bridge Hook
 *
 * Bridges CopilotKit's in-memory chat state with Convex persistent storage.
 *
 * Pattern:
 * - CopilotKit manages the active session (streaming, message state)
 * - Convex is the source of truth for conversation history
 * - This hook syncs between them:
 *   1. On load: Convex messages → CopilotKit
 *   2. On new message completion: CopilotKit → Convex
 *   3. On conversation switch: clear CopilotKit → load from Convex
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useCopilotChat } from '@copilotkit/react-core'
import { TextMessage, Role as GqlRole } from '@copilotkit/runtime-client-gql'
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

export interface UseCopilotBridgeOptions {
  businessId?: string
  language?: string
}

export interface UseCopilotBridgeReturn {
  // CopilotKit chat state
  visibleMessages: ReturnType<typeof useCopilotChat>['visibleMessages']
  isLoading: boolean
  stopGeneration: () => void
  appendMessage: ReturnType<typeof useCopilotChat>['appendMessage']

  // Conversation management
  conversations: Conversation[]
  activeConversationId: string | undefined
  isLoadingConversations: boolean

  // Actions
  createConversation: () => Promise<string>
  switchConversation: (conversationId: string) => void
  archiveConversation: (conversationId: string) => Promise<void>

  // Convex messages for the active conversation (for history display)
  convexMessages: ChatMessage[]
  isLoadingMessages: boolean

  // Send a message through CopilotKit and persist to Convex
  sendMessage: (content: string) => Promise<void>
}

/**
 * Bridge hook that syncs CopilotKit's active session with Convex persistence.
 */
export function useCopilotBridge(
  options: UseCopilotBridgeOptions = {}
): UseCopilotBridgeReturn {
  const { businessId, language = 'en' } = options
  const { user } = useUser()

  // Active conversation tracking
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>()
  const lastSyncedConversationRef = useRef<string | undefined>(undefined)

  // CopilotKit chat state (open-source hook)
  const copilotChat = useCopilotChat()

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

  // Sync Convex messages to CopilotKit when conversation changes
  useEffect(() => {
    if (
      activeConversationId &&
      activeConversationId !== lastSyncedConversationRef.current &&
      convexMessages.length > 0
    ) {
      // Convert Convex messages to CopilotKit's GQL format
      const gqlMessages = convexMessages.map((msg) =>
        new TextMessage({
          content: msg.content,
          role: msg.role === 'user' ? GqlRole.User : GqlRole.Assistant,
        })
      )

      // Reset CopilotKit state and populate with history
      copilotChat.reset()
      // Note: After reset, we'd use setMessages if available.
      // With the open-source hook, we rely on visibleMessages being empty after reset
      // and the conversation history being displayed from convexMessages directly.

      lastSyncedConversationRef.current = activeConversationId
    }
  }, [activeConversationId, convexMessages, copilotChat])

  // Create a new conversation
  const handleCreateConversation = useCallback(async () => {
    const newId = await convexCreateConversation(undefined, language)
    copilotChat.reset()
    setActiveConversationId(newId)
    lastSyncedConversationRef.current = newId
    return newId
  }, [convexCreateConversation, language, copilotChat])

  // Switch to an existing conversation
  const handleSwitchConversation = useCallback(
    (conversationId: string) => {
      if (conversationId === activeConversationId) return
      copilotChat.reset()
      lastSyncedConversationRef.current = undefined // Force re-sync
      setActiveConversationId(conversationId)
    },
    [activeConversationId, copilotChat]
  )

  // Archive a conversation
  const handleArchiveConversation = useCallback(
    async (conversationId: string) => {
      await convexArchiveConversation(conversationId)
      if (conversationId === activeConversationId) {
        // Switch to next available conversation
        const remaining = conversations.filter((c) => c.id !== conversationId)
        if (remaining.length > 0) {
          handleSwitchConversation(remaining[0].id)
        } else {
          setActiveConversationId(undefined)
          copilotChat.reset()
        }
      }
    },
    [
      convexArchiveConversation,
      activeConversationId,
      conversations,
      handleSwitchConversation,
      copilotChat,
    ]
  )

  // Send message: persist user message to Convex, then let CopilotKit handle the AI response
  const handleSendMessage = useCallback(
    async (content: string) => {
      let conversationId = activeConversationId

      // Auto-create conversation if none active
      if (!conversationId) {
        conversationId = await handleCreateConversation()
      }

      // Persist user message to Convex
      await createMessage({
        conversationId: conversationId!,
        role: 'user',
        content,
      })

      // Send through CopilotKit for AI processing
      const userMessage = new TextMessage({
        content,
        role: GqlRole.User,
      })
      await copilotChat.appendMessage(userMessage)

      // Note: The assistant response will be persisted to Convex
      // after CopilotKit completes the response. This is handled
      // by watching copilotChat.visibleMessages for new assistant messages.
    },
    [activeConversationId, handleCreateConversation, createMessage, copilotChat]
  )

  // Watch for new assistant messages from CopilotKit and persist to Convex
  const lastPersistedIndexRef = useRef(0)

  useEffect(() => {
    if (!activeConversationId || copilotChat.isLoading) return

    const messages = copilotChat.visibleMessages
    if (messages.length <= lastPersistedIndexRef.current) return

    // Find new assistant messages that haven't been persisted
    const newMessages = messages.slice(lastPersistedIndexRef.current)
    const assistantMessages = newMessages.filter(
      (msg) => 'role' in msg && (msg as any).role === GqlRole.Assistant
    )

    if (assistantMessages.length > 0) {
      // Persist each new assistant message
      assistantMessages.forEach((msg) => {
        const content = 'content' in msg ? String((msg as any).content) : ''
        if (content) {
          createMessage({
            conversationId: activeConversationId,
            role: 'assistant',
            content,
          }).catch((err) =>
            console.error('[CopilotBridge] Failed to persist assistant message:', err)
          )
        }
      })
    }

    lastPersistedIndexRef.current = messages.length
  }, [
    copilotChat.visibleMessages,
    copilotChat.isLoading,
    activeConversationId,
    createMessage,
  ])

  // Reset persisted index when conversation changes
  useEffect(() => {
    lastPersistedIndexRef.current = 0
  }, [activeConversationId])

  return {
    visibleMessages: copilotChat.visibleMessages,
    isLoading: copilotChat.isLoading,
    stopGeneration: copilotChat.stopGeneration,
    appendMessage: copilotChat.appendMessage,

    conversations,
    activeConversationId,
    isLoadingConversations,

    createConversation: handleCreateConversation,
    switchConversation: handleSwitchConversation,
    archiveConversation: handleArchiveConversation,

    convexMessages,
    isLoadingMessages,

    sendMessage: handleSendMessage,
  }
}
