// src/lib/secure-langgraph-agent.ts

/**
 * Secure LangGraph Financial Co-pilot Agent
 * Security-first architecture with mandatory user context validation and RLS enforcement
 */

import { StateGraph, END, Annotation } from "@langchain/langgraph"
import { BaseMessage, AIMessage, ToolMessage, HumanMessage } from "@langchain/core/messages"
import { ToolFactory } from './secure-tools/tool-factory'
import { UserContext } from './secure-tools/base-tool'
import { aiConfig } from './config/ai-config'

// Secure Agent State Definition with mandatory user context
const SecureAgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
    default: () => []
  }),
  language: Annotation<string>({
    reducer: (x: string, y: string) => y || x,
    default: () => 'en'
  }),
  // CRITICAL: User context is now mandatory and validated
  userContext: Annotation<UserContext>({
    reducer: (x: UserContext, y: UserContext) => ({ ...x, ...y }),
    default: () => ({ userId: '', conversationId: '' })
  }),
  // Track security validation state
  securityValidated: Annotation<boolean>({
    reducer: (x: boolean, y: boolean) => y,
    default: () => false
  })
})

// Export the secure state type
export type SecureAgentState = typeof SecureAgentStateAnnotation.State

/**
 * Get secure system prompt with available tools
 */
function getSecureSystemPrompt(language: string): string {
  const toolDescriptions = ToolFactory.getToolDescriptions()
  const availableTools = Object.entries(toolDescriptions)
    .map(([name, desc]) => `${name}: ${desc}`)
    .join('\n')

  const basePrompt = `You are FinanSEAL AI, a secure financial co-pilot for Southeast Asian SMEs. You help users understand their financial data with complete privacy and security.

IMPORTANT SECURITY NOTICE: You are operating in a secure environment where all data access is properly authorized and user-isolated.

Available Tools:
${availableTools}

CRITICAL RAG INTEGRATION GUIDELINES:
- For ANY financial questions about user's specific data (invoices, receipts, transactions, expenses, vendors, amounts), ALWAYS use search_documents tool first
- For questions about transactions or financial summaries, use get_transactions tool
- Simple questions like "show me my expenses" or "what invoices do I have" require tool usage to access actual data
- Only provide general financial advice without tools when the question is purely educational/theoretical

When you need to use a tool, respond with JSON in this exact format:
{
  "tool_call": {
    "name": "tool_name",
    "parameters": {
      "query": "user's search query here"
    }
  },
  "reasoning": "Why you need to use this tool"
}

Examples of when to use tools:
- "What are my recent expenses?" → Use get_transactions
- "Show me invoices from vendor ABC" → Use search_documents with query "vendor ABC invoices"  
- "What's my total spending this month?" → Use get_transactions
- "Find receipts with amount over $100" → Use search_documents with query "receipts amount over 100"

For regular responses (no tool needed), respond normally in conversational text.

Always be helpful, accurate, and proactive in accessing user data to provide specific insights. All data you access belongs to the authenticated user only.`

  const translations = {
    en: basePrompt,
    th: `${basePrompt}\n\nตอบเป็นภาษาไทยเสมอ และรักษาความปลอดภัยของข้อมูลผู้ใช้`,
    id: `${basePrompt}\n\nSelalu jawab dalam bahasa Indonesia dan jaga keamanan data pengguna.`
  }

  return translations[language as keyof typeof translations] || translations.en
}

/**
 * Security Validation Node - MANDATORY first step
 * Validates user context and permissions before any agent action
 */
async function validateSecurity(state: SecureAgentState): Promise<Partial<SecureAgentState>> {
  console.log('[SecurityValidation] Validating user context and permissions')

  // CRITICAL: Validate user context exists
  if (!state.userContext || !state.userContext.userId) {
    console.error('[SecurityValidation] Missing or invalid user context')
    return {
      messages: [...state.messages, new AIMessage('I apologize, but I cannot process your request due to authentication issues. Please refresh and try again.')],
      securityValidated: false
    }
  }

  // CRITICAL: Validate user context format
  if (typeof state.userContext.userId !== 'string' || state.userContext.userId.length === 0) {
    console.error('[SecurityValidation] Invalid userId format')
    return {
      messages: [...state.messages, new AIMessage('I apologize, but there was an authentication error. Please refresh and try again.')],
      securityValidated: false
    }
  }

  // Additional security checks can be added here
  // - Rate limiting
  // - User permissions validation
  // - Session validation
  // - Conversation ownership validation

  console.log(`[SecurityValidation] Security validation passed for user: ${state.userContext.userId}`)
  return {
    securityValidated: true
  }
}

