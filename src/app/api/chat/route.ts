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