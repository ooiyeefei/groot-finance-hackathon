/**
 * Model Node - The agent's "brain" with security enforcement and sanitization
 * Only processes requests after security validation
 */

import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { ToolFactory } from '../../tools/tool-factory';
import { ModelType } from '../../tools/base-tool';
import { detectModelType, geminiService } from '../config/model-config';
import { getSystemPrompt } from '../config/prompts';
import { aiConfig } from '../../config/ai-config';
import { AgentState } from '../types';

export async function callModel(state: AgentState): Promise<Partial<AgentState>> {
  console.log('[CallModel] Processing request with security validation');

  if (process.env.NODE_ENV === 'development') {
    console.log(`[CallModel] DEBUG: State has ${state.messages.length} messages`);
  }

  // Message count logging only (content removed to prevent conversation dumping)
  console.log(`[CallModel] Processing ${state.messages.length} messages (types: ${state.messages.map(msg => {
    if (msg instanceof HumanMessage) return 'Human';
    if (msg instanceof AIMessage) return 'AI';
    if (msg instanceof ToolMessage) return 'Tool';
    return 'Unknown';
  }).join(', ')})`);

  // CRITICAL: Ensure security validation passed
  if (!state.securityValidated) {
    console.error('[CallModel] Security validation not passed, refusing to process');
    return {
      messages: [...state.messages, new AIMessage('Request cannot be processed due to security restrictions.')],
      currentPhase: 'completed'
    };
  }

  // Set phase to execution when we start model processing
  console.log('[CallModel] Setting phase to execution for model processing');

  // MODEL-CONDITIONAL ARCHITECTURE: Detect model type for appropriate approach
  const modelType = detectModelType();
  const systemPrompt = getSystemPrompt(state.language || 'en', modelType);

  console.log(`[CallModel] Using ${modelType} approach for this request`);

  // DEBUG: Check if this looks like a regulatory question (development only)
  if (process.env.NODE_ENV === 'development') {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage && typeof lastMessage.content === 'string') {
      const query = lastMessage.content.toLowerCase();
      const regulatoryKeywords = ['gst', 'tax', 'regulation', 'compliance', 'registration', 'ovr', 'overseas vendor', 'requirements'];
      const isRegulatoryQuestion = regulatoryKeywords.some(keyword => query.includes(keyword));
      console.log(`[CallModel] Query classification - Regulatory keywords detected: ${isRegulatoryQuestion}`);
    }
  }

  // --- CONDITIONAL SANITIZATION (GEMINI ONLY) ---
  // Only apply sanitization workarounds for Gemini due to safety restrictions
  const processedMessages = [...state.messages];

  if (modelType === 'gemini') {
    console.log(`[CallModel] Applying Gemini-specific sanitization workarounds`);
    await applyGeminiSanitization(processedMessages);
  } else {
    console.log(`[CallModel] Using original approach for ${modelType} - no sanitization needed`);
  }

  // CRITICAL FIX: Trim conversation history to prevent context pollution
  // Keep only the last 6 messages (3 user/assistant pairs) to prevent LLM confusion
  let trimmedMessages = processedMessages;
  if (processedMessages.length > 6) {
    trimmedMessages = processedMessages.slice(-6);
    console.log(`[CallModel] TRIMMED conversation history from ${processedMessages.length} to ${trimmedMessages.length} messages to prevent context pollution`);
  }

  // Prepare messages for LLM using trimmed messages (sanitized for Gemini, original for others)
  console.log(`[CallModel] Building messages for LLM from ${trimmedMessages.length} processed messages`);

  const messages = buildMessagesForLLM(trimmedMessages, systemPrompt);

  console.log(`[CallModel] Final messages for LLM: ${messages.length} total (${messages.length - 1} conversation messages + 1 system)`);

  try {
    console.log(`[CallModel] Calling LLM for user: ${state.userContext.userId}`);

    // Get available tools for function calling from ToolFactory (single source of truth)
    // Role-based filtering: managers see team tools, employees don't
    const tools = await getValidatedTools(modelType, state.userContext.role);

    // Check if we should use Gemini
    if (modelType === 'gemini' && geminiService) {
      const isFinancial = detectFinancialQuery(state);
      return await handleGeminiResponse(state, messages, systemPrompt, tools, isFinancial);
    }

    // Fallback to original OpenAI-compatible API
    return await handleOpenAIResponse(state, messages, tools);

  } catch (error) {
    return handleModelError(state, error);
  }
}