/**
 * Secure Call Model Node - The agent's "brain" with security enforcement
 * Only processes requests after security validation
 */
async function secureCallModel(state: SecureAgentState): Promise<Partial<SecureAgentState>> {
  console.log('[SecureCallModel] Processing request with security validation')

  // CRITICAL: Ensure security validation passed
  if (!state.securityValidated) {
    console.error('[SecureCallModel] Security validation not passed, refusing to process')
    return {
      messages: [...state.messages, new AIMessage('Request cannot be processed due to security restrictions.')]
    }
  }

  const systemPrompt = getSecureSystemPrompt(state.language || 'en')
  
  // Prepare messages for LLM
  const messages = [
    { role: 'system', content: systemPrompt },
    ...state.messages.map((msg: any) => ({
      role: (msg._getType ? msg._getType() : msg.type) === 'human' ? 'user' : 'assistant',
      content: msg.content
    }))
  ]

  try {
    console.log(`[SecureCallModel] Calling LLM for user: ${state.userContext.userId}`)
    // ### DEBUGGING: Log the full request payload being sent to the LLM endpoint
    console.log('[SecureCallModel] Request Payload:', JSON.stringify({
        model: aiConfig.chat.modelId,
        messages,
        max_tokens: 1000,
        temperature: 0.3
    }, null, 2));
    
    const response = await fetch(`${aiConfig.chat.endpointUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiConfig.chat.modelId,
        messages,
        max_tokens: 1000,
        temperature: 0.3
      })
    })

    if (!response.ok) {
      // ### DEBUGGING: Log the non-OK response status and text
      const errorText = await response.text();
      console.error(`[SecureCallModel] LLM API error: ${response.status} - ${errorText}`);
      throw new Error(`LLM API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json()
    // ### DEBUGGING: Log the full successful response from the LLM endpoint
    console.log('[SecureCallModel] Raw LLM Response:', JSON.stringify(result, null, 2));

    const assistantResponse = result.choices?.[0]?.message;

    // CRITICAL: Check for tool calls directly from the JSON response.
    // This is the most reliable way to handle the output.
    if (assistantResponse?.tool_calls) {
      const toolCall = assistantResponse.tool_calls[0];
      const toolName = toolCall.function?.name;
      
      if (!ToolFactory.hasToolType(toolName)) {
        console.error(`[SecureCallModel] Unknown tool requested: ${toolName}`);
        return {
          messages: [...state.messages, new AIMessage('I apologize, but I cannot use the requested tool.')],
        };
      }
      
      // Construct a new message with the tool call.
      const aiMessageWithToolCall = new AIMessage({
        content: '',
        tool_calls: [toolCall],
      });

      console.log('[SecureCallModel] Tool call detected:', toolCall);
      return {
        messages: [...state.messages, aiMessageWithToolCall],
      };
    }
    
    // If no tool call, get the content.
    let content = assistantResponse?.content || 'I apologize, but I cannot process your request right now.';
    
    // Clean up extra fields or meta-commentary in the content if they exist.
    if (content && typeof content === 'string') {
      content = content
        .replace(/^(I need to understand.*?\.)?\s*/i, '')
        .replace(/^(Let me help you.*?\.)?\s*/i, '')
        .replace(/^\*\*Response:\*\*\s*/i, '')
        .trim();
    }
    
    // Add the final text response.
    console.log('[SecureCallModel] Final AI Content:', content); // ### Added final content log
    return {
      messages: [...state.messages, new AIMessage(content)],
    };

  } catch (error) {
    // ### DEBUGGING: Log the full error object for detailed insights
    console.error(`[SecureCallModel] Caught an error for user ${state.userContext.userId}:`, error);
    // If it's an HTTP error, log response details
    if (error instanceof Error && error.message.startsWith('LLM API error:')) {
      console.error('[SecureCallModel] API Error Details:', error.message);
    }
    return {
      messages: [...state.messages, new AIMessage('I apologize, but I encountered an error processing your request. Please try again.')],
    };
  }
}
/**
 * Secure Execute Tool Node - The agent's "hands" with RLS enforcement
 * All tool execution goes through the secure ToolFactory
 */
async function secureExecuteTool(state: SecureAgentState): Promise<Partial<SecureAgentState>> {
  console.log('[SecureExecuteTool] Processing secure tool execution')

  // CRITICAL: Ensure security validation passed
  if (!state.securityValidated) {
    console.error('[SecureExecuteTool] Security validation not passed, refusing tool execution')
    return {
      messages: [...state.messages, new ToolMessage({
        content: 'Tool execution denied due to security restrictions',
        tool_call_id: 'security_error',
        name: 'security_error'
      })]
    }
  }

  const lastMessage = state.messages[state.messages.length - 1]
  
  if (!lastMessage || lastMessage._getType() !== 'ai') {
    console.error('[SecureExecuteTool] No AI message found for tool execution')
    return { messages: state.messages }
  }

  try {
    // Parse the tool call JSON
    const toolCall = JSON.parse(lastMessage.content as string)
    const toolName = toolCall.tool_call?.name
    const parameters = toolCall.tool_call?.parameters || {}

    console.log(`[SecureExecuteTool] Executing tool: ${toolName} for user: ${state.userContext.userId}`)

    // CRITICAL: Execute tool through secure ToolFactory with user context
    const result = await ToolFactory.executeTool(toolName, parameters, state.userContext)

    console.log(`[SecureExecuteTool] Tool ${toolName} execution result:`, { success: result.success })

    // Create appropriate response message
    const toolMessage = new ToolMessage({
      content: result.success ? result.data || 'Tool executed successfully' : result.error || 'Tool execution failed',
      tool_call_id: toolName,
      name: toolName
    })

    return {
      messages: [...state.messages, toolMessage]
    }

  } catch (error) {
    console.error(`[SecureExecuteTool] Error for user ${state.userContext.userId}:`, error)
    
    const errorMessage = new ToolMessage({
      content: `Tool execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      tool_call_id: 'error',
      name: 'error'
    })

    return {
      messages: [...state.messages, errorMessage]
    }
  }
}

/**
 * Secure Router Function - Determines next step with security awareness.
 */
function secureRouter(state: SecureAgentState): string {
  // CRITICAL: Check for empty messages array at the start.
  if (!state.messages || state.messages.length === 0) {
    return 'validateSecurity';
  }

  // Use a type assertion to treat the message as a dynamic object for `type` property.
  const lastMessage = state.messages[state.messages.length - 1] as any;

  // Check the message type. If it's not a standard LangChain type, use the `type` property.
  const messageType = lastMessage._getType ? lastMessage._getType() : lastMessage.type;

  // Route based on message type
  if (messageType === 'ai') {
    try {
      const toolCall = JSON.parse(lastMessage.content as string);
      if (toolCall.tool_call && toolCall.tool_call.name) {
        return 'secureExecuteTool';
      }
    } catch {
      // Not JSON, fall through to END
    }
    // If the last AI message is not a tool call, the turn is over.
    return END;
  }

  if (messageType === 'tool') {
    // A tool result needs to be processed by the model for a final answer.
    return 'secureCallModel';
  }

  // If the message is a human message, the agent needs to respond.
  return 'secureCallModel';
}

/**
 * Create and compile the secure LangGraph application
 */
export function createSecureFinancialAgent() {
  console.log('[SecureLangGraph] Creating secure financial agent...')

  // Validate all tools before creating agent
  ToolFactory.validateTools().then(validation => {
    if (!validation.valid) {
      console.error('[SecureLangGraph] Tool validation failed:', validation.errors)
    } else {
      console.log('[SecureLangGraph] All tools validated successfully')
    }
  })

  // Define the secure state graph
  const workflow = new StateGraph(SecureAgentStateAnnotation)

  // Add nodes with security enforcement
  workflow.addNode('validateSecurity', validateSecurity)
  workflow.addNode('secureCallModel', secureCallModel)
  workflow.addNode('secureExecuteTool', secureExecuteTool)

  // Add edges with security-aware routing
  workflow.addEdge("__start__", "validateSecurity" as any)
  workflow.addConditionalEdges("validateSecurity" as any, secureRouter)
  workflow.addConditionalEdges("secureCallModel" as any, secureRouter)
  workflow.addConditionalEdges("secureExecuteTool" as any, secureRouter)

  // Compile the secure graph
  const app = workflow.compile()
  console.log('[SecureLangGraph] Secure financial agent compiled successfully')

  return app
}

/**
 * Convenience function to create secure agent state from user context
 */
export function createSecureAgentState(
  userContext: UserContext,
  initialMessage: string,
  language: string = 'en'
): SecureAgentState {
  return {
    messages: [new HumanMessage(initialMessage)],
    language,
    userContext,
    securityValidated: false
  }
}