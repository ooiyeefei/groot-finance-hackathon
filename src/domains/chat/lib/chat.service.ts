/**
 * Chat Service Layer
 *
 * Business logic for LangGraph AI agent conversations, messages, and citations.
 * Handles conversation management, message threading, and citation preview.
 */

import { createBusinessContextSupabaseClient } from '@/lib/db/supabase-server'
import { createFinancialAgent, createAgentState } from '@/lib/ai/langgraph-agent'
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages'
import { type Locale, isValidLocale } from '@/i18n'
import type { CitationData } from '@/lib/ai/tools/base-tool'

// ============================================================================
// Types
// ============================================================================

export interface SendMessageRequest {
  message: string
  conversationId?: string
  language?: string
}

export interface SendMessageResult {
  message: string
  conversationId: string
  citations: CitationData[]
  confidence: number
  needsClarification: boolean
  clarificationQuestions: string[]
  debugInfo?: any
}

export interface Conversation {
  id: string
  title: string
  language: string
  context_summary?: string
  is_active: boolean
  created_at: string
  updated_at: string
  message_count?: number
  latest_message?: any
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[]
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  metadata?: any
  token_count?: number
  created_at: string
}

// ============================================================================
// Main Chat Functions
// ============================================================================

/**
 * Send a chat message and get AI agent response
 * Handles LangGraph agent invocation, conversation history, and citations
 */
