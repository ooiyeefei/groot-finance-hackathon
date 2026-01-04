/**
 * Chat Domain Hooks
 *
 * Realtime hooks for chat functionality.
 * Provider-agnostic interface - implementation details are hidden.
 */

export {
  // Hooks
  useConversations,
  useConversation,
  useMessages,
  useSendMessage,
  useCreateConversation,
  useArchiveConversation,
  useDeleteConversation,
  // Types
  type ChatMessage,
  type Conversation,
  type Citation,
  type ToolCall,
  type ConversationsResult,
  type MessagesResult,
  type SendMessageOptions,
  type SendMessageResult,
  type CreateConversationResult,
} from './use-realtime-chat'
