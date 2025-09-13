import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { SupportedLanguage } from '@/lib/translations'
import { createFinancialAgent, createAgentState } from '@/lib/langgraph-agent'
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages'
import { CitationData } from '@/lib/tools/base-tool'

interface ChatRequest {
  message: string
  conversationId?: string
  language?: SupportedLanguage
}


/**
 * Simplified response parser for direct AI responses
 * Removes any malformed tool calls or reasoning artifacts
 */
function parseFinalAnswer(content: string): string {
  if (!content || typeof content !== 'string') {
    return content
  }

  // Remove any malformed tool call artifacts that confuse the model
  content = content
    .replace(/<\/tool_call>[\s\S]*?<\/tool_call>/gi, '') // Remove malformed tool call blocks
    .replace(/\{"name":\s*"[^"]+",\s*"arguments":\s*\{[^}]*\}\}/g, '') // Remove JSON tool call artifacts
    .replace(/^(Let me see what|Hmm, maybe|I should|The tool|Looking at|From what|According to)[\s\S]*?(?=The |Your |Here |In )/mi, '') // Remove reasoning preambles
    .replace(/<think>[\s\S]*?<\/think>/gi, '') // Remove any remaining think blocks
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '') // Remove thinking blocks
    .trim()

  // ENHANCED DONE command filtering - catch all variations
  // Check for DONE at start of line, standalone DONE, or DONE with punctuation
  if (/^\s*DONE\s*[.\-\s]*$/i.test(content) || 
      /^\s*DONE\s*$/i.test(content) || 
      content.trim().toUpperCase() === 'DONE' ||
      /^DONE[\s\.\-]*$/i.test(content.trim()) ||
      /^\**\s*DONE\s*\**$/i.test(content.trim())) {
    return "I've completed processing your request."
  }

  // Remove DONE at the end of responses if it appears standalone
  content = content.replace(/\s+DONE\s*[.\-]*\s*$/i, '').trim()

  // If content is empty or too short after cleaning, provide fallback
  if (!content || content.length < 10) {
    return 'I apologize, but I encountered an issue processing that request.'
  }

  return content
}

/**
 * Post-process response to ensure citation markers are properly inserted
 */