export async function sendChatMessage(
  userId: string,
  supabaseUserId: string,
  businessId: string,
  request: SendMessageRequest
): Promise<SendMessageResult> {
  const { message, conversationId, language: rawLanguage = 'en' } = request
  const language: Locale = isValidLocale(rawLanguage) ? rawLanguage as Locale : 'en'

  const supabase = await createBusinessContextSupabaseClient(userId)

  // Step 1: Get or create conversation
  let currentConversationId: string

  if (conversationId) {
    currentConversationId = conversationId
  } else {
    const { data: newConversation, error: conversationError } = await supabase
      .from('conversations')
      .insert({
        user_id: supabaseUserId,
        business_id: businessId,
        title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
        language: language
      })
      .select('id')
      .single()

    if (conversationError) {
      throw new Error(`Failed to create conversation: ${conversationError.message}`)
    }

    currentConversationId = newConversation.id
  }

  // Step 2: Get recent conversation history (last 10 messages) with metadata
  const { data: recentMessages, error: historyError } = await supabase
    .from('messages')
    .select('role, content, metadata')
    .eq('conversation_id', currentConversationId)
    .eq('user_id', supabaseUserId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (historyError) {
    throw new Error(`Failed to fetch conversation history: ${historyError.message}`)
  }

  // Convert database messages to LangChain format (reverse to chronological order)
  const conversationHistory: BaseMessage[] = recentMessages.reverse().map(msg => {
    if (msg.role === 'user') {
      return new HumanMessage(msg.content)
    } else {
      return new AIMessage(msg.content)
    }
  })

  // Step 3: Check if this is a clarification response
  const isClarificationResponse = await _checkIfClarificationResponse(
    supabase,
    currentConversationId,
    userId,
    message,
    recentMessages
  )

  // Step 4: Create user context for agent
  const userContext = {
    userId: userId,
    supabaseUserId: supabaseUserId,
    businessId: businessId,
    conversationId: currentConversationId
  }

  // Step 5: Create or restore agent state
  let agentState: ReturnType<typeof createAgentState>

  if (isClarificationResponse.isResponse && isClarificationResponse.originalState) {
    // Restore saved agent state from database metadata
    console.log('[Chat Service] Restoring agent state from database metadata')
    agentState = isClarificationResponse.originalState as ReturnType<typeof createAgentState>

    // Preserve userContext from current request
    agentState.userContext = userContext
    agentState.messages = conversationHistory.concat([new HumanMessage(message)])

    // Reset phase if completed to allow clarification processing
    if (agentState.currentPhase === 'completed') {
      agentState.currentPhase = 'execution'
    }

    agentState.needsClarification = false
    agentState.isClarificationResponse = true
  } else {
    // Create new agent state
    agentState = createAgentState(userContext, message, language)
    agentState.messages = conversationHistory.concat([new HumanMessage(message)])
  }

  // Step 6: Invoke LangGraph agent
  const financialAgent = createFinancialAgent()
  const agentResult = await financialAgent.invoke(agentState)

  // Step 7: Extract response and citations
  const lastMessage = agentResult.messages[agentResult.messages.length - 1]
  let assistantResponse = ''

  if (lastMessage && lastMessage._getType() === 'ai') {
    assistantResponse = typeof lastMessage.content === 'string' ? lastMessage.content : 'I apologize, but I cannot process your request right now.'
  }

  // Clean up response
  assistantResponse = _parseFinalAnswer(assistantResponse)

  // Extract citations
  const agentCitations = agentResult.citations || []
  assistantResponse = _ensureCitationMarkers(assistantResponse, agentCitations)

  // Step 8: Save messages to database
  await supabase
    .from('messages')
    .insert({
      conversation_id: currentConversationId,
      user_id: supabaseUserId,
      role: 'user',
      content: message
    })

  // Prepare assistant metadata
  const assistantMetadata: any = {}

  if (agentCitations.length > 0) {
    assistantMetadata.citations = agentCitations
  }

  if (agentResult.needsClarification && agentResult.clarificationQuestions?.length) {
    assistantMetadata.clarification_pending = true
    assistantMetadata.agent_state = agentResult
    assistantMetadata.clarification_questions = agentResult.clarificationQuestions
    assistantMetadata.original_query = message
  }

  await supabase
    .from('messages')
    .insert({
      conversation_id: currentConversationId,
      user_id: supabaseUserId,
      role: 'assistant',
      content: assistantResponse,
      metadata: Object.keys(assistantMetadata).length > 0 ? assistantMetadata : null
    })

  // Update conversation timestamp
  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', currentConversationId)
    .eq('user_id', supabaseUserId)

  return {
    message: assistantResponse,
    conversationId: currentConversationId,
    citations: agentCitations,
    confidence: agentResult.currentIntent?.confidence || 0.8,
    needsClarification: agentResult.needsClarification || false,
    clarificationQuestions: agentResult.clarificationQuestions || [],
    debugInfo: { finalState: agentResult }
  }
}

/**
 * List user's conversations with message counts
 */
export async function listConversations(
  clerkUserId: string,
  supabaseUserId: string,
  businessId: string,
  limit: number = 50
): Promise<Conversation[]> {
  const supabase = await createBusinessContextSupabaseClient(clerkUserId)

  console.log(`[Chat Service] DEBUG: Executing conversations query with:`, {
    supabaseUserId,
    businessId,
    limit
  })

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select(`
      id,
      title,
      language,
      context_summary,
      is_active,
      created_at,
      updated_at,
      messages (
        id,
        role,
        content,
        created_at,
        deleted_at
      )
    `)
    .eq('user_id', supabaseUserId)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error(`[Chat Service] DEBUG: Database query failed:`, error)
    throw new Error(`Failed to fetch conversations: ${error.message}`)
  }

  console.log(`[Chat Service] DEBUG: Raw database result - found ${conversations?.length || 0} conversations`)

  // Format conversations with latest message preview
  const formattedConversations = conversations.map(conv => {
    const activeMessages = conv.messages?.filter(msg => !msg.deleted_at) || []

    return {
      id: conv.id,
      title: conv.title,
      language: conv.language,
      context_summary: conv.context_summary,
      is_active: conv.is_active,
      created_at: conv.created_at,
      updated_at: conv.updated_at,
      message_count: activeMessages.length,
      latest_message: activeMessages.length > 0 ? activeMessages[activeMessages.length - 1] : null
    }
  })

  console.log(`[Chat Service] DEBUG: Formatted ${formattedConversations.length} conversations for response`)

  return formattedConversations
}

/**
 * Get specific conversation with all messages
 */
