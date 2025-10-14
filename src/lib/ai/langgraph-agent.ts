// src/lib/langgraph-agent.ts

/**
 * LangGraph Financial Co-pilot Agent
 * Architecture with user context validation and RLS enforcement
 */

import { StateGraph } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { ToolFactory } from './tools/tool-factory';
import { UserContext } from './tools/base-tool';

// Import from extracted modules
import { AgentStateAnnotation, AgentState, UserIntent, IntentAnalysisResult } from './agent/types';
import { router } from './agent/router';
import { validate } from './agent/nodes/validation-node';
import { analyzeIntent } from './agent/nodes/intent-node';
import { handleClarification } from './agent/nodes/clarification-node';
import { callModel } from './agent/nodes/model-node';
import { executeTool, correctToolCall } from './agent/nodes/tool-nodes';
import { topicGuardrail, handleOffTopic } from './agent/nodes/guardrail-nodes';

// Export types for backward compatibility
export type { AgentState, UserIntent, IntentAnalysisResult };

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

  // Add nodes with topic guardrail, LLM-powered intent analysis and clarification
  workflow.addNode('topicGuardrail', topicGuardrail);
  workflow.addNode('handleOffTopic', handleOffTopic);
  workflow.addNode('validate', validate);
  workflow.addNode('analyzeIntent', analyzeIntent);
  workflow.addNode('handleClarification', handleClarification);
  workflow.addNode('callModel', callModel);
  workflow.addNode('executeTool', executeTool);
  workflow.addNode('correctToolCall', correctToolCall);

  // Add edges for intelligent workflow with topic guardrails and phases
  workflow.addEdge("__start__", "topicGuardrail" as any);
  workflow.addConditionalEdges("topicGuardrail" as any, router);
  workflow.addConditionalEdges("handleOffTopic" as any, router);
  workflow.addConditionalEdges("validate" as any, router);
  workflow.addConditionalEdges("analyzeIntent" as any, router);
  workflow.addConditionalEdges("handleClarification" as any, router);
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
    securityValidated: false,
    failureCount: 0,
    lastFailedTool: null,
    currentIntent: null,
    needsClarification: false,
    clarificationQuestions: [],
    currentPhase: 'validation',
    citations: [],
    isTopicAllowed: true,
    isClarificationResponse: false
  };
}