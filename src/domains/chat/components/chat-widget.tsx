'use client'

/**
 * Floating Chat Widget
 *
 * A floating button anchored at bottom-right that opens an expandable
 * chat window. Renders globally on every page via the root layout.
 */

import { useState, useCallback, useEffect } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { ChatWindow } from './chat-window'
import { useAuth } from '@clerk/nextjs'
import { useActiveBusiness } from '@/contexts/business-context'

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

  return (
    <>
      {/* Chat Window */}
      {isOpen && !isMinimized && (
        <div
          className="fixed bottom-20 right-4 z-50 w-[400px] h-[600px] max-h-[80vh] max-w-[calc(100vw-2rem)]
            animate-in slide-in-from-bottom-4 fade-in duration-200"
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

      {/* Floating Button */}
      <button
        onClick={isOpen ? handleClose : handleOpen}
        className={`
          fixed bottom-4 right-4 z-50
          w-14 h-14 rounded-full shadow-lg
          flex items-center justify-center
          transition-all duration-200 ease-out
          ${
            isOpen
              ? 'bg-muted hover:bg-muted/80 text-foreground'
              : 'bg-primary hover:bg-primary/90 text-primary-foreground hover:scale-105'
          }
        `}
        aria-label={isOpen ? 'Close chat' : 'Open chat assistant'}
        aria-expanded={isOpen}
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
