/**
 * Chat Service Layer
 *
 * Business logic for LangGraph AI agent conversations, messages, and citations.
 *
 * Uses Convex for real-time database operations.
 *
 * North Star Architecture:
 * - All business logic centralized in service layer
 * - API routes are thin wrappers handling HTTP concerns
 */

import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { createFinancialAgent, createAgentState } from '@/lib/ai/langgraph-agent'
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages'
import { type Locale, isValidLocale } from '@/i18n'
import type { CitationData } from '@/lib/ai/tools/base-tool'

// ===== TYPE DEFINITIONS =====

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
  created_at: string
}

// ===== CORE SERVICE FUNCTIONS =====

/**
 * Send chat message and get AI agent response with conversation history and citations
 */
export async function sendChatMessage(
  userId: string,
  convexUserId: string,
  businessId: string,
  request: SendMessageRequest
): Promise<SendMessageResult> {
  const { message, conversationId, language: rawLanguage = 'en' } = request
  const language: Locale = isValidLocale(rawLanguage) ? rawLanguage as Locale : 'en'

  const { client: convexClient } = await getAuthenticatedConvex()
  if (!convexClient) {
    throw new Error('Failed to get Convex client')
  }

  // Get or create conversation
  let currentConversationId: string

  if (conversationId) {
    currentConversationId = conversationId
  } else {
    // Create new conversation via Convex
    const newConversationId = await convexClient.mutation(api.functions.conversations.create, {
      businessId: businessId as any, // Convex will validate
      title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
      language: language
    })

    currentConversationId = newConversationId
  }

  // Get recent conversation history (last 10 messages) for LangGraph context
  const historyResult = await convexClient.query(api.functions.messages.getRecentForContext, {
    conversationId: currentConversationId,
    limit: 10
  })

  // Convert to LangChain format
  const conversationHistory: BaseMessage[] = (historyResult || []).map((msg: any) => {
    if (msg.role === 'user') {
      return new HumanMessage(msg.content)
    } else {
      return new AIMessage(msg.content)
    }
  })

  // Check if this is a clarification response
  const isClarificationResponse = await _checkIfClarificationResponse(
    convexClient,
    currentConversationId,
    message,
    historyResult
  )

  // Create user context for agent
  const userContext = {
    userId: userId,
    convexUserId: convexUserId,
    businessId: businessId,
    conversationId: currentConversationId
  }

  // Create or restore agent state
  let agentState: ReturnType<typeof createAgentState>

  if (isClarificationResponse.isResponse && isClarificationResponse.originalState) {
    // Restore saved agent state from database metadata
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

  // Invoke LangGraph agent with LangSmith tracing
  const financialAgent = createFinancialAgent()

  // LangSmith tracing config - automatically enabled when LANGCHAIN_TRACING_V2=true
  // This provides:
  // - Per-run latency breakdown by node
  // - Tool execution traces with inputs/outputs
  // - Metadata for filtering in LangSmith dashboard
  // - Run grouping by conversation thread
  const runConfig = {
    configurable: {
      thread_id: currentConversationId, // Groups runs by conversation
    },
    runName: `FinanSEAL Chat - ${language}`,
    metadata: {
      userId: userId,
      businessId: businessId,
      conversationId: currentConversationId,
      language: language,
      isClarificationResponse: isClarificationResponse.isResponse,
      messageLength: message.length,
    },
    tags: ['finanseal', 'chat', `lang:${language}`],
  }

  const agentResult = await financialAgent.invoke(agentState, runConfig)

  // Extract response and citations
  const lastMessage = agentResult.messages[agentResult.messages.length - 1]
  let assistantResponse = ''

  if (lastMessage && lastMessage._getType() === 'ai') {
    assistantResponse = typeof lastMessage.content === 'string' ? lastMessage.content : 'I apologize, but I cannot process your request right now.'
  }

  // Clean response and extract citations
  assistantResponse = _parseFinalAnswer(assistantResponse)

  // Extract citations
  const agentCitations = agentResult.citations || []
  assistantResponse = _ensureCitationMarkers(assistantResponse, agentCitations)

  // Save user message to database
  await convexClient.mutation(api.functions.messages.create, {
    conversationId: currentConversationId,
    role: 'user',
    content: message
  })

  // Prepare assistant message metadata
  const assistantMetadata: any = {}

  if (agentCitations.length > 0) {
    assistantMetadata.citations = agentCitations
  }

  if (agentResult.needsClarification && agentResult.clarificationQuestions?.length) {
    assistantMetadata.clarification_pending = true
    // Serialize agent state - convert LangChain messages to plain objects for Convex
    assistantMetadata.agent_state = _serializeAgentState(agentResult)
    assistantMetadata.clarification_questions = agentResult.clarificationQuestions
    assistantMetadata.original_query = message
  }

  // Save assistant message
  await convexClient.mutation(api.functions.messages.create, {
    conversationId: currentConversationId,
    role: 'assistant',
    content: assistantResponse,
    metadata: Object.keys(assistantMetadata).length > 0 ? assistantMetadata : undefined
  })

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
 * List user conversations with message counts
 */
export async function listConversations(
  clerkUserId: string,
  convexUserId: string,
  businessId: string,
  limit: number = 50
): Promise<Conversation[]> {
  console.log(`[Chat Service] listConversations called with businessId: ${businessId}, limit: ${limit}`)

  const { client: convexClient, userId: authUserId } = await getAuthenticatedConvex()
  if (!convexClient) {
    console.error('[Chat Service] ❌ Failed to get authenticated Convex client')
    throw new Error('Failed to get Convex client')
  }

  console.log(`[Chat Service] ✅ Got authenticated Convex client for user: ${authUserId}`)

  // Query conversations via Convex
  console.log(`[Chat Service] Querying Convex conversations.list...`)
  const result = await convexClient.query(api.functions.conversations.list, {
    businessId: businessId as any,
    limit
  })

  console.log(`[Chat Service] Convex returned:`, JSON.stringify(result, null, 2))

  // Transform Convex response to expected format
  const conversations: Conversation[] = (result.conversations || []).map((conv: any) => ({
    id: conv._id,
    title: conv.title || 'New Chat',
    language: conv.language || 'en',
    is_active: conv.isActive ?? true,
    created_at: new Date(conv._creationTime).toISOString(),
    updated_at: conv.updatedAt ? new Date(conv.updatedAt).toISOString() : new Date(conv._creationTime).toISOString(),
    message_count: conv.messageCount ?? 0,
    latest_message: conv.lastMessageContent ? {
      role: conv.lastMessageRole,
      content: conv.lastMessageContent,
      created_at: conv.lastMessageAt ? new Date(conv.lastMessageAt).toISOString() : null
    } : null
  }))

  console.log(`[Chat Service] ✅ Fetched ${conversations.length} conversations via Convex`)
  return conversations
}

/**
 * Create a new empty conversation
 */
export async function createConversation(
  clerkUserId: string,
  convexUserId: string,
  businessId: string,
  language: string = 'en'
): Promise<{ id: string; title: string }> {
  const { client: convexClient } = await getAuthenticatedConvex()
  if (!convexClient) {
    throw new Error('Failed to get Convex client')
  }

  // Create conversation via Convex
  const conversationId = await convexClient.mutation(api.functions.conversations.create, {
    businessId: businessId as any,
    title: 'New Chat',
    language: language
  })

  console.log(`[Chat Service] Created new conversation: ${conversationId}`)

  return {
    id: conversationId,
    title: 'New Chat'
  }
}

/**
 * Get conversation with all messages
 */
export async function getConversation(
  conversationId: string,
  clerkUserId: string,
  convexUserId: string
): Promise<ConversationWithMessages> {
  const { client: convexClient } = await getAuthenticatedConvex()
  if (!convexClient) {
    throw new Error('Failed to get Convex client')
  }

  // Get conversation
  const conversation = await convexClient.query(api.functions.conversations.getById, {
    id: conversationId
  })

  if (!conversation) {
    throw new Error('Conversation not found')
  }

  // Get all messages
  const messagesResult = await convexClient.query(api.functions.messages.list, {
    conversationId: conversationId,
    limit: 1000 // Get all messages
  })

  // Transform to expected format
  const messages: Message[] = (messagesResult.messages || []).map((msg: any) => ({
    id: msg._id,
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
    metadata: msg.metadata,
    created_at: new Date(msg._creationTime).toISOString()
  }))

  return {
    id: conversation._id,
    title: conversation.title || 'New Chat',
    language: conversation.language || 'en',
    is_active: conversation.isActive ?? true,
    created_at: new Date(conversation._creationTime).toISOString(),
    updated_at: conversation.updatedAt ? new Date(conversation.updatedAt).toISOString() : new Date(conversation._creationTime).toISOString(),
    messages
  }
}

/**
 * Delete conversation and messages
 * Note: Convex uses hard delete instead of soft delete
 */
export async function deleteConversation(
  conversationId: string,
  clerkUserId: string,
  convexUserId: string
): Promise<void> {
  const { client: convexClient } = await getAuthenticatedConvex()
  if (!convexClient) {
    throw new Error('Failed to get Convex client')
  }

  // Delete conversation (this also deletes all messages in Convex)
  await convexClient.mutation(api.functions.conversations.remove, {
    id: conversationId
  })

  console.log(`[Chat Service] Deleted conversation: ${conversationId}`)
}

/**
 * Delete message
 * Note: Convex uses hard delete instead of soft delete
 */
export async function deleteMessage(
  messageId: string,
  clerkUserId: string,
  convexUserId: string
): Promise<void> {
  const { client: convexClient } = await getAuthenticatedConvex()
  if (!convexClient) {
    throw new Error('Failed to get Convex client')
  }

  // Delete message
  await convexClient.mutation(api.functions.messages.remove, {
    id: messageId
  })

  console.log(`[Chat Service] Deleted message: ${messageId}`)
}

/**
 * Proxy government PDF documents for citation preview with domain validation
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

// ===== PRIVATE HELPER FUNCTIONS =====

/**
 * Serialize LangGraph agent state for Convex storage
 * Converts LangChain message objects to plain JSON-serializable objects
 *
 * Preserves all important message data:
 * - role, content (essential)
 * - tool_calls, additional_kwargs (for tool-using agents)
 * - name, id (message identity)
 * - response_metadata (model info)
 */
function _serializeAgentState(agentResult: any): any {
  const serialized: any = {}

  // Copy primitive and simple object properties
  for (const [key, value] of Object.entries(agentResult)) {
    if (key === 'messages') {
      // Convert LangChain messages to plain objects, preserving all important data
      serialized.messages = (value as any[]).map((msg: any) => {
        // Check if it's a LangChain message object
        if (msg && typeof msg._getType === 'function') {
          const plainMsg: any = {
            role: msg._getType() === 'human' ? 'user' : 'assistant',
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
          }

          // Preserve tool calls for AI messages (important for agent continuity)
          if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
            plainMsg.tool_calls = msg.tool_calls
          }

          // Preserve additional kwargs (can contain function call details)
          if (msg.additional_kwargs && Object.keys(msg.additional_kwargs).length > 0) {
            plainMsg.additional_kwargs = msg.additional_kwargs
          }

          // Preserve message identity if present
          if (msg.name) plainMsg.name = msg.name
          if (msg.id) plainMsg.id = msg.id

          // Preserve response metadata (token usage, model info)
          if (msg.response_metadata && Object.keys(msg.response_metadata).length > 0) {
            plainMsg.response_metadata = msg.response_metadata
          }

          return plainMsg
        }
        // Already a plain object - ensure it has required fields
        return {
          role: msg.role || 'unknown',
          content: msg.content || '',
          ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
          ...(msg.additional_kwargs && { additional_kwargs: msg.additional_kwargs }),
          ...(msg.name && { name: msg.name }),
          ...(msg.id && { id: msg.id })
        }
      })
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Deep copy objects but skip functions
      serialized[key] = JSON.parse(JSON.stringify(value))
    } else if (typeof value !== 'function') {
      serialized[key] = value
    }
  }

  return serialized
}

/**
 * Parse and clean AI response - removes tool calls, thinking blocks, and DONE commands
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
 * Ensure citation markers are inserted in response text
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
 * Check if message is a clarification response to previous questions
 */
async function _checkIfClarificationResponse(
  convexClient: any,
  conversationId: string,
  message: string,
  recentMessages: any[]
): Promise<{ isResponse: boolean; originalState?: any }> {
  // Look for most recent assistant message with clarification questions
  const reversedMessages = [...recentMessages].reverse()
  const lastAssistantMessage = reversedMessages.find(msg => msg.role === 'assistant')

  if (!lastAssistantMessage) {
    return { isResponse: false }
  }

  // Get full message details to check metadata
  // Note: recentMessages from getRecentForContext doesn't include metadata
  // We need to query the actual message to get metadata
  const messagesResult = await convexClient.query(api.functions.messages.list, {
    conversationId: conversationId,
    limit: 5
  })

  // Find assistant messages with clarification metadata
  const assistantMessages = (messagesResult.messages || [])
    .filter((msg: any) => msg.role === 'assistant')
    .reverse()

  const lastAssistantWithMeta = assistantMessages[0]

  if (!lastAssistantWithMeta) {
    return { isResponse: false }
  }

  // Priority check: Look for explicit clarification state in metadata
  const assistantMetadata = lastAssistantWithMeta.metadata

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
