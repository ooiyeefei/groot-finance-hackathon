/**
 * Router Function - Determines next step in the agent graph with intelligent phase handling
 */

import { END } from "@langchain/langgraph";
import { AgentState } from './types';

/**
 * Simplified circuit breaker function to prevent infinite loops
 * Consolidates all loop detection logic into a single, maintainable function
 */
function checkCircuitBreaker(state: AgentState): { shouldBreak: boolean; reason?: string } {
  if (!state.messages || state.messages.length === 0) {
    return { shouldBreak: false };
  }

  // Find the start of the current turn by looking for the last human message
  let currentTurnStart = state.messages.length - 1;
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    const msgType = msg._getType ? msg._getType() : (msg as any).type;
    if (msgType === 'human') {
      currentTurnStart = i;
      break;
    }
  }

  const currentTurnMessages = state.messages.slice(currentTurnStart);
  const currentTurnLength = currentTurnMessages.length;

  // 1. INTELLIGENT TURN LENGTH: Different limits based on context
  // Allow more room for successful tool execution flows, stricter for error loops
  const hasSuccessfulTools = currentTurnMessages.filter(msg => {
    if (msg._getType && msg._getType() === 'tool') {
      const content = typeof msg.content === 'string' ? msg.content : '';
      return content.includes('Found') || content.includes('success') || content.includes('✅');
    }
    return false;
  }).length;

  const hasErrors = currentTurnMessages.filter(msg => {
    if (msg._getType && msg._getType() === 'tool') {
      const content = typeof msg.content === 'string' ? msg.content : '';
      return content.includes('error') || content.includes('failed') || content.includes('timeout');
    }
    return false;
  }).length;

  // Dynamic threshold based on success vs error patterns
  const turnLimit = hasErrors > hasSuccessfulTools ? 10 : 20; // Stricter for error loops

  if (currentTurnLength > turnLimit) {
    return { shouldBreak: true, reason: `Turn too long (${currentTurnLength} messages, limit: ${turnLimit})` };
  }

  // 2. Check state-based failure count: Use AgentState.failureCount for persistent tracking
  if (state.failureCount && state.failureCount >= 3) {
    return { shouldBreak: true, reason: `${state.failureCount} consecutive failures` };
  }

  // 3. Check for repeated "no results" pattern in current turn
  const noResultsCount = currentTurnMessages.filter(msg => {
    if (msg._getType && msg._getType() === 'tool') {
      const content = typeof msg.content === 'string' ? msg.content : '';
      return content.includes('No transactions found') || content.includes('No results found') || content.includes('No documents found');
    }
    return false;
  }).length;

  if (noResultsCount >= 2) {
    return { shouldBreak: true, reason: `${noResultsCount} repeated "no results" responses` };
  }

  // 4. Check for excessive tool failures in current turn
  const toolFailuresCount = currentTurnMessages.filter(msg => {
    if (msg._getType && msg._getType() === 'tool') {
      const content = typeof msg.content === 'string' ? msg.content : '';
      return content.includes('error') || content.includes('failed') || content.includes('timeout');
    }
    return false;
  }).length;

  if (toolFailuresCount >= 3) {
    return { shouldBreak: true, reason: `${toolFailuresCount} tool failures in current turn` };
  }

  return { shouldBreak: false };
}

export function router(state: AgentState): string {
  console.log(`[Router] Current phase: ${state.currentPhase}, Messages: ${state.messages?.length || 0}, Topic allowed: ${state.isTopicAllowed}, Is clarification: ${state.isClarificationResponse}`);

  // CRITICAL: Check for empty messages array at the start.
  if (!state.messages || state.messages.length === 0) {
    return 'topicGuardrail';
  }

  // Check if we have a new human message that needs topic classification
  const lastMessage = state.messages[state.messages.length - 1];
  const isHumanMessage = lastMessage && lastMessage._getType() === 'human';

  // Topic Guardrail Logic - First priority for new human messages
  if (isHumanMessage) {
    // Check if we need to classify the topic (topic classification not done yet)
    if (state.isTopicAllowed === undefined) {
      console.log('[Router] New human message requires topic classification');
      return 'topicGuardrail';
    }

    // If topic was classified as not allowed, handle off-topic
    if (state.isTopicAllowed === false) {
      console.log('[Router] Topic not allowed, routing to handleOffTopic');
      return 'handleOffTopic';
    }

    // Topic is allowed, continue with normal flow
    console.log('[Router] Topic allowed, proceeding with normal workflow');
  }

  // Phase-based routing for intelligent workflow
  if (state.currentPhase === 'validation') {
    return 'validate';
  }

  if (state.currentPhase === 'intent_analysis') {
    return 'analyzeIntent';
  }

  if (state.currentPhase === 'clarification') {
    return 'handleClarification';
  }

  if (state.currentPhase === 'completed') {
    return END;
  }

  // SIMPLIFIED CIRCUIT BREAKER: Single unified check for infinite loop prevention
  const circuitBreakerResult = checkCircuitBreaker(state);
  if (circuitBreakerResult.shouldBreak) {
    console.log(`[Router] CIRCUIT BREAKER: ${circuitBreakerResult.reason}`);
    return END;
  }

  // Get the current message from the state.
  const currentMessage = state.messages[state.messages.length - 1] as any;

  // PRIMARY FIX: Check if the raw LLM response has an empty tool_calls array and a tool_calls finish reason.
  if (currentMessage.finish_reason === 'tool_calls' && (!currentMessage.tool_calls || currentMessage.tool_calls.length === 0)) {
    console.log('[Router] Incomplete tool call detected. Routing for correction.');
    return 'correctToolCall';
  }

  // Now, proceed with the regular routing logic based on the message type.
  const messageType = currentMessage._getType ? currentMessage._getType() : currentMessage.type;

  if (messageType === 'ai') {
    // If the message is a valid tool call (not incomplete), execute it.
    if (currentMessage.tool_calls && currentMessage.tool_calls.length > 0) {
      console.log('[Router] Valid tool call detected. Routing to execute tool.');
      return 'executeTool';
    }

    // If no tool call, the turn is over.
    console.log('[Router] Final AI response. Ending turn.');
    return END;
  }

  if (messageType === 'tool') {
    // Circuit breaker logic is now handled by checkCircuitBreaker() above
    // A tool result needs to be processed by the model for a final answer.
    console.log('[Router] Tool result received. Routing to call model for final answer.');
    return 'callModel';
  }

  // If the message is a human message, the agent needs to respond.
  console.log('[Router] Human message received. Routing to call model.');
  return 'callModel';
}