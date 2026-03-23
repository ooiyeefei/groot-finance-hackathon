/**
 * Agent Factory - Creates and compiles the LangGraph Financial Agent
 */

import { StateGraph } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { validateTools, type UserContext } from '../tools/mcp-tool-registry';
import { AgentStateAnnotation, AgentState } from './types';
import { router } from './router';

// Import node functions
import { topicGuardrail, handleOffTopic } from './nodes/guardrail-nodes';
import { validate } from './nodes/validation-node';
import { analyzeIntent } from './nodes/intent-node';
import { handleClarification } from './nodes/clarification-node';
import { callModel } from './nodes/model-node';
import { executeTool, correctToolCall } from './nodes/tool-nodes';

/**
 * Create and compile the LangGraph application
 */
export function createFinancialAgent() {
  console.log('[LangGraph] Creating financial agent...');

  // Validate tools from MCP server (warm up schema cache)
  validateTools().then(validation => {
    if (!validation.valid) {
      console.error('[LangGraph] MCP tool validation failed:', validation.errors);
    } else {
      console.log(`[LangGraph] ${validation.toolCount} MCP tools validated successfully`);
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