'use client'

/**
 * Chat Window Component
 *
 * The main chat interface rendered inside the floating widget.
 * Uses CopilotKit's headless hooks for message handling and streaming.
 * Displays conversation history from Convex with CopilotKit's active session overlay.
 */

import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react'
import { X, Minus, Send, Square, MessageSquarePlus, Loader2 } from 'lucide-react'
import { MessageRenderer } from './message-renderer'
import { ConversationSwitcher } from './conversation-switcher'
import { useCopilotBridge } from '../hooks/use-copilot-chat'
import { useAuth } from '@clerk/nextjs'
import type { CitationData } from '@/lib/ai/tools/base-tool'

interface ChatWindowProps {
  onClose: () => void
  onMinimize: () => void
  businessId?: string
  initialMessage?: string
  onInitialMessageConsumed?: () => void
}

export function ChatWindow({ onClose, onMinimize, businessId, initialMessage, onInitialMessageConsumed }: ChatWindowProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { userId } = useAuth()

  const {
    isLoading,
    error,
    stopGeneration,
    conversations,
    activeConversationId,
    isLoadingConversations,
    createConversation,
    switchConversation,
    archiveConversation,
    convexMessages,
    isLoadingMessages,
    sendMessage,
  } = useCopilotBridge({ businessId })

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [convexMessages, isLoading])

  // Focus input on mount and prefill if initialMessage provided
  useEffect(() => {
    if (initialMessage) {
      setInput(initialMessage)
      onInitialMessageConsumed?.()
    }
    inputRef.current?.focus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      const trimmed = input.trim()
      if (!trimmed || isLoading) return

      setInput('')
      await sendMessage(trimmed)
    },
    [input, isLoading, sendMessage]
  )

  // Handle textarea Enter key (send on Enter, newline on Shift+Enter)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit(e as unknown as FormEvent)
      }
    },
    [handleSubmit]
  )

  // Build display messages from Convex (single source of truth)
  const displayMessages: DisplayMessage[] = convexMessages.map((msg) => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
    citations: msg.metadata?.citations as CitationData[] | undefined,
  }))

  return (
    <div className="flex flex-col h-full bg-background rounded-t-xl overflow-hidden border border-border shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
          <ConversationSwitcher
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelect={switchConversation}
            onCreate={() => createConversation()}
            onArchive={archiveConversation}
            isLoading={isLoadingConversations}
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onMinimize}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
            aria-label="Minimize"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {isLoadingMessages ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : displayMessages.length === 0 ? (
          <EmptyState />
        ) : (
          displayMessages.map((msg, index) => (
            <MessageRenderer
              key={msg.id || `msg-${index}`}
              content={msg.content}
              role={msg.role}
              citations={msg.citations}
            />
          ))
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-start gap-2">
            <div className="bg-card border border-border rounded-lg px-4 py-3 max-w-[85%]">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Thinking...</span>
              </div>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-border bg-surface px-4 py-3">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about expenses, compliance, vendors..."
            className="flex-1 resize-none bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[40px] max-h-[120px]"
            rows={1}
            disabled={isLoading}
          />
          {isLoading ? (
            <button
              type="button"
              onClick={stopGeneration}
              className="p-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-lg transition-colors flex-shrink-0"
              aria-label="Stop generation"
            >
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="p-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

// Empty state shown when no messages exist
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
        <MessageSquarePlus className="w-6 h-6 text-primary" />
      </div>
      <h4 className="text-sm font-medium text-foreground mb-1">
        FinanSEAL Assistant
      </h4>
      <p className="text-xs text-muted-foreground max-w-[240px]">
        Ask about expenses, vendor analytics, compliance regulations, or team spending
      </p>
    </div>
  )
}

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: CitationData[]
}
