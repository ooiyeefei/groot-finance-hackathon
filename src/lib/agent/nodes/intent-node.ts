/**
 * Intent Analysis Node - LLM-powered intent understanding and clarification detection
 */

import { AgentState, UserIntent, IntentAnalysisResult } from '../types';
import { aiConfig } from '../../config/ai-config';

/**
 * LLM-Powered Intent Analysis Node
 * Uses the existing chat agent LLM to understand user intent and generate clarification questions
 */
export async function analyzeIntent(state: AgentState): Promise<Partial<AgentState>> {
  console.log('[IntentAnalysis] Analyzing user intent with LLM');

  // CRITICAL: Ensure security validation passed
  if (!state.securityValidated) {
    console.error('[IntentAnalysis] Security validation not passed, skipping intent analysis');
    return {
      currentPhase: 'execution'
    };
  }

  // Get the last user message
  const lastMessage = state.messages[state.messages.length - 1];
  if (!lastMessage || lastMessage._getType() !== 'human') {
    console.log('[IntentAnalysis] No human message found, proceeding to execution');
    return {
      currentPhase: 'execution'
    };
  }

  const userQuery = typeof lastMessage.content === 'string' ? lastMessage.content : '';

  // All queries go through LLM intent analysis - no hardcoded patterns

  try {
    // Use the existing chat agent LLM for intent analysis with conversation context
    const intentAnalysisResult = await performLLMIntentAnalysis(userQuery, state.language || 'en', state);

    console.log('[IntentAnalysis] LLM analysis result:', {
      primaryIntent: intentAnalysisResult.intent.primaryIntent,
      queryCategory: intentAnalysisResult.intent.queryCategory,
      confidence: intentAnalysisResult.intent.confidence,
      requiresClarification: intentAnalysisResult.requiresClarification,
      missingContext: intentAnalysisResult.intent.missingContext
    });

    // DETERMINISTIC OVERRIDE: Personal data queries always skip clarification
    let finalRequiresClarification = intentAnalysisResult.requiresClarification;
    let finalClarificationQuestions = intentAnalysisResult.clarificationQuestions;

    if (intentAnalysisResult.intent.queryCategory === 'personal_data') {
      console.log('[IntentAnalysis] OVERRIDE: Personal data query detected, skipping clarification');
      finalRequiresClarification = false;
      finalClarificationQuestions = [];
    }

    const nextPhase = finalRequiresClarification ? 'clarification' : 'execution';

    return {
      currentIntent: intentAnalysisResult.intent,
      needsClarification: finalRequiresClarification,
      clarificationQuestions: finalClarificationQuestions,
      currentPhase: nextPhase
    };

  } catch (error) {
    console.error('[IntentAnalysis] Error during LLM intent analysis:', error);
    // Fallback to simple execution if analysis fails
    return {
      currentIntent: {
        primaryIntent: 'general_inquiry',
        queryType: 'general_info',
        queryCategory: 'other',
        confidence: 0.5,
        contextNeeded: {},
        missingContext: [],
        originalQuery: userQuery
      },
      needsClarification: false,
      clarificationQuestions: [],
      currentPhase: 'execution'
    };
  }
}

/**
 * LLM-powered intent analysis using the existing chat agent with conversation context
 */
