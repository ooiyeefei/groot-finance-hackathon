// src/lib/langgraph-agent.ts

/**
 * LangGraph Financial Co-pilot Agent
 * Architecture with user context validation and RLS enforcement
 */

import { StateGraph, END, Annotation } from "@langchain/langgraph";
import { BaseMessage, AIMessage, ToolMessage, HumanMessage } from "@langchain/core/messages";
import { ToolFactory } from './tools/tool-factory';
import { UserContext } from './tools/base-tool';
import { aiConfig } from './config/ai-config';
// Removed: import { generateToolSchemas } from './tools/tool-schema-generator';
// Now using ToolFactory.getToolSchemas() directly for single source of truth

// Agent State Definition with mandatory user context
const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
    default: () => []
  }),
  language: Annotation<string>({
    reducer: (x: string, y: string) => y || x,
    default: () => 'en'
  }),
  // User context is now mandatory and validated
  userContext: Annotation<UserContext>({
    reducer: (x: UserContext, y: UserContext) => ({ ...x, ...y }),
    default: () => ({ userId: '', conversationId: '' })
  }),
  // Track security validation state
  securityValidated: Annotation<boolean>({
    reducer: (x: boolean, y: boolean) => y,
    default: () => false
  })
});

// Export the secure state type
export type AgentState = typeof AgentStateAnnotation.State;

/**
 * Get system prompt for native function calling
 */
function getSystemPrompt(language: string): string {
  const basePrompt = `You are FinanSEAL AI, a secure financial co-pilot for Southeast Asian SMEs. You help users understand their financial data with complete privacy and security.

IMPORTANT SECURITY NOTICE: You are operating in a secure environment where all data access is properly authorized and user-isolated.

CRITICAL RAG INTEGRATION GUIDELINES:
- For ANY financial questions about user's specific data (invoices, receipts, transactions, expenses, vendors, amounts), you MUST use the appropriate function
- For document-related queries (invoices, receipts, reports), use the search_documents function
- For transaction queries (expenses, spending, financial summaries), use the get_transactions function
- Simple questions like "show me my expenses" or "what invoices do I have" require function usage to access actual data
- Only provide general financial advice without functions when the question is purely educational/theoretical

You have access to function calling capabilities. When you need to access user data, call the appropriate function with relevant parameters.

Examples of when to use functions:
- "What are my recent expenses?" → Call get_transactions function
- "Show me invoices from vendor ABC" → Call search_documents function with query "vendor ABC invoices"  
- "What's my total spending this month?" → Call get_transactions function with date filters
- "Find receipts with amount over $100" → Call search_documents function with query "receipts amount over 100"

Always be helpful, accurate, and proactive in accessing user data to provide specific insights. All data you access belongs to the authenticated user only.`;

  const translations = {
    en: basePrompt,
    th: `${basePrompt}\n\nตอบเป็นภาษาไทยเสมอ และรักษาความปลอดภัยของข้อมูลผู้ใช้`,
    id: `${basePrompt}\n\nSelalu jawab dalam bahasa Indonesia dan jaga keamanan data pengguna.`
  };

  return translations[language as keyof typeof translations] || translations.en;
}

/**
 * Validation Node - MANDATORY first step
 * Validates user context and permissions before any agent action
 */
async function validate(state: AgentState): Promise<Partial<AgentState>> {
  console.log('[Validation] Validating user context and permissions');

  // CRITICAL: Validate user context exists
  if (!state.userContext || !state.userContext.userId) {
    console.error('[Validation] Missing or invalid user context');
    return {
      messages: [...state.messages, new AIMessage('I apologize, but I cannot process your request due to authentication issues. Please refresh and try again.')],
      securityValidated: false
    };
  }

  // CRITICAL: Validate user context format
  if (typeof state.userContext.userId !== 'string' || state.userContext.userId.length === 0) {
    console.error('[Validation] Invalid userId format');
    return {
      messages: [...state.messages, new AIMessage('I apologize, but there was an authentication error. Please refresh and try again.')],
      securityValidated: false
    };
  }

  // Additional security checks can be added here
  // - Rate limiting
  // - User permissions validation
  // - Session validation
  // - Conversation ownership validation

  console.log(`[Validation] Security validation passed for user: ${state.userContext.userId}`);
  return {
    securityValidated: true
  };
}

/**
 * Call Model Node - The agent's "brain" with security enforcement
 * Only processes requests after security validation
 */
