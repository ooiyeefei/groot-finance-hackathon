/**
 * Tool Execution and Correction Nodes
 */

import { AIMessage, ToolMessage, HumanMessage } from "@langchain/core/messages";
import { ToolFactory } from '../../tools/tool-factory';
import { AgentState } from '../types';

/**
 * Execute Tool Node - The agent's "hands" with RLS enforcement
 * All tool execution goes through the ToolFactory
 */
export async function executeTool(state: AgentState): Promise<Partial<AgentState>> {
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

  let toolName = 'unknown'; // Declare at function level for catch block access

  try {
    // Get the tool call from the AIMessage's property
    const toolCall = lastMessage.tool_calls[0] as any;

    // Safely check for the 'function' property before accessing it.
    if (!toolCall.function) {
      throw new Error("Invalid tool call format: 'function' property is missing.");
    }

    // Access the function name and parse the JSON from the arguments property
    toolName = toolCall.function.name;
    const parameters = JSON.parse(toolCall.function.arguments);

    // ### DEBUGGING: Log the exact parameters and user context before execution
    console.log(`[ExecuteTool] Executing tool: ${toolName} for user: ${state.userContext.userId}`);
    console.log(`[DEBUG] Parameters: ${JSON.stringify(parameters, null, 2)}`);

    // Check for repeated failures and try fallback tool
    if (state.failureCount && state.failureCount >= 2 && state.lastFailedTool === toolName) {
      console.log(`[ExecuteTool] Attempting fallback tool after ${state.failureCount} failures with ${toolName}`);
      const fallbackTool = toolName === 'search_documents' ? 'get_transactions' : 'search_documents';
      if (ToolFactory.hasToolType(fallbackTool)) {
        console.log(`[ExecuteTool] Switching to fallback tool: ${fallbackTool}`);
        const fallbackResult = await ToolFactory.executeTool(fallbackTool, parameters, state.userContext);

        if (fallbackResult.success) {
          const fallbackCitations = fallbackResult.citations || [];
          const toolMessage = new ToolMessage({
            content: `[Automatic tool correction] ${fallbackResult.data}`,
            tool_call_id: toolCall.id || 'fallback_exec',
            name: fallbackTool
          });
          return {
            messages: [...state.messages, toolMessage],
            failureCount: 0,
            lastFailedTool: null,
            citations: fallbackCitations
          };
        }
      }
    }

    // Execute tool through secure ToolFactory with user context
    const result = await ToolFactory.executeTool(toolName, parameters, state.userContext);

    console.log(`[ExecuteTool] Tool ${toolName} execution result:`, { success: result.success });

    // Extract citations from tool result if available
    const newCitations = result.citations || [];
    if (newCitations.length > 0) {
      console.log(`[ExecuteTool] Extracted ${newCitations.length} citations from ${toolName}:`, newCitations.map(c => ({ id: c.id, source: c.source_name })));
    }

    // ENHANCED ERROR HANDLING: Handle tool failures with proper context
    if (!result.success) {
      // LOG STRUCTURED ERROR for debugging
      console.error(`[ExecuteTool] TOOL FAILURE - ${toolName}:`, {
        error: result.error,
        debugInfo: result.debugInfo || 'No debug info',
        errorType: result.errorType || 'unknown',
        parameters: JSON.stringify(parameters, null, 2),
        userId: state.userContext.userId,
        businessId: state.userContext.businessId,
        timestamp: new Date().toISOString()
      })

      // ANTI-HALLUCINATION: Provide structured error response that prevents LLM fabrication
      let structuredError = `TOOL_ERROR: I cannot retrieve the requested information due to: ${result.error}`

      // ADD CONTEXT based on error type
      if (result.debugInfo) {
        if (result.debugInfo.includes('No transactions found') || result.debugInfo.includes('Empty result set')) {
          structuredError = `DATA_EMPTY: No data matches your criteria. This is not an error - you simply have no matching records for this query.`
        } else if (result.debugInfo.includes('Parameter validation error')) {
          structuredError = `VALIDATION_ERROR: ${result.error} Please check your query format and try again.`
        } else if (result.debugInfo.includes('Authentication') || result.debugInfo.includes('business context')) {
          structuredError = `ACCESS_ERROR: ${result.error} Please ensure you are logged into the correct business account.`
        } else if (result.debugInfo.includes('Network') || result.debugInfo.includes('Database')) {
          structuredError = `SYSTEM_ERROR: ${result.error} This appears to be a temporary issue.`
        }
      }

      // PREVENT HALLUCINATION: Be explicit that this is a real error, not data to interpret
      structuredError += `\n\n**Important**: This is a system error message, not actual data. Do not fabricate information when tools fail.`

      const toolMessage = new ToolMessage({
        content: structuredError,
        tool_call_id: toolCall.id || 'tool_error',
        name: toolName
      })

      // Update failure tracking for circuit breaker
      const newFailureCount = (state.failureCount || 0) + 1
      console.log(`[ExecuteTool] FAILURE COUNT: ${newFailureCount} for tool ${toolName}`)

      return {
        messages: [...state.messages, toolMessage],
        failureCount: newFailureCount,
        lastFailedTool: toolName,
        citations: [] // No citations on error
      }
    }

    // SUCCESS CASE: Create successful response message
    const successContent = result.data || 'Tool executed successfully but returned no data'
    const toolMessage = new ToolMessage({
      content: successContent,
      tool_call_id: toolCall.id || 'tool_exec',
      name: toolName
    });

    return {
      messages: [...state.messages, toolMessage],
      failureCount: 0, // Reset failure count on success
      lastFailedTool: null,
      citations: newCitations // Add citations to agent state
    };

  } catch (error) {
    // CRITICAL ERROR HANDLING: System-level failures
    console.error(`[ExecuteTool] CRITICAL SYSTEM ERROR for user ${state.userContext.userId}:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      toolName: toolName || 'unknown',
      userId: state.userContext.userId,
      businessId: state.userContext.businessId,
      timestamp: new Date().toISOString()
    });

    // ANTI-HALLUCINATION: Explicit system error message
    const systemErrorContent = `SYSTEM_ERROR: A critical error occurred while executing the ${toolName || 'requested'} tool.

**Error Details**: ${error instanceof Error ? error.message : 'Unknown system error'}

**Important**: This is a system error, not user data. Please report this issue if it persists. Do not attempt to fabricate or guess information when system errors occur.`

    const errorMessage = new ToolMessage({
      content: systemErrorContent,
      tool_call_id: 'system_error',
      name: 'system_error'
    });

    return {
      messages: [...state.messages, errorMessage],
      failureCount: (state.failureCount || 0) + 1,
      lastFailedTool: toolName || 'unknown'
    };
  }
}

/**
 * Correct Tool Call Node - Guides the LLM to provide a valid tool call.
 */
export async function correctToolCall(state: AgentState): Promise<Partial<AgentState>> {
  console.log('[CorrectToolCall] The LLM failed to provide a valid tool call. Re-prompting...');

  const correctionPrompt = `Your previous attempt to provide a tool call was incomplete or invalid. You must provide a valid 'tool_calls' array containing a JSON object in the correct format to proceed. Please try again, providing only the required JSON output.`;

  // Create a new HumanMessage with the corrective prompt.
  const correctionMessage = new HumanMessage(correctionPrompt);

  // Return the state with the new message to guide the LLM.
  return {
    messages: [...state.messages, correctionMessage]
  };
}