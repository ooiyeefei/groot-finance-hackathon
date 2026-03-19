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
import { HumanMessage, AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
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
    runName: `Groot Finance CopilotKit - ${language}`,
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
    runName: `Groot Finance Stream - ${language}`,
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
  let finalMessages: BaseMessage[] = []
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
          finalMessages = output.messages
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
    const { textContent, actions: llmActions } = extractActionsFromContent(finalContent)
    finalContent = textContent

    // Server-side auto-generation: always generate from tool results,
    // then merge with LLM-emitted cards (deduplicating by content)
    const autoActions = autoGenerateActionsFromToolResults(finalMessages)

    // Always strip residual action card JSON from text (safety net for edge cases
    // where the regex extraction partially matched or the LLM used unusual formatting).
    const ACTION_TYPES_PATTERN = 'invoice_posting|cash_flow_dashboard|compliance_alert|budget_alert|spending_time_series|anomaly_card|vendor_comparison|expense_approval|expense_reimbursement|revenue_summary'
    finalContent = finalContent
      // Strip ```actions ... ``` fenced blocks
      .replace(/(?:\\*`){3,}actions[\s\S]*?(?:\\*`){3,}/g, '')
      // Strip ```json blocks containing action card types
      .replace(/(?:\\*`){3,}(?:json)?\s*\n\s*\[\s*\{[\s\S]*?"type"\s*:\s*"(?:invoice_posting|cash_flow_dashboard|compliance_alert|budget_alert|spending_time_series|anomaly_card|vendor_comparison|expense_approval|expense_reimbursement|revenue_summary)"[\s\S]*?(?:\\*`){3,}/g, '')
      // Strip unfenced raw JSON arrays containing action card types (LLM sometimes
      // dumps [{"type": "invoice_posting", ...}] directly in the text without fencing)
      .replace(new RegExp(`\\[\\s*\\{[\\s\\S]*?"type"\\s*:\\s*"(?:${ACTION_TYPES_PATTERN})"[\\s\\S]*?\\}\\s*\\]`, 'g'), '')
      .trim()

    // Deduplicate action cards: LLM-emitted cards take priority.
    // Bulk-capable types (invoice_posting, expense_approval) allow multiple cards
    // but deduplicate by content key (invoiceId / expenseId).
    // Other types keep only one card per type.
    const BULK_CARD_TYPES = new Set(['invoice_posting', 'expense_approval', 'expense_reimbursement'])
    const allActions = [...llmActions, ...autoActions]
    const seenIds = new Set<string>()
    const seenContentKeys = new Set<string>()
    const seenTypes = new Set<string>()
    const actions = allActions.filter((a) => {
      if (a.id && seenIds.has(a.id)) return false
      if (a.id) seenIds.add(a.id)

      if (BULK_CARD_TYPES.has(a.type)) {
        const d = a.data as Record<string, unknown>
        const contentKey = `${a.type}:${d?.invoiceId ?? d?.expenseId ?? a.id}`
        if (seenContentKeys.has(contentKey)) return false
        seenContentKeys.add(contentKey)
        return true
      }

      if (seenTypes.has(a.type)) return false
      seenTypes.add(a.type)
      return true
    })

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
  const actionBlockRegex = /```actions\s*([\s\S]*?)```/g

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

// --- Server-side Action Card Auto-Generation ---

type ActionCard = { type: string; id: string; data: Record<string, unknown> }

/** Generate a short deterministic hash from a string (djb2 algorithm) */
function hashCode(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

/**
 * Auto-generate action cards from tool results when the LLM doesn't emit them.
 * Scans the message history for successful ToolMessages and maps known tool
 * results to their corresponding card types.
 */
function autoGenerateActionsFromToolResults(messages: BaseMessage[]): ActionCard[] {
  const actions: ActionCard[] = []
  const processedToolCallIds = new Set<string>()

  for (const msg of messages) {
    if (msg._getType?.() !== 'tool') continue
    const toolMsg = msg as ToolMessage
    const toolName = toolMsg.name
    const content = typeof toolMsg.content === 'string' ? toolMsg.content : ''

    // Deduplicate by tool_call_id to prevent processing the same tool result twice
    // (LangGraph message arrays can contain duplicates from graph traversal)
    const toolCallId = toolMsg.tool_call_id
    if (toolCallId && processedToolCallIds.has(toolCallId)) continue
    if (toolCallId) processedToolCallIds.add(toolCallId)

    // Skip error responses
    if (content.startsWith('TOOL_ERROR:') || content.startsWith('SYSTEM_ERROR:') || content.startsWith('DATA_EMPTY:')) {
      continue
    }

    // Try to parse structured data from tool result
    let parsed: Record<string, unknown> | null = null
    try {
      parsed = JSON.parse(content)
    } catch {
      // Not JSON — tool returned formatted text (e.g., get_transactions)
    }

    if (toolName === 'analyze_cash_flow' && parsed) {
      const card = buildCashFlowCard(parsed)
      if (card) actions.push(card)
    }

    if (toolName === 'detect_anomalies' && parsed) {
      const cards = buildAnomalyCards(parsed)
      actions.push(...cards)
    }

    if (toolName === 'analyze_vendor_risk' && parsed) {
      const card = buildVendorComparisonCard(parsed)
      if (card) actions.push(card)
    }

    if (toolName === 'get_invoices' && parsed) {
      const cards = buildInvoicePostingCards(parsed)
      actions.push(...cards)
    }

    if (toolName === 'searchRegulatoryKnowledgeBase' && content && !parsed) {
      // Regulatory results come as formatted text with citations — generate compliance card
      const card = buildComplianceCardFromText(content)
      if (card) actions.push(card)
    }

    if (toolName === 'get_transactions' && content) {
      // get_transactions returns formatted text — parse it into structured cards
      const txns = parseTransactionText(content)
      if (txns.length >= 2) {
        const budgetCard = buildBudgetAlertFromTransactions(txns, content)
        if (budgetCard) actions.push(budgetCard)
        const timeSeriesCard = buildSpendingTimeSeriesFromTransactions(txns, content)
        if (timeSeriesCard) actions.push(timeSeriesCard)
        const revenueCard = buildRevenueSummaryFromTransactions(txns, content)
        if (revenueCard) actions.push(revenueCard)
      }
    }
  }

  return actions
}

function buildCashFlowCard(data: Record<string, unknown>): ActionCard | null {
  // Validate that the data has the expected cash flow fields
  if (data.runwayDays === undefined && data.monthlyBurnRate === undefined) return null

  return {
    type: 'cash_flow_dashboard',
    id: `cashflow-auto-${hashCode(JSON.stringify(data))}`,
    data: {
      runwayDays: data.runwayDays ?? 0,
      monthlyBurnRate: data.monthlyBurnRate ?? 0,
      estimatedBalance: data.estimatedBalance ?? data.currentBalance ?? 0,
      totalIncome: data.totalIncome ?? 0,
      totalExpenses: data.totalExpenses ?? 0,
      expenseToIncomeRatio: data.expenseToIncomeRatio ?? data.expenseRatio ?? 0,
      currency: data.currency ?? 'MYR',
      forecastPeriod: data.forecastPeriod ?? `${data.horizonDays ?? 30}-day forecast`,
      alerts: Array.isArray(data.alerts) ? data.alerts : [],
    },
  }
}

function buildAnomalyCards(data: Record<string, unknown>): ActionCard[] {
  const anomalies = Array.isArray(data.anomalies) ? data.anomalies : (Array.isArray(data) ? data : [])
  return anomalies.map((anomaly: Record<string, unknown>, idx: number) => ({
    type: 'anomaly_card',
    id: `anomaly-auto-${hashCode(JSON.stringify(anomaly))}-${idx}`,
    data: anomaly,
  }))
}

function buildVendorComparisonCard(data: Record<string, unknown>): ActionCard | null {
  const vendors = Array.isArray(data.vendors) ? data.vendors : (Array.isArray(data) ? data : [])
  if (vendors.length === 0) return null

  return {
    type: 'vendor_comparison',
    id: `vendor-auto-${hashCode(JSON.stringify(vendors))}`,
    data: { vendors, ...data },
  }
}

function buildInvoicePostingCards(data: Record<string, unknown>): ActionCard[] {
  const invoices = Array.isArray(data.invoices) ? data.invoices : (Array.isArray(data) ? data : [])

  // Only create posting cards for invoices that haven't been posted yet
  return invoices
    .filter((inv: Record<string, unknown>) => {
      const accountingStatus = inv.accountingStatus as string | undefined
      // Skip already-posted invoices — they don't need a "Post to Accounting" action
      return accountingStatus !== 'posted'
    })
    .map((inv: Record<string, unknown>, idx: number) => ({
      type: 'invoice_posting',
      id: `invoice-auto-${hashCode(JSON.stringify(inv))}-${idx}`,
      data: {
        invoiceId: inv._id ?? inv.invoiceId ?? '',
        vendorName: inv.vendorName ?? (inv.extractedData as Record<string, unknown>)?.vendorName ?? 'Unknown',
        amount: inv.amount ?? (inv.extractedData as Record<string, unknown>)?.totalAmount ?? 0,
        currency: inv.currency ?? (inv.extractedData as Record<string, unknown>)?.currency ?? 'MYR',
        invoiceDate: inv.invoiceDate ?? (inv.extractedData as Record<string, unknown>)?.invoiceDate ?? '',
        invoiceNumber: inv.invoiceNumber ?? (inv.extractedData as Record<string, unknown>)?.invoiceNumber,
        confidenceScore: inv.confidenceScore ?? (inv.extractedData as Record<string, unknown>)?.confidence ?? 0.5,
        lineItems: inv.lineItems ?? (inv.extractedData as Record<string, unknown>)?.lineItems ?? [],
        status: 'ready',
      },
    }))
}

function buildComplianceCardFromText(content: string): ActionCard | null {
  // Extract key information from regulatory text response
  // Look for country/authority patterns
  const countryMatch = content.match(/\b(Singapore|Malaysia|Thailand|Indonesia|Philippines|Vietnam)\b/i)
  if (!countryMatch) return null

  const country = countryMatch[1]
  const codeMap: Record<string, string> = {
    singapore: 'SG', malaysia: 'MY', thailand: 'TH',
    indonesia: 'ID', philippines: 'PH', vietnam: 'VN',
  }
  const authorityMap: Record<string, string> = {
    singapore: 'IRAS', malaysia: 'LHDN', thailand: 'RD',
    indonesia: 'DJP', philippines: 'BIR', vietnam: 'GDT',
  }

  const countryLower = country.toLowerCase()

  // Extract requirements from bullet points or numbered items
  const requirements: string[] = []
  const bulletMatches = content.match(/[-•]\s+(.+?)(?:\n|$)/g)
  if (bulletMatches) {
    bulletMatches.forEach((m) => {
      const text = m.replace(/^[-•]\s+/, '').trim()
      if (text.length > 10 && text.length < 200) requirements.push(text)
    })
  }
  const numberedMatches = content.match(/\d+\.\s+(.+?)(?:\n|$)/g)
  if (numberedMatches) {
    numberedMatches.forEach((m) => {
      const text = m.replace(/^\d+\.\s+/, '').trim()
      if (text.length > 10 && text.length < 200 && !requirements.includes(text)) {
        requirements.push(text)
      }
    })
  }

  if (requirements.length === 0) return null

  // Extract topic from first line or heading
  const topicMatch = content.match(/^#+\s*(.+?)$/m) || content.match(/^(.{10,80}?)[\n.]/m)
  const topic = topicMatch ? topicMatch[1].trim() : `Regulatory Information - ${country}`

  // Extract citation indices
  const citationMatches = content.match(/\[\^(\d+)\]/g)
  const citationIndices = citationMatches
    ? citationMatches.map((m) => parseInt(m.replace(/[\[\]^]/g, '')))
    : []

  return {
    type: 'compliance_alert',
    id: `compliance-auto-${hashCode(content.slice(0, 200))}`,
    data: {
      country,
      countryCode: codeMap[countryLower] ?? country.slice(0, 2).toUpperCase(),
      authority: authorityMap[countryLower] ?? 'Tax Authority',
      topic,
      severity: 'for_information',
      requirements,
      citationIndices,
    },
  }
}

// --- get_transactions text parsing and card builders ---

interface ParsedTransaction {
  amount: number
  currency: string
  date: string
  category: string
  transactionType: string // "Income" | "Expense" | "Cost of Goods Sold"
  month: string // "YYYY-MM" for grouping
}

// Known internal category ID patterns (e.g. "other_9gsnmr") — resolve to display name
const CATEGORY_ID_REGEX = /^[a-z_]+_[a-z0-9]{4,}$/i

function resolveCategoryName(raw: string): string {
  if (!raw || raw === 'Uncategorized') return 'Uncategorized'
  // If it looks like an internal ID (e.g. "other_9gsnmr"), extract the prefix as display name
  if (CATEGORY_ID_REGEX.test(raw)) {
    const prefix = raw.split('_')[0]
    return prefix.charAt(0).toUpperCase() + prefix.slice(1)
  }
  return raw
}

/** Parse the formatted text output of get_transactions into structured data */
function parseTransactionText(content: string): ParsedTransaction[] {
  const txns: ParsedTransaction[] = []
  // Match each transaction block including the Type field
  const blockRegex = /\d+\.\s+.+?\n\s+Amount:\s+([\d,.]+)\s+(\w+).*?\n\s+Date:\s+(.+?)\n\s+Category:\s+(.+?)\n\s+Vendor:\s+.+?\n\s+Type:\s+(.+?)(?:\n|$)/g
  let match: RegExpExecArray | null
  while ((match = blockRegex.exec(content)) !== null) {
    const amount = parseFloat(match[1].replace(/,/g, ''))
    const currency = match[2]
    const dateStr = match[3].trim()
    const category = resolveCategoryName(match[4].trim())
    const transactionType = match[5].trim()

    // Parse month from date like "Feb 05, 2026" or "Oct 31, 2025"
    const dateMatch = dateStr.match(/(\w{3})\s+\d{1,2},\s+(\d{4})/)
    const monthMap: Record<string, string> = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
      Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
    }
    const month = dateMatch
      ? `${dateMatch[2]}-${monthMap[dateMatch[1]] || '01'}`
      : 'unknown'

    if (!isNaN(amount) && amount > 0) {
      txns.push({ amount, currency, date: dateStr, category, transactionType, month })
    }
  }
  return txns
}

/** Build a budget_alert card from parsed transactions (category spending breakdown) */
function buildBudgetAlertFromTransactions(txns: ParsedTransaction[], content: string): ActionCard | null {
  // CRITICAL: Only include expense and COGS transactions — never income/revenue
  const expenseTxns = txns.filter(t =>
    t.transactionType === 'Expense' || t.transactionType === 'Cost of Goods Sold'
  )
  if (expenseTxns.length === 0) return null

  // Handle mixed currencies: group by currency, use the dominant one
  const currencyCounts = new Map<string, number>()
  for (const t of expenseTxns) {
    currencyCounts.set(t.currency, (currencyCounts.get(t.currency) || 0) + 1)
  }
  // Use the most common currency; filter to only that currency for accurate totals
  const dominantCurrency = [...currencyCounts.entries()]
    .sort((a, b) => b[1] - a[1])[0][0]
  const sameCurrencyTxns = expenseTxns.filter(t => t.currency === dominantCurrency)

  // Group by category
  const categoryMap = new Map<string, number>()
  for (const t of sameCurrencyTxns) {
    categoryMap.set(t.category, (categoryMap.get(t.category) || 0) + t.amount)
  }
  if (categoryMap.size < 1) return null

  const totalSpend = sameCurrencyTxns.reduce((s, t) => s + t.amount, 0)
  const avgPerCategory = categoryMap.size > 1 ? totalSpend / categoryMap.size : totalSpend

  type BudgetStatus = 'on_track' | 'above_average' | 'overspending'
  const categories = Array.from(categoryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, spend]) => {
      const pct = categoryMap.size > 1 ? (spend / avgPerCategory) * 100 : 100
      const status: BudgetStatus = pct > 130 ? 'overspending'
        : pct > 100 ? 'above_average'
        : 'on_track'
      return {
        name,
        currentSpend: spend,
        averageSpend: Math.round(avgPerCategory * 100) / 100,
        percentOfAverage: Math.round(pct),
        status,
      }
    })

  const overCount = categories.filter(c => c.status === 'overspending').length
  const overallStatus: BudgetStatus = overCount >= categories.length / 2 ? 'overspending'
    : overCount > 0 ? 'above_average'
    : 'on_track'

  // Derive period from expense transaction dates
  const months = [...new Set(sameCurrencyTxns.map(t => t.month))].sort()
  const period = months.length === 1
    ? formatMonthLabel(months[0])
    : `${formatMonthLabel(months[0])} – ${formatMonthLabel(months[months.length - 1])}`

  return {
    type: 'budget_alert',
    id: `budget-auto-${hashCode(content.slice(0, 200))}`,
    data: {
      period,
      currency: dominantCurrency,
      categories,
      totalCurrentSpend: totalSpend,
      totalAverageSpend: Math.round(avgPerCategory * categoryMap.size * 100) / 100,
      overallStatus,
    },
  }
}

