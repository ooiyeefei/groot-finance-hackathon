/**
 * Clarification Node - Handles clarification questions and responses
 */

import { AIMessage } from "@langchain/core/messages";
import { AgentState } from '../types';

export async function handleClarification(state: AgentState): Promise<Partial<AgentState>> {
  console.log('[Clarification] Generating clarification questions');

  if (!state.needsClarification || !state.clarificationQuestions || state.clarificationQuestions.length === 0) {
    console.log('[Clarification] No clarification needed, proceeding to execution');
    return {
      currentPhase: 'execution'
    };
  }

  // Format clarification questions
  const clarificationMessage = "To provide you with the most accurate information, could you please clarify:\n\n" +
    state.clarificationQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n');

  return {
    messages: [...state.messages, new AIMessage(clarificationMessage)],
    currentPhase: 'completed'
  };
}