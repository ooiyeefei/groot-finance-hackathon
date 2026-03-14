'use client'

/**
 * Chat Drawer Widget
 *
 * A right-side drawer panel (desktop) or full-screen overlay (mobile)
 * that houses the AI chat assistant. Renders globally via root layout.
 * The ChatWindow stays mounted when the drawer is closed to preserve
 * conversation state across navigations.
 */

import { useState, useCallback, useEffect } from 'react'
import { MessageCircle } from 'lucide-react'
import { ChatWindow } from './chat-window'
import { useAuth } from '@clerk/nextjs'
import { useActiveBusiness } from '@/contexts/business-context'
import { useSubscription } from '@/domains/billing/hooks/use-subscription'

interface ChatWidgetProps {
  businessId?: string
}

export function ChatWidget({ businessId: businessIdProp }: ChatWidgetProps) {
  const { businessId: activeBusinessId } = useActiveBusiness()
  const businessId = businessIdProp || activeBusinessId || undefined
  const [isOpen, setIsOpen] = useState(false)
  const [pendingMessage, setPendingMessage] = useState<string | undefined>()
  const [pendingDraft, setPendingDraft] = useState<string | undefined>()
  const [pendingSuggestionChips, setPendingSuggestionChips] = useState<string[] | undefined>()
  const [pendingInsightContext, setPendingInsightContext] = useState<Record<string, unknown> | undefined>()
  const { isSignedIn } = useAuth()
  const { data: subscriptionData } = useSubscription()

  const handleOpen = useCallback(() => {
    setIsOpen(true)
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    setPendingMessage(undefined)
    setPendingDraft(undefined)
    setPendingSuggestionChips(undefined)
    setPendingInsightContext(undefined)
  }, [])

  // Handle Escape key to close
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose()
      }
    }
    document.addEventListener('keydown', handleEscKey)
    return () => document.removeEventListener('keydown', handleEscKey)
  }, [isOpen, handleClose])

  // Listen for external open-chat events (e.g. from InsightCard "Ask AI" button)
  useEffect(() => {
    const handleOpenChat = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string; draftMessage?: string; suggestionChips?: string[]; insightContext?: Record<string, unknown> }>).detail
      if (detail?.message) {
        // Legacy: auto-send message (backward compat)
        setPendingMessage(detail.message)
      }
      if (detail?.draftMessage) {
        // New: populate input without sending (editable by user)
        setPendingDraft(detail.draftMessage)
      }
      if (detail?.suggestionChips) {
        setPendingSuggestionChips(detail.suggestionChips)
      }
      if (detail?.insightContext) {
        setPendingInsightContext(detail.insightContext)
      }
      setIsOpen(true)
    }
    window.addEventListener('finanseal:open-chat', handleOpenChat)
    return () => window.removeEventListener('finanseal:open-chat', handleOpenChat)
  }, [])

  // Don't render for unauthenticated users or when subscription is locked
  const LOCKED_STATUSES = ['paused', 'canceled', 'unpaid']
  if (!isSignedIn) return null
  if (subscriptionData && LOCKED_STATUSES.includes(subscriptionData.subscription.status)) return null

  return (
    <>
      {/* Drawer Panel — always mounted, translated off-screen when closed */}
      <div
        className={`
          fixed z-40 bg-background border-l border-border
          transition-transform duration-250 ease-out
          top-0 right-0 h-full
          w-full md:w-[380px]
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        role="dialog"
        aria-label="Groot Finance Chat Assistant"
        aria-hidden={!isOpen}
      >
        <ChatWindow
          onClose={handleClose}
          onMinimize={handleClose}
          businessId={businessId}
          initialMessage={pendingMessage}
          onInitialMessageConsumed={() => setPendingMessage(undefined)}
          draftMessage={pendingDraft}
          onDraftConsumed={() => setPendingDraft(undefined)}
          suggestionChips={pendingSuggestionChips}
          onSuggestionChipsConsumed={() => setPendingSuggestionChips(undefined)}
          insightContext={pendingInsightContext}
          onInsightContextConsumed={() => setPendingInsightContext(undefined)}
        />
      </div>

      {/* Floating Action Button — hidden when drawer is open (header X handles close) */}
      {!isOpen && (
        <button
          onClick={handleOpen}
          className="fixed z-50 bottom-6 right-6 md:bottom-8 md:right-8
            w-14 h-14 rounded-full shadow-lg
            flex items-center justify-center
            transition-all duration-200 ease-out
            bg-primary hover:bg-primary/90 text-primary-foreground"
          aria-label="Open chat assistant"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}
    </>
  )
}
