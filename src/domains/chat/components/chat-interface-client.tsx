'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import ActionButton from '@/components/ui/action-button'
import ChatInterface from '@/domains/chat/components/chat-interface'
import ConversationSidebar from '@/domains/chat/components/conversation-sidebar'
import SkeletonLoader from '@/components/ui/skeleton-loader'
import { Menu } from 'lucide-react'
import type { Conversation } from '@/domains/chat/lib/chat.service'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  citations?: Array<{
    id: string
    index: number
    source_name: string
    country: string
    section?: string
    pdf_url?: string
    page_number?: number
    text_coordinates?: {
      x1: number
      y1: number
      x2: number
      y2: number
    }
    content_snippet: string
    confidence_score: number
    official_url?: string
  }>
}

interface ConversationData {
  id: string
  title: string
  language: string
  context_summary?: string
  is_active: boolean
  created_at: string
  updated_at: string
  messages: Array<{
    id: string
    role: 'user' | 'assistant'
    content: string
    created_at: string
    metadata?: {
      citations?: Array<{
        id: string
        index: number
        source_name: string
        country: string
        section?: string
        pdf_url?: string
        page_number?: number
        text_coordinates?: {
          x1: number
          y1: number
          x2: number
          y2: number
        }
        content_snippet: string
        confidence_score: number
        official_url?: string
      }>
    }
  }>
}

interface ChatInterfaceClientProps {
  initialConversations: Conversation[]
  userRole: {
    employee: boolean
    manager: boolean
    admin: boolean
  }
}

export default function ChatInterfaceClient({ initialConversations }: ChatInterfaceClientProps) {
  const { userId, isLoaded } = useAuth()
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>()
  const [chatKey, setChatKey] = useState<string>('initial')
  const [currentMessages, setCurrentMessages] = useState<Message[]>([])
  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)

  // Auto-load most recent conversation from server-provided data
  useEffect(() => {
    const loadMostRecentConversation = async () => {
      if (!isLoaded || !userId || initialLoadComplete) return

      setLoading(true)
      try {
        // Use server-provided initial conversations instead of API call
        if (initialConversations && initialConversations.length > 0) {
          const mostRecentConversation = initialConversations[0]
          await loadConversation(mostRecentConversation.id)
        }
      } catch (error) {
        console.error('Failed to load most recent conversation:', error)
      } finally {
        setLoading(false)
        setInitialLoadComplete(true)
      }
    }

    loadMostRecentConversation()
  }, [isLoaded, userId, initialLoadComplete, initialConversations])

  // Load specific conversation
  const loadConversation = async (conversationId: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/v1/chat/conversations/${conversationId}`)
      if (response.ok) {
        const data = await response.json()
        const conversation: ConversationData = data.conversation

        // Convert API messages to chat interface format
        const formattedMessages: Message[] = conversation.messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.created_at),
          citations: msg.metadata?.citations || []
        }))

        setCurrentMessages(formattedMessages)
        setCurrentConversationId(conversationId)
        setChatKey(`conversation-${conversationId}`) // Force component remount when switching conversations
      }
    } catch (error) {
      console.error('Failed to load conversation:', error)
    } finally {
      setLoading(false)
    }
  }

  // Start new chat
  const startNewChat = () => {
    setCurrentMessages([])
    setCurrentConversationId(undefined)
    setLoading(false) // Ensure loading state is reset
    setChatKey(`new-chat-${Date.now()}`) // Force component remount
  }

  // Handle conversation creation from chat interface
  const handleConversationCreated = (conversationId: string) => {
    setCurrentConversationId(conversationId)
  }

  // Handle messages update from chat interface
  const handleMessagesUpdate = (messages: Message[]) => {
    setCurrentMessages(messages)
  }

  // Handle conversation deletion
  const handleConversationDeleted = (conversationId: string) => {
    // If the deleted conversation was currently active, start a new chat
    if (conversationId === currentConversationId) {
      startNewChat()
    }
  }

  if (!isLoaded || !userId) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-auto p-6">
          <div className="h-[calc(100vh-160px)] max-w-6xl mx-auto">
            <SkeletonLoader variant="chat" className="mt-8" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Chat History Sidebar */}
      <ConversationSidebar
        isOpen={isChatSidebarOpen}
        onClose={() => setIsChatSidebarOpen(false)}
        currentConversationId={currentConversationId}
        onConversationSelect={loadConversation}
        onNewChat={startNewChat}
        onConversationDeleted={handleConversationDeleted}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header Actions */}
        <div className="flex items-center gap-2 p-4 border-b border-record-border">
          <ActionButton
            onClick={startNewChat}
            variant="primary"
            aria-label="Start new chat conversation"
          >
            New Chat
          </ActionButton>
          <button
            onClick={() => setIsChatSidebarOpen(!isChatSidebarOpen)}
            className={`relative group inline-flex items-center justify-center px-3 py-2 rounded-md transition-all duration-200 ease-in-out ${isChatSidebarOpen
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            aria-label={isChatSidebarOpen ? "Close Chat History" : "Open Chat History"}
            title={isChatSidebarOpen ? "Close Chat History" : "Open Chat History"}
          >
            <Menu className="w-4 h-4" />

            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-record-layer-2 text-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-300 pointer-events-none whitespace-nowrap z-10">
              {isChatSidebarOpen ? "Close Chat History" : "Chat History"}
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-record-layer-2"></div>
            </div>
          </button>
        </div>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto p-6">
          {/* Chat Interface */}
          <div className="h-[calc(100vh-160px)] max-w-6xl mx-auto">
            {loading ? (
              <SkeletonLoader variant="chat" className="mt-8" />
            ) : (
              <ChatInterface
                key={chatKey}
                conversationId={currentConversationId}
                onConversationCreated={handleConversationCreated}
                initialMessages={currentMessages}
                onMessagesUpdate={handleMessagesUpdate}
              />
            )}
          </div>
        </main>
      </div>
    </>
  )
}