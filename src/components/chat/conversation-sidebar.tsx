'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, Plus, Clock, Search, X, Trash2, MoreVertical } from 'lucide-react'
import { useTranslations } from 'next-intl'
import ConfirmationDialog from '@/components/ui/confirmation-dialog'

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
  onConversationDeleted?: (conversationId: string) => void
}

export default function ConversationSidebar({
  isOpen,
  onClose,
  currentConversationId,
  onConversationSelect,
  onNewChat,
  onConversationDeleted
}: ConversationSidebarProps) {
  const t = useTranslations('chat')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

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

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenMenuId(null)
    }

    if (openMenuId) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [openMenuId])

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
      return t('yesterday')
    } else if (diffInDays < 7) {
      return t('daysAgo', { days: diffInDays })
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

  // Handle delete conversation
  const handleDeleteConversation = async () => {
    if (!conversationToDelete) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/conversations/${conversationToDelete}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        // Remove from local state
        setConversations(prev => prev.filter(conv => conv.id !== conversationToDelete))
        
        // Notify parent component if the deleted conversation is currently active
        if (conversationToDelete === currentConversationId) {
          onConversationDeleted?.(conversationToDelete)
        }
        
        setDeleteDialogOpen(false)
        setConversationToDelete(null)
        setOpenMenuId(null)
      } else {
        console.error('Failed to delete conversation')
        // TODO: Add toast notification for error
      }
    } catch (error) {
      console.error('Error deleting conversation:', error)
      // TODO: Add toast notification for error
    } finally {
      setIsDeleting(false)
    }
  }

  // Handle opening delete dialog
  const handleOpenDeleteDialog = (conversationId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    setConversationToDelete(conversationId)
    setDeleteDialogOpen(true)
    setOpenMenuId(null)
  }

  // Handle closing delete dialog
  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false)
    setConversationToDelete(null)
  }

  // Toggle conversation menu
  const toggleMenu = (conversationId: string, event: React.MouseEvent | React.KeyboardEvent) => {
    event.stopPropagation()
    setOpenMenuId(openMenuId === conversationId ? null : conversationId)
  }

  // Handle keyboard navigation for conversation menus
  const handleMenuKeyDown = (conversationId: string, event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleMenu(conversationId, event)
    } else if (event.key === 'Escape') {
      setOpenMenuId(null)
    }
  }

  const handleDeleteKeyDown = (conversationId: string, event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleOpenDeleteDialog(conversationId, event as any)
    }
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
            {t('chatHistory')}
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
            {t('newChat')}
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('searchConversations')}
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
              <div className="animate-pulse">{t('loadingConversations')}</div>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-gray-400">
              {searchQuery ? (
                <div>
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>{t('noConversationsFound')}</p>
                  <p className="text-sm mt-1">{t('tryDifferentSearch')}</p>
                </div>
              ) : (
                <div>
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>{t('noConversationsYet')}</p>
                  <p className="text-sm mt-1">{t('startNewChat')}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {filteredConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`
                    relative rounded-lg transition-colors
                    ${currentConversationId === conversation.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }
                  `}
                >
                  <button
                    onClick={() => {
                      onConversationSelect(conversation.id)
                      onClose()
                    }}
                    className="w-full text-left p-3 rounded-lg pr-12"
                  >
                    <div className="flex flex-col space-y-1">
                      <h4 className="font-medium text-sm leading-tight">
                        {truncateText(conversation.title)}
                      </h4>
                      
                      {conversation.latest_message && (
                        <p className="text-xs opacity-80 leading-tight">
                          <span className="font-medium">
                            {conversation.latest_message.role === 'user' ? t('you') : t('ai')}:
                          </span>{' '}
                          {truncateText(conversation.latest_message.content, 50)}
                        </p>
                      )}
                      
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center text-xs opacity-60">
                          <MessageSquare className="w-3 h-3 mr-1" />
                          <span>{t('messagesCount', { count: conversation.message_count })}</span>
                        </div>
                        <div className="flex items-center text-xs opacity-60">
                          <Clock className="w-3 h-3 mr-1" />
                          <span>{formatTime(conversation.updated_at)}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                  
                  {/* Menu Button */}
                  <div className="absolute top-3 right-3">
                    <button
                      onClick={(e) => toggleMenu(conversation.id, e)}
                      onKeyDown={(e) => handleMenuKeyDown(conversation.id, e)}
                      className={`group/menu p-1.5 rounded-md transition-all duration-150 ease-in-out group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 ${
                        currentConversationId === conversation.id
                          ? 'text-white opacity-70 bg-gray-700 hover:bg-gray-600 focus:bg-gray-600'
                          : 'text-gray-300 opacity-70 bg-gray-700 hover:bg-gray-600 focus:bg-gray-600'
                      }`}
                      aria-label={`Options for conversation: ${conversation.title}`}
                      title="Conversation options"
                      tabIndex={0}
                    >
                      <MoreVertical className="w-3 h-3" />
                    </button>
                    
                    {/* Dropdown Menu */}
                    {openMenuId === conversation.id && (
                      <div className="absolute right-0 top-8 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-30 min-w-[90px] overflow-hidden">
                        <button
                          onClick={(e) => handleOpenDeleteDialog(conversation.id, e)}
                          onKeyDown={(e) => handleDeleteKeyDown(conversation.id, e)}
                          className="w-full text-left px-2 py-1.5 text-xs text-red-400 hover:bg-red-900 hover:bg-opacity-30 hover:text-red-300 transition-colors flex items-center focus:outline-none focus:bg-red-900 focus:bg-opacity-30 focus:ring-2 focus:ring-red-500 focus:ring-inset"
                          aria-label={`Delete conversation: ${conversation.title}`}
                          tabIndex={0}
                        >
                          <Trash2 className="w-3 h-3 mr-1.5" />
                          {t('delete')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Delete Confirmation Dialog - Moved outside sidebar to overlay entire page */}
      <ConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleDeleteConversation}
        title={t('deleteConversation')}
        message={t('deleteConversationConfirm')}
        confirmText={t('delete')}
        cancelText={t('cancel')}
        confirmVariant="danger"
        isLoading={isDeleting}
      />
    </>
  )
}