'use client'

/**
 * Floating Chat Widget
 *
 * A floating button anchored at bottom-right that opens an expandable
 * chat window. Renders globally on every page via the root layout.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { ChatWindow } from './chat-window'
import { useAuth } from '@clerk/nextjs'
import { useActiveBusiness } from '@/contexts/business-context'

const STORAGE_KEY = 'chat-widget-position'
const BTN_SIZE = 56 // w-14 h-14 = 56px
const MARGIN = 16  // keep button inside viewport with a margin

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

interface ChatWidgetProps {
  businessId?: string
}

export function ChatWidget({ businessId: businessIdProp }: ChatWidgetProps) {
  const { businessId: activeBusinessId } = useActiveBusiness()
  const businessId = businessIdProp || activeBusinessId || undefined
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [pendingMessage, setPendingMessage] = useState<string | undefined>()
  const { isSignedIn } = useAuth()

  // Draggable position — stored as { right, bottom } from viewport edges
  const [pos, setPos] = useState<{ right: number; bottom: number }>(() => {
    if (typeof window === 'undefined') return { right: MARGIN, bottom: MARGIN }
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) return JSON.parse(saved)
    } catch {}
    return { right: MARGIN, bottom: MARGIN }
  })

  const isDragging = useRef(false)
  const dragStart = useRef<{ mouseX: number; mouseY: number; right: number; bottom: number } | null>(null)
  const hasMoved = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    hasMoved.current = false
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, right: pos.right, bottom: pos.bottom }
    e.preventDefault()
  }, [pos])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !dragStart.current) return
      const dx = dragStart.current.mouseX - e.clientX
      const dy = dragStart.current.mouseY - e.clientY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved.current = true
      const newRight = clamp(dragStart.current.right + dx, MARGIN, window.innerWidth - BTN_SIZE - MARGIN)
      const newBottom = clamp(dragStart.current.bottom + dy, MARGIN, window.innerHeight - BTN_SIZE - MARGIN)
      setPos({ right: newRight, bottom: newBottom })
    }
    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false
        setPos((p) => {
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)) } catch {}
          return p
        })
      }
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const handleOpen = useCallback(() => {
    setIsOpen(true)
    setIsMinimized(false)
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    setIsMinimized(false)
    setPendingMessage(undefined)
  }, [])

  const handleMinimize = useCallback(() => {
    setIsMinimized(true)
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
      const detail = (e as CustomEvent<{ message?: string }>).detail
      if (detail?.message) {
        setPendingMessage(detail.message)
      }
      setIsOpen(true)
      setIsMinimized(false)
    }
    window.addEventListener('finanseal:open-chat', handleOpenChat)
    return () => window.removeEventListener('finanseal:open-chat', handleOpenChat)
  }, [])

  // Don't render for unauthenticated users
  if (!isSignedIn) return null

  const chatWindowBottom = pos.bottom + BTN_SIZE + MARGIN
  const chatWindowRight = pos.right

  return (
    <>
      {/* Chat Window — positioned above the button */}
      {isOpen && !isMinimized && (
        <div
          className="fixed z-50 w-[452px] h-[678px] max-h-[85vh] max-w-[calc(100vw-2rem)]
            animate-in slide-in-from-bottom-4 fade-in duration-200"
          style={{ bottom: chatWindowBottom, right: chatWindowRight }}
          role="dialog"
          aria-label="FinanSEAL Chat Assistant"
        >
          <ChatWindow
            onClose={handleClose}
            onMinimize={handleMinimize}
            businessId={businessId}
            initialMessage={pendingMessage}
            onInitialMessageConsumed={() => setPendingMessage(undefined)}
          />
        </div>
      )}

      {/* Floating Button — draggable */}
      <button
        onMouseDown={handleMouseDown}
        onClick={() => {
          if (hasMoved.current) return // suppress click after drag
          if (isOpen) handleClose(); else handleOpen()
        }}
        style={{ bottom: pos.bottom, right: pos.right }}
        className={`
          fixed z-50
          w-14 h-14 rounded-full shadow-lg
          flex items-center justify-center
          transition-colors duration-200 ease-out
          cursor-grab active:cursor-grabbing select-none
          ${
            isOpen
              ? 'bg-muted hover:bg-muted/80 text-foreground'
              : 'bg-primary hover:bg-primary/90 text-primary-foreground'
          }
        `}
        aria-label={isOpen ? 'Close chat' : 'Open chat assistant'}
        aria-expanded={isOpen}
        title="Drag to move"
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <MessageCircle className="w-6 h-6" />
        )}
      </button>
    </>
  )
}
