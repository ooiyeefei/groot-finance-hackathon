/**
 * Validation Node - MANDATORY security step
 * Validates user context and permissions before any agent action
 */

import { AIMessage } from "@langchain/core/messages";
import { AgentState } from '../types';

export async function validate(state: AgentState): Promise<Partial<AgentState>> {
  console.log('[Validation] Validating user context and permissions');

  // CRITICAL: Validate user context exists
  if (!state.userContext || !state.userContext.userId) {
    console.error('[Validation] Missing or invalid user context');
    console.error('[Validation] State keys:', Object.keys(state));
    console.error('[Validation] UserContext value:', state.userContext);
    return {
      messages: [new AIMessage('I apologize, but I cannot process your request due to authentication issues. Please refresh and try again.')],
      securityValidated: false,
      currentPhase: 'completed' // Prevent infinite loop by ending the conversation
    };
  }

  // CRITICAL: Validate user context format
  if (typeof state.userContext.userId !== 'string' || state.userContext.userId.length === 0) {
    console.error('[Validation] Invalid userId format');
    return {
      messages: [new AIMessage('I apologize, but there was an authentication error. Please refresh and try again.')],
      securityValidated: false,
      currentPhase: 'completed' // Prevent infinite loop by ending the conversation
    };
  }

  // Additional security checks can be added here
  // - Rate limiting
  // - User permissions validation
  // - Session validation
  // - Conversation ownership validation

  // Check if this is a new conversation turn (reset citations for memory management)
  const isNewTurn = state.messages[state.messages.length - 1]?._getType() === 'human' && !state.isClarificationResponse;

  console.log(`[Validation] Security validation passed for user: ${state.userContext.userId}${isNewTurn ? ' (new turn - citations reset)' : ''}`);
  return {
    securityValidated: true,
    currentPhase: 'intent_analysis',
    citations: isNewTurn ? [] : state.citations // Reset citations for new turns to prevent memory bloat
  };
}