/** Build a spending_time_series card from parsed transactions (monthly totals) */
function buildSpendingTimeSeriesFromTransactions(txns: ParsedTransaction[], content: string): ActionCard | null {
  // Only include expense/COGS transactions for spending time series
  const expenseTxns = txns.filter(t =>
    t.transactionType === 'Expense' || t.transactionType === 'Cost of Goods Sold'
  )
  if (expenseTxns.length === 0) return null

  // Use dominant currency for consistent totals
  const currencyCounts = new Map<string, number>()
  for (const t of expenseTxns) {
    currencyCounts.set(t.currency, (currencyCounts.get(t.currency) || 0) + 1)
  }
  const dominantCurrency = [...currencyCounts.entries()]
    .sort((a, b) => b[1] - a[1])[0][0]
  const sameCurrencyTxns = expenseTxns.filter(t => t.currency === dominantCurrency)

  // Group by month
  const monthMap = new Map<string, Map<string, number>>()
  for (const t of sameCurrencyTxns) {
    if (t.month === 'unknown') continue
    if (!monthMap.has(t.month)) monthMap.set(t.month, new Map())
    const cats = monthMap.get(t.month)!
    cats.set(t.category, (cats.get(t.category) || 0) + t.amount)
  }

  const sortedMonths = [...monthMap.keys()].sort()
  if (sortedMonths.length < 2) return null

  const currency = dominantCurrency

  const periods = sortedMonths.map((month) => {
    const cats = monthMap.get(month)!
    const catArray = [...cats.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount }))
    return {
      label: formatMonthLabel(month),
      total: catArray.reduce((s, c) => s + c.amount, 0),
      categories: catArray,
    }
  })

  // Calculate trend from first to last period
  const first = periods[0].total
  const last = periods[periods.length - 1].total
  const trendPct = first > 0 ? Math.round(((last - first) / first) * 100) : 0
  const trendDirection = trendPct > 5 ? 'up' : trendPct < -5 ? 'down' : 'stable'

  return {
    type: 'spending_time_series',
    id: `timeseries-auto-${hashCode(content.slice(0, 200))}`,
    data: {
      chartType: 'time_series',
      title: 'Spending Trends',
      currency,
      periods,
      trendPercent: Math.abs(trendPct),
      trendDirection,
    },
  }
}

