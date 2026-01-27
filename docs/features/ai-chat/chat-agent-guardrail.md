Guardrail Implementation Deep Dive

  Implemented guardrail system to restrict the financial AI agent to only business/financial topics.

  1. Architecture Overview

  Added a mandatory topic classification layer as the first step in the
   LangGraph workflow, using an LLM-powered classifier to determine if
  queries are business-related before processing.

  // New workflow flow:
  User Query → Topic Guardrail → [ALLOWED/BLOCKED/CLARIFICATION] →
  Continue or Reject

  2. Core Implementation Components

  A. Extended Agent State Structure

  Added two new fields to the AgentStateAnnotation to track topic
  validation:

  const AgentStateAnnotation = Annotation.Root({
    // ... existing fields

    // NEW: Topic guardrail validation
    isTopicAllowed: Annotation<boolean>({
      reducer: (x: boolean, y: boolean) => y,
      default: () => true
    }),

    // NEW: Clarification response detection
    isClarificationResponse: Annotation<boolean>({
      reducer: (x: boolean, y: boolean) => y,
      default: () => false
    })
  });

  B. Topic Classification Node (topicGuardrail)

  Location: src/lib/langgraph-agent.ts lines 491-612

  This is the core guardrail logic that classifies every user query:

  async function topicGuardrail(state: AgentState):
  Promise<Partial<AgentState>> {
    console.log('[TopicGuardrail] Validating topic relevance');

    const lastMessage = state.messages[state.messages.length - 1];
    const userQuery = typeof lastMessage.content === 'string' ?
  lastMessage.content : '';

    // SMART BYPASS: Skip guardrail for very short responses (likely
  clarification answers)
    if (userQuery.length < 10) {
      return {
        isTopicAllowed: true,
        isClarificationResponse: true
      };
    }

    // LLM-POWERED CLASSIFICATION
    const topicClassificationPrompt = `You are a topic classification
  system for a financial co-pilot chatbot designed for Southeast Asian
  SMEs.

  CLASSIFICATION RULES:
  1. ALLOWED topics (respond with "ALLOWED"):
     - Tax, GST, VAT questions for Singapore, Malaysia, Thailand,
  Indonesia
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
     - Simple confirmations like "Yes", "No", "Singapore", "Sole
  Proprietorship"
     - Providing additional details asked for in business context

  User Query: "${userQuery}"

  Respond with exactly one word: ALLOWED, BLOCKED, or CLARIFICATION`;

    // Call the existing LLM API for classification
    const response = await
  fetch(`${aiConfig.chat.endpointUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization':
  `Bearer ${aiConfig.chat.apiKey}` },
      body: JSON.stringify({
        model: aiConfig.chat.modelId,
        messages: [{ role: 'system', content: topicClassificationPrompt
  }],
        max_tokens: 10,
        temperature: 0.1
      })
    });

    const result = await response.json();
    const classification =
  result.choices?.[0]?.message?.content?.trim().toUpperCase();

    // Return classification results
    if (classification === 'BLOCKED') {
      return { isTopicAllowed: false, isClarificationResponse: false };
    } else if (classification === 'CLARIFICATION') {
      return { isTopicAllowed: true, isClarificationResponse: true };
    } else {
      return { isTopicAllowed: true, isClarificationResponse: false };
    }
  }

  C. Off-Topic Handler (handleOffTopic)

  Location: src/lib/langgraph-agent.ts lines 618-637

  When a query is classified as BLOCKED, this node provides professional
  rejection messages:

  async function handleOffTopic(state: AgentState):
  Promise<Partial<AgentState>> {
    const language = state.language || 'en';

    const rejectionMessages = {
      en: "I'm a financial co-pilot designed to help Southeast Asian SMEs
   with tax, compliance, and business questions. I can assist with:\n\n•
  GST/VAT questions for Singapore, Malaysia, Thailand, Indonesia\n•
  Business setup and incorporation\n• Financial analysis and transaction
  management\n• Cross-border commerce and regulations\n• Invoice
  processing and document management\n\nPlease ask me something related
  to your business or financial needs!",

      th: "ฉันเป็นโคไพล็อตด้านการเงินที่ออกแบบมาเพื่อช่วยเหลือ SMEs
  ในเอเชียตะวันออกเฉียงใต้เรื่องภาษี การปฏิบัติตามกฎระเบียบ และคำถามทางธุรกิจ...",

      id: "Saya adalah kopilot keuangan yang dirancang untuk membantu UKM
   Asia Tenggara dengan pertanyaan pajak, kepatuhan, dan bisnis..."
    };

    const message = rejectionMessages[language as keyof typeof
  rejectionMessages] || rejectionMessages.en;

    return {
      messages: [...state.messages, new AIMessage(message)],
      currentPhase: 'completed' // End the conversation here
    };
  }

  D. Router Logic Updates

  Location: src/lib/langgraph-agent.ts lines 1489-1671

  I modified the router to prioritize topic classification for all new
  human messages:

  function router(state: AgentState): string {
    // CRITICAL: Check for empty messages array
    if (!state.messages || state.messages.length === 0) {
      return 'topicGuardrail';
    }

    const lastMessage = state.messages[state.messages.length - 1];
    const isHumanMessage = lastMessage && lastMessage._getType() ===
  'human';

    // TOPIC GUARDRAIL LOGIC - First priority for new human messages
    if (isHumanMessage) {
      // Check if we need to classify the topic (not done yet)
      if (state.isTopicAllowed === undefined) {
        console.log('[Router] New human message requires topic
  classification');
        return 'topicGuardrail';
      }

      // If topic was classified as not allowed, handle off-topic
      if (state.isTopicAllowed === false) {
        console.log('[Router] Topic not allowed, routing to
  handleOffTopic');
        return 'handleOffTopic';
      }
    }

    // Continue with normal workflow for allowed topics...
    // ... existing router logic
  }

  E. Graph Definition Updates

  Location: src/lib/langgraph-agent.ts lines 1688-1716

  I added the new nodes to the LangGraph workflow:

  export function createFinancialAgent() {
    const workflow = new StateGraph(AgentStateAnnotation);

    // Add nodes with topic guardrail as first step
    workflow.addNode('topicGuardrail', topicGuardrail);      // NEW
    workflow.addNode('handleOffTopic', handleOffTopic);      // NEW
    workflow.addNode('validate', validate);
    workflow.addNode('analyzeIntent', analyzeIntent);
    // ... other existing nodes

    // NEW WORKFLOW: Start with topic guardrail
    workflow.addEdge("__start__", "topicGuardrail" as any);
    workflow.addConditionalEdges("topicGuardrail" as any, router);
    workflow.addConditionalEdges("handleOffTopic" as any, router);
    // ... other edges

    return workflow.compile();
  }

  3. Smart Clarification Handling

  The system includes intelligent clarification bypass logic to prevent
  blocking legitimate follow-up responses:

  // In topicGuardrail function:
  if (userQuery.length < 10) {
    return {
      isTopicAllowed: true,
      isClarificationResponse: true  // Bypass guardrail for short
  responses
    };
  }

  This prevents blocking responses like:
  - "Singapore" (answering "Which country?")
  - "Yes" (confirming business setup)
  - "Sole proprietorship" (answering business structure question)

  4. Integration with Existing Systems

  Security Preservation

  The guardrail system maintains all existing security:
  - User context validation still mandatory
  - RLS enforcement unchanged
  - Authentication via Clerk middleware preserved

  Error Handling

  try {
    // LLM classification logic
  } catch (error) {
    console.error('[TopicGuardrail] Error during topic classification:',
  error);
    // Fail open - allow by default on errors to avoid blocking
  legitimate queries
    return {
      isTopicAllowed: true,
      isClarificationResponse: false
    };
  }

  5. Multi-Language Support

  The system provides professional rejection messages in 3 languages:
  - English: Full business capability description
  - Thai: Native Thai explanation of financial co-pilot capabilities
  - Indonesian: Bahasa Indonesia business assistance explanation

  6. Testing Implementation

  I created a comprehensive test suite (test-guardrail.js) with test
  cases:

  const testCases = [
    {
      name: 'On-topic Financial Query',
      message: 'What are the GST registration requirements for
  Singapore?',
      expectedResult: 'ALLOWED'
    },
    {
      name: 'Off-topic Query',
      message: 'What is the weather like today?',
      expectedResult: 'BLOCKED'
    },
    {
      name: 'Short Clarification Response',
      message: 'Yes',
      expectedResult: 'CLARIFICATION'
    }
  ];

  7. Key Benefits of This Implementation

  1. Mandatory Topic Validation: Every query goes through classification
  before processing
  2. Intelligent Bypass: Clarification responses don't get blocked
  inappropriately
  3. Professional UX: Multi-language rejection messages maintain
  professional tone
  4. Zero Breaking Changes: Existing functionality for financial queries
  unchanged
  5. Fail-Safe Design: Errors default to allowing queries (fail open) to
  avoid blocking legitimate users
  6. Performance Optimized: Single LLM call for classification, minimal
  overhead