async function callModel(state: AgentState): Promise<Partial<AgentState>> {
  console.log('[CallModel] Processing request with security validation');

  // CRITICAL: Ensure security validation passed
  if (!state.securityValidated) {
    console.error('[CallModel] Security validation not passed, refusing to process');
    return {
      messages: [...state.messages, new AIMessage('Request cannot be processed due to security restrictions.')]
    };
  }

  const systemPrompt = getSystemPrompt(state.language || 'en');
  
  // Prepare messages for LLM
  const messages = [
    { role: 'system', content: systemPrompt },
    ...state.messages.map((msg: any) => ({
      // Map LangChain 'human' type to LLM's 'user' type
      role: (msg._getType ? msg._getType() : msg.type) === 'human' ? 'user' : 'assistant',
      content: msg.content
    }))
  ];

  try {
    console.log(`[CallModel] Calling LLM for user: ${state.userContext.userId}`);
    
    // Get available tools for function calling from ToolFactory (single source of truth)
    const tools = ToolFactory.getToolSchemas();
    
    const requestPayload = {
      model: aiConfig.chat.modelId,
      messages,
      tools,
      tool_choice: "auto",
      max_tokens: 1000,
      temperature: 0.3
    };
    
    // ### DEBUGGING: Log the full request payload being sent to the LLM endpoint
    console.log('[CallModel] Request Payload:', JSON.stringify(requestPayload, null, 2));
    
    const response = await fetch(`${aiConfig.chat.endpointUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      // ### DEBUGGING: Log the non-OK response status and text
      const errorText = await response.text();
      console.error(`[CallModel] LLM API error: ${response.status} - ${errorText}`);
      throw new Error(`LLM API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    // ### DEBUGGING: Log the full successful response from the LLM endpoint
    console.log('[CallModel] Raw LLM Response:', JSON.stringify(result, null, 2));

    const assistantResponse = result.choices?.[0]?.message;

    // CRITICAL: Check for tool calls and ensure the array is not empty.
    if (assistantResponse?.tool_calls && assistantResponse.tool_calls.length > 0) {
      const toolCall = assistantResponse.tool_calls[0];
      const toolName = toolCall.function?.name;
      
      if (!ToolFactory.hasToolType(toolName)) {
        console.error(`[CallModel] Unknown tool requested: ${toolName}`);
        return {
          messages: [...state.messages, new AIMessage('I apologize, but I cannot use the requested tool.')],
        };
      }
      
      // Construct a new AIMessage with the tool call, this is the key to clean routing.
      const aiMessageWithToolCall = new AIMessage({
        content: '',
        tool_calls: [toolCall],
      });

      console.log('[CallModel] Tool call detected:', toolCall);
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
    // ### DEBUGGING: Log the final content being added to the messages
    console.log('[CallModel] Final AI Content:', content);
    return {
      messages: [...state.messages, new AIMessage(content)],
    };

  } catch (error) {
    // ### DEBUGGING: Log the full error object for detailed insights
    console.error(`[CallModel] Caught an error for user ${state.userContext.userId}:`, error);
    // If it's an HTTP error, log response details
    if (error instanceof Error && error.message.startsWith('LLM API error:')) {
      console.error('[CallModel] API Error Details:', error.message);
    }
    return {
      messages: [...state.messages, new AIMessage('I apologize, but I encountered an error processing your request. Please try again.')],
    };
  }
}

/**
 * Execute Tool Node - The agent's "hands" with RLS enforcement
 * All tool execution goes through the ToolFactory
 */
async function executeTool(state: AgentState): Promise<Partial<AgentState>> {
  console.log('[ExecuteTool] Processing tool execution');

  // CRITICAL: Ensure security validation passed
  if (!state.securityValidated) {
    console.error('[ExecuteTool] Security validation not passed, refusing tool execution');
    return {
      messages: [...state.messages, new ToolMessage({
        content: 'Tool execution denied due to security restrictions',
        tool_call_id: 'security_error',
        name: 'security_error'
      })]
    };
  }

  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  
  if (!lastMessage || lastMessage._getType() !== 'ai' || !lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
    console.error('[ExecuteTool] No valid AI message with tool calls found for execution');
    return { messages: state.messages };
  }

  try {
    // Get the tool call from the AIMessage's property
    const toolCall = lastMessage.tool_calls[0] as any;
    
    // Safely check for the 'function' property before accessing it.
    if (!toolCall.function) {
      throw new Error("Invalid tool call format: 'function' property is missing.");
    }

    // Access the function name and parse the JSON from the arguments property
    const toolName = toolCall.function.name;
    const parameters = JSON.parse(toolCall.function.arguments);

    console.log(`[ExecuteTool] Executing tool: ${toolName} for user: ${state.userContext.userId}`);

    // Execute tool through secure ToolFactory with user context
    const result = await ToolFactory.executeTool(toolName, parameters, state.userContext);

    console.log(`[ExecuteTool] Tool ${toolName} execution result:`, { success: result.success });

    // Create appropriate response message
    const toolMessage = new ToolMessage({
      content: result.success ? result.data || 'Tool executed successfully' : result.error || 'Tool execution failed',
      tool_call_id: toolCall.id || 'tool_exec', // Use the tool call ID for better tracking
      name: toolName
    });

    return {
      messages: [...state.messages, toolMessage]
    };

  } catch (error) {
    console.error(`[ExecuteTool] Error for user ${state.userContext.userId}:`, error);
    
    const errorMessage = new ToolMessage({
      content: `Tool execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      tool_call_id: 'error',
      name: 'error'
    });

    return {
      messages: [...state.messages, errorMessage]
    };
  }
}

/**
 * Correct Tool Call Node - Guides the LLM to provide a valid tool call.
 */
async function correctToolCall(state: AgentState): Promise<Partial<AgentState>> {
  console.log('[CorrectToolCall] The LLM failed to provide a valid tool call. Re-prompting...');
  
  const correctionPrompt = `Your previous attempt to provide a tool call was incomplete or invalid. You must provide a valid 'tool_calls' array containing a JSON object in the correct format to proceed. Please try again, providing only the required JSON output.`;
  
  // Create a new HumanMessage with the corrective prompt.
  const correctionMessage = new HumanMessage(correctionPrompt);
  
  // Return the state with the new message to guide the LLM.
  return {
    messages: [...state.messages, correctionMessage]
  };
}

/**
 * Router Function - Determines next step in the graph.
 */
function router(state: AgentState): string {
  // CRITICAL: Check for empty messages array at the start.
  if (!state.messages || state.messages.length === 0) {
    return 'validate';
  }

  // Get the last message from the state.
  const lastMessage = state.messages[state.messages.length - 1] as any;
  
  // PRIMARY FIX: Check if the raw LLM response has an empty tool_calls array and a tool_calls finish reason.
  // This is the most reliable way to catch the incomplete response.
  if (lastMessage.finish_reason === 'tool_calls' && (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0)) {
    console.log('[Router] Incomplete tool call detected. Routing for correction.');
    return 'correctToolCall';
  }

  // Now, proceed with the regular routing logic based on the message type.
  const messageType = lastMessage._getType ? lastMessage._getType() : lastMessage.type;

  if (messageType === 'ai') {
    // If the message is a valid tool call (not incomplete), execute it.
    if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      console.log('[Router] Valid tool call detected. Routing to execute tool.');
      return 'executeTool';
    }

    // If no tool call, the turn is over.
    console.log('[Router] Final AI response. Ending turn.');
    return END;
  }

  if (messageType === 'tool') {
    // A tool result needs to be processed by the model for a final answer.
    console.log('[Router] Tool result received. Routing to call model.');
    return 'callModel';
  }

  // If the message is a human message, the agent needs to respond.
  console.log('[Router] Human message received. Routing to call model.');
  return 'callModel';
}

/**
 * Create and compile the LangGraph application
 */
export function createFinancialAgent() {
  console.log('[LangGraph] Creating financial agent...');

  // Validate all tools before creating agent
  ToolFactory.validateTools().then(validation => {
    if (!validation.valid) {
      console.error('[LangGraph] Tool validation failed:', validation.errors);
    } else {
      console.log('[LangGraph] All tools validated successfully');
    }
  });

  // Define the state graph
  const workflow = new StateGraph(AgentStateAnnotation);

  // Add nodes
  workflow.addNode('validate', validate);
  workflow.addNode('callModel', callModel);
  workflow.addNode('executeTool', executeTool);
  workflow.addNode('correctToolCall', correctToolCall);

  // Add edges
  workflow.addEdge("__start__", "validate" as any);
  workflow.addConditionalEdges("validate" as any, router);
  workflow.addConditionalEdges("callModel" as any, router);
  workflow.addConditionalEdges("executeTool" as any, router);
  workflow.addEdge("correctToolCall" as any, "callModel" as any); // Corrective loop

  // Compile the graph
  const app = workflow.compile();
  console.log('[LangGraph] Financial agent compiled successfully');

  return app;
}

/**
 * Convenience function to create agent state from user context
 */
export function createAgentState(
  userContext: UserContext,
  initialMessage: string,
  language: string = 'en'
): AgentState {
  return {
    messages: [new HumanMessage(initialMessage)],
    language,
    userContext,
    securityValidated: false
  };
}