function ensureCitationMarkers(content: string, citations: CitationData[]): string {
  if (!citations || citations.length === 0) {
    return content
  }

  // Check if the response already has citation markers
  const hasCitationMarkers = /\[\^\d+\]/.test(content)
  
  if (hasCitationMarkers) {
    console.log('[CitationProcessor] Response already contains citation markers')
    return content
  }

  console.log(`[CitationProcessor] No citation markers found, attempting to add them for ${citations.length} citations`)

  // If response mentions sources but lacks citation markers, try to add them
  let processedContent = content

  // For each citation, try to find mentions of the source name and add citation markers
  citations.forEach((citation, index) => {
    const citationMarker = `[^${index + 1}]`
    const sourceName = citation.source_name

    if (sourceName && sourceName !== 'Unknown Source') {
      // Try to find mentions of the source name and add citation markers
      const sourceRegex = new RegExp(`\\b${sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
      
      // Only add citation marker if we find the source mentioned
      if (sourceRegex.test(processedContent)) {
        processedContent = processedContent.replace(sourceRegex, (match) => {
          return `${match} ${citationMarker}`
        })
      }
    }
  })

  // If we still don't have citation markers but have meaningful content about regulations/requirements
  if (!/\[\^\d+\]/.test(processedContent) && citations.length > 0) {
    // Add a general citation at the end for regulatory content
    if (processedContent.includes('regulation') || processedContent.includes('requirement') || processedContent.includes('GST') || processedContent.includes('tax')) {
      processedContent += ` [^1]`
      console.log('[CitationProcessor] Added general citation marker at end')
    }
  }

  return processedContent
}

/**
 * Extract established facts from a user message in response to clarification questions
 */
function extractEstablishedFacts(message: string): Record<string, string> {
  const facts: Record<string, string> = {};
  const messageWords = message.toLowerCase().trim();

  // Extract country information
  if (messageWords.includes('singapore')) {
    facts.country = 'Singapore';
  } else if (messageWords.includes('malaysia')) {
    facts.country = 'Malaysia';
  } else if (messageWords.includes('thailand')) {
    facts.country = 'Thailand';
  } else if (messageWords.includes('indonesia')) {
    facts.country = 'Indonesia';
  }

  // Extract business structure information
  if (messageWords.includes('sole proprietorship')) {
    facts.businessStructure = 'Sole Proprietorship';
  } else if (messageWords.includes('partnership')) {
    facts.businessStructure = 'Partnership';
  } else if (messageWords.includes('private limited') || messageWords.includes('pte ltd')) {
    facts.businessStructure = 'Private Limited Company';
  } else if (messageWords.includes('sdn bhd')) {
    facts.businessStructure = 'Sdn Bhd';
  }

  // Extract business type information
  if (messageWords.includes('individual')) {
    facts.businessType = 'Individual';
  } else if (messageWords.includes('sme') || messageWords.includes('small')) {
    facts.businessType = 'SME';
  } else if (messageWords.includes('corporate')) {
    facts.businessType = 'Corporate';
  } else if (messageWords.includes('startup')) {
    facts.businessType = 'Startup';
  }

  // Extract industry information
  if (messageWords.includes('retail')) {
    facts.industry = 'Retail';
  } else if (messageWords.includes('restaurant') || messageWords.includes('food')) {
    facts.industry = 'Food & Beverage';
  } else if (messageWords.includes('tech') || messageWords.includes('technology')) {
    facts.industry = 'Technology';
  } else if (messageWords.includes('consulting')) {
    facts.industry = 'Consulting';
  } else if (messageWords.includes('manufacturing')) {
    facts.industry = 'Manufacturing';
  } else if (messageWords.includes('trading')) {
    facts.industry = 'Trading';
  }

  return facts;
}

/**
 * Check if the current message is a clarification response
 * by analyzing conversation history for recent clarification questions
 */
async function checkIfClarificationResponse(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  conversationId: string,
  userId: string,
  message: string,
  recentMessages: Record<string, unknown>[]
): Promise<{ isResponse: boolean; originalState?: Record<string, unknown> }> {
  console.log(`[ClarificationCheck] Starting clarification check for message: "${message}"`)
  console.log(`[ClarificationCheck] Recent messages count: ${recentMessages.length}`)
  
  // Look for the most recent assistant message with clarification questions
  const lastAssistantMessage = [...recentMessages]
    .reverse()
    .find(msg => msg.role === 'assistant')
  
  if (!lastAssistantMessage) {
    console.log(`[ClarificationCheck] No assistant message found`)
    return { isResponse: false }
  }
  
  console.log(`[ClarificationCheck] Last assistant message:`, {
    content: String(lastAssistantMessage.content || '').substring(0, 100) + '...',
    hasMetadata: !!lastAssistantMessage.metadata,
    metadata: lastAssistantMessage.metadata
  })
  
  // PRIORITY CHECK: Look for explicit clarification state in metadata first
  const assistantMetadata = lastAssistantMessage.metadata as any
  console.log(`[ClarificationCheck] Assistant metadata check:`, {
    hasMetadata: !!assistantMetadata,
    hasClarificationPending: assistantMetadata?.clarification_pending,
    hasAgentState: !!assistantMetadata?.agent_state,
    metadataKeys: assistantMetadata ? Object.keys(assistantMetadata) : []
  })
  
  if (assistantMetadata && assistantMetadata.clarification_pending) {
    console.log(`[ClarificationCheck] ✅ Clarification response detected via metadata!`)
    
    // Check if user message appears to be answering clarification questions
    const messageWords = message.toLowerCase().trim()
    const clarificationKeywords = [
      // Country responses
      'singapore', 'malaysia', 'thailand', 'indonesia',
      // Business structure responses
      'sole proprietorship', 'partnership', 'private limited', 'pte ltd', 'sdn bhd',
      // Business type responses  
      'individual', 'sme', 'small', 'medium', 'corporate', 'startup',
      // Industry responses (partial matching)
      'retail', 'restaurant', 'food', 'tech', 'technology', 'consulting', 
      'manufacturing', 'trading', 'import', 'export', 'ecommerce', 'fintech',
      // Timeline responses
      'immediately', 'month', 'months', 'soon', 'planning', 'exploring'
    ]
    
    const matchingKeywords = clarificationKeywords.filter(keyword => 
      messageWords.includes(keyword)
    )
    
    const isLikelyClarificationResponse = matchingKeywords.length > 0 || messageWords.length < 50
    
    console.log(`[ClarificationCheck] Message analysis:`, {
      messageWords,
      matchingKeywords,
      messageLength: messageWords.length,
      isLikelyClarificationResponse
    })
    
    if (isLikelyClarificationResponse) {
      return {
        isResponse: true,
        originalState: assistantMetadata.agent_state
      }
    }
  }
  
  // FALLBACK: Content-based detection for older conversations without metadata
  console.log(`[ClarificationCheck] No clarification metadata found, trying content-based detection`)
  
  const content = String(lastAssistantMessage.content || '')
  const hasClarificationQuestions = content.includes('could you please clarify:') ||
    content.includes('To provide you with more accurate information, could you please clarify:') ||
    content.includes('Please clarify:') ||
    content.includes('Which country are you') ||
    content.includes('What type of business structure') ||
    content.includes('What type of business are you') ||
    content.includes('What industry') ||
    content.includes('When are you planning') ||
    // More flexible patterns that match our actual agent output
    /which country.*planning.*set.*up.*business/i.test(content) ||
    /what type.*business structure/i.test(content) ||
    /what industry.*business/i.test(content) ||
    /when.*planning.*set.*up/i.test(content) ||
    // Check for numbered clarification questions pattern
    /\d+\.\s+/.test(content)
  
  console.log(`[ClarificationCheck] Has clarification questions in content: ${hasClarificationQuestions}`)
  
  if (hasClarificationQuestions) {
    // Check if user message appears to be answering clarification questions
    const messageWords = message.toLowerCase().trim()
    const clarificationKeywords = [
      // Country responses
      'singapore', 'malaysia', 'thailand', 'indonesia',
      // Business structure responses
      'sole proprietorship', 'partnership', 'private limited', 'pte ltd', 'sdn bhd',
      // Business type responses  
      'individual', 'sme', 'small', 'medium', 'corporate', 'startup',
      // Industry responses (partial matching)
      'retail', 'restaurant', 'food', 'tech', 'technology', 'consulting', 
      'manufacturing', 'trading', 'import', 'export', 'ecommerce', 'fintech',
      // Timeline responses
      'immediately', 'month', 'months', 'soon', 'planning', 'exploring'
    ]
    
    const matchingKeywords = clarificationKeywords.filter(keyword => 
      messageWords.includes(keyword)
    )
    
    const isLikelyClarificationResponse = matchingKeywords.length > 0 || messageWords.length < 50
    
    console.log(`[ClarificationCheck] Fallback message analysis:`, {
      messageWords,
      matchingKeywords,
      messageLength: messageWords.length,
      isLikelyClarificationResponse
    })
    
    if (isLikelyClarificationResponse) {
      console.log(`[ClarificationCheck] ✅ Fallback: Treating as clarification response based on content patterns!`)
      return {
        isResponse: true,
        originalState: {} // Empty state as fallback
      }
    }
  }
  
  console.log(`[ClarificationCheck] Result: Not a clarification response`)
  return { isResponse: false }
}

export async function POST(request: NextRequest) {
  console.log('[Chat API] Starting LangGraph agent request...')
  
  try {
    // Authenticate the user
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body: ChatRequest = await request.json()
    const { message, conversationId, language = 'en' } = body

    if (!message || message.trim() === '') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Initialize Supabase client
    const supabase = createServerSupabaseClient()

    let currentConversationId = conversationId

    // Create new conversation if none provided
    if (!currentConversationId) {
      const { data: newConversation, error: conversationError } = await supabase
        .from('conversations')
        .insert({
          user_id: userId,
          title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
          language: language
        })
        .select('id')
        .single()

      if (conversationError) {
        console.error('Error creating conversation:', conversationError)
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
      }

      currentConversationId = newConversation.id
    }

    // Get recent conversation history (last 10 messages) - INCLUDE METADATA
    const { data: recentMessages, error: historyError } = await supabase
      .from('messages')
      .select('role, content, metadata')
      .eq('conversation_id', currentConversationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)

    if (historyError) {
      console.error('Error fetching conversation history:', historyError)
      return NextResponse.json({ error: 'Failed to fetch conversation history' }, { status: 500 })
    }

    // Convert database messages to LangChain BaseMessage format (reverse to chronological order)
    const conversationHistory: BaseMessage[] = recentMessages.reverse().map(msg => {
      if (msg.role === 'user') {
        return new HumanMessage(msg.content)
      } else {
        return new AIMessage(msg.content)
      }
    })

    // Create user context for enhanced agent
    const userContext = {
      userId: userId,
      conversationId: currentConversationId || undefined
    }

    console.log(`[Chat API] Invoking enhanced LangGraph agent with ${conversationHistory.length + 1} messages for user ${userId}`)

    // Check if this is a clarification response
    console.log(`[Chat API] Checking if message is clarification response...`)
    const isClarificationResponse = currentConversationId ? await checkIfClarificationResponse(
      supabase, 
      currentConversationId, 
      userId, 
      message, 
      recentMessages
    ) : { isResponse: false }
    
    console.log(`[Chat API] Clarification check result:`, isClarificationResponse)

    // Extract established facts from clarification responses
    let extractedFacts: Record<string, string> = {};
    if (isClarificationResponse.isResponse) {
      extractedFacts = extractEstablishedFacts(message);
      console.log(`[Chat API] Extracted facts from clarification response:`, extractedFacts);
    }

    // Create and invoke the main LangGraph agent
    const financialAgent = createFinancialAgent()
    
    // CRITICAL FIX: Restore saved agent state instead of creating new state
    let agentState: ReturnType<typeof createAgentState>
    
    if (isClarificationResponse.isResponse && isClarificationResponse.originalState) {
      // PHASE 1 FIX: Restore the saved agent state from database metadata
      console.log('[Chat API] 🔄 Restoring agent state from database metadata to maintain conversation context')
      console.log('[Chat API] Original state keys:', Object.keys(isClarificationResponse.originalState))
      
      try {
        // Restore the complete saved agent state
        agentState = isClarificationResponse.originalState as ReturnType<typeof createAgentState>
        
        // Update with new message and clarification response flag
        agentState.messages = conversationHistory.concat([new HumanMessage(message)])
        
        // Optionally enhance with newly extracted facts (additive, not replacement)
        const extractedFacts = extractEstablishedFacts(message)
        if (Object.keys(extractedFacts).length > 0) {
          console.log(`[Chat API] Enhancing restored state with newly extracted facts:`, extractedFacts)
          // Note: Facts are managed through database metadata, not agent state
        }
        
        // CRITICAL FIX: Reset phase from 'completed' to 'execution' for clarification responses
        // This prevents the router from immediately ending the conversation
        if (agentState.currentPhase === 'completed') {
          agentState.currentPhase = 'execution'
          console.log('[Chat API] 🔄 Reset currentPhase from "completed" to "execution" for clarification processing')
        }

        // Reset clarification flags so agent can proceed with execution
        agentState.needsClarification = false
        agentState.isClarificationResponse = true

        console.log('[Chat API] ✅ Successfully restored agent state with conversation memory')

      } catch (error) {
        console.error('[Chat API] ❌ Failed to restore agent state, falling back to new state:', error)
        // Fallback to new state if restoration fails
        agentState = createAgentState(userContext, message, language)
        agentState.messages = conversationHistory.concat([new HumanMessage(message)])
      }
      
    } else {
      // Current behavior for new conversations (not clarification responses)
      console.log('[Chat API] 🆕 Creating new agent state for fresh conversation')
      agentState = createAgentState(userContext, message, language)
      agentState.messages = conversationHistory.concat([new HumanMessage(message)])
      
      // Apply extracted facts for new conversations
      const extractedFacts = extractEstablishedFacts(message)
      if (Object.keys(extractedFacts).length > 0) {
        console.log(`[Chat API] Extracted facts for new conversation:`, extractedFacts)
        // Note: Facts will be managed through database metadata
      }
    }
    
    console.log(`[Chat API] Invoking main LangGraph agent with ${agentState.messages.length} messages for user ${userId}`)
    
    // Execute the agent
    const agentResult = await financialAgent.invoke(agentState)
    
    // Extract the final response from the agent result
    const lastMessage = agentResult.messages[agentResult.messages.length - 1]
    let assistantResponse = ''
    
    if (lastMessage && lastMessage._getType() === 'ai') {
      assistantResponse = typeof lastMessage.content === 'string' ? lastMessage.content : 'I apologize, but I cannot process your request right now.'
    }
    
    // Extract citations from agent result
    const agentCitations = agentResult.citations || [];
    console.log(`[Chat API] Agent returned ${agentCitations.length} citations:`, agentCitations.map(c => ({ id: c.id, source: c.source_name })));

    // Create result structure compatible with existing code
    const result = {
      response: assistantResponse,
      sources: agentCitations.map(citation => ({ originalCitation: citation })), // Convert to expected format
      confidence: agentResult.currentIntent?.confidence || 0.8,
      needsClarification: agentResult.needsClarification || false,
      clarificationQuestions: agentResult.clarificationQuestions || [],
      debugInfo: {
        finalState: agentResult
      }
    }

    console.log('[Chat API] Main LangGraph agent completed')

    // Handle agent response structure
    assistantResponse = result.response || "I apologize, but I couldn't process your request. Please try again."
    let citations: CitationData[] = []
    
    // Clean up tool call JSON if it appears in the final response
    try {
      const parsed = JSON.parse(assistantResponse)
      if (parsed.tool_call && parsed.reasoning) {
        // This shouldn't happen in the final response, but handle it gracefully
        assistantResponse = "I'm processing your request. Please wait a moment."
      }
    } catch {
      // Not JSON, use as-is
    }
    
    // CRITICAL: Filter out thinking process and internal reasoning
    assistantResponse = parseFinalAnswer(assistantResponse)
    
    // CRITICAL: Remove DONE command if it appears (Enhanced Pattern Matching)
    const isDoneResponse = /^\s*DONE\s*[.\-\s]*$/i.test(assistantResponse) || 
                          /^\s*DONE\s*$/i.test(assistantResponse) || 
                          assistantResponse.trim().toUpperCase() === 'DONE' ||
                          /^DONE[\s\.\-]*$/i.test(assistantResponse.trim()) ||
                          /^\**\s*DONE\s*\**$/i.test(assistantResponse.trim());
    
    if (isDoneResponse) {
      assistantResponse = "I've completed processing your request."
    }
    
    // CRITICAL: Ensure citation markers are present if citations exist
    assistantResponse = ensureCitationMarkers(assistantResponse, citations)
    
    // Extract citations from sources if available
    if (result.sources && Array.isArray(result.sources) && result.sources.length > 0) {
      console.log(`[Chat API] Processing ${result.sources.length} result sources for citations`)
      citations = result.sources
        .filter((source: any) => source && source.originalCitation)
        .map((source: any, index: number) => {
          console.log(`[Chat API] Extracting citation ${index + 1}:`, source.originalCitation)
          return source.originalCitation
        })
      
      console.log(`[Chat API] Extracted ${citations.length} citations from result sources`)
    }
    
    // Handle clarification flow - questions are already formatted by the agent
    if (result.needsClarification && result.clarificationQuestions?.length) {
      console.log(`[Chat API] Agent needs clarification: ${result.clarificationQuestions.length} questions`)
      // Note: Clarification questions are already formatted in the assistantResponse by the LangGraph agent
    }

    // Save user message to database
    const { error: userMessageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: currentConversationId,
        user_id: userId,
        role: 'user',
        content: message
      })

    if (userMessageError) {
      console.error('Error saving user message:', userMessageError)
    }

    // Save assistant response to database with citations and clarification state
    const assistantMetadata: any = {}
    
    // Add citations if present
    if (citations.length > 0) {
      assistantMetadata.citations = citations
    }
    
    // Add clarification state if needed
    if (result.needsClarification && result.clarificationQuestions?.length) {
      console.log(`[Chat API] DEBUG: Adding clarification metadata for ${result.clarificationQuestions.length} questions`)
      assistantMetadata.clarification_pending = true
      assistantMetadata.agent_state = result.debugInfo?.finalState || {}
      assistantMetadata.clarification_questions = result.clarificationQuestions
      assistantMetadata.original_query = message
    }
    
    console.log(`[Chat API] DEBUG: Saving assistant message with metadata keys:`, Object.keys(assistantMetadata))
    console.log(`[Chat API] DEBUG: Assistant response preview:`, assistantResponse.substring(0, 100))
    
    const { error: assistantMessageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: currentConversationId,
        user_id: userId,
        role: 'assistant',
        content: assistantResponse,
        metadata: Object.keys(assistantMetadata).length > 0 ? assistantMetadata : null
      })

    if (assistantMessageError) {
      console.error('Error saving assistant message:', assistantMessageError)
    } else {
      console.log(`[Chat API] DEBUG: Successfully saved assistant message with metadata: ${!!assistantMetadata && Object.keys(assistantMetadata).length > 0}`)
    }

    // Update conversation timestamp
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', currentConversationId)
      .eq('user_id', userId)

    console.log(`[Chat API] Successfully completed enhanced agent interaction with ${citations.length} citations, confidence: ${result.confidence?.toFixed(3) || 'unknown'}`)

    return NextResponse.json({
      message: assistantResponse,
      conversationId: currentConversationId,
      citations: citations,
      confidence: result.confidence || 0,
      needsClarification: result.needsClarification || false,
      clarificationQuestions: result.clarificationQuestions || [],
      debugInfo: result.debugInfo
    })

  } catch (error) {
    console.error('[Chat API] LangGraph agent error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}