/**
 * LangGraph Agent Adapter
 *
 * Bridges the LangGraph financial agent with the chat API.
 * The agent runs in-process — no external deployment needed.
 *
 * Two invocation modes:
 * 1. invokeLangGraphAgent() — synchronous, returns complete response (legacy)
 * 2. streamLangGraphAgent() — yields SSE-compatible events progressively
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

// --- SSE Stream Event Types ---

export interface SSEStatusEvent {
  event: 'status'
  data: { phase: string }
}

export interface SSETextEvent {
  event: 'text'
  data: { token: string }
}

export interface SSEActionEvent {
  event: 'action'
  data: { type: string; id?: string; data: Record<string, unknown> }
}

export interface SSECitationEvent {
  event: 'citation'
  data: { citations: CitationData[] }
}

export interface SSEDoneEvent {
  event: 'done'
  data: { totalTokens?: number }
}

export interface SSEErrorEvent {
  event: 'error'
  data: { message: string; code?: string }
}

export type SSEEvent =
  | SSEStatusEvent
  | SSETextEvent
  | SSEActionEvent
  | SSECitationEvent
  | SSEDoneEvent
  | SSEErrorEvent

/** Map LangGraph node names to user-facing status messages */
const NODE_STATUS_MAP: Record<string, string> = {
  topicGuardrail: 'Checking query...',
  validate: 'Validating request...',
  analyzeIntent: 'Analyzing your question...',
  callModel: 'Generating response...',
  executeTool: 'Searching data...',
  correctToolCall: 'Refining search...',
  handleClarification: 'Processing clarification...',
  handleOffTopic: 'Processing...',
}

/**
 * Stream the LangGraph financial agent using .streamEvents() v2.
 * Yields SSE-compatible event objects progressively.
 */
export async function* streamLangGraphAgent(
  request: CopilotAgentRequest
): AsyncGenerator<SSEEvent> {
  const { message, conversationHistory, userContext, language } = request

  const langchainHistory: BaseMessage[] = conversationHistory.map((msg) =>
    msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
  )

  const agentState = createAgentState(userContext, message, language)
  agentState.messages = [...langchainHistory, new HumanMessage(message)]

  const financialAgent = createFinancialAgent()

  const runConfig = {
    configurable: { thread_id: userContext.conversationId },
    runName: `FinanSEAL Stream - ${language}`,
    metadata: {
      userId: userContext.userId,
      businessId: userContext.businessId,
      conversationId: userContext.conversationId,
      language,
      source: 'chat-stream',
    },
    tags: ['finanseal', 'stream', `lang:${language}`],
    version: 'v2' as const,
  }

  console.log(`[Stream Adapter] Streaming agent for user ${userContext.userId}`)

  let finalContent = ''
  let finalCitations: CitationData[] = []
  const seenNodes = new Set<string>()

  try {
    const eventStream = financialAgent.streamEvents(agentState, runConfig)

    for await (const event of eventStream) {
      const { event: eventName, name, data } = event

      // Emit status updates when nodes start
      if (eventName === 'on_chain_start' && name && NODE_STATUS_MAP[name]) {
        if (!seenNodes.has(name)) {
          seenNodes.add(name)
          yield { event: 'status', data: { phase: NODE_STATUS_MAP[name] } }
        }
      }

      // When a tool executes, emit a more specific status
      if (eventName === 'on_chain_start' && name === 'executeTool') {
        yield { event: 'status', data: { phase: 'Searching data...' } }
      }

      // Capture the final state when the graph ends
      if (eventName === 'on_chain_end' && data?.output) {
        const output = data.output
        if (output.messages && Array.isArray(output.messages)) {
          // Extract the last AI message from final output
          for (let i = output.messages.length - 1; i >= 0; i--) {
            const msg = output.messages[i]
            if (msg._getType?.() === 'ai' && typeof msg.content === 'string' && msg.content.length > 0) {
              finalContent = msg.content
              break
            }
          }
          if (output.citations) {
            finalCitations = output.citations
          }
        }
      }
    }

    // Clean the final content
    if (!finalContent) {
      finalContent = 'I apologize, but I encountered an issue processing your request. Please try again.'
    }
    finalContent = parseFinalAnswer(finalContent)
    finalContent = ensureCitationMarkers(finalContent, finalCitations)

    // Extract action cards from the response (```actions ... ``` blocks)
    const { textContent, actions } = extractActionsFromContent(finalContent)
    finalContent = textContent

    // Emit text as word-level chunks for progressive rendering
    yield { event: 'status', data: { phase: 'Preparing response...' } }
    const words = finalContent.split(/(\s+)/)
    for (const word of words) {
      if (word) {
        yield { event: 'text', data: { token: word } }
      }
    }

    // Emit action cards
    for (const action of actions) {
      yield { event: 'action', data: action }
    }

    // Emit citations if available
    if (finalCitations.length > 0) {
      yield { event: 'citation', data: { citations: finalCitations } }
    }

    // Done
    yield { event: 'done', data: {} }
  } catch (error) {
    console.error('[Stream Adapter] Error:', error)
    yield {
      event: 'error',
      data: {
        message: error instanceof Error ? error.message : 'Failed to process message',
        code: 'AGENT_ERROR',
      },
    }
  }
}

/**
 * Extract action card JSON from ```actions``` fenced code blocks in the response.
 * Returns the text content with action blocks removed, and parsed action objects.
 */
function extractActionsFromContent(content: string): {
  textContent: string
  actions: Array<{ type: string; id?: string; data: Record<string, unknown> }>
} {
  const actions: Array<{ type: string; id?: string; data: Record<string, unknown> }> = []
  const actionBlockRegex = /```actions\s*\n([\s\S]*?)```/g

  const textContent = content.replace(actionBlockRegex, (_match, jsonBlock: string) => {
    try {
      const parsed = JSON.parse(jsonBlock.trim())
      const items = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of items) {
        if (item && typeof item.type === 'string' && item.data) {
          actions.push(item)
        }
      }
    } catch (err) {
      console.warn('[Stream Adapter] Failed to parse actions block:', err)
    }
    return '' // Remove the actions block from text
  }).trim()

  return { textContent, actions }
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
