import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { SupportedLanguage } from '@/lib/translations'
import { createFinancialAgent, AgentState } from '@/lib/langgraph-agent'
import { HumanMessage, AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages'
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
    .replace(/^(Let me see what|Hmm, maybe|I should|The tool|Looking at|Based on|From what|According to)[\s\S]*?(?=The |Your |Here |In |\d)/mi, '') // Remove reasoning preambles
    .replace(/<think>[\s\S]*?<\/think>/gi, '') // Remove any remaining think blocks
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '') // Remove thinking blocks
    .trim()

  // If content is empty or too short after cleaning, provide fallback
  if (!content || content.length < 10) {
    return 'I apologize, but I encountered an issue processing that request.'
  }

  return content
}

/**
 * Extract citations from tool messages in the conversation
 */
function extractCitations(messages: BaseMessage[]): CitationData[] {
  const allCitations: CitationData[] = []
  
  console.log(`[Citation Extraction] Processing ${messages.length} messages`)
  
  for (const message of messages) {
    console.log(`[Citation Extraction] Message type: ${message._getType()}, content preview:`, 
                typeof message.content === 'string' ? message.content.substring(0, 100) + '...' : 'non-string')
    
    if (message._getType() === 'tool') {
      const toolMessage = message as ToolMessage
      console.log(`[Citation Extraction] Tool message name: ${toolMessage.name}`)
      
      try {
        // Get tool content as string
        const toolContent = typeof toolMessage.content === 'string' 
          ? toolMessage.content 
          : JSON.stringify(toolMessage.content)
        
        // Check if this is a regulatory knowledge tool result
        if (toolMessage.name === 'searchRegulatoryKnowledgeBase') {
          console.log('[Citation Extraction] Found regulatory knowledge tool result')
          // Extract embedded citations data
          const citationsMatch = toolContent.match(/<!--CITATIONS_DATA:([\s\S]+?):END_CITATIONS-->/)
          if (citationsMatch) {
            try {
              const citationsData = JSON.parse(citationsMatch[1])
              if (Array.isArray(citationsData)) {
                console.log(`[Citation Extraction] Found ${citationsData.length} citations in tool result`)
                allCitations.push(...citationsData)
              }
            } catch (parseError) {
              console.error('Error parsing embedded citations data:', parseError)
            }
          } else {
            console.log('[Citation Extraction] No citations data found in regulatory tool result')
          }
        }
      } catch (error) {
        console.error('Error extracting citations from tool message:', error)
      }
    }
  }
  
  console.log(`[Citation Extraction] Total citations extracted: ${allCitations.length}`)
  return allCitations
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

    // Get recent conversation history (last 10 messages)
    const { data: recentMessages, error: historyError } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', currentConversationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(10)

    if (historyError) {
      console.error('Error fetching conversation history:', historyError)
      return NextResponse.json({ error: 'Failed to fetch conversation history' }, { status: 500 })
    }

    // Convert database messages to LangChain BaseMessage format
    const conversationHistory: BaseMessage[] = recentMessages.map(msg => {
      if (msg.role === 'user') {
        return new HumanMessage(msg.content)
      } else {
        return new AIMessage(msg.content)
      }
    })

    // Add the new user message
    conversationHistory.push(new HumanMessage(message))

    // Create secure agent state with proper user context
    const userContext = {
      userId: userId,
      conversationId: currentConversationId || undefined
    }

    const initialState: AgentState = {
      messages: conversationHistory,
      language: language,
      userContext: userContext,
      securityValidated: false,
      failureCount: 0,
      lastFailedTool: null
    }

    console.log(`[Chat API] Invoking secure LangGraph agent with ${initialState.messages.length} messages for user ${userId}`)

    // Create and invoke the secure LangGraph agent
    const agent = createFinancialAgent()
    const result = await agent.invoke(initialState)

    console.log('[Chat API] LangGraph agent completed')

    // Extract the final assistant response and citations
    const finalMessages = (result.messages as BaseMessage[]) || []
    const lastMessage = finalMessages.length > 0 ? finalMessages[finalMessages.length - 1] : null
    
    let assistantResponse = "I apologize, but I couldn't process your request. Please try again."
    let citations: CitationData[] = []
    
    if (lastMessage && lastMessage._getType() === 'ai') {
      assistantResponse = lastMessage.content as string
      
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
    }
    
    // Extract citations from the conversation
    citations = extractCitations(finalMessages)

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

    // Save assistant response to database with citations
    const { error: assistantMessageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: currentConversationId,
        user_id: userId,
        role: 'assistant',
        content: assistantResponse,
        metadata: citations.length > 0 ? { citations } : null
      })

    if (assistantMessageError) {
      console.error('Error saving assistant message:', assistantMessageError)
    }

    // Update conversation timestamp
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', currentConversationId)
      .eq('user_id', userId)

    console.log(`[Chat API] Successfully completed LangGraph agent interaction with ${citations.length} citations`)

    return NextResponse.json({
      message: assistantResponse,
      conversationId: currentConversationId,
      citations: citations
    })

  } catch (error) {
    console.error('[Chat API] LangGraph agent error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}