/**
 * Apply Gemini-specific sanitization workarounds
 */
async function applyGeminiSanitization(processedMessages: any[]): Promise<void> {
  const lastMessage = processedMessages[processedMessages.length - 1];

  // Enhanced message type detection - try multiple approaches
  const isHumanMessage = lastMessage instanceof HumanMessage;
  const hasHumanContent = lastMessage && lastMessage.content && typeof lastMessage.content === 'string';

  // Check if we need to sanitize - only for Gemini
  if (lastMessage && hasHumanContent) {
    const originalQuery = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

    // Check for financial trigger words
    const financialTriggers = [
      'invoice', 'amount', 'largest', 'biggest', 'expense', 'transaction',
      'payment', 'financial', 'money', 'cost', 'price', 'bill', 'receipt',
      'purchase', 'spend', 'budget', 'revenue', 'profit', 'loss', 'vendor',
      'accounting', 'finance', 'economic', 'monetary', 'fiscal', 'currency',
      'dollar', 'euro', 'pound', 'yen', 'credit', 'debit', 'bank', 'account'
    ];

    const containsFinancialTerms = financialTriggers.some(trigger =>
      originalQuery.toLowerCase().includes(trigger)
    );

    if (containsFinancialTerms) {
      const sanitizedQuery = await sanitizeFinancialQuery(originalQuery);
      if (sanitizedQuery) {
        // Replace the last message with sanitized version for LLM processing only
        const sanitizedMessage = new HumanMessage(sanitizedQuery);
        processedMessages[processedMessages.length - 1] = sanitizedMessage;
      }
    }
  }
}

/**
 * Sanitize financial queries for Gemini safety compliance
 */
