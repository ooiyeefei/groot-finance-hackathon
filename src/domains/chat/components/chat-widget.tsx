'use client'

/**
 * Chat Drawer Widget
 *
 * A right-side drawer panel (desktop) or full-screen overlay (mobile)
 * that houses the AI chat assistant. Renders globally via root layout.
 * The ChatWindow stays mounted when the drawer is closed to preserve
 * conversation state across navigations.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { MessageCircle } from 'lucide-react'
import { ChatWindow } from './chat-window'
import { useSafeAuth as useAuth } from '@/lib/hooks/use-demo-auth'
import { useActiveBusiness } from '@/contexts/business-context'
import { useSubscription } from '@/domains/billing/hooks/use-subscription'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

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

  // Draggable FAB state
  const fabRef = useRef<HTMLButtonElement>(null)
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, startRight: 24, startBottom: 24, moved: false })
  const [fabPosition, setFabPosition] = useState({ right: 24, bottom: 24 })

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current
    ds.dragging = true
    ds.moved = false
    ds.startX = e.clientX
    ds.startY = e.clientY
    ds.startRight = fabPosition.right
    ds.startBottom = fabPosition.bottom
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [fabPosition])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current
    if (!ds.dragging) return
    const dx = ds.startX - e.clientX
    const dy = ds.startY - e.clientY
    if (!ds.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return
    ds.moved = true
    const maxRight = window.innerWidth - 56
    const maxBottom = window.innerHeight - 56
    setFabPosition({
      right: Math.max(8, Math.min(maxRight, ds.startRight + dx)),
      bottom: Math.max(8, Math.min(maxBottom, ds.startBottom + dy)),
    })
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current
    ds.dragging = false
    if (!ds.moved) {
      handleOpen()
    }
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
  }, [handleOpen])

  // Proactive alert unread badge count (031-action-center-push-chat)
  // @ts-ignore — new Convex module, types not yet generated (will resolve after convex deploy)
  const unreadData = useQuery(api.functions.proactiveAlerts.getUnreadCount,
    businessId ? { businessId } : "skip"
  )
  const unreadCount = unreadData?.count ?? 0
  const unreadCapped = unreadData?.capped ?? false

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
          w-full md:w-[500px]
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

      {/* Floating Action Button — draggable, hidden when drawer is open */}
      {!isOpen && (
        <button
          ref={fabRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ right: fabPosition.right, bottom: fabPosition.bottom }}
          className="fixed z-50 w-14 h-14 rounded-full shadow-lg
            flex items-center justify-center select-none touch-none
            transition-shadow duration-200 ease-out
            bg-primary hover:bg-primary/90 text-primary-foreground"
          aria-label="Open chat assistant"
        >
          <MessageCircle className="w-6 h-6 pointer-events-none" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1
              flex items-center justify-center rounded-full text-[10px] font-bold
              bg-destructive text-destructive-foreground pointer-events-none">
              {unreadCapped ? '20+' : unreadCount}
            </span>
          )}
        </button>
      )}
    </>
  )
}