export async function getConversation(
  conversationId: string,
  clerkUserId: string,
  supabaseUserId: string
): Promise<ConversationWithMessages> {
  const supabase = await createBusinessContextSupabaseClient(clerkUserId)

  // Get conversation
  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select(`
      id,
      title,
      language,
      context_summary,
      is_active,
      created_at,
      updated_at
    `)
    .eq('id', conversationId)
    .eq('user_id', supabaseUserId)
    .is('deleted_at', null)
    .single()

  if (conversationError) {
    if (conversationError.code === 'PGRST116') {
      throw new Error('Conversation not found')
    }
    throw new Error(`Failed to fetch conversation: ${conversationError.message}`)
  }

  // Get all messages
  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select(`
      id,
      role,
      content,
      metadata,
      token_count,
      created_at
    `)
    .eq('conversation_id', conversationId)
    .eq('user_id', supabaseUserId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (messagesError) {
    throw new Error(`Failed to fetch messages: ${messagesError.message}`)
  }

  return {
    ...conversation,
    messages: messages || []
  }
}

/**
 * Soft delete conversation and all its messages
 */
export async function deleteConversation(
  conversationId: string,
  clerkUserId: string,
  supabaseUserId: string
): Promise<void> {
  const supabase = await createBusinessContextSupabaseClient(clerkUserId)
  const now = new Date().toISOString()

  // Soft delete conversation
  const { error: conversationError } = await supabase
    .from('conversations')
    .update({ deleted_at: now })
    .eq('id', conversationId)
    .eq('user_id', supabaseUserId)
    .is('deleted_at', null)

  if (conversationError) {
    throw new Error(`Failed to delete conversation: ${conversationError.message}`)
  }

  // Soft delete all messages in the conversation
  const { error: messagesError } = await supabase
    .from('messages')
    .update({ deleted_at: now })
    .eq('conversation_id', conversationId)
    .eq('user_id', supabaseUserId)
    .is('deleted_at', null)

  if (messagesError) {
    console.error('[Chat Service] Failed to delete messages:', messagesError)
    // Continue - conversation deletion is more important
  }
}

/**
 * Soft delete a specific message
 */
export async function deleteMessage(
  messageId: string,
  clerkUserId: string,
  supabaseUserId: string
): Promise<void> {
  const supabase = await createBusinessContextSupabaseClient(clerkUserId)

  // Verify message belongs to user by checking conversation ownership
  const { data: message, error: fetchError } = await supabase
    .from('messages')
    .select(`
      id,
      conversation_id,
      conversations!inner (
        user_id
      )
    `)
    .eq('id', messageId)
    .eq('conversations.user_id', supabaseUserId)
    .is('deleted_at', null)
    .single()

  if (fetchError || !message) {
    throw new Error('Message not found')
  }

  // Soft delete message
  const { error: deleteError } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)
    .is('deleted_at', null)

  if (deleteError) {
    throw new Error(`Failed to delete message: ${deleteError.message}`)
  }
}

/**
 * Proxy government PDF documents for citation preview
 * Validates domain whitelist and caches responses
 */
