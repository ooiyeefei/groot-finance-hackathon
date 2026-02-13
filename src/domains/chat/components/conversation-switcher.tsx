'use client'

/**
 * Conversation Switcher
 *
 * A compact dropdown/list within the chat window header for switching
 * between conversations. Not a full sidebar — designed to be minimal.
 */

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Plus, Trash2, MessageSquare } from 'lucide-react'
import type { Conversation } from '../hooks/use-realtime-chat'

interface ConversationSwitcherProps {
  conversations: Conversation[]
  activeConversationId: string | undefined
  onSelect: (conversationId: string) => void
  onCreate: () => void
  onArchive: (conversationId: string) => void
  isLoading?: boolean
}

export function ConversationSwitcher({
  conversations,
  activeConversationId,
  onSelect,
  onCreate,
  onArchive,
  isLoading = false,
}: ConversationSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const activeConversation = conversations.find((c) => c.id === activeConversationId)
  const displayTitle = activeConversation?.title || 'New Chat'

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-sm text-foreground hover:bg-muted rounded px-2 py-1 transition-colors max-w-[180px]"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="truncate">{displayTitle}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {/* New Conversation Button */}
          <button
            onClick={() => {
              onCreate()
              setIsOpen(false)
            }}
            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-primary hover:bg-muted transition-colors border-b border-border"
          >
            <Plus className="w-4 h-4" />
            <span className="font-medium">New Conversation</span>
          </button>

          {/* Conversations List */}
          <div className="max-h-64 overflow-y-auto" role="listbox">
            {isLoading ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                Loading...
              </div>
            ) : conversations.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No conversations yet
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  role="option"
                  aria-selected={conv.id === activeConversationId}
                  className={`
                    group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors
                    ${
                      conv.id === activeConversationId
                        ? 'bg-primary/10 text-foreground'
                        : 'text-foreground hover:bg-muted'
                    }
                  `}
                  onClick={() => {
                    onSelect(conv.id)
                    setIsOpen(false)
                  }}
                >
                  <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{conv.title}</p>
                    {conv.lastMessage && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {conv.lastMessage.content}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onArchive(conv.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive rounded transition-all"
                    aria-label={`Delete ${conv.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
