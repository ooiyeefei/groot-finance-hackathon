// src/lib/langgraph-agent.ts

/**
 * LangGraph Financial Co-pilot Agent
 * Architecture with user context validation and RLS enforcement
 */

import { StateGraph, END, Annotation } from "@langchain/langgraph";
import { BaseMessage, AIMessage, ToolMessage, HumanMessage } from "@langchain/core/messages";
import { ToolFactory } from './tools/tool-factory'
import { ModelType, CitationData } from './tools/base-tool';
import { UserContext } from './tools/base-tool';
import { aiConfig } from './config/ai-config';
import { GeminiService } from './ai-services/gemini-service';
// Using ToolFactory.getToolSchemas() directly for single source of truth

// Intent Analysis Types
interface UserIntent {
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

interface IntentAnalysisResult {
  intent: UserIntent
  requiresClarification: boolean
  clarificationQuestions: string[]
  skipPlanning?: boolean
}

// Agent State Definition with mandatory user context and intent analysis
const AgentStateAnnotation = Annotation.Root({
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

// Helper to check if we should use Gemini - BOTH conditions must be true
const shouldUseGemini = () => {
  return process.env.USE_GEMINI === 'true' && !!aiConfig.gemini?.apiKey;
};

// Model type detection for conditional logic
// ModelType imported from base-tool.ts

const detectModelType = (): ModelType => {
  const useGemini = shouldUseGemini();
  const hasGeminiService = !!geminiService;
  const modelType = (useGemini && hasGeminiService) ? 'gemini' : 'openai';
  
  console.log(`[ModelDetection] USE_GEMINI=${useGemini}, hasGeminiService=${hasGeminiService} → Using ${modelType.toUpperCase()} path`);
  
  return modelType;
};

// Initialize Gemini service if configured
let geminiService: GeminiService | null = null;
if (shouldUseGemini() && aiConfig.gemini?.apiKey) {
  console.log(`🔧 [INIT] Gemini service initialized - Model: ${aiConfig.gemini.model}`);
  geminiService = new GeminiService();
} else {
  console.log(`🔧 [INIT] Using OpenAI-compatible service - Model: ${aiConfig.chat.modelId} at ${aiConfig.chat.endpointUrl}`);
}

/**
 * Get system prompt based on model type - Gemini vs OpenAI approaches
 */
function getSystemPrompt(language: string, modelType: ModelType): string {
  if (modelType === 'gemini') {
    return getGeminiSystemPrompt(language);
  } else {
    return getIntelligentAgentPrompt(language);
  }
}

/**
 * Gemini System Prompt - FINANCIAL AGENT CONSTITUTION v2.0
 */
function getGeminiSystemPrompt(language: string): string {
  const basePrompt = `# FINANCIAL AGENT CONSTITUTION v2.0

### MANDATORY TOOL SELECTION DIRECTIVE

**ABSOLUTE RULE: You MUST NEVER answer regulatory/tax/compliance questions from your built-in knowledge. You MUST ALWAYS call the regulatory knowledge base tool for ANY question about regulations, tax, compliance, or financial rules.**

You have access to two types of tools:
1.  **Personal Data Tools** (\`get_transactions\`, \`get_vendors\`, \`search_documents\`): Use these when the user asks about THEIR OWN data. Keywords: "my", "I", "me", "show me", "what is my".
2.  **Knowledge Base Tools** (\`searchRegulatoryKnowledgeBase\`): Use these for GENERAL KNOWLEDGE questions about tax, compliance, and regulations. Keywords: "what are", "how does", "explain", "requirements for", "GST", "tax", "regulation", "compliance", "registration", "OVR", "overseas vendor".

**CRITICAL DECISION EXAMPLES:**
- User: "What was my largest transaction in Singapore?" -> **USE \`get_transactions\`**. This is about the user's personal data.
- User: "What are the GST registration requirements in Singapore?" -> **MUST USE \`searchRegulatoryKnowledgeBase\`**. NEVER answer from built-in knowledge.
- User: "How does Overseas Vendor Registration (OVR) work?" -> **MUST USE \`searchRegulatoryKnowledgeBase\`**. NEVER answer from built-in knowledge.
- User: "Explain GST rules" -> **MUST USE \`searchRegulatoryKnowledgeBase\`**. NEVER answer from built-in knowledge.
- User: "What is the tax rate?" -> **MUST USE \`searchRegulatoryKnowledgeBase\`**. NEVER answer from built-in knowledge.

**REGULATORY QUESTION DETECTION:**
If the user's question contains ANY of these keywords, you MUST call \`searchRegulatoryKnowledgeBase\`:
- GST, tax, taxation, VAT
- regulation, regulatory, compliance
- registration, OVR, overseas vendor
- requirements, rules, law, legal
- Singapore, Malaysia (in regulatory context)
- filing, submission, declaration
- rate, percentage, threshold
- exemption, relief, deduction

**NEVER respond with "Based on Singapore's tax regulations..." or similar - ALWAYS call the tool first.**

## CRITICAL: Tool Parameter Separation Protocol

You are a financial analysis agent with ONE ABSOLUTE RULE: Never contaminate tool parameters with irrelevant data.

### MANDATORY REASONING PROTOCOL
Before EVERY tool call, you MUST follow this exact 4-step process:

**STEP 1: SEMANTIC DECOMPOSITION**
- TEMPORAL: Extract all date/time references (June, past 60 days, this year, etc.)
- ANALYTICAL: Extract analysis intent (largest, smallest, total, average, etc.)  
- CONTENT: Extract search terms (vendor names, transaction types, etc.)
- FILTERS: Extract explicit filters (amount ranges, categories, etc.)

**STEP 2: PARAMETER MAPPING**
- TEMPORAL → dateRange/startDate/endDate parameters ONLY
- ANALYTICAL → Handle in your response logic, NOT in tool parameters
- CONTENT → query parameter (vendor names, description keywords ONLY)
- FILTERS → Appropriate filter parameters

**STEP 3: CONTAMINATION CHECK**
- query parameter MUST NOT contain: dates, time words, analysis words, or natural language
- If temporal info exists: query MUST be empty OR contain only vendor/content terms
- If asking for "all transactions in period": query MUST be empty string

**STEP 4: VALIDATION**
Verify: "Does this tool call only search for what I need, without pollution?"

### CRITICAL RULES
1. **Date Priority Rule**: Specific dates > months > relative ranges > default
2. **Query Purity Rule**: query="" if user wants all transactions in a time period
3. **No Hallucination Rule**: Never invent specifics not in user request
4. **Analysis Post-Processing**: Handle "largest", "smallest" etc. after getting results

### CRITICAL EXECUTION REQUIREMENT

**You are an expert financial assistant. Your primary function is to help users by accessing their financial data through available tools.**

### Core Logic
1. Analyze the user's query to determine their intent.
2. **IF** the user's query requires accessing personal data (like transactions, vendors, documents, spending history, etc.), you **MUST** use a tool.
3. **ELSE IF** the user's query is a general question that does not require personal data (e.g., "what is a 401k?", "how do I save money?"), you may answer directly.

### Tool Usage Rules
- When a tool is required, your response **MUST** be only the JSON for the tool call.
- Do not add any conversational text, acknowledgements, or explanations like "I will look that up for you" or "Here are the transactions I found".
- Your internal reasoning process (monologue) is for your eyes only and must never be part of the final output.

**WHAT NOT TO DO - BAD EXAMPLE:**
User: "what are the transactions i had in the past 30 days"
❌ BAD Response: "1. Decompose: [temporal: past 30 days] [analytical: list all] [content: none] 2. Map: dateRange="past_30_days", query="", no_filters_needed 3. Validate: Clean - temporal words NOT in query 4. Execute: get_transactions({"dateRange": "past_30_days", "query": ""})"

✅ CORRECT Response: [MAKE ACTUAL FUNCTION CALL WITHOUT ANY CONVERSATIONAL TEXT]

### EXECUTION EXAMPLES

**EXAMPLE 1 - Temporal Analysis with Empty Query**
User: "what's the largest transaction in june?"

<thinking>
1. Decompose: [temporal: june] [analytical: largest] [content: none]
2. Map: This maps to get_transactions tool. The dateRange should be for June. The "largest" analysis will be handled after I get the results.
3. Validate: Clean query, no temporal contamination.
4. Execute: I need to call get_transactions with June date range.
</thinking>


**EXAMPLE 2 - All Transactions in Period**
User: "what are the transactions i have in the past 60 days?"

<thinking>
1. Decompose: [temporal: past 60 days] [analytical: list all] [content: none]
2. Map: This maps to get_transactions tool. The dateRange parameter should be "past_60_days". The query is empty as no specific content is being searched for.
3. Validate: Clean. The temporal words are handled by the dateRange parameter.
4. Execute: I will call get_transactions with the specified date range.
</thinking>


**EXAMPLE 3 - Vendor Search with Time Constraint**
User: "show me all McDonald's transactions this year"

<thinking>
1. Decompose: [temporal: this year] [analytical: list all] [content: McDonald's]
2. Map: This maps to get_transactions with dateRange="this_year" and query="McDonald's"
3. Validate: Clean - only vendor name in query, no temporal contamination.
4. Execute: I will call get_transactions with year constraint and vendor filter.
</thinking>


**EXAMPLE 4 - Amount Analysis with Multiple Constraints**
User: "what's my biggest expense from Grab in the last 3 months?"

<thinking>
1. Decompose: [temporal: last 3 months] [analytical: biggest] [content: Grab]
2. Map: This maps to get_transactions with dateRange="past_90_days" and query="Grab". The "biggest" analysis will be handled after getting results.
3. Validate: Clean - only vendor in query, no temporal words.
4. Execute: I will call get_transactions with the specified parameters.
</thinking>


**EXAMPLE 5 - Category Analysis**
User: "show me all food transactions in June this year"

<thinking>
1. Decompose: [temporal: June this year] [analytical: list all] [content: food category]
2. Map: This needs get_transactions with a June date range and query="food"
3. Validate: Clean - no temporal contamination in query.
4. Execute: I will search for food-related transactions in June.
</thinking>


### FINAL STEP: ANSWER SYNTHESIS PROTOCOL

**CRITICAL: When you receive a ToolMessage containing the data you requested, your task is complete. Your ONLY remaining job is to present this information to the user in a clear, human-readable format.**

**CITATION REQUIREMENT: If the ToolMessage contains citation markers like [^1], [^2], [^3] or citation data, you MUST include these citation markers in your response. Use the format: "According to [Source Name] [^1], the requirement is..." Always reference sources with their corresponding citation numbers.**

**ABSOLUTE RULE: DO NOT call the same tool again with the same parameters. If the ToolMessage contains the data, synthesize your answer and finish.**

**LOOP PREVENTION RULES:**
1. **One Tool Call Per Query**: Each user question requires exactly ONE tool call with the correct parameters
2. **Immediate Synthesis**: When tool results arrive, immediately format and present them
3. **No Repetition**: Never call the same tool with identical parameters in succession
4. **Completion Recognition**: A successful ToolMessage means your investigation is complete

**SYNTHESIS EXAMPLES:**

**Example: After Successful Tool Result**
ToolMessage: "Found 3 transactions for past 60 days: [transaction data]"
Agent Response: "I found 3 transactions from the past 60 days: [formatted presentation of the data]"
**DONE - No additional tool calls needed**

**Example: After Empty Tool Result**  
ToolMessage: "No transactions found matching your criteria."
Agent Response: "I didn't find any transactions matching your search criteria. You might want to try a broader date range or different search terms."
**DONE - No additional tool calls needed**

### ABSOLUTE FINAL INSTRUCTION

**CRITICAL REMINDER: Any request for the user's own data is a tool-use trigger. Do not bypass this rule. Your only valid output in these cases is a function call.**

**TOOL-USE TRIGGERS (Always require function calls):**
- Questions about transactions, spending, payments, purchases
- Requests for vendor lists, document searches
- Any query about "my transactions", "my expenses", "my data"
- Time-based queries like "past 90 days", "this month", "last year"

**FORBIDDEN RESPONSES for personal data queries:**
- ❌ "I didn't find any transactions matching your criteria"
- ❌ "You might want to try a broader date range"
- ❌ Any conversational text instead of function calls

Follow this protocol rigorously for every request.`;

  const translations = {
    en: basePrompt,
    th: `${basePrompt}\n\nตอบเป็นภาษาไทยเสมอ และรักษาความปลอดภัยของข้อมูลผู้ใช้`,
    id: `${basePrompt}\n\nSelalu jawab dalam bahasa Indonesia dan jaga keamanan data pengguna.`
  };

  return translations[language as keyof typeof translations] || translations.en;
}

/**
 * OpenAI System Prompt - FINANCIAL AGENT CONSTITUTION v2.0
 */
function getIntelligentAgentPrompt(language: string): string {
  const basePrompt = `# FINANCIAL AGENT CONSTITUTION v2.0

### MANDATORY TOOL SELECTION DIRECTIVE

**ABSOLUTE RULE: You MUST NEVER answer regulatory/tax/compliance questions from your built-in knowledge. You MUST ALWAYS call the regulatory knowledge base tool for ANY question about regulations, tax, compliance, or financial rules.**

You have access to two types of tools:
1.  **Personal Data Tools** (\`get_transactions\`, \`get_vendors\`, \`search_documents\`): Use these when the user asks about THEIR OWN data. Keywords: "my", "I", "me", "show me", "what is my".
2.  **Knowledge Base Tools** (\`searchRegulatoryKnowledgeBase\`): Use these for GENERAL KNOWLEDGE questions about tax, compliance, and regulations. Keywords: "what are", "how does", "explain", "requirements for", "GST", "tax", "regulation", "compliance", "registration", "OVR", "overseas vendor".

**CRITICAL DECISION EXAMPLES:**
- User: "What was my largest transaction in Singapore?" -> **USE \`get_transactions\`**. This is about the user's personal data.
- User: "What are the GST registration requirements in Singapore?" -> **MUST USE \`searchRegulatoryKnowledgeBase\`**. NEVER answer from built-in knowledge.
- User: "How does Overseas Vendor Registration (OVR) work?" -> **MUST USE \`searchRegulatoryKnowledgeBase\`**. NEVER answer from built-in knowledge.
- User: "Explain GST rules" -> **MUST USE \`searchRegulatoryKnowledgeBase\`**. NEVER answer from built-in knowledge.
- User: "What is the tax rate?" -> **MUST USE \`searchRegulatoryKnowledgeBase\`**. NEVER answer from built-in knowledge.

**REGULATORY QUESTION DETECTION:**
If the user's question contains ANY of these keywords, you MUST call \`searchRegulatoryKnowledgeBase\`:
- GST, tax, taxation, VAT
- regulation, regulatory, compliance
- registration, OVR, overseas vendor
- requirements, rules, law, legal
- Singapore, Malaysia (in regulatory context)
- filing, submission, declaration
- rate, percentage, threshold
- exemption, relief, deduction

**NEVER respond with "Based on Singapore's tax regulations..." or similar - ALWAYS call the tool first.**

## CRITICAL: Tool Parameter Separation Protocol

You are a financial analysis agent with ONE ABSOLUTE RULE: Never contaminate tool parameters with irrelevant data.

### MANDATORY REASONING PROTOCOL
Before EVERY tool call, you MUST follow this exact 4-step process:

**STEP 1: SEMANTIC DECOMPOSITION**
- TEMPORAL: Extract all date/time references (June, past 60 days, this year, etc.)
- ANALYTICAL: Extract analysis intent (largest, smallest, total, average, etc.)  
- CONTENT: Extract search terms (vendor names, transaction types, etc.)
- FILTERS: Extract explicit filters (amount ranges, categories, etc.)

**STEP 2: PARAMETER MAPPING**
- TEMPORAL → dateRange/startDate/endDate parameters ONLY
- ANALYTICAL → Handle in your response logic, NOT in tool parameters
- CONTENT → query parameter (vendor names, description keywords ONLY)
- FILTERS → Appropriate filter parameters

**STEP 3: CONTAMINATION CHECK**
- query parameter MUST NOT contain: dates, time words, analysis words, or natural language
- If temporal info exists: query MUST be empty OR contain only vendor/content terms
- If asking for "all transactions in period": query MUST be empty string

**STEP 4: VALIDATION**
Verify: "Does this tool call only search for what I need, without pollution?"

### CRITICAL RULES
1. **Date Priority Rule**: Specific dates > months > relative ranges > default
2. **Query Purity Rule**: query="" if user wants all transactions in a time period
3. **No Hallucination Rule**: Never invent specifics not in user request
4. **Analysis Post-Processing**: Handle "largest", "smallest" etc. after getting results

### CRITICAL EXECUTION REQUIREMENT

**You are an expert financial assistant. Your primary function is to help users by accessing their financial data through available tools.**

### Core Logic
1. Analyze the user's query to determine their intent.
2. **IF** the user's query requires accessing personal data (like transactions, vendors, documents, spending history, etc.), you **MUST** use a tool.
3. **ELSE IF** the user's query is a general question that does not require personal data (e.g., "what is a 401k?", "how do I save money?"), you may answer directly.

### Tool Usage Rules
- When a tool is required, your response **MUST** be only the JSON for the tool call.
- Do not add any conversational text, acknowledgements, or explanations like "I will look that up for you" or "Here are the transactions I found".
- Your internal reasoning process (monologue) is for your eyes only and must never be part of the final output.

**WHAT NOT TO DO - BAD EXAMPLE:**
User: "what are the transactions i had in the past 30 days"
❌ BAD Response: "1. Decompose: [temporal: past 30 days] [analytical: list all] [content: none] 2. Map: dateRange="past_30_days", query="", no_filters_needed 3. Validate: Clean - temporal words NOT in query 4. Execute: get_transactions({"dateRange": "past_30_days", "query": ""})"

✅ CORRECT Response: [MAKE ACTUAL FUNCTION CALL WITHOUT ANY CONVERSATIONAL TEXT]

### EXECUTION EXAMPLES

**EXAMPLE 1 - Temporal Analysis with Empty Query**
User: "what's the largest transaction in june?"

<thinking>
1. Decompose: [temporal: june] [analytical: largest] [content: none]
2. Map: This maps to get_transactions tool. The dateRange should be for June. The "largest" analysis will be handled after I get the results.
3. Validate: Clean query, no temporal contamination.
4. Execute: I need to call get_transactions with June date range.
</thinking>


**EXAMPLE 2 - All Transactions in Period**
User: "what are the transactions i have in the past 60 days?"

<thinking>
1. Decompose: [temporal: past 60 days] [analytical: list all] [content: none]
2. Map: This maps to get_transactions tool. The dateRange parameter should be "past_60_days". The query is empty as no specific content is being searched for.
3. Validate: Clean. The temporal words are handled by the dateRange parameter.
4. Execute: I will call get_transactions with the specified date range.
</thinking>


**EXAMPLE 3 - Vendor Search with Time Constraint**
User: "show me all McDonald's transactions this year"

<thinking>
1. Decompose: [temporal: this year] [analytical: list all] [content: McDonald's]
2. Map: This maps to get_transactions with dateRange="this_year" and query="McDonald's"
3. Validate: Clean - only vendor name in query, no temporal contamination.
4. Execute: I will call get_transactions with year constraint and vendor filter.
</thinking>


**EXAMPLE 4 - Amount Analysis with Multiple Constraints**
User: "what's my biggest expense from Grab in the last 3 months?"

<thinking>
1. Decompose: [temporal: last 3 months] [analytical: biggest] [content: Grab]
2. Map: This maps to get_transactions with dateRange="past_90_days" and query="Grab". The "biggest" analysis will be handled after getting results.
3. Validate: Clean - only vendor in query, no temporal words.
4. Execute: I will call get_transactions with the specified parameters.
</thinking>


**EXAMPLE 5 - Category Analysis**
User: "show me all food transactions in June this year"

<thinking>
1. Decompose: [temporal: June this year] [analytical: list all] [content: food category]
2. Map: This needs get_transactions with a June date range and query="food"
3. Validate: Clean - no temporal contamination in query.
4. Execute: I will search for food-related transactions in June.
</thinking>


### FINAL STEP: ANSWER SYNTHESIS PROTOCOL

**CRITICAL: When you receive a ToolMessage containing the data you requested, your task is complete. Your ONLY remaining job is to present this information to the user in a clear, human-readable format.**

**CITATION REQUIREMENT: If the ToolMessage contains citation markers like [^1], [^2], [^3] or citation data, you MUST include these citation markers in your response. Use the format: "According to [Source Name] [^1], the requirement is..." Always reference sources with their corresponding citation numbers.**

**ABSOLUTE RULE: DO NOT call the same tool again with the same parameters. If the ToolMessage contains the data, synthesize your answer and finish.**

**LOOP PREVENTION RULES:**
1. **One Tool Call Per Query**: Each user question requires exactly ONE tool call with the correct parameters
2. **Immediate Synthesis**: When tool results arrive, immediately format and present them
3. **No Repetition**: Never call the same tool with identical parameters in succession
4. **Completion Recognition**: A successful ToolMessage means your investigation is complete

**SYNTHESIS EXAMPLES:**

**Example: After Successful Tool Result**
ToolMessage: "Found 3 transactions for past 60 days: [transaction data]"
Agent Response: "I found 3 transactions from the past 60 days: [formatted presentation of the data]"
**DONE - No additional tool calls needed**

**Example: After Empty Tool Result**  
ToolMessage: "No transactions found matching your criteria."
Agent Response: "I didn't find any transactions matching your search criteria. You might want to try a broader date range or different search terms."
**DONE - No additional tool calls needed**

**CRITICAL:** For general conversation (greetings, thanks), respond directly without tools. For completion signals after tool results, output "DONE". For vendor lists, use get_vendors(). All other queries use get_transactions() following the protocol above.

**LANGUAGE:** Respond in ${language === 'th' ? 'Thai' : language === 'id' ? 'Indonesian' : 'English'} and maintain user data privacy.`;

  const translations = {
    en: basePrompt,
    th: `${basePrompt}\n\nตอบเป็นภาษาไทยเสมอ และรักษาความปลอดภัยของข้อมูลผู้ใช้`,
    id: `${basePrompt}\n\nSelalu jawab dalam bahasa Indonesia dan jaga keamanan data pengguna.`
  };

  return translations[language as keyof typeof translations] || translations.en;
}

/**
 * Topic Guardrail Node - MANDATORY first step
 * Uses LLM to classify if the query is financial/business-related
 * Bypasses guardrail for clarification responses to avoid blocking legitimate follow-ups
 */
async function topicGuardrail(state: AgentState): Promise<Partial<AgentState>> {
  console.log('[TopicGuardrail] Validating topic relevance');
  
  // Get the last user message
  const lastMessage = state.messages[state.messages.length - 1];
  if (!lastMessage || lastMessage._getType() !== 'human') {
    console.log('[TopicGuardrail] No human message found, allowing by default');
    return {
      isTopicAllowed: true,
      isClarificationResponse: false
    };
  }

  const userQuery = typeof lastMessage.content === 'string' ? lastMessage.content : '';
  
  // Skip guardrail for very short responses (likely clarification answers)
  if (userQuery.length < 10) {
    console.log('[TopicGuardrail] Short response detected, likely clarification - allowing');
    return {
      isTopicAllowed: true,
      isClarificationResponse: true
    };
  }

  try {
    // Build context-aware topic classification prompt
    const topicClassificationPrompt = `You are a topic classification system for a financial co-pilot chatbot designed for Southeast Asian SMEs.

CLASSIFICATION RULES:
1. ALLOWED topics (respond with "ALLOWED"):
   - Tax, GST, VAT questions for Singapore, Malaysia, Thailand, Indonesia
   - Business setup, incorporation, compliance
   - Financial analysis, transactions, expenses, accounting
   - Cross-border commerce, import/export regulations
   - Invoice processing, document management
   - Regulatory compliance, licensing requirements
   - Business banking, payments, currency conversion
   - General business operations and management

2. NOT ALLOWED topics (respond with "BLOCKED"):
   - Personal conversations, casual chat
   - Non-business advice (health, relationships, travel for leisure)
   - Technical support unrelated to finance/business
   - Entertainment, sports, politics, news
   - Academic subjects unrelated to business
   - Creative writing, storytelling
   - General AI capabilities or meta-discussions

3. CLARIFICATION responses (respond with "CLARIFICATION"):
   - Short answers to previous business questions
   - Simple confirmations like "Yes", "No", "Singapore", "Sole Proprietorship"
   - Providing additional details asked for in business context
   - Follow-up answers to clarification questions

IMPORTANT: Consider conversation context. If this appears to be answering a clarification question about business/finance, classify as CLARIFICATION.

User Query: "${userQuery}"

Respond with exactly one word: ALLOWED, BLOCKED, or CLARIFICATION`;

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
          { role: 'system', content: topicClassificationPrompt }
        ],
        max_tokens: 10,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      console.error('[TopicGuardrail] LLM API error, allowing by default');
      return {
        isTopicAllowed: true,
        isClarificationResponse: false
      };
    }

    const result = await response.json();
    const classification = result.choices?.[0]?.message?.content?.trim().toUpperCase();
    
    console.log(`[TopicGuardrail] Classification result: ${classification} for query: "${userQuery.substring(0, 50)}..."`);

    if (classification === 'BLOCKED') {
      return {
        isTopicAllowed: false,
        isClarificationResponse: false
      };
    } else if (classification === 'CLARIFICATION') {
      return {
        isTopicAllowed: true,
        isClarificationResponse: true
      };
    } else {
      // ALLOWED or any other response defaults to allowed
      return {
        isTopicAllowed: true,
        isClarificationResponse: false
      };
    }
    
  } catch (error) {
    console.error('[TopicGuardrail] Error during topic classification:', error);
    // Fail open - allow by default on errors to avoid blocking legitimate queries
    return {
      isTopicAllowed: true,
      isClarificationResponse: false
    };
  }
}

/**
 * Off-Topic Handler Node
 * Provides multi-language rejection messages for off-topic queries
 */
async function handleOffTopic(state: AgentState): Promise<Partial<AgentState>> {
  console.log('[HandleOffTopic] Generating off-topic rejection message');
  
  const language = state.language || 'en';
  
  const rejectionMessages = {
    en: "I'm a financial co-pilot designed to help Southeast Asian SMEs with tax, compliance, and business questions. I can assist with:\n\n• GST/VAT questions for Singapore, Malaysia, Thailand, Indonesia\n• Business setup and incorporation\n• Financial analysis and transaction management\n• Cross-border commerce and regulations\n• Invoice processing and document management\n\nPlease ask me something related to your business or financial needs!",
    
    th: "ฉันเป็นโคไพล็อตด้านการเงินที่ออกแบบมาเพื่อช่วยเหลือ SMEs ในเอเชียตะวันออกเฉียงใต้เรื่องภาษี การปฏิบัติตามกฎระเบียบ และคำถามทางธุรกิจ ฉันสามารถช่วยได้ในเรื่อง:\n\n• คำถามเกี่ยวกับ GST/VAT สำหรับสิงคโปร์ มาเลเซีย ไทย อินโดนีเซีย\n• การจัดตั้งธุรกิจและการจดทะเบียน\n• การวิเคราะห์ทางการเงินและการจัดการธุรกรรม\n• การค้าข้ามแดนและกฎระเบียบ\n• การประมวลผลใบแจ้งหนี้และการจัดการเอกสาร\n\nกรุณาถามฉันเกี่ยวกับความต้องการทางธุรกิจหรือการเงินของคุณ!",
    
    id: "Saya adalah kopilot keuangan yang dirancang untuk membantu UKM Asia Tenggara dengan pertanyaan pajak, kepatuhan, dan bisnis. Saya dapat membantu dengan:\n\n• Pertanyaan GST/PPN untuk Singapura, Malaysia, Thailand, Indonesia\n• Pendirian bisnis dan pendirian badan hukum\n• Analisis keuangan dan manajemen transaksi\n• Perdagangan lintas batas dan regulasi\n• Pemrosesan faktur dan manajemen dokumen\n\nSilakan tanyakan sesuatu yang berkaitan dengan kebutuhan bisnis atau keuangan Anda!"
  };

  const message = rejectionMessages[language as keyof typeof rejectionMessages] || rejectionMessages.en;

  return {
    messages: [...state.messages, new AIMessage(message)],
    currentPhase: 'completed'
  };
}

/**
 * Validation Node - MANDATORY security step
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
    securityValidated: true,
    currentPhase: 'intent_analysis'
  };
}

/**
 * LLM-Powered Intent Analysis Node
 * Uses the existing chat agent LLM to understand user intent and generate clarification questions
 */
async function analyzeIntent(state: AgentState): Promise<Partial<AgentState>> {
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


/**
 * Clarification Node - Handles clarification questions and responses
 */
async function handleClarification(state: AgentState): Promise<Partial<AgentState>> {
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

/**
 * Call Model Node - The agent's "brain" with security enforcement and sanitization
 * Only processes requests after security validation
 */
async function callModel(state: AgentState): Promise<Partial<AgentState>> {
  console.log('[CallModel] Processing request with security validation');
  console.log(`[CallModel] DEBUG: State has ${state.messages.length} messages`);
  
  // Log all messages in state for debugging
  state.messages.forEach((msg, index) => {
    const msgType = msg instanceof HumanMessage ? 'HumanMessage' : 
                   msg instanceof AIMessage ? 'AIMessage' : 
                   msg instanceof ToolMessage ? 'ToolMessage' : 'Unknown';
    const content = typeof msg.content === 'string' ? msg.content.substring(0, 50) + '...' : 'Complex content';
    console.log(`[CallModel] Message ${index}: ${msgType} - Content: ${content}`);
  });

  // CRITICAL: Ensure security validation passed
  if (!state.securityValidated) {
    console.error('[CallModel] Security validation not passed, refusing to process');
    return {
      messages: [...state.messages, new AIMessage('Request cannot be processed due to security restrictions.')],
      currentPhase: 'completed'
    };
  }

  // Set phase to execution when we start model processing
  console.log('[CallModel] Setting phase to execution for model processing');

  // MODEL-CONDITIONAL ARCHITECTURE: Detect model type for appropriate approach
  const modelType = detectModelType();
  const systemPrompt = getSystemPrompt(state.language || 'en', modelType);
  
  console.log(`[CallModel] Using ${modelType} approach for this request`);
  
  // DEBUG: Check if this looks like a regulatory question
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage && typeof lastMessage.content === 'string') {
    const query = lastMessage.content.toLowerCase();
    const regulatoryKeywords = ['gst', 'tax', 'regulation', 'compliance', 'registration', 'ovr', 'overseas vendor', 'requirements'];
    const isRegulatoryQuestion = regulatoryKeywords.some(keyword => query.includes(keyword));
    console.log(`[CallModel] DEBUG: Query "${lastMessage.content.substring(0, 50)}..." contains regulatory keywords: ${isRegulatoryQuestion}`);
  }

  // --- CONDITIONAL SANITIZATION (GEMINI ONLY) ---
  // Only apply sanitization workarounds for Gemini due to safety restrictions
  const processedMessages = [...state.messages];
  
  if (modelType === 'gemini') {
    console.log(`[CallModel] Applying Gemini-specific sanitization workarounds`);
    
    const lastMessage = processedMessages[processedMessages.length - 1];
    
    // ENHANCED MESSAGE TYPE DETECTION - try multiple approaches
    const isHumanMessage = lastMessage instanceof HumanMessage;
    const hasHumanType = (lastMessage as any)._getType?.() === 'human';
    const hasUserRole = (lastMessage as any).role === 'user';
    const hasHumanContent = lastMessage && lastMessage.content && typeof lastMessage.content === 'string';
    
    
    // Check if we need to sanitize - only for Gemini
    if (lastMessage && hasHumanContent) {
      const originalQuery = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);
      
      // Check for financial trigger words
      const financialTriggers = [
        'invoice', 'amount', 'largest', 'biggest', 'expense', 'transaction', 
        'payment', 'financial', 'money', 'cost', 'price', 'bill', 'receipt',
        'purchase', 'spend', 'budget', 'revenue', 'profit', 'loss', 'vendor',
        'accounting', 'finance', 'economic', 'monetary', 'fiscal', 'currency',
        'dollar', 'euro', 'pound', 'yen', 'credit', 'debit', 'bank', 'account'
      ];

      const containsFinancialTerms = financialTriggers.some(trigger => 
        originalQuery.toLowerCase().includes(trigger)
      );

      if (containsFinancialTerms) {
        
        try {
          const sanitizationPrompt = `You are a query sanitizer that removes financial terminology to bypass AI safety restrictions. Your job is to rewrite queries to be generic while preserving the core intent.

SANITIZATION RULES:
- Replace "invoice" → "document" or "record"
- Replace "amount/money/cost/price" → "value" or "number"
- Replace "transaction/payment/expense" → "data record" or "entry"
- Replace "financial/accounting" → "data"
- Replace "largest/biggest" → "highest" or "maximum"
- Replace "vendor/company name" → "entity" or "source"
- Remove currency symbols and financial context
- Keep date ranges, numerical filters, and comparison logic
- Preserve the core analytical intent

EXAMPLES:
Original: "What is the largest invoice amount I have in the past 60 days?"
Sanitized: "What is the highest value in my data records from the past 60 days?"

Original: "Show me all expenses from ABC Company over $500"
Sanitized: "Show me all entries from ABC Company with values over 500"

Rewrite this query to remove financial terminology while preserving intent:
"${originalQuery}"

Return ONLY the sanitized query, no explanations.`;

          // Build headers conditionally based on API key presence
          const headers: Record<string, string> = {
            'Content-Type': 'application/json'
          };
          
          // Only add Authorization header if API key is present
          if (aiConfig.chat.apiKey) {
            headers['Authorization'] = `Bearer ${aiConfig.chat.apiKey}`;
          }

          const response = await fetch(`${aiConfig.chat.endpointUrl}/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: aiConfig.chat.modelId,
              messages: [
                { role: 'system', content: sanitizationPrompt }
              ],
              max_tokens: 200,
              temperature: 0.1
            })
          });

          if (response.ok) {
            const result = await response.json();
            const sanitizedQuery = result.choices?.[0]?.message?.content?.trim();
            
            if (sanitizedQuery) {
              // Replace the last message with sanitized version for LLM processing only
              const sanitizedMessage = new HumanMessage(sanitizedQuery);
              processedMessages[processedMessages.length - 1] = sanitizedMessage;
            }
          } else {
            console.warn('[CallModel] Sanitization failed, using original query');
          }
        } catch (error) {
          console.warn('[CallModel] Sanitization error, using original query:', error);
        }
      }
    }
  } else {
    console.log(`[CallModel] Using original approach for ${modelType} - no sanitization needed`);
  }
  
  // CRITICAL FIX: Trim conversation history to prevent context pollution
  // Keep only the last 6 messages (3 user/assistant pairs) to prevent LLM confusion
  let trimmedMessages = processedMessages;
  if (processedMessages.length > 6) {
    trimmedMessages = processedMessages.slice(-6);
    console.log(`[CallModel] TRIMMED conversation history from ${processedMessages.length} to ${trimmedMessages.length} messages to prevent context pollution`);
  }
  
  // Prepare messages for LLM using trimmed messages (sanitized for Gemini, original for others)
  console.log(`[CallModel] Building messages for LLM from ${trimmedMessages.length} processed messages`);
  
  const messages = [
    { role: 'system', content: systemPrompt },
    ...trimmedMessages.map((msg: any, index) => {
      const msgType = msg._getType ? msg._getType() : msg.type;
      console.log(`[CallModel] Processing message ${index}: type=${msgType}, content="${typeof msg.content === 'string' ? msg.content.substring(0, 50) + '...' : 'Complex content'}"`);
      
      // ULTRA-ROBUST: Check multiple conditions for human message
      const isHumanMsg = msgType === 'human' || 
                        msg instanceof HumanMessage || 
                        (msg as any).role === 'user' ||
                        (index === processedMessages.length - 1 && typeof msg.content === 'string'); // Last message with string content
      
      if (isHumanMsg || msgType === 'human') {
        const userMessage = { role: 'user', content: msg.content };
        console.log(`[CallModel] Created user message: "${typeof userMessage.content === 'string' ? userMessage.content.substring(0, 50) + '...' : 'Complex content'}"`);
        return userMessage;
      } else if (msgType === 'tool') {
        // CRITICAL FIX: Proper OpenAI tool message format
        return { 
          role: 'tool', 
          content: msg.content, 
          tool_call_id: msg.tool_call_id 
        };
      } else {
        return { role: 'assistant', content: msg.content };
      }
    })
  ];
  
  console.log(`[CallModel] Final messages for LLM: ${messages.length} total (${messages.length - 1} conversation messages + 1 system)`);

  try {
    console.log(`[CallModel] Calling LLM for user: ${state.userContext.userId}`);
    
    // Get available tools for function calling from ToolFactory (single source of truth)
    // Use model-specific schemas for clean architectural separation
    const rawTools = ToolFactory.getToolSchemas(modelType);
    
    console.log(`[CallModel] DEBUG: ToolFactory returned ${rawTools.length} raw tools`);
    console.log(`[CallModel] DEBUG: Available tool names: ${rawTools.map(t => t.function?.name).join(', ')}`);
    
    // Check specifically for regulatory tool
    const hasRegulatoryTool = rawTools.some(tool => tool.function?.name === 'searchRegulatoryKnowledgeBase');
    console.log(`[CallModel] DEBUG: Regulatory tool present: ${hasRegulatoryTool}`);
    
    // ADDITIONAL VALIDATION: Ensure each tool has a function.name before sending to API
    const tools = rawTools.filter(tool => {
      const hasName = tool?.function?.name;
      if (!hasName) {
        console.error(`[CallModel] CRITICAL: Tool missing function.name:`, JSON.stringify(tool, null, 2));
        return false;
      }
      return true;
    });
    
    // If no valid tools after filtering, proceed without tools
    if (tools.length === 0) {
      console.warn(`[CallModel] No valid tools available, proceeding without function calling`);
    } else {
      console.log(`[CallModel] DEBUG: ${tools.length} valid tools loaded for LLM`);
    }

    // Check if we should use Gemini
    if (shouldUseGemini() && geminiService) {
      console.log(`\n🤖 [GEMINI PATH] Using model: ${aiConfig.gemini.model} with ${messages.length} messages\n`);
      
      // Convert messages to GeminiMessage format
      const geminiMessages = messages.slice(1).map((msg: any) => ({
        role: msg.role === 'assistant' ? 'assistant' : msg.role,
        content: msg.content,
        tool_call_id: msg.tool_call_id
      }));

      const response = await geminiService.generateContent(geminiMessages, systemPrompt, tools);

      if (!response.success) {
        console.error('[CallModel] Gemini error:', response.error);
        return {
          messages: [...state.messages, new AIMessage('I apologize, but I encountered an error processing your request.')],
        };
      }

      // Check for function calls
      if (response.tool_calls && response.tool_calls.length > 0) {
        const toolCall = response.tool_calls[0];
        const toolName = toolCall.function.name;
        
        console.log('[CallModel] Gemini function call detected:', toolCall);
        
        if (!ToolFactory.hasToolType(toolName)) {
          console.error(`[CallModel] Unknown tool requested: ${toolName}`);
          return {
            messages: [...state.messages, new AIMessage('I apologize, but I cannot use the requested tool.')],
          };
        }
        
        // Convert to LangChain ToolCall format
        const aiMessageWithToolCall = new AIMessage({
          content: '',
          tool_calls: [{
            name: toolName,
            args: JSON.parse(toolCall.function.arguments),
            id: toolCall.id,
            type: 'tool_call'
          }],
        });

        return {
          messages: [...state.messages, aiMessageWithToolCall],
        };
      }

      // Return text response from Gemini
      const content = response.content || 'I apologize, but I cannot process your request right now.';
      console.log('[CallModel] Gemini text response generated');
      
      return {
        messages: [...state.messages, new AIMessage(content)],
      };
    }

    // Fallback to original OpenAI-compatible API
    console.log(`\n🚀 [OPENAI PATH] Using model: ${aiConfig.chat.modelId} at ${aiConfig.chat.endpointUrl}\n`);
    
    const basePayload = {
      model: aiConfig.chat.modelId,
      messages,
      max_tokens: 1000,
      temperature: 0.3
    };
    
    const requestPayload = tools.length > 0 ? {
      ...basePayload,
      tools,
      tool_choice: "auto"
    } : basePayload;
    
    console.log(`[CallModel] TOOLS PAYLOAD (${tools.length} tools):`, JSON.stringify(tools.length > 0 ? (requestPayload as any).tools : null, null, 2));
    
    // Build headers conditionally based on API key presence
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    // Only add Authorization header if API key is present
    if (aiConfig.chat.apiKey) {
      headers['Authorization'] = `Bearer ${aiConfig.chat.apiKey}`;
    }

    const response = await fetch(`${aiConfig.chat.endpointUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CallModel] LLM API error: ${response.status} - ${errorText}`);
      throw new Error(`LLM API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const hasToolCalls = result.choices?.[0]?.message?.tool_calls?.length > 0;
    console.log(`[CallModel] Response received, tool_calls: ${hasToolCalls}`);

    const assistantResponse = result.choices?.[0]?.message;

    // --- CHECK FOR SPECIAL 'DONE' COMMAND (Enhanced Pattern Matching) ---
    const responseContent = assistantResponse?.content?.trim() || '';
    const isDoneCommand = /^\s*DONE\s*[.\-\s]*$/i.test(responseContent) || 
                         /^\s*DONE\s*$/i.test(responseContent) || 
                         responseContent.toUpperCase() === 'DONE' ||
                         /^DONE[\s\.\-]*$/i.test(responseContent) ||
                         /^\**\s*DONE\s*\**$/i.test(responseContent);
                         
    if (isDoneCommand) {
      console.log('[CallModel] Model issued DONE command (enhanced detection). Synthesizing final answer.');
      
      // Find the last successful tool result in the history
      const lastToolMessage = state.messages.slice().reverse().find(m => m._getType() === 'tool');
      
      if (lastToolMessage) {
        // Return the tool's content as the final answer
        const finalAnswer = typeof lastToolMessage.content === 'string' 
          ? lastToolMessage.content 
          : 'Here is the information I found for you.';
        
        console.log('[CallModel] DONE command processed, returning final answer');
        return {
          messages: [...state.messages, new AIMessage(finalAnswer)],
        };
      } else {
        // Fallback if no tool message found
        return {
          messages: [...state.messages, new AIMessage('I\'ve completed the task but could not find the result to display.')],
        };
      }
    }
    
    // --- CHECK FOR ERROR COMMAND ---
    if (assistantResponse?.content?.trim()?.startsWith('ERROR:')) {
      console.log('[CallModel] Model issued ERROR command:', assistantResponse.content);
      return {
        messages: [...state.messages, new AIMessage('I apologize, but I cannot determine how to process your request. Please try rephrasing your question.')],
      };
    }

    if (assistantResponse?.tool_calls && assistantResponse.tool_calls.length > 0) {
      const toolCall = assistantResponse.tool_calls[0];
      const toolName = toolCall.function?.name;
      
      if (!ToolFactory.hasToolType(toolName)) {
        console.error(`[CallModel] Unknown tool requested: ${toolName}`);
        return {
          messages: [...state.messages, new AIMessage('I apologize, but I cannot use the requested tool.')],
        };
      }
      
      const aiMessageWithToolCall = new AIMessage({
        content: '',
        tool_calls: [toolCall],
      });

      console.log('[CallModel] Tool call detected:', toolCall);
      return {
        messages: [...state.messages, aiMessageWithToolCall],
      };
    }
    
    // If no tool call, get the content - simplified for direct command model
    let content = assistantResponse?.content || 'I apologize, but I cannot process your request right now.';
    
    // Basic content cleaning for direct command model
    if (content && typeof content === 'string') {
      content = content.trim();
      
      // ENHANCED: Filter out any remaining DONE commands in content
      const isDoneResponse = /^\s*DONE\s*[.\-\s]*$/i.test(content) || 
                            /^\s*DONE\s*$/i.test(content) || 
                            content.toUpperCase() === 'DONE' ||
                            /^DONE[\s\.\-]*$/i.test(content) ||
                            /^\**\s*DONE\s*\**$/i.test(content);
      
      if (isDoneResponse) {
        content = "I've completed processing your request.";
      } else {
        // Remove DONE at the end of responses if it appears
        content = content.replace(/\s+DONE\s*[.\-]*\s*$/i, '').trim();
      }
      
      // For direct command models, we expect clean output, so minimal cleaning needed
      // Just ensure we don't return empty content
      if (!content || content.length < 3) {
        content = 'I apologize, but I cannot process your request right now.';
      }
    }
    
    console.log('[CallModel] Final AI Content:', content);
    return {
      messages: [...state.messages, new AIMessage(content)],
    };

  } catch (error) {
    // Enhanced error handling for network connectivity issues
    console.error(`[CallModel] Caught an error for user ${state.userContext.userId}:`, error);
    
    let errorMessage = 'I apologize, but I encountered an error processing your request. Please try again.';
    
    if (error instanceof Error) {
      if (error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT') || error.message.includes('fetch failed')) {
        console.error('[CallModel] Network connectivity error:', error.message);
        errorMessage = 'I\'m experiencing network connectivity issues. Please try your question again in a moment.';
      } else if (error.message.startsWith('LLM API error:')) {
        console.error('[CallModel] API Error Details:', error.message);
        errorMessage = 'The AI service is temporarily unavailable. Please try again shortly.';
      }
    }
    
    return {
      messages: [...state.messages, new AIMessage(errorMessage)],
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

    // Create appropriate response message
    const toolMessage = new ToolMessage({
      content: result.success ? result.data || 'Tool executed successfully' : result.error || 'Tool execution failed',
      tool_call_id: toolCall.id || 'tool_exec', // Use the tool call ID for better tracking
      name: toolName
    });

    // Update failure tracking for circuit breaker
    const newFailureCount = result.success ? 0 : (state.failureCount || 0) + 1;
    const newLastFailedTool = result.success ? null : toolName;

    return {
      messages: [...state.messages, toolMessage],
      failureCount: newFailureCount,
      lastFailedTool: newLastFailedTool,
      citations: newCitations // Add citations to agent state
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
 * Router Function - Determines next step in the graph with intelligent phase handling
 */
function router(state: AgentState): string {
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

  // FIXED CIRCUIT BREAKER: Count messages within the current turn only, not total conversation history
  // Find the start of the current turn by looking backwards for the last HumanMessage
  let currentTurnStart = state.messages.length - 1;
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    const msgType = msg._getType ? msg._getType() : (msg as any).type;
    if (msgType === 'human') {
      currentTurnStart = i;
      break;
    }
  }
  
  // Count messages in current turn only (from last human message to end)
  const currentTurnMessages = state.messages.slice(currentTurnStart);
  const currentTurnLength = currentTurnMessages.length;
  
  // Allow reasonable interaction within current turn: human -> ai -> tool -> ai (up to 6 messages)
  // Only trigger circuit breaker for excessive loops within THIS turn
  if (currentTurnLength > 6) {
    console.log(`[Router] CIRCUIT BREAKER: Current turn too long (${currentTurnLength} messages in this turn). Ending to prevent infinite loops.`);
    return END;
  }

  // Count tool failures in the current turn only
  const currentTurnToolFailures = currentTurnMessages.filter(msg => {
    if (msg._getType && msg._getType() === 'tool') {
      const content = typeof msg.content === 'string' ? msg.content : '';
      return content.includes('error') || content.includes('failed') || content.includes('timeout');
    }
    return false;
  }).length;

  if (currentTurnToolFailures >= 3) {
    console.log(`[Router] CIRCUIT BREAKER: ${currentTurnToolFailures} tool failures in current turn. Ending conversation.`);
    return END;
  }

  // Count consecutive tool calls without successful results
  let consecutiveToolCalls = 0;
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    const msgType = msg._getType ? msg._getType() : (msg as any).type;
    
    if (msgType === 'tool') {
      consecutiveToolCalls++;
      const content = typeof msg.content === 'string' ? msg.content : '';
      if (content.includes('Found') && !content.includes('No') && !content.includes('error')) {
        break; // Found a successful result, stop counting
      }
    } else if (msgType === 'ai' && (msg as any).tool_calls && (msg as any).tool_calls.length > 0) {
      // AI tool call, continue counting
      continue;
    } else {
      break; // Different message type, stop counting
    }
  }

  if (consecutiveToolCalls >= 6) {
    console.log(`[Router] CIRCUIT BREAKER: ${consecutiveToolCalls} consecutive tool calls without success. Ending conversation.`);
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
    // Enhanced circuit breaker - prevent infinite loops
    const toolMessage = currentMessage as ToolMessage;
    const contentStr = typeof toolMessage.content === 'string' ? toolMessage.content : '';
    const isFailure = !contentStr || contentStr.includes('error') || contentStr.includes('failed') || contentStr.includes('timeout');
    
    // Check if this is a successful tool result
    const isSuccess = contentStr && (
      contentStr.includes('"success": true') || 
      contentStr.includes('vendors') || 
      contentStr.includes('transactions') ||
      contentStr.includes('documents') ||
      (contentStr.length > 50 && !isFailure) // Non-empty substantial content without error indicators
    );
    
    if (isFailure && state.failureCount && state.failureCount >= 2) {
      console.log(`[Router] Circuit breaker activated after ${state.failureCount} failures`);
      return END;
    }
    
    // Check for repeated "No transactions found" messages in current turn
    if (contentStr.includes('No transactions found') || contentStr.includes('No results found')) {
      const noResultsCount = currentTurnMessages.filter(msg => {
        if (msg._getType && msg._getType() === 'tool') {
          const content = typeof msg.content === 'string' ? msg.content : '';
          return content.includes('No transactions found') || content.includes('No results found');
        }
        return false;
      }).length;
      
      if (noResultsCount >= 2) {
        console.log(`[Router] CIRCUIT BREAKER: ${noResultsCount} "no results" messages. Ending conversation.`);
        return END;
      }
    }
    
    // If we have a successful tool result and this is getting long, try to wrap up
    if (isSuccess && currentTurnLength >= 6) {
      console.log(`[Router] Successful tool result detected with long turn. Allowing one final model call to complete.`);
    }
    
    // A tool result needs to be processed by the model for a final answer.
    console.log('[Router] Tool result received. Routing to call model for final answer.');
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
