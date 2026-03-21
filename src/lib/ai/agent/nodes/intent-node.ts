/**
 * Intent Analysis Node - LLM-powered intent understanding and clarification detection
 */

import { AgentState, UserIntent, IntentAnalysisResult } from '../types';
import { aiConfig } from '../../config/ai-config';
import { loadOptimizedConfig } from '../dspy/model-version-loader';

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

  // DETERMINISTIC FAST-PATH: Skip LLM intent analysis entirely for queries that are
  // obviously about the user's business data. The LLM (Qwen3-8B) frequently misclassifies
  // these as "general_knowledge" and asks unnecessary clarification questions.
  const queryLower = userQuery.toLowerCase();
  const BUSINESS_DATA_PATTERN = /\b(revenue|cash\s*flow|runway|burn\s*rate|invoices?|aging|owe|suppliers?|vendors?|outstanding|receivable|payable|AP\b|AR\b|overdue|expenses?|spending|transactions?|income|budget|profit|loss|balance|how\s+much|show\s+me|what('s|\s+is)\s+(our|my|the|total))\b/i;
  const isObviousBusinessData = BUSINESS_DATA_PATTERN.test(userQuery);

  // EXPENSE DISAMBIGUATION: "my expenses"/"my spending"/"my claims" is ambiguous —
  // for Owner/Finance Admin, it could mean personal expense claims OR business-wide P&L.
  // Let the LLM handle these with the disambiguation prompt instead of fast-pathing.
  const MY_EXPENSE_PATTERN = /\b(my\s+(expenses?|spending|claims?)|summarize\s+my\s+expenses?|my\s+expense\s+claims?)\b/i;
  const needsExpenseDisambiguation = MY_EXPENSE_PATTERN.test(userQuery);

  if (isObviousBusinessData && !needsExpenseDisambiguation) {
    console.log('[IntentAnalysis] FAST-PATH: Business data query detected, skipping LLM classification → direct execution');
    return {
      currentIntent: {
        primaryIntent: 'transaction_analysis',
        queryType: 'specific_case',
        queryCategory: 'personal_data',
        confidence: 0.95,
        contextNeeded: {},
        missingContext: [],
        originalQuery: userQuery,
      },
      needsClarification: false,
      clarificationQuestions: [],
      currentPhase: 'execution',
    };
  }

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

    // POST-LLM OVERRIDE: Even if the LLM classified as general_knowledge, skip clarification
    // for cross-employee queries that are clearly about business data (team spending, employee expenses).
    let finalRequiresClarification = intentAnalysisResult.requiresClarification;
    let finalClarificationQuestions = intentAnalysisResult.clarificationQuestions;

    if (intentAnalysisResult.intent.queryCategory === 'personal_data') {
      // Only allow clarification for genuinely ambiguous cross-employee queries
      const isCrossEmployee = /\b(team|employee|staff|someone|everybody|everyone|all\s+(expenses?|spending|claims?))\b/i.test(queryLower);
      const hasSpecificName = /\b(how much did \w+|what did \w+ (spend|claim|buy))\b/i.test(queryLower);

      // EXCEPTION: "my expenses"/"my spending" is ambiguous for owner — the LLM prompt
      // tells the agent to clarify. Do NOT override clarification for these queries.
      const isAmbiguousExpense = needsExpenseDisambiguation;

      if (!isCrossEmployee && !hasSpecificName && !isAmbiguousExpense) {
        console.log('[IntentAnalysis] OVERRIDE: Personal data query, skipping clarification');
        finalRequiresClarification = false;
        finalClarificationQuestions = [];
      }
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

Analyze the following user query and respond with a JSON object.

## FEW-SHOT EXAMPLES (learn the pattern):

Query: "What's my revenue this month?"
→ {"primaryIntent":"transaction_analysis","queryType":"calculation","queryCategory":"personal_data","confidence":0.98,"contextNeeded":{},"missingContext":[],"requiresClarification":false,"clarificationQuestions":[]}

Query: "Show me outstanding invoices"
→ {"primaryIntent":"transaction_analysis","queryType":"specific_case","queryCategory":"personal_data","confidence":0.97,"contextNeeded":{},"missingContext":[],"requiresClarification":false,"clarificationQuestions":[]}

Query: "How much do I owe my vendors?"
→ {"primaryIntent":"transaction_analysis","queryType":"calculation","queryCategory":"personal_data","confidence":0.98,"contextNeeded":{},"missingContext":[],"requiresClarification":false,"clarificationQuestions":[]}

Query: "Cash flow analysis"
→ {"primaryIntent":"transaction_analysis","queryType":"calculation","queryCategory":"personal_data","confidence":0.96,"contextNeeded":{},"missingContext":[],"requiresClarification":false,"clarificationQuestions":[]}

Query: "AP aging report"
→ {"primaryIntent":"transaction_analysis","queryType":"specific_case","queryCategory":"personal_data","confidence":0.97,"contextNeeded":{},"missingContext":[],"requiresClarification":false,"clarificationQuestions":[]}

Query: "What is GST?"
→ {"primaryIntent":"regulatory_knowledge","queryType":"general_info","queryCategory":"general_knowledge","confidence":0.95,"contextNeeded":{"country":"unknown"},"missingContext":["country"],"requiresClarification":false,"clarificationQuestions":[]}

Query: "How to register SST in Malaysia?"
→ {"primaryIntent":"regulatory_knowledge","queryType":"procedural","queryCategory":"general_knowledge","confidence":0.95,"contextNeeded":{"country":"malaysia"},"missingContext":[],"requiresClarification":false,"clarificationQuestions":[]}

Query: "What is accounts receivable?"
→ {"primaryIntent":"general_inquiry","queryType":"general_info","queryCategory":"general_knowledge","confidence":0.95,"contextNeeded":{},"missingContext":[],"requiresClarification":false,"clarificationQuestions":[]}

Query: "Team spending this quarter"
→ {"primaryIntent":"transaction_analysis","queryType":"calculation","queryCategory":"personal_data","confidence":0.97,"contextNeeded":{},"missingContext":[],"requiresClarification":false,"clarificationQuestions":[]}

Query: "invoices"
→ {"primaryIntent":"transaction_analysis","queryType":"general_info","queryCategory":"personal_data","confidence":0.7,"contextNeeded":{},"missingContext":[],"requiresClarification":true,"clarificationQuestions":["Are you looking for your outstanding invoices, or do you want to understand invoice processing in general?"]}

## RESPONSE FORMAT

Return JSON with these fields:
1. primaryIntent: One of [regulatory_knowledge, business_setup, transaction_analysis, document_search, compliance_check, general_inquiry]
2. queryType: One of [general_info, procedural, comparison, calculation, specific_case]
3. queryCategory: One of [personal_data, general_knowledge, other]
4. confidence: Number 0-1
5. contextNeeded: Object with country, businessType, urgency, specificity (if applicable)
6. missingContext: Array of missing context strings
7. requiresClarification: Boolean
8. clarificationQuestions: Array of questions (if requiresClarification is true)

## ROUTING RULES (CRITICAL — follow exactly):

**personal_data** (user's OWN business data — ALWAYS skip clarification):
Revenue, cash flow, invoices, AP/AR, spending, aging, vendors, expenses, transactions, budget, profit/loss, balance, overdue, outstanding, team spending, employee expenses.
DEFAULT: If the query mentions ANY financial term AND could plausibly refer to the user's data, classify as personal_data.

**general_knowledge** (rules, regulations, how-things-work — ONLY when NOT about user's data):
GST rules, tax rates, registration requirements, IFRS standards, accounting definitions, compliance requirements.
ONLY classify as general_knowledge when the user explicitly asks about rules/concepts in general, NOT their own numbers.

**other**: Greetings, thanks, unclear/non-business queries.

## CLARIFICATION RULES:
- ONLY ask for clarification if the query is genuinely ambiguous (single word like "invoices" or "taxes")
- NEVER ask for clarification on personal_data queries — go directly to tool execution
- Check conversation context before asking — don't repeat questions already answered

User Query: "${query}"

Respond with valid JSON only:`;

  // Load DSPy-optimized few-shot examples if available (from weekly training pipeline)
  try {
    const optimizedConfig = await loadOptimizedConfig('chat_intent');
    if (optimizedConfig && optimizedConfig.fewShotExamples.length > 0) {
      const optimizedExamples = optimizedConfig.fewShotExamples
        .map(ex => `Query: "${ex.query}"\n→ ${JSON.stringify(ex.expectedOutput)}`)
        .join('\n\n');
      contextualPrompt += `\n\n## OPTIMIZED EXAMPLES (from training pipeline v${optimizedConfig.version}):\n${optimizedExamples}`;
      console.log(`[IntentAnalysis] Loaded ${optimizedConfig.fewShotExamples.length} optimized examples from DSPy v${optimizedConfig.version}`);
    }
  } catch (err) {
    // Non-fatal: fall back to default prompt if loader fails
    console.warn('[IntentAnalysis] Failed to load optimized config, using defaults:', err);
  }

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
    // Gemini sometimes wraps JSON in markdown code blocks — strip them
    let cleanedText = analysisText;
    const jsonBlockMatch = analysisText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      cleanedText = jsonBlockMatch[1].trim();
    }
    const analysis = JSON.parse(cleanedText);

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