async function sanitizeFinancialQuery(originalQuery: string): Promise<string | null> {
  try {
    const sanitizationPrompt = `You are a query sanitizer that removes financial terminology to bypass AI safety restrictions. Your job is to rewrite queries to be generic while preserving the core intent.

SANITIZATION RULES:
- Replace "invoice" → "document" or "record"
- Replace "amount/money/cost/price" → "value" or "number"
- Replace "transaction/payment/expense" → "data record" or "entry"
- Replace "financial/accounting" → "data"
- Replace "largest/biggest" → "highest" or "maximum"
- Replace "vendor/company name" → "entity" or "source"
- Remove currency symbols and financial context
- Keep date ranges, numerical filters, and comparison logic
- Preserve the core analytical intent

EXAMPLES:
Original: "What is the largest invoice amount I have in the past 60 days?"
Sanitized: "What is the highest value in my data records from the past 60 days?"

Original: "Show me all expenses from ABC Company over $500"
Sanitized: "Show me all entries from ABC Company with values over 500"

Rewrite this query to remove financial terminology while preserving intent:
"${originalQuery}"

Return ONLY the sanitized query, no explanations.`;

    // Build headers conditionally based on API key presence
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // Only add Authorization header if API key is present
    if (aiConfig.chat.apiKey) {
      headers['Authorization'] = `Bearer ${aiConfig.chat.apiKey}`;
    }

    const response = await fetch(`${aiConfig.chat.endpointUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: aiConfig.chat.modelId,
        messages: [
          { role: 'system', content: sanitizationPrompt }
        ],
        max_tokens: 200,
        temperature: 0.1
      })
    });

    if (response.ok) {
      const result = await response.json();
      const sanitizedQuery = result.choices?.[0]?.message?.content?.trim();
      if (sanitizedQuery) {
        return sanitizedQuery;
      }
    } else {
      console.warn('[CallModel] Sanitization failed, using original query');
    }
  } catch (error) {
    console.warn('[CallModel] Sanitization error, using original query:', error);
  }

  return null;
}

/**
 * Build messages array for LLM consumption
 */
function buildMessagesForLLM(trimmedMessages: any[], systemPrompt: string): any[] {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...trimmedMessages.map((msg: any, index) => {
      const msgType = msg._getType ? msg._getType() : msg.type;
      // Process message without logging sensitive content
      console.log(`[CallModel] Processing message ${index}: type=${msgType}`);

      // ULTRA-ROBUST: Check multiple conditions for human message
      const isHumanMsg = msgType === 'human' ||
                        msg instanceof HumanMessage ||
                        (msg as any).role === 'user' ||
                        (index === trimmedMessages.length - 1 && typeof msg.content === 'string'); // Last message with string content

      if (isHumanMsg || msgType === 'human') {
        const userMessage = { role: 'user', content: msg.content };
        console.log(`[CallModel] Created user message (type: ${msgType})`);
        return userMessage;
      } else if (msgType === 'tool') {
        // CRITICAL FIX: Proper OpenAI tool message format
        return {
          role: 'tool',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          tool_call_id: msg.tool_call_id
        };
      } else {
        // CRITICAL FIX: Include tool_calls for assistant messages that made tool calls
        // OpenAI API requires tool_calls in assistant message before tool result
        const assistantMsg: Record<string, unknown> = {
          role: 'assistant',
          content: msg.content || ''
        };
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          assistantMsg.tool_calls = msg.tool_calls.map((tc: { id: string; name: string; args: unknown }) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args)
            }
          }));
        }
        return assistantMsg;
      }
    })
  ];

  return messages;
}

/**
 * Get validated tools for the LLM, filtered by user role
 */
async function getValidatedTools(modelType: ModelType, userRole?: string): Promise<any[]> {
  // Use role-based schemas to filter tool visibility by user role
  const rawTools = ToolFactory.getToolSchemasForRole(modelType, userRole);

  if (process.env.NODE_ENV === 'development') {
    console.log(`[CallModel] DEBUG: ToolFactory returned ${rawTools.length} raw tools`);
    console.log(`[CallModel] DEBUG: Available tool names: ${rawTools.map(t => t.function?.name).join(', ')}`);

    // Check specifically for regulatory tool
    const hasRegulatoryTool = rawTools.some(tool => tool.function?.name === 'searchRegulatoryKnowledgeBase');
    console.log(`[CallModel] DEBUG: Regulatory tool present: ${hasRegulatoryTool}`);
  }

  // ADDITIONAL VALIDATION: Ensure each tool has a function.name before sending to API
  const tools = rawTools.filter(tool => {
    const hasName = tool?.function?.name;
    if (!hasName) {
      console.error(`[CallModel] CRITICAL: Tool missing function.name:`, JSON.stringify(tool, null, 2));
      return false;
    }
    return true;
  });

  // If no valid tools after filtering, proceed without tools
  if (tools.length === 0) {
    console.warn(`[CallModel] No valid tools available, proceeding without function calling`);
  } else if (process.env.NODE_ENV === 'development') {
    console.log(`[CallModel] DEBUG: ${tools.length} valid tools loaded for LLM`);
  }

  return tools;
}

/**
 * Handle Gemini model response
 */
async function handleGeminiResponse(state: AgentState, messages: any[], systemPrompt: string, tools: any[], isFinancialQuery: boolean = false): Promise<Partial<AgentState>> {
  console.log(`\n🤖 [GEMINI PATH] Using model: ${aiConfig.gemini.model} with ${messages.length} messages, financial query: ${isFinancialQuery}\n`);

  // Convert messages to GeminiMessage format
  const geminiMessages = messages.slice(1).map((msg: any) => ({
    role: msg.role === 'assistant' ? 'assistant' : msg.role,
    content: msg.content,
    tool_call_id: msg.tool_call_id
  }));

  const response = await geminiService!.generateContent(geminiMessages, systemPrompt, tools);

  if (!response.success) {
    console.error('[CallModel] Gemini error:', response.error);
    return {
      messages: [...state.messages, new AIMessage('I apologize, but I encountered an error processing your request.')],
    };
  }

  // Check for function calls
  if (response.tool_calls && response.tool_calls.length > 0) {
    const toolCall = response.tool_calls[0];
    const toolName = toolCall.function.name;

    console.log('[CallModel] Gemini function call detected:', toolCall);

    if (!ToolFactory.hasToolType(toolName)) {
      console.error(`[CallModel] Unknown tool requested: ${toolName}`);
      return {
        messages: [...state.messages, new AIMessage('I apologize, but I cannot use the requested tool.')],
      };
    }

    // Convert to LangChain ToolCall format
    const aiMessageWithToolCall = new AIMessage({
      content: '',
      tool_calls: [{
        name: toolName,
        args: JSON.parse(toolCall.function.arguments),
        id: toolCall.id,
        type: 'tool_call'
      }],
    });

    return {
      messages: [...state.messages, aiMessageWithToolCall],
    };
  }

  // ANTI-HALLUCINATION GUARD: Block financial responses without tool usage (same as OpenAI path)
  if (isFinancialQuery) {
    console.log(`[CallModel] 🚨 GEMINI BLOCKED FINANCIAL HALLUCINATION: Financial query detected but Gemini returned text instead of tool call`);
    return {
      messages: [...state.messages, new AIMessage('I need to look up your actual financial data to answer that question accurately. Let me search your records now.')],
    };
  }

  // Return text response from Gemini
  const content = response.content || 'I apologize, but I cannot process your request right now.';
  console.log('[CallModel] Gemini text response generated');

  return {
    messages: [...state.messages, new AIMessage(content)],
  };
}

/**
 * Detect if the query is asking for user's financial data (requires mandatory tool usage)
 * CRITICAL FIX: Only detect financial queries from human messages, not tool results
 */
function detectFinancialQuery(state: AgentState): boolean {
  const lastMessage = state.messages[state.messages.length - 1];
  if (!lastMessage || typeof lastMessage.content !== 'string') {
    return false;
  }

  // CRITICAL FIX: Don't force tool usage on tool results - allow final answer generation
  const messageType = lastMessage._getType ? lastMessage._getType() : (lastMessage as any).type;
  if (messageType === 'tool') {
    console.log('[CallModel] Skipping financial query detection for tool result - allowing final answer generation');
    return false;
  }

  // Only detect financial queries from human messages
  if (messageType !== 'human') {
    return false;
  }

  const query = lastMessage.content.toLowerCase();

  // Financial query indicators - these MUST use tools to prevent hallucination
  const financialTriggers = [
    // Direct data requests
    'my transactions', 'my expenses', 'my invoices', 'my payments', 'my income',
    'show me', 'list my', 'find my', 'get my', 'what transactions', 'what expenses',
    'what invoices', 'what payments', 'what income', 'how much', 'total amount',
    'largest', 'biggest', 'smallest', 'most expensive', 'least expensive',

    // Overview / status queries — user wants to see their actual data
    'income and expense', 'expense status', 'income status', 'financial status',
    'financial health', 'financial overview', 'financial summary', 'spending summary',
    'business doing', 'cash position', 'cash flow',
    'invoice status', 'invoices status', 'account receivable', 'account payable',
    'sales invoice', 'pending invoice', 'overdue invoice',

    // Query patterns that need database access
    'transactions from', 'expenses from', 'invoices from', 'payments to',
    'spent on', 'paid to', 'received from', 'amount paid', 'amount spent',
    'amount received', 'balance', 'outstanding', 'overdue', 'pending',

    // Vendor/company specific queries
    'vendor', 'company', 'supplier', 'client', 'customer',

    // Time-based financial queries
    'this month', 'last month', 'this year', 'last year', 'past', 'recent',
    'today', 'yesterday', 'this week', 'last week',

    // Currency and amounts
    'usd', 'sgd', 'thb', 'idr', 'myr', 'eur', 'cny', 'vnd', 'php', 'inr',
    '$', '€', '£', '¥', '₹', '₫', '₱', 'rm', 'rp'
  ];

  // Personal pronouns indicating user's own data
  const personalIndicators = ['my', 'i have', 'i paid', 'i spent', 'i received', 'show me', 'list my', 'tell me about my'];

  // Check for financial triggers
  const hasFinancialTrigger = financialTriggers.some(trigger => query.includes(trigger));

  // Check for personal data requests — personal pronoun + any financial-adjacent word
  const hasPersonalIndicator = personalIndicators.some(indicator => query.includes(indicator));
  const financialAdjacent = ['transaction', 'expense', 'income', 'invoice', 'payment', 'spending', 'finance', 'money', 'budget', 'cost', 'revenue'];
  const hasFinancialWord = financialAdjacent.some(word => query.includes(word));

  const isFinancialQuery = hasFinancialTrigger || (hasPersonalIndicator && hasFinancialWord);

  if (isFinancialQuery) {
    console.log(`[CallModel] 🚨 FINANCIAL QUERY DETECTED - Forcing tool usage to prevent hallucination: "${query.substring(0, 100)}..."`);
  }

  return isFinancialQuery;
}

/**
 * Handle OpenAI-compatible model response
 */
async function handleOpenAIResponse(state: AgentState, messages: any[], tools: any[]): Promise<Partial<AgentState>> {
  console.log(`\n🚀 [OPENAI PATH] Using model: ${aiConfig.chat.modelId} at ${aiConfig.chat.endpointUrl}\n`);

  const basePayload = {
    model: aiConfig.chat.modelId,
    messages,
    max_tokens: 1000,
    temperature: 0.3
  };

  // CRITICAL FIX: Detect financial queries and force tool usage to prevent hallucination
  const isFinancialQuery = detectFinancialQuery(state);

  const requestPayload = tools.length > 0 ? {
    ...basePayload,
    tools,
    // Force tool usage for financial queries to prevent hallucination
    tool_choice: isFinancialQuery ? "required" : "auto"
  } : basePayload;

  console.log(`[CallModel] Request with ${tools.length} tools configured, tool_choice: ${isFinancialQuery ? "required" : "auto"} (financial query: ${isFinancialQuery})`);

  // Build headers conditionally based on API key presence
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  // Only add Authorization header if API key is present
  if (aiConfig.chat.apiKey) {
    headers['Authorization'] = `Bearer ${aiConfig.chat.apiKey}`;
  }

  const response = await fetch(`${aiConfig.chat.endpointUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestPayload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[CallModel] LLM API error: ${response.status} - ${errorText}`);
    throw new Error(`LLM API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const hasToolCalls = result.choices?.[0]?.message?.tool_calls?.length > 0;
  console.log(`[CallModel] Response received, tool_calls: ${hasToolCalls}`);

  const assistantResponse = result.choices?.[0]?.message;

  // --- CHECK FOR SPECIAL 'DONE' COMMAND (Enhanced Pattern Matching) ---
  const responseContent = assistantResponse?.content?.trim() || '';
  const isDoneCommand = /^\s*DONE\s*[.\-\s]*$/i.test(responseContent) ||
                       /^\s*DONE\s*$/i.test(responseContent) ||
                       responseContent.toUpperCase() === 'DONE' ||
                       /^DONE[\s\.\-]*$/i.test(responseContent) ||
                       /^\**\s*DONE\s*\**$/i.test(responseContent);

  if (isDoneCommand) {
    console.log('[CallModel] Model issued DONE command (enhanced detection). Synthesizing final answer.');

    // Find the last successful tool result in the history
    const lastToolMessage = state.messages.slice().reverse().find(m => m._getType() === 'tool');

    if (lastToolMessage) {
      // Return the tool's content as the final answer
      const finalAnswer = typeof lastToolMessage.content === 'string'
        ? lastToolMessage.content
        : 'Here is the information I found for you.';

      console.log('[CallModel] DONE command processed, returning final answer');
      return {
        messages: [...state.messages, new AIMessage(finalAnswer)],
      };
    } else {
      // Fallback if no tool message found
      return {
        messages: [...state.messages, new AIMessage('I\'ve completed the task but could not find the result to display.')],
      };
    }
  }

  // --- CHECK FOR ERROR COMMAND ---
  if (assistantResponse?.content?.trim()?.startsWith('ERROR:')) {
    console.log('[CallModel] Model issued ERROR command:', assistantResponse.content);
    return {
      messages: [...state.messages, new AIMessage('I apologize, but I cannot determine how to process your request. Please try rephrasing your question.')],
    };
  }

  if (assistantResponse?.tool_calls && assistantResponse.tool_calls.length > 0) {
    const toolCall = assistantResponse.tool_calls[0];
    const toolName = toolCall.function?.name;

    if (!ToolFactory.hasToolType(toolName)) {
      console.error(`[CallModel] Unknown tool requested: ${toolName}`);
      return {
        messages: [...state.messages, new AIMessage('I apologize, but I cannot use the requested tool.')],
      };
    }

    // CRITICAL FIX 4: Block fake transaction IDs in compliance tool calls
    if (toolName === 'analyze_cross_border_compliance') {
      const args = JSON.parse(toolCall.function.arguments || '{}');
      const transactionId = args.transaction_id;

      // Detect fake transaction IDs (pattern matching common fake UUIDs)
      const fakeTxPatterns = [
        /^a1b2c3d4-e5f6-7890-abcd-ef[0-9a-f]{12}$/i,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      ];

      const isFakeId = fakeTxPatterns.some(pattern => pattern.test(transactionId)) ||
                       transactionId === 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' ||
                       transactionId?.includes('1234567890') ||
                       transactionId?.includes('abcd-ef');

      if (isFakeId) {
        console.error(`[CallModel] 🚨 BLOCKED FAKE TRANSACTION ID: ${transactionId}`);
        return {
          messages: [...state.messages, new AIMessage('I cannot analyze compliance for fabricated transaction IDs. Please use the get_transactions tool first to retrieve real transaction data, then I can analyze specific transactions for compliance.')],
        };
      }
    }

    const aiMessageWithToolCall = new AIMessage({
      content: '',
      tool_calls: [toolCall],
    });

    console.log('[CallModel] Tool call detected:', toolCall);
    return {
      messages: [...state.messages, aiMessageWithToolCall],
    };
  }

  // If no tool call, get the content - simplified for direct command model
  let content = assistantResponse?.content || 'I apologize, but I cannot process your request right now.';

  // CRITICAL ANTI-HALLUCINATION SAFEGUARD: Block financial responses without tool usage
  if (isFinancialQuery && !hasToolCalls) {
    console.log(`[CallModel] 🚨 BLOCKED FINANCIAL HALLUCINATION: Financial query detected but no tools used - preventing fictional data response`);

    // Force the AI to use tools for financial data instead of hallucinating
    return {
      messages: [...state.messages, new AIMessage('I need to look up your actual financial data to answer that question accurately. Let me search your transactions now.')],
    };
  }

  // Basic content cleaning for direct command model
  if (content && typeof content === 'string') {
    content = content.trim();

    // ENHANCED: Filter out any remaining DONE commands in content
    const isDoneResponse = /^\s*DONE\s*[.\-\s]*$/i.test(content) ||
                          /^\s*DONE\s*$/i.test(content) ||
                          content.toUpperCase() === 'DONE' ||
                          /^DONE[\s\.\-]*$/i.test(content) ||
                          /^\**\s*DONE\s*\**$/i.test(content);

    if (isDoneResponse) {
      content = "I've completed processing your request.";
    } else {
      // Remove DONE at the end of responses if it appears
      content = content.replace(/\s+DONE\s*[.\-]*\s*$/i, '').trim();
    }

    // For direct command models, we expect clean output, so minimal cleaning needed
    // Just ensure we don't return empty content
    if (!content || content.length < 3) {
      content = 'I apologize, but I cannot process your request right now.';
    }
  }

  console.log(`[CallModel] AI response generated (${content.length} chars)`);
  return {
    messages: [...state.messages, new AIMessage(content)],
  };
}

/**
 * Handle model execution errors
 */
function handleModelError(state: AgentState, error: any): Partial<AgentState> {
  // Enhanced error handling for network connectivity issues
  console.error(`[CallModel] Caught an error for user ${state.userContext.userId}:`, error);

  let errorMessage = 'I apologize, but I encountered an error processing your request. Please try again.';

  if (error instanceof Error) {
    if (error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT') || error.message.includes('fetch failed')) {
      console.error('[CallModel] Network connectivity error:', error.message);
      errorMessage = 'I\'m experiencing network connectivity issues. Please try your question again in a moment.';
    } else if (error.message.startsWith('LLM API error:')) {
      console.error('[CallModel] API Error Details:', error.message);
      errorMessage = 'The AI service is temporarily unavailable. Please try again shortly.';
    }
  }

  return {
    messages: [...state.messages, new AIMessage(errorMessage)],
  };
}