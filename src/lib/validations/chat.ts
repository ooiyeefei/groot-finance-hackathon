/**
 * Chat & AI Assistant Validation Schemas
 *
 * Zod schemas for chat messages, conversations, and AI assistant interactions.
 */

import { z } from 'zod'
import {
  documentIdSchema,
  languageSchema,
  paginationSchema,
  searchQuerySchema
} from './common'

/**
 * Chat message role schema
 */
export const chatMessageRoleSchema = z.enum(['user', 'assistant', 'system'], {
  errorMap: () => ({
    message: 'Role must be one of: user, assistant, system'
  })
})

/**
 * Citation source type schema
 */
export const citationSourceTypeSchema = z.enum([
  'document',
  'transaction',
  'regulatory',
  'knowledge_base'
], {
  errorMap: () => ({
    message: 'Source type must be one of: document, transaction, regulatory, knowledge_base'
  })
})

/**
 * Send chat message schema
 */
export const sendChatMessageSchema = z.object({
  message: z.string()
    .min(1, 'Message cannot be empty')
    .max(5000, 'Message too long'),

  conversation_id: documentIdSchema.optional(),

  language: languageSchema.default('en'),

  context: z.object({
    document_id: documentIdSchema.optional(),
    transaction_id: documentIdSchema.optional(),
    business_id: documentIdSchema.optional()
  }).optional()
})

/**
 * Update chat message schema
 */
export const updateChatMessageSchema = z.object({
  message: z.string()
    .min(1, 'Message cannot be empty')
    .max(5000, 'Message too long'),

  regenerate: z.boolean().default(false)
})

/**
 * List conversations query schema
 */
export const listConversationsQuerySchema = paginationSchema.extend({
  search: searchQuerySchema,

  sort_by: z.enum([
    'created_at',
    'updated_at',
    'message_count'
  ]).default('updated_at'),

  sort_order: z.enum(['asc', 'desc']).default('desc')
})

/**
 * Conversation ID parameter schema
 */
export const conversationIdParamSchema = z.object({
  conversationId: documentIdSchema
})

/**
 * Message ID parameter schema
 */
export const messageIdParamSchema = z.object({
  messageId: documentIdSchema
})

/**
 * Citation preview request schema
 */
export const citationPreviewSchema = z.object({
  source_id: documentIdSchema,

  source_type: citationSourceTypeSchema
})

/**
 * Feedback schema for AI responses
 */
export const messageFeedbackSchema = z.object({
  message_id: documentIdSchema,

  rating: z.enum(['positive', 'negative']),

  feedback_text: z.string()
    .max(1000, 'Feedback too long')
    .optional(),

  feedback_categories: z.array(z.enum([
    'inaccurate',
    'incomplete',
    'irrelevant',
    'harmful',
    'helpful',
    'accurate',
    'complete'
  ])).optional()
})

/**
 * Export conversation schema
 */
export const exportConversationSchema = z.object({
  conversation_id: documentIdSchema,

  format: z.enum(['txt', 'json', 'pdf']).default('txt'),

  include_metadata: z.boolean().default(false)
})

/**
 * Type exports
 */
export type ChatMessageRole = z.infer<typeof chatMessageRoleSchema>
export type CitationSourceType = z.infer<typeof citationSourceTypeSchema>
export type SendChatMessageRequest = z.infer<typeof sendChatMessageSchema>
export type UpdateChatMessageRequest = z.infer<typeof updateChatMessageSchema>
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>
export type CitationPreviewRequest = z.infer<typeof citationPreviewSchema>
export type MessageFeedbackRequest = z.infer<typeof messageFeedbackSchema>
export type ExportConversationRequest = z.infer<typeof exportConversationSchema>