/** Format "2026-02" to "Feb 2026" */
function formatMonthLabel(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-')
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${names[parseInt(month, 10) - 1] || month} ${year}`
}

/** Build a revenue_summary card from parsed income transactions */
function buildRevenueSummaryFromTransactions(txns: ParsedTransaction[], content: string): ActionCard | null {
  // Only include income/revenue transactions
  const incomeTxns = txns.filter(t =>
    t.transactionType === 'Income' || t.transactionType === 'Sales Revenue'
  )
  if (incomeTxns.length === 0) return null

  // Use dominant currency
  const currencyCounts = new Map<string, number>()
  for (const t of incomeTxns) {
    currencyCounts.set(t.currency, (currencyCounts.get(t.currency) || 0) + 1)
  }
  const currency = [...currencyCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const sameCurrencyTxns = incomeTxns.filter(t => t.currency === currency)

  // Group by category (revenue source)
  const sourceMap = new Map<string, { amount: number; count: number }>()
  for (const t of sameCurrencyTxns) {
    const key = t.category || 'Other Revenue'
    const existing = sourceMap.get(key) || { amount: 0, count: 0 }
    existing.amount += t.amount
    existing.count += 1
    sourceMap.set(key, existing)
  }
  if (sourceMap.size < 1) return null

  const totalRevenue = sameCurrencyTxns.reduce((s, t) => s + t.amount, 0)

  const sources = Array.from(sourceMap.entries())
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([name, data]) => ({
      name,
      amount: Math.round(data.amount * 100) / 100,
      count: data.count,
      percentOfTotal: totalRevenue > 0 ? Math.round((data.amount / totalRevenue) * 100) : 0,
    }))

  // Detect period from transaction dates
  const months = new Set(sameCurrencyTxns.map(t => t.month))
  const period = months.size === 1
    ? formatMonthLabel([...months][0])
    : `${formatMonthLabel([...months].sort()[0])} – ${formatMonthLabel([...months].sort().pop()!)}`

  return {
    type: 'revenue_summary',
    id: `revenue-auto-${hashCode(content.slice(0, 200))}`,
    data: {
      period,
      currency,
      sources,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      transactionCount: sameCurrencyTxns.length,
    },
  }
}
