/**
 * CopilotKit LangGraph Adapter
 *
 * Bridges the existing LangGraph financial agent with CopilotKit's runtime.
 * The agent runs in-process — no external deployment needed.
 *
 * This adapter:
 * 1. Creates the LangGraph agent via createFinancialAgent()
 * 2. Converts CopilotKit messages to LangChain format
 * 3. Invokes the agent with UserContext
 * 4. Returns the response with citation metadata
 */

import { createFinancialAgent, createAgentState } from '@/lib/ai/langgraph-agent'
import { HumanMessage, AIMessage, type BaseMessage } from '@langchain/core/messages'
import type { CitationData } from '@/lib/ai/tools/base-tool'
import type { UserContext } from '@/lib/ai/tools/base-tool'

export interface CopilotAgentRequest {
  message: string
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  userContext: UserContext & { conversationId: string }
  language: string
}

export interface CopilotAgentResponse {
  content: string
  citations: CitationData[]
  needsClarification: boolean
  clarificationQuestions: string[]
  confidence: number
}

/**
 * Invoke the LangGraph financial agent with a message and conversation history.
 * This is the core bridge between CopilotKit's runtime and our agent.
 */
export async function invokeLangGraphAgent(
  request: CopilotAgentRequest
): Promise<CopilotAgentResponse> {
  const { message, conversationHistory, userContext, language } = request

  // Convert conversation history to LangChain format
  const langchainHistory: BaseMessage[] = conversationHistory.map((msg) => {
    return msg.role === 'user'
      ? new HumanMessage(msg.content)
      : new AIMessage(msg.content)
  })

  // Create agent state with context
  const agentState = createAgentState(userContext, message, language)
  agentState.messages = [...langchainHistory, new HumanMessage(message)]

  // Create and invoke the agent
  const financialAgent = createFinancialAgent()

  const runConfig = {
    configurable: {
      thread_id: userContext.conversationId,
    },
    runName: `FinanSEAL CopilotKit - ${language}`,
    metadata: {
      userId: userContext.userId,
      businessId: userContext.businessId,
      conversationId: userContext.conversationId,
      language,
      source: 'copilotkit',
    },
    tags: ['finanseal', 'copilotkit', `lang:${language}`],
  }

  console.log(`[CopilotKit Adapter] Invoking agent for user ${userContext.userId}`)

  const agentResult = await financialAgent.invoke(agentState, runConfig)

  // Extract the assistant response from the last AI message
  let assistantResponse = ''
  for (let i = agentResult.messages.length - 1; i >= 0; i--) {
    const msg = agentResult.messages[i]
    if (msg._getType?.() === 'ai' && typeof msg.content === 'string' && msg.content.length > 0) {
      assistantResponse = msg.content
      break
    }
  }

  if (!assistantResponse) {
    assistantResponse = 'I apologize, but I encountered an issue processing your request. Please try again.'
  }

  // Clean the response
  assistantResponse = parseFinalAnswer(assistantResponse)

  // Extract citations
  const citations: CitationData[] = agentResult.citations || []
  assistantResponse = ensureCitationMarkers(assistantResponse, citations)

  console.log(`[CopilotKit Adapter] Response ready with ${citations.length} citations`)

  return {
    content: assistantResponse,
    citations,
    needsClarification: agentResult.needsClarification || false,
    clarificationQuestions: agentResult.clarificationQuestions || [],
    confidence: agentResult.currentIntent?.confidence || 0.8,
  }
}

/**
 * Parse and clean AI response — removes tool calls, thinking blocks, DONE commands
 */
function parseFinalAnswer(content: string): string {
  if (!content || typeof content !== 'string') return content

  content = content
    .replace(/<\/tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/\{"name":\s*"[^"]+",\s*"arguments":\s*\{[^}]*\}\}/g, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim()

  if (/^\s*DONE\s*[.\-\s]*$/i.test(content) || /^\**\s*DONE\s*\**$/i.test(content.trim())) {
    return "I've completed processing your request."
  }

  content = content.replace(/\s+DONE\s*[.\-]*\s*$/i, '').trim()

  if (!content || content.length < 10) {
    return 'I apologize, but I encountered an issue processing that request.'
  }

  return content
}

/**
 * Ensure citation markers are inserted in response text
 */
function ensureCitationMarkers(content: string, citations: CitationData[]): string {
  if (!citations || citations.length === 0) return content
  if (/\[\^\d+\]/.test(content)) return content

  let processed = content

  citations.forEach((citation, index) => {
    const marker = `[^${index + 1}]`
    const sourceName = citation.source_name

    if (sourceName && sourceName !== 'Unknown Source') {
      const sourceRegex = new RegExp(
        `\\b${sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
        'gi'
      )
      if (sourceRegex.test(processed)) {
        processed = processed.replace(sourceRegex, (match) => `${match} ${marker}`)
      }
    }
  })

  // Add general citation for regulatory content if no markers were added
  if (!/\[\^\d+\]/.test(processed) && citations.length > 0) {
    if (/regulation|requirement|GST|tax/i.test(processed)) {
      processed += ` [^1]`
    }
  }

  return processed
}
