'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, Plus, Calendar, Clock, Search, X } from 'lucide-react'

interface Conversation {
  id: string
  title: string
  language: string
  context_summary?: string
  is_active: boolean
  created_at: string
  updated_at: string
  message_count: number
  latest_message?: {
    role: 'user' | 'assistant'
    content: string
    created_at: string
  }
}

interface ConversationSidebarProps {
  isOpen: boolean
  onClose: () => void
  currentConversationId?: string
  onConversationSelect: (conversationId: string) => void
  onNewChat: () => void
}

export default function ConversationSidebar({
  isOpen,
  onClose,
  currentConversationId,
  onConversationSelect,
  onNewChat
}: ConversationSidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch conversations
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const response = await fetch('/api/conversations')
        if (response.ok) {
          const data = await response.json()
          setConversations(data.conversations)
        }
      } catch (error) {
        console.error('Failed to fetch conversations:', error)
      } finally {
        setLoading(false)
      }
    }

    if (isOpen) {
      fetchConversations()
    }
  }, [isOpen])

  // Filter conversations based on search query
  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (conv.latest_message?.content && 
     conv.latest_message.content.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMs = now.getTime() - date.getTime()
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))

    if (diffInDays === 0) {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    } else if (diffInDays === 1) {
      return 'Yesterday'
    } else if (diffInDays < 7) {
      return `${diffInDays} days ago`
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      })
    }
  }

  const truncateText = (text: string, maxLength: number = 60) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <div className={`
        fixed lg:relative
        left-0 top-0 
        h-full w-80 
        bg-gray-800 border-r border-gray-700 
        transform transition-transform duration-300 ease-in-out
        z-50 lg:z-auto
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        flex flex-col
      `}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white flex items-center">
            <MessageSquare className="w-5 h-5 mr-2" />
            Chat History
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-4 border-b border-gray-700">
          <button
            onClick={() => {
              onNewChat()
              onClose()
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors flex items-center justify-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Chat
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-700 text-white placeholder-gray-400 rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600"
            />
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-400">
              <div className="animate-pulse">Loading conversations...</div>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-gray-400">
              {searchQuery ? (
                <div>
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No conversations found</p>
                  <p className="text-sm mt-1">Try a different search term</p>
                </div>
              ) : (
                <div>
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No conversations yet</p>
                  <p className="text-sm mt-1">Start a new chat to begin</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {filteredConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => {
                    onConversationSelect(conversation.id)
                    onClose()
                  }}
                  className={`
                    w-full text-left p-3 rounded-lg transition-colors
                    ${currentConversationId === conversation.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }
                  `}
                >
                  <div className="flex items-start justify-between mb-1">
                    <h4 className="font-medium text-sm leading-tight">
                      {truncateText(conversation.title)}
                    </h4>
                    <div className="flex items-center ml-2 flex-shrink-0">
                      <Clock className="w-3 h-3 mr-1 opacity-60" />
                      <span className="text-xs opacity-60">
                        {formatTime(conversation.updated_at)}
                      </span>
                    </div>
                  </div>
                  
                  {conversation.latest_message && (
                    <p className="text-xs opacity-80 leading-tight">
                      <span className="font-medium">
                        {conversation.latest_message.role === 'user' ? 'You' : 'AI'}:
                      </span>{' '}
                      {truncateText(conversation.latest_message.content, 50)}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center text-xs opacity-60">
                      <MessageSquare className="w-3 h-3 mr-1" />
                      <span>{conversation.message_count} messages</span>
                    </div>
                    <div className="flex items-center text-xs opacity-60">
                      <Calendar className="w-3 h-3 mr-1" />
                      <span>{formatTime(conversation.created_at)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}