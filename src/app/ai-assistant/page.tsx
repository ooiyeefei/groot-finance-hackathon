'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import ActionButton from '@/components/ui/action-button'
import ChatInterface from '@/components/chat/chat-interface'
import ConversationSidebar from '@/components/chat/conversation-sidebar'
import { LanguageProvider } from '@/contexts/language-context'
import SkeletonLoader from '@/components/ui/skeleton-loader'
import { Menu } from 'lucide-react'
import { ClientProviders } from '@/components/providers/client-providers'

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
  const [chatKey, setChatKey] = useState<string>('initial')
  const [currentMessages, setCurrentMessages] = useState<Message[]>([])
  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)

  // Redirect if not authenticated
  if (isLoaded && !userId) {
    redirect('/sign-in')
  }

  // Auto-load most recent conversation on page load
  useEffect(() => {
    const loadMostRecentConversation = async () => {
      if (!isLoaded || !userId || initialLoadComplete) return

      setLoading(true)
      try {
        const response = await fetch('/api/conversations')
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
  }, [isLoaded, userId, initialLoadComplete])

  // Load specific conversation
  const loadConversation = async (conversationId: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/conversations/${conversationId}`)
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
      <ClientProviders>
        <div className="flex h-screen bg-gray-900">
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
      <LanguageProvider>
        <div className="flex h-screen bg-gray-900">
          {/* Main Navigation Sidebar */}
          <Sidebar />

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
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      }`}
                    aria-label={isChatSidebarOpen ? "Close Chat History" : "Open Chat History"}
                    title={isChatSidebarOpen ? "Close Chat History" : "Open Chat History"}
                  >
                    <Menu className="w-4 h-4" />

                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-300 pointer-events-none whitespace-nowrap z-10">
                      {isChatSidebarOpen ? "Close Chat History" : "Chat History"}
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
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
        </div>
      </LanguageProvider>
    </ClientProviders>
  )
}

