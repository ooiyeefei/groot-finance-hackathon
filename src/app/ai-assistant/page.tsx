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
import { Menu } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
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
  }>
}

export default function AIAssistantPage() {
  const { userId, isLoaded } = useAuth()
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>()
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
          timestamp: new Date(msg.created_at)
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
  const startNewChat = () => {
    setCurrentMessages([])
    setCurrentConversationId(undefined)
  }

  // Handle conversation creation from chat interface
  const handleConversationCreated = (conversationId: string) => {
    setCurrentConversationId(conversationId)
  }

  if (!isLoaded || !userId) {
    return (
      <div className="flex h-screen bg-gray-900 items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  return (
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
                <ActionButton
                  onClick={() => setIsChatSidebarOpen(true)}
                  variant="secondary"
                  aria-label="Open chat history sidebar"
                >
                  <Menu className="w-5 h-5" />
                </ActionButton>
              </>
            }
          />
          
          {/* Main Content Area */}
          <main className="flex-1 overflow-auto p-6">
            {/* Chat Interface */}
            <div className="h-[calc(100vh-160px)] max-w-6xl mx-auto">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-white">Loading conversation...</div>
                </div>
              ) : (
                <ChatInterface
                  conversationId={currentConversationId}
                  onConversationCreated={handleConversationCreated}
                  initialMessages={currentMessages}
                />
              )}
            </div>
          </main>
        </div>
      </div>
    </LanguageProvider>
  )
}