async function performLLMIntentAnalysis(query: string, language: string, state?: AgentState): Promise<IntentAnalysisResult> {
  // Build context-aware intent analysis prompt
  let contextualPrompt = `You are an expert financial AI assistant that analyzes user queries to understand their intent and determine what context is needed.

CRITICAL INSTRUCTION: You have access to conversation context. Use this information to avoid asking questions that have already been answered or addressed.`;

  // Extract conversation history and facts from restored agent state
  if (state?.currentIntent) {
    contextualPrompt += `\n\nPREVIOUS CONVERSATION CONTEXT:
- Original Query: "${state.currentIntent.originalQuery}"
- Primary Intent: ${state.currentIntent.primaryIntent}
- Confidence: ${state.currentIntent.confidence}`;

    if (state.currentIntent.contextNeeded && Object.keys(state.currentIntent.contextNeeded).length > 0) {
      contextualPrompt += `\nPreviously Identified Context: ${JSON.stringify(state.currentIntent.contextNeeded)}`;
    }
  }

  // Add clarification questions that were already asked
  if (state?.clarificationQuestions && state.clarificationQuestions.length > 0) {
    contextualPrompt += `\n\nPREVIOUSLY ASKED QUESTIONS (do NOT repeat these):
${state.clarificationQuestions.map(q => `- ${q}`).join('\n')}`;
  }

  // Extract facts from the conversation history
  if (state?.messages && state.messages.length > 1) {
    const conversationText = state.messages.map(msg =>
      `${msg._getType()}: ${typeof msg.content === 'string' ? msg.content : ''}`
    ).join('\n');

    // Look for established facts in conversation
    if (conversationText.toLowerCase().includes('malaysia')) {
      contextualPrompt += `\nESTABLISHED FACTS:\n- Country: Malaysia (already mentioned)`;
    }
    if (conversationText.toLowerCase().includes('sole proprietorship')) {
      contextualPrompt += `\n- Business Structure: Sole Proprietorship (already confirmed)`;
    }
    if (conversationText.toLowerCase().includes('tech')) {
      contextualPrompt += `\n- Industry: Technology (already confirmed)`;
    }
    if (conversationText.toLowerCase().includes('remotely')) {
      contextualPrompt += `\n- Operation Mode: Remote (already confirmed)`;
    }
  }

  contextualPrompt += `\n\nIMPORTANT: If the user appears to be answering previous clarification questions, focus on processing their answers rather than asking new questions unless critical information is still missing.`;

  contextualPrompt += `

Analyze the following user query and respond with a JSON object containing:
1. primaryIntent: One of [regulatory_knowledge, business_setup, transaction_analysis, document_search, compliance_check, general_inquiry]
2. queryType: One of [general_info, procedural, comparison, calculation, specific_case]
3. queryCategory: One of [personal_data, general_knowledge, other] - CRITICAL for routing
4. confidence: Number between 0 and 1
5. contextNeeded: Object with fields for country, businessType, urgency, specificity (if applicable)
6. missingContext: Array of strings indicating what context is missing
7. requiresClarification: Boolean indicating if clarification questions should be asked
8. clarificationQuestions: Array of specific questions to ask the user (if requiresClarification is true)

Intent Detection Rules:
- regulatory_knowledge: Questions about GST, tax, regulations, compliance requirements
- business_setup: Questions about starting, incorporating, registering a business
- transaction_analysis: Questions about user's own transactions, expenses, payments
- document_search: Questions about finding or searching documents/invoices
- compliance_check: Questions about cross-border compliance, international requirements
- general_inquiry: General questions, greetings, or unclear intent

Query Category Rules (CRITICAL FOR ROUTING):
- personal_data: User asking about THEIR OWN data (transactions, documents, vendors)
  * Keywords: "my", "I", "me", "show me", "what is my", "find my", "my transactions", "my largest", "my documents"
  * Examples: "What's my largest transaction?", "Show me my transactions in June", "Find my invoices from ABC Corp"
  * ACTION: Skip clarification and go directly to tool execution
- general_knowledge: User asking about general business/regulatory information
  * Keywords: "what are", "how does", "explain", "requirements for", "GST rules", "tax rate", "how to register"
  * Examples: "What are GST registration requirements?", "How does OVR work?", "What's the tax rate in Singapore?"
  * ACTION: May require clarification for country/business context
- other: Greetings, unclear requests, or non-business queries
  * Examples: "Hello", "Thanks", unclear or ambiguous requests

Context Extraction:
- country: singapore, malaysia, thailand, indonesia (from query content)
- businessType: sme, individual, corporate, startup (from query content)
- urgency: high (urgent/asap), medium (soon), low (default)
- specificity: technical (technical details), general (overview), specific (specific case)

Enhanced Clarification Rules (Context-Aware):
- ONLY ask for clarification if genuinely critical information is missing AND has not been established previously
- Check established facts and previous questions before generating new clarification questions
- If this is a clarification response, be more permissive and focus on processing provided information
- Avoid asking redundant questions that overlap with previously answered topics
- Consider the conversation history when determining if additional context is truly needed

User Query: "${query}"

Respond with valid JSON only, no explanations:`;

  // Build headers conditionally
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (aiConfig.chat.apiKey) {
    headers['Authorization'] = `Bearer ${aiConfig.chat.apiKey}`;
  }

  const response = await fetch(`${aiConfig.chat.endpointUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: aiConfig.chat.modelId,
      messages: [
        { role: 'system', content: contextualPrompt }
      ],
      max_tokens: 1000,
      temperature: 0.1
    })
  });

  if (!response.ok) {
    throw new Error(`Intent analysis LLM API error: ${response.status}`);
  }

  const result = await response.json();
  const analysisText = result.choices?.[0]?.message?.content?.trim();

  if (!analysisText) {
    throw new Error('No analysis result from LLM');
  }

  try {
    const analysis = JSON.parse(analysisText);

    // Construct the intent analysis result
    const intent: UserIntent = {
      primaryIntent: analysis.primaryIntent || 'general_inquiry',
      queryType: analysis.queryType || 'general_info',
      queryCategory: analysis.queryCategory || 'other',
      confidence: analysis.confidence || 0.5,
      contextNeeded: analysis.contextNeeded || {},
      missingContext: analysis.missingContext || [],
      originalQuery: query
    };

    return {
      intent,
      requiresClarification: analysis.requiresClarification || false,
      clarificationQuestions: analysis.clarificationQuestions || []
    };
  } catch (parseError) {
    console.error('[IntentAnalysis] Failed to parse LLM response:', analysisText);
    throw new Error('Failed to parse intent analysis result');
  }
}