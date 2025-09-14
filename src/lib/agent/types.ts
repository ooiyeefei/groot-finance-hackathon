/**
 * Type definitions for the LangGraph Financial Agent
 */

import { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";
import { UserContext, CitationData } from '../tools/base-tool';

// Intent Analysis Types
export interface UserIntent {
  primaryIntent: 'regulatory_knowledge' | 'business_setup' | 'transaction_analysis' | 'document_search' | 'compliance_check' | 'general_inquiry'
  queryType: 'general_info' | 'procedural' | 'comparison' | 'calculation' | 'specific_case'
  queryCategory: 'personal_data' | 'general_knowledge' | 'other'
  confidence: number
  contextNeeded: {
    country?: 'singapore' | 'malaysia' | 'thailand' | 'indonesia' | 'unknown'
    businessType?: 'sme' | 'individual' | 'corporate' | 'startup' | 'unknown'
    urgency?: 'high' | 'medium' | 'low'
    specificity?: 'technical' | 'general' | 'specific'
  }
  missingContext: string[]
  originalQuery: string
}

export interface IntentAnalysisResult {
  intent: UserIntent
  requiresClarification: boolean
  clarificationQuestions: string[]
  skipPlanning?: boolean
}

// Agent State Definition with mandatory user context and intent analysis
export const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x: BaseMessage[], y: BaseMessage[]) => {
      const combined = x.concat(y);
      // Prevent context overflow: Keep only last 50 messages
      if (combined.length > 50) {
        console.log(`[Context Management] Trimming conversation from ${combined.length} to 50 messages`);
        return combined.slice(-50);
      }
      return combined;
    },
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
  }),
  // Track consecutive tool failures for circuit breaker
  failureCount: Annotation<number>({
    reducer: (x: number, y: number) => y,
    default: () => 0
  }),
  lastFailedTool: Annotation<string | null>({
    reducer: (x: string | null, y: string | null) => y,
    default: () => null
  }),
  // Intent analysis state
  currentIntent: Annotation<UserIntent | null>({
    reducer: (x: UserIntent | null, y: UserIntent | null) => y || x,
    default: () => null
  }),
  // Clarification tracking
  needsClarification: Annotation<boolean>({
    reducer: (x: boolean, y: boolean) => y,
    default: () => false
  }),
  clarificationQuestions: Annotation<string[]>({
    reducer: (x: string[], y: string[]) => y.length > 0 ? y : x,
    default: () => []
  }),
  // Processing phase
  currentPhase: Annotation<'validation' | 'intent_analysis' | 'clarification' | 'execution' | 'completed'>({
    reducer: (x: 'validation' | 'intent_analysis' | 'clarification' | 'execution' | 'completed', y: 'validation' | 'intent_analysis' | 'clarification' | 'execution' | 'completed') => y || x,
    default: () => 'validation' as const
  }),
  // Citations tracking from tool results
  citations: Annotation<CitationData[]>({
    reducer: (x: CitationData[], y: CitationData[]) => {
      // Accumulate citations, avoiding duplicates by id
      const existing = x || [];
      const newCitations = y || [];
      const existingIds = new Set(existing.map(c => c.id));
      const uniqueNew = newCitations.filter(c => !existingIds.has(c.id));
      return existing.concat(uniqueNew);
    },
    default: () => []
  }),
  // Topic guardrail validation
  isTopicAllowed: Annotation<boolean>({
    reducer: (x: boolean, y: boolean) => y,
    default: () => true
  }),
  // Clarification response detection
  isClarificationResponse: Annotation<boolean>({
    reducer: (x: boolean, y: boolean) => y,
    default: () => false
  })
});

// Export the secure state type
export type AgentState = typeof AgentStateAnnotation.State;