import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { SupportedLanguage } from '@/lib/translations'
import { createFinancialAgent, AgentState } from '@/lib/langgraph-agent'
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages'

interface ChatRequest {
  message: string
  conversationId?: string
  language?: SupportedLanguage
}

/**
 * Filters out LLM thinking process and internal reasoning from responses
 * This prevents users from seeing the model's internal thought process
 */
function filterThinkingProcess(content: string): string {
  if (!content || typeof content !== 'string') {
    return content
  }

  // Remove content between thinking tags (various formats)
  content = content
    // Remove <think>...</think> blocks
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    // Remove </think> tags that might appear without opening tags
    .replace(/<\/think>/gi, '')
    // Remove <thinking>...</thinking> blocks
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    // Remove </thinking> tags
    .replace(/<\/thinking>/gi, '')

  // Remove internal reasoning patterns
  content = content
    // Remove "Okay, the user is..." style reasoning
    .replace(/^Okay,\s+the\s+user\s+is\s+.*?\./mi, '')
    .replace(/^Let\s+me\s+understand\s+.*?\./mi, '')
    .replace(/^The\s+user\s+wants\s+.*?\./mi, '')
    .replace(/^I\s+need\s+to\s+.*?\./mi, '')
    .replace(/^Looking\s+at\s+this\s+request\s+.*?\./mi, '')
    .replace(/^Based\s+on\s+the\s+query\s+.*?\./mi, '')
    .replace(/^To\s+answer\s+this\s+question\s+.*?\./mi, '')
    .replace(/^First,\s+let\s+me\s+.*?\./mi, '')
    .replace(/^I\s+should\s+.*?\./mi, '')
    .replace(/^I'll\s+start\s+by\s+.*?\./mi, '')
    .replace(/^Let\s+me\s+check\s+.*?\./mi, '')
    .replace(/^I'm\s+going\s+to\s+.*?\./mi, '')
    .replace(/^From\s+what\s+I\s+can\s+see\s+.*?\./mi, '')
    .replace(/^According\s+to\s+.*?\./mi, '')

  // Remove meta-commentary patterns
  content = content
    .replace(/^Based\s+on\s+.*?\./mi, '')
    .replace(/^Looking\s+at\s+.*?\./mi, '')
    .replace(/^From\s+the\s+.*?\./mi, '')
    .replace(/^According\s+to\s+.*?\./mi, '')
    .replace(/^The\s+data\s+shows\s+.*?\./mi, '')
    .replace(/^Analyzing\s+.*?\./mi, '')
    .replace(/^Processing\s+.*?\./mi, '')
    .replace(/^Searching\s+.*?\./mi, '')
    .replace(/^Reviewing\s+.*?\./mi, '')
    .replace(/^Examining\s+.*?\./mi, '')
    .replace(/^Investigating\s+.*?\./mi, '')
    .replace(/^Checking\s+.*?\./mi, '')

  // Remove response formatting markers
  content = content
    .replace(/^\*\*Response:\*\*\s*/mi, '')
    .replace(/^\*\*Answer:\*\*\s*/mi, '')
    .replace(/^\*\*Final Answer:\*\*\s*/mi, '')
    .replace(/^\*\*Result:\*\*\s*/mi, '')

  // Remove thinking indicators at the start of sentences
  content = content
    .replace(/^(I need to understand|Let me help you|To answer your question|First, let me|I'll start by|Let me search|I should|I'm going to|I will)\s+.*?\.\s*/mi, '')

  // Clean up multiple line breaks and extra whitespace
  content = content
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/^\s+/gm, '')
    .trim()

  // If content starts with reasoning verbs, remove the entire first sentence
  const reasoningPatterns = /^(Analyzing|Processing|Searching|Reviewing|Examining|Investigating|Looking|Checking|Understanding|Considering)\s+.*?\./i
  if (reasoningPatterns.test(content)) {
    content = content.replace(reasoningPatterns, '').trim()
  }

  // Ensure we don't return empty content after cleaning
  if (!content || content.length < 10) {
    content = 'I apologize, but I cannot process your request right now.'
  }

  return content
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

    // Extract the final assistant response
    const finalMessages = (result.messages as BaseMessage[]) || []
    const lastMessage = finalMessages.length > 0 ? finalMessages[finalMessages.length - 1] : null
    
    let assistantResponse = "I apologize, but I couldn't process your request. Please try again."
    
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
      assistantResponse = filterThinkingProcess(assistantResponse)
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

    // Save assistant response to database
    const { error: assistantMessageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: currentConversationId,
        user_id: userId,
        role: 'assistant',
        content: assistantResponse
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

    console.log('[Chat API] Successfully completed LangGraph agent interaction')

    return NextResponse.json({
      message: assistantResponse,
      conversationId: currentConversationId
    })

  } catch (error) {
    console.error('[Chat API] LangGraph agent error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}