export async function proxyCitationDocument(url: string): Promise<Response> {
  // Validate URL is from trusted government domains
  const allowedDomains = ['ssm.com.my', 'gov.sg', 'jhi.gov.my', 'mida.gov.my']
  const urlObj = new URL(url)
  const isAllowed = allowedDomains.some(domain => urlObj.hostname.includes(domain))

  if (!isAllowed) {
    throw new Error('Domain not allowed')
  }

  // Fetch PDF from government server
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'FinanSEAL Bot 1.0'
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch PDF: ${response.status}`)
  }

  const pdfBuffer = await response.arrayBuffer()

  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
    }
  })
}

// ============================================================================
// Private Helper Functions
// ============================================================================

/**
 * Parse and clean final AI response
 * Removes tool calls, thinking blocks, and DONE commands
 */
function _parseFinalAnswer(content: string): string {
  if (!content || typeof content !== 'string') {
    return content
  }

  // Remove malformed tool call artifacts
  content = content
    .replace(/<\/tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/\{"name":\s*"[^"]+",\s*"arguments":\s*\{[^}]*\}\}/g, '')
    .replace(/^(Let me see what|Hmm, maybe|I should|The tool|Looking at|From what|According to)[\s\S]*?(?=The |Your |Here |In )/mi, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim()

  // Enhanced DONE command filtering
  if (/^\s*DONE\s*[.\-\s]*$/i.test(content) ||
    /^\s*DONE\s*$/i.test(content) ||
    content.trim().toUpperCase() === 'DONE' ||
    /^DONE[\s\.\-]*$/i.test(content.trim()) ||
    /^\**\s*DONE\s*\**$/i.test(content.trim())) {
    return "I've completed processing your request."
  }

  // Remove DONE at the end
  content = content.replace(/\s+DONE\s*[.\-]*\s*$/i, '').trim()

  // Fallback for empty content
  if (!content || content.length < 10) {
    return 'I apologize, but I encountered an issue processing that request.'
  }

  return content
}

/**
 * Ensure citation markers are properly inserted
 */
function _ensureCitationMarkers(content: string, citations: CitationData[]): string {
  if (!citations || citations.length === 0) {
    return content
  }

  // Check if response already has citation markers
  const hasCitationMarkers = /\[\^\d+\]/.test(content)

  if (hasCitationMarkers) {
    return content
  }

  // Try to add citation markers for each citation
  let processedContent = content

  citations.forEach((citation, index) => {
    const citationMarker = `[^${index + 1}]`
    const sourceName = citation.source_name

    if (sourceName && sourceName !== 'Unknown Source') {
      const sourceRegex = new RegExp(`\\b${sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')

      if (sourceRegex.test(processedContent)) {
        processedContent = processedContent.replace(sourceRegex, (match) => {
          return `${match} ${citationMarker}`
        })
      }
    }
  })

  // If still no citation markers but content is regulatory, add general citation
  if (!/\[\^\d+\]/.test(processedContent) && citations.length > 0) {
    if (processedContent.includes('regulation') || processedContent.includes('requirement') ||
      processedContent.includes('GST') || processedContent.includes('tax')) {
      processedContent += ` [^1]`
    }
  }

  return processedContent
}

/**
 * Check if current message is a clarification response
 */
async function _checkIfClarificationResponse(
  supabase: any,
  conversationId: string,
  userId: string,
  message: string,
  recentMessages: any[]
): Promise<{ isResponse: boolean; originalState?: any }> {
  // Look for most recent assistant message with clarification questions
  const lastAssistantMessage = [...recentMessages]
    .reverse()
    .find(msg => msg.role === 'assistant')

  if (!lastAssistantMessage) {
    return { isResponse: false }
  }

  // Priority check: Look for explicit clarification state in metadata
  const assistantMetadata = lastAssistantMessage.metadata as any

  if (assistantMetadata && assistantMetadata.clarification_pending) {
    // Check if user message appears to be answering clarification questions
    const messageWords = message.toLowerCase().trim()
    const clarificationKeywords = [
      'singapore', 'malaysia', 'thailand', 'indonesia',
      'sole proprietorship', 'partnership', 'private limited', 'pte ltd', 'sdn bhd',
      'individual', 'sme', 'small', 'medium', 'corporate', 'startup',
      'retail', 'restaurant', 'food', 'tech', 'technology', 'consulting',
      'manufacturing', 'trading', 'import', 'export', 'ecommerce', 'fintech',
      'immediately', 'month', 'months', 'soon', 'planning', 'exploring'
    ]

    const matchingKeywords = clarificationKeywords.filter(keyword =>
      messageWords.includes(keyword)
    )

    const isLikelyClarificationResponse = matchingKeywords.length > 0 || messageWords.length < 50

    if (isLikelyClarificationResponse) {
      return {
        isResponse: true,
        originalState: assistantMetadata.agent_state
      }
    }
  }

  return { isResponse: false }
}
