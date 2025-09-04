'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, Trash2, MoreVertical } from 'lucide-react'
import { useLanguage } from '@/contexts/language-context'
import ConfirmationDialog from '@/components/ui/confirmation-dialog'
import { CitationData } from '@/lib/tools/base-tool'
import CitationOverlay from '@/components/citations/citation-overlay'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  citations?: CitationData[]
}

interface ChatInterfaceProps {
  conversationId?: string
  onConversationCreated?: (conversationId: string) => void
  initialMessages?: Message[]
  onMessagesUpdate?: (messages: Message[]) => void
}

export default function ChatInterface({ conversationId, onConversationCreated, initialMessages, onMessagesUpdate }: ChatInterfaceProps) {
  const { language, t } = useLanguage()
  const [messages, setMessages] = useState<Message[]>(initialMessages || [])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(conversationId)
  const [activeCitation, setActiveCitation] = useState<CitationData | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isUpdatingFromProps = useRef(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null)
  const [isDeletingMessage, setIsDeletingMessage] = useState(false)
  const [openMessageMenuId, setOpenMessageMenuId] = useState<string | null>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleCitationClick = (citation: CitationData) => {
    setActiveCitation(citation)
  }

  const renderContentWithCitations = (content: string, citations: CitationData[] = []) => {
    // Parse [^1], [^2] markers and make them clickable
    const citationRegex = /\[\^(\d+)\]/g
    const parts = content.split(citationRegex)
    
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        // This is a citation number
        const citationIndex = parseInt(part) - 1
        const citation = citations[citationIndex]
        
        if (citation) {
          return (
            <button
              key={`citation-${index}`}
              className="inline-flex items-center px-1 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer mx-0.5 transition-colors"
              onClick={() => handleCitationClick(citation)}
              title={`${citation.source_name} (${citation.country})`}
            >
              ^{part}
            </button>
          )
        } else {
          // Citation reference but no citation data available
          return (
            <span key={`citation-missing-${index}`} className="inline-flex items-center px-1 py-0.5 text-xs bg-gray-500 text-white rounded mx-0.5">
              ^{part}
            </span>
          )
        }
      }
      return part
    })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Sync conversation ID when prop changes
  useEffect(() => {
    setCurrentConversationId(conversationId)
  }, [conversationId])

  // Notify parent when messages change - using useEffect directly to avoid callback recreation
  useEffect(() => {
    if (onMessagesUpdate && messages.length > 0) {
      onMessagesUpdate(messages)
    }
  }, [messages, onMessagesUpdate])

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    }

    // Add user message optimistically
    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          conversationId: currentConversationId,
          language: language
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      
      // Update conversation ID if this was the first message
      if (!currentConversationId && data.conversationId) {
        setCurrentConversationId(data.conversationId)
        onConversationCreated?.(data.conversationId)
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
        citations: data.citations || []
      }

      setMessages(prev => [...prev, assistantMessage])

    } catch (error) {
      console.error('Error sending message:', error)
      
      // Add error message
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `${t.error}: Sorry, I encountered an error while processing your message. Please try again.`,
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  // Handle delete message
  const handleDeleteMessage = async () => {
    if (!messageToDelete) return

    setIsDeletingMessage(true)
    try {
      const response = await fetch(`/api/messages/${messageToDelete}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        // Remove from local state
        setMessages(prev => prev.filter(msg => msg.id !== messageToDelete))
        
        setDeleteDialogOpen(false)
        setMessageToDelete(null)
        setOpenMessageMenuId(null)
      } else {
        console.error('Failed to delete message')
        // TODO: Add toast notification for error
      }
    } catch (error) {
      console.error('Error deleting message:', error)
      // TODO: Add toast notification for error
    } finally {
      setIsDeletingMessage(false)
    }
  }

  // Handle opening delete dialog
  const handleOpenDeleteDialog = (messageId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    setMessageToDelete(messageId)
    setDeleteDialogOpen(true)
    setOpenMessageMenuId(null)
  }

  // Handle closing delete dialog
  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false)
    setMessageToDelete(null)
  }

  // Toggle message menu
  const toggleMessageMenu = (messageId: string, event: React.MouseEvent | React.KeyboardEvent) => {
    event.stopPropagation()
    setOpenMessageMenuId(openMessageMenuId === messageId ? null : messageId)
  }

  // Handle keyboard navigation for delete menus
  const handleMenuKeyDown = (messageId: string, event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleMessageMenu(messageId, event)
    } else if (event.key === 'Escape') {
      setOpenMessageMenuId(null)
    }
  }

  const handleDeleteKeyDown = (messageId: string, event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleOpenDeleteDialog(messageId, event as any)
    }
  }

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenMessageMenuId(null)
    }

    if (openMessageMenuId) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [openMessageMenuId])

  return (
    <div className="flex flex-col h-full bg-gray-800 rounded-lg border border-gray-700">
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">FinanSEAL AI</h3>
            <p className="text-sm text-gray-400">Financial Assistant</p>
          </div>
        </div>
        <div className="text-xs text-gray-500">
          {currentConversationId ? t.connected : t.newChat}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <h4 className="text-lg font-medium text-white mb-2">
              {t.welcome}
            </h4>
            <p className="text-gray-400 text-sm max-w-md mx-auto">
              {t.welcomeSubtitle}
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex items-start space-x-3 ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            } group relative`}
          >
            {message.role === 'assistant' && (
              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            
            <div className="relative">
              <div
                className={`max-w-xs lg:max-w-md rounded-lg ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-100'
                }`}
              >
                <div className="flex items-start justify-between px-4 py-2">
                  <div className="flex-1 mr-2">
                    <div className="text-sm whitespace-pre-wrap">
                      {message.role === 'assistant' && message.citations && message.citations.length > 0
                        ? renderContentWithCitations(message.content, message.citations)
                        : message.content
                      }
                    </div>
                    <p className={`text-xs mt-1 ${
                      message.role === 'user' ? 'text-blue-200' : 'text-gray-400'
                    }`}>
                      {formatTime(message.timestamp)}
                    </p>
                  </div>
                  
                  {/* Integrated Delete Menu Button */}
                  {currentConversationId && (
                    <div className="flex-shrink-0 relative">
                      <button
                        onClick={(e) => toggleMessageMenu(message.id, e)}
                        onKeyDown={(e) => handleMenuKeyDown(message.id, e)}
                        className={`p-1.5 rounded-md transition-all duration-150 ease-in-out group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 ${
                          message.role === 'user'
                            ? 'text-blue-200 opacity-70 hover:bg-blue-700 hover:bg-opacity-30 focus:bg-blue-700 focus:bg-opacity-30'
                            : 'text-gray-300 opacity-70 hover:bg-gray-600 hover:bg-opacity-50 focus:bg-gray-600 focus:bg-opacity-50'
                        }`}
                        aria-label={`Options for message sent at ${formatTime(message.timestamp)}`}
                        tabIndex={0}
                      >
                        <MoreVertical className="w-3 h-3" />
                      </button>
                      
                      {/* Dropdown Menu */}
                      {openMessageMenuId === message.id && (
                        <div className={`absolute top-8 ${
                          message.role === 'user' ? 'right-0' : 'right-0'
                        } bg-gray-800 border border-gray-600 rounded-md shadow-lg z-30 min-w-[80px] overflow-hidden`}>
                          <button
                            onClick={(e) => handleOpenDeleteDialog(message.id, e)}
                            onKeyDown={(e) => handleDeleteKeyDown(message.id, e)}
                            className="w-full text-left px-2 py-1.5 text-xs text-red-400 hover:bg-red-900 hover:bg-opacity-30 hover:text-red-300 transition-colors flex items-center focus:outline-none focus:bg-red-900 focus:bg-opacity-30 focus:ring-2 focus:ring-red-500 focus:ring-inset"
                            tabIndex={0}
                            aria-label={`Delete message sent at ${formatTime(message.timestamp)}`}
                          >
                            <Trash2 className="w-3 h-3 mr-1.5" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {message.role === 'user' && (
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-gray-700 text-gray-100 px-4 py-2 rounded-lg">
              <div className="flex items-center space-x-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">{t.thinking}</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center space-x-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={t.inputPlaceholder}
            className="flex-1 bg-gray-700 text-white placeholder-gray-400 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600"
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
            aria-label={t.send}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {t.inputHelp}
        </p>
      </div>
      
      {/* Delete Message Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleDeleteMessage}
        title="Delete Message"
        message="Are you sure you want to delete this message? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        isLoading={isDeletingMessage}
      />

      {/* Citation Overlay */}
      <CitationOverlay 
        citation={activeCitation}
        isOpen={!!activeCitation}
        onClose={() => setActiveCitation(null)} 
      />
    </div>
  )
}

