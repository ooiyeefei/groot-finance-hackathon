'use client'

/**
 * Chat Window Component
 *
 * The main chat interface rendered inside the floating widget.
 * Displays conversation history from Convex with SSE streaming overlay.
 * Shows progressive status updates, streaming text, and action cards.
 */

import { useState, useRef, useEffect, useCallback, useMemo, type FormEvent } from 'react'
import { X, ArrowUp, Square, Loader2, Sparkles } from 'lucide-react'
import { MessageRenderer } from './message-renderer'
import { ConversationSwitcher } from './conversation-switcher'
import { RichContentPanel, type RichContentData } from './rich-content-panel'
import { useCopilotBridge } from '../hooks/use-copilot-chat'
import { useAuth } from '@clerk/nextjs'
import type { CitationData } from '@/lib/ai/tools/base-tool'
import type { ChatAction } from '../lib/sse-parser'

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
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { userId } = useAuth()

  // Smart auto-scroll: track if user has scrolled up
  const [userScrolledUp, setUserScrolledUp] = useState(false)

  // Track messages streamed in this browser session (for interactive vs historical rendering).
  // Messages streamed this session keep interactive controls (bulk checkboxes, post buttons).
  // On page reload the Set is empty, so all messages render as historical.
  const sessionStreamedIds = useRef(new Set<string>())
  const wasLoadingRef = useRef(false)

  // Rotating fun status messages during cold-start / waiting
  const [funMessageIndex, setFunMessageIndex] = useState(0)
  const funMessages = useMemo(() => [
    'Summoning your financial agent...',
    'Crunching the numbers...',
    'Consulting the ledger spirits...',
    'Warming up the calculators...',
    'Brewing some insights...',
    'Balancing the books...',
    'Almost there, counting beans...',
  ], [])

  // Rich content panel state
  const [richContent, setRichContent] = useState<RichContentData | null>(null)

  const handleViewDetails = useCallback((payload: { type: 'chart' | 'table' | 'dashboard'; title: string; data: unknown }) => {
    setRichContent(payload as RichContentData)
  }, [])

  const handleCloseRichContent = useCallback(() => {
    setRichContent(null)
  }, [])

  const {
    isLoading,
    error,
    streamingText,
    streamingStatus,
    streamingActions,
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

  // Rotate fun messages every 4s while loading with no streaming text
  useEffect(() => {
    if (!isLoading || streamingText) return
    setFunMessageIndex(0)
    const interval = setInterval(() => {
      setFunMessageIndex((i) => (i + 1) % funMessages.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [isLoading, streamingText, funMessages])

  // Detect streaming completion and record the message ID for this session.
  // When isLoading goes true→false, the last assistant message was just streamed.
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && convexMessages.length > 0) {
      const lastMsg = convexMessages[convexMessages.length - 1]
      if (lastMsg.role === 'assistant') {
        sessionStreamedIds.current.add(lastMsg.id)
      }
    }
    wasLoadingRef.current = isLoading
  }, [isLoading, convexMessages])

  // Clear session tracking on conversation switch
  useEffect(() => {
    sessionStreamedIds.current.clear()
  }, [activeConversationId])

  // Smart auto-scroll: only scroll if user hasn't scrolled up
  useEffect(() => {
    if (!userScrolledUp) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [convexMessages, isLoading, streamingText, userScrolledUp])

  // Track scroll position to detect user scrolling up
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const { scrollTop, scrollHeight, clientHeight } = container
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    setUserScrolledUp(!isAtBottom)
  }, [])

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
      setUserScrolledUp(false) // Reset scroll lock on new message
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
  const displayMessages: DisplayMessage[] = convexMessages.map((msg) => {
    const meta = msg.metadata as Record<string, unknown> | undefined
    return {
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      citations: meta?.citations as CitationData[] | undefined,
      actions: meta?.actions as ChatAction[] | undefined,
    }
  })

  // Parse follow-up suggestions from the last assistant message
  const followUpSuggestions = useMemo(() => {
    if (isLoading || displayMessages.length === 0) return []
    const lastMsg = displayMessages[displayMessages.length - 1]
    if (lastMsg.role !== 'assistant') return []
    return parseSuggestions(lastMsg.content)
  }, [displayMessages, isLoading])

  return (
    <>
    {/* Rich content panel (slides out alongside chat) */}
    <RichContentPanel
      content={richContent}
      isOpen={richContent !== null}
      onClose={handleCloseRichContent}
    />

    <div className="flex flex-col h-full bg-background overflow-hidden">
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
        <button
          onClick={onClose}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
      >
        {isLoadingMessages ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : displayMessages.length === 0 && !isLoading ? (
          <EmptyState onSuggestionClick={(text) => { setUserScrolledUp(false); sendMessage(text) }} />
        ) : (
          displayMessages.map((msg, index) => (
            <MessageRenderer
              key={msg.id || `msg-${index}`}
              content={msg.content}
              role={msg.role}
              citations={msg.citations}
              actions={msg.actions}
              isHistorical={!sessionStreamedIds.current.has(msg.id)}
              onViewDetails={handleViewDetails}
            />
          ))
        )}

        {/* Streaming response: status + progressive text + action cards */}
        {isLoading && (
          <div className="flex items-start gap-2">
            <div className="bg-card border border-border rounded-lg px-4 py-3 max-w-[85%] w-full">
              {/* Progressive streaming text */}
              {streamingText ? (
                <MessageRenderer
                  content={streamingText}
                  role="assistant"
                  actions={streamingActions.length > 0 ? streamingActions : undefined}
                  isHistorical={false}
                  isInline={true}
                  onViewDetails={handleViewDetails}
                />
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                  <span className="transition-opacity duration-300">
                    {streamingStatus || funMessages[funMessageIndex]}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Follow-up suggestion pills (horizontal, after last assistant message) */}
        {followUpSuggestions.length > 0 && !isLoading && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-thin">
            <Sparkles className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            {followUpSuggestions.map((text) => (
              <button
                key={text}
                onClick={() => { setUserScrolledUp(false); sendMessage(text) }}
                className="text-xs px-3 py-1.5 rounded-full border border-primary/25 text-foreground
                  hover:bg-primary/10 hover:border-primary/40 transition-colors whitespace-nowrap flex-shrink-0"
              >
                {text}
              </button>
            ))}
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
            className="flex-1 resize-none bg-input border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px] max-h-[120px]"
            rows={1}
            disabled={isLoading}
          />
          {isLoading ? (
            <button
              type="button"
              onClick={stopGeneration}
              className="p-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-full transition-colors flex-shrink-0"
              aria-label="Stop generation"
            >
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="p-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              aria-label="Send message"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          )}
        </form>
        <p className="text-[11px] text-muted-foreground text-center mt-2">
          AI may make mistakes. Verify important information.
        </p>
      </div>
    </div>
    </>
  )
}

// Suggestion prompts shown in empty state
const SUGGESTIONS = [
  'Analyze my cash flow runway',
  'Show my recent invoices',
  'GST requirements for Singapore',
  'Find unusual spending patterns',
  'Compare my vendor costs',
  'Summarize my expenses this month',
]

// Empty state shown when no messages exist
function EmptyState({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  return (
    <div className="flex flex-col justify-between h-full py-6 px-1">
      {/* Welcome text */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-1">
          What do you need help with?
        </h3>
        <p className="text-sm text-muted-foreground">
          Select a topic or type your question below.
        </p>
      </div>

      {/* Suggestion pills — right-aligned */}
      <div className="flex flex-col items-end gap-2">
        {SUGGESTIONS.map((text) => (
          <button
            key={text}
            onClick={() => onSuggestionClick(text)}
            className="text-sm px-4 py-2 rounded-full border border-primary/30 text-foreground
              hover:bg-primary/10 transition-colors text-right"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: CitationData[]
  actions?: ChatAction[]
}

/**
 * Parse follow-up suggestions from a ```suggestions code block in message content.
 * Returns an array of suggestion strings, or empty if none found.
 */
function parseSuggestions(content: string): string[] {
  // Match ```suggestions ... ``` blocks (handles raw and escaped backticks)
  const match = content.match(/(?:\\*`){3,}suggestions\s*\n?([\s\S]*?)(?:\\*`){3,}/)
  if (!match?.[1]) return []

  try {
    const parsed = JSON.parse(match[1].trim())
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) {
      return parsed.slice(0, 3) // Max 3 suggestions
    }
  } catch {
    // Fallback: try to extract quoted strings
    const strings = match[1].match(/"([^"]+)"/g)
    if (strings) {
      return strings.slice(0, 3).map((s) => s.replace(/^"|"$/g, ''))
    }
  }
  return []
}
