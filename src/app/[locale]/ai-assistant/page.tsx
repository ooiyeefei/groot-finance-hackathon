'use client'

import { useState, useEffect, lazy, Suspense } from 'react'
import { useAuth } from '@clerk/nextjs'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import ActionButton from '@/components/ui/action-button'
import SkeletonLoader from '@/components/ui/skeleton-loader'
import { Menu } from 'lucide-react'
import { ClientProviders } from '@/components/providers/client-providers'

// PERFORMANCE OPTIMIZATION: Dynamic imports for heavy components (only load when needed)
const ChatInterface = lazy(() => import('@/domains/chat/components/chat-interface'))
const ConversationSidebar = lazy(() => import('@/domains/chat/components/conversation-sidebar'))

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

export default function AIAssistantPage() {
  const { userId, isLoaded } = useAuth()
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>()
  const [currentMessages, setCurrentMessages] = useState<Message[]>([])
  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0)

  // Redirect if not authenticated
  if (isLoaded && !userId) {
    redirect('/sign-in')
  }

  // Auto-load most recent conversation on initial page load only
  useEffect(() => {
    if (!isLoaded || !userId || initialLoadComplete) return

    const loadMostRecentConversation = async () => {
      setLoading(true)
      try {
        const response = await fetch('/api/v1/chat/conversations')
        if (response.ok) {
          const data = await response.json()
          const conversations = data.conversations

          // Load the most recent conversation if it exists
          if (conversations && conversations.length > 0) {
            const mostRecentConversation = conversations[0]
            await loadConversation(mostRecentConversation.id)
          }
        }
      } catch (error) {
        console.error('Failed to load most recent conversation:', error)
      } finally {
        setLoading(false)
        setInitialLoadComplete(true)
      }
    }

    loadMostRecentConversation()
  }, [isLoaded, userId]) // Removed initialLoadComplete dependency to prevent re-runs

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
      }
    } catch (error) {
      console.error('Failed to load conversation:', error)
    } finally {
      setLoading(false)
    }
  }

  // Start new chat
  const startNewChat = async () => {
    try {
      setLoading(true)

      // Create new conversation via API
      const response = await fetch('/api/v1/chat/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language: 'en' // You can pass locale here if needed
        })
      })

      if (response.ok) {
        const data = await response.json()
        const newConversationId = data.conversation.id

        console.log(`[AI Assistant] Created new conversation: ${newConversationId}`)

        // Clear messages and set new conversation ID
        setCurrentMessages([])
        setCurrentConversationId(newConversationId)

        // Trigger sidebar refresh to show new conversation
        setSidebarRefreshTrigger(prev => prev + 1)
      } else {
        console.error('[AI Assistant] Failed to create conversation')
        // Fallback to clearing UI only
        setCurrentMessages([])
        setCurrentConversationId(undefined)
      }
    } catch (error) {
      console.error('[AI Assistant] Error creating conversation:', error)
      // Fallback to clearing UI only
      setCurrentMessages([])
      setCurrentConversationId(undefined)
    } finally {
      setLoading(false)
    }
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
      <ClientProviders>
        <div className="flex h-screen bg-background">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <HeaderWithUser
              title="AI Assistant"
              subtitle="Get intelligent financial guidance powered by LLM"
            />
            <main className="flex-1 overflow-auto p-6">
              <div className="h-[calc(100vh-160px)] max-w-6xl mx-auto">
                <SkeletonLoader variant="chat" className="mt-8" />
              </div>
            </main>
          </div>
        </div>
      </ClientProviders>
    )
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
          {/* Main Navigation Sidebar */}
          <Sidebar />

          {/* Chat History Sidebar */}
          <Suspense fallback={<div className="w-80 bg-record-layer-2 border-r border-border animate-pulse"></div>}>
            <ConversationSidebar
              isOpen={isChatSidebarOpen}
              onClose={() => setIsChatSidebarOpen(false)}
              currentConversationId={currentConversationId}
              onConversationSelect={loadConversation}
              onNewChat={startNewChat}
              onConversationDeleted={handleConversationDeleted}
              refreshTrigger={sidebarRefreshTrigger}
            />
          </Suspense>
          {/* Main Content */}
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <HeaderWithUser
              title="AI Assistant"
              subtitle="Get intelligent financial guidance powered by LLM"
              actions={
                <>
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
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-300 pointer-events-none whitespace-nowrap z-10">
                      {isChatSidebarOpen ? "Close Chat History" : "Chat History"}
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-border"></div>
                    </div>
                  </button>
                </>
              }
            />

            {/* Main Content Area */}
            <main className="flex-1 overflow-auto p-6">
              {/* Chat Interface */}
              <div className="h-[calc(100vh-160px)] max-w-6xl mx-auto">
                {loading ? (
                  <SkeletonLoader variant="chat" className="mt-8" />
                ) : (
                  <Suspense fallback={<SkeletonLoader variant="chat" className="mt-8" />}>
                    <ChatInterface
                      conversationId={currentConversationId}
                      onConversationCreated={handleConversationCreated}
                      initialMessages={currentMessages}
                      onMessagesUpdate={handleMessagesUpdate}
                    />
                  </Suspense>
                )}
              </div>
            </main>
          </div>
      </div>
    </ClientProviders>
  )
}

