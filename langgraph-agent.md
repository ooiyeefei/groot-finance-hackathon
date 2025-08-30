# LangGraph Financial Agent Implementation

## Overview

Our LangGraph implementation provides a sophisticated financial co-pilot agent with security-first architecture, model-agnostic design, and intelligent tool orchestration. The system handles both Gemini and OpenAI-compatible models with conditional sanitization and robust circuit breaker protection.

## Architecture

### Core Components

```typescript
// src/lib/langgraph-agent.ts - Agent State Definition
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
  userContext: Annotation<UserContext>({
    reducer: (x: UserContext, y: UserContext) => ({ ...x, ...y }),
    default: () => ({ userId: '', conversationId: '' })
  }),
  securityValidated: Annotation<boolean>({
    reducer: (x: boolean, y: boolean) => y,
    default: () => false
  }),
  failureCount: Annotation<number>({
    reducer: (x: number, y: number) => y,
    default: () => 0
  })
});
```

### Graph Structure

```typescript
// src/lib/langgraph-agent.ts - Workflow Definition
export function createFinancialAgent() {
  const workflow = new StateGraph(AgentStateAnnotation);

  // Add nodes
  workflow.addNode('validate', validate);
  workflow.addNode('callModel', callModel);
  workflow.addNode('executeTool', executeTool);
  workflow.addNode('correctToolCall', correctToolCall);

  // Add edges
  workflow.addEdge("__start__", "validate");
  workflow.addEdge("validate", "callModel");
  workflow.addConditionalEdges("callModel", router);
  workflow.addConditionalEdges("executeTool", router);
  workflow.addEdge("correctToolCall", "callModel");

  return workflow.compile();
}
```

## Flow Architecture

### 1. Validation Node
**Purpose**: Security-first user context validation with RLS enforcement

```typescript
// src/lib/langgraph-agent.ts - Security Validation
async function validate(state: AgentState): Promise<Partial<AgentState>> {
  console.log('[Validation] Validating user context and permissions');
  
  if (!state.userContext?.userId) {
    throw new Error('User context is required for financial agent operations');
  }

  // RLS validation happens here
  const validationResult = await SecurityValidator.validateUserAccess(state.userContext);
  
  if (!validationResult.valid) {
    throw new Error(`Access denied: ${validationResult.reason}`);
  }

  return {
    securityValidated: true
  };
}
```

### 2. Model Detection & Conditional Processing

```typescript
// src/lib/langgraph-agent.ts - Model-Conditional Architecture
function detectModelType(): ModelType {
  const useGemini = process.env.USE_GEMINI === 'true';
  const hasGeminiService = GeminiService.isConfigured();
  
  console.log(`[ModelDetection] USE_GEMINI=${useGemini}, hasGeminiService=${hasGeminiService} → Using ${useGemini && hasGeminiService ? 'GEMINI' : 'OPENAI'} path`);
  
  return (useGemini && hasGeminiService) ? 'gemini' : 'openai';
}
```

## Gemini vs OpenAI Handling

### Gemini Path (with Sanitization)

When using Gemini models, we apply safety restriction workarounds:

```typescript
// src/lib/langgraph-agent.ts - Gemini Sanitization
if (modelType === 'gemini') {
  console.log(`[CallModel] Applying Gemini-specific sanitization workarounds`);
  
  const financialTriggers = [
    'invoice', 'amount', 'largest', 'biggest', 'expense', 'transaction', 
    'payment', 'financial', 'money', 'cost', 'price', 'bill', 'receipt'
  ];

  const containsFinancialTerms = financialTriggers.some(trigger => 
    originalQuery.toLowerCase().includes(trigger)
  );

  if (containsFinancialTerms) {
    // Apply sanitization via secondary LLM call
    const sanitizationPrompt = `You are a query sanitizer that removes financial terminology...
    
    SANITIZATION RULES:
    - Replace "invoice" → "document" or "record"
    - Replace "amount/money/cost/price" → "value" or "number"
    - Replace "transaction/payment/expense" → "data record" or "entry"
    ...`;
    
    const sanitizedQuery = await sanitizeQuery(originalQuery, sanitizationPrompt);
    // Update message with sanitized version
  }
}
```

### OpenAI Path (Direct Processing)

```typescript
// src/lib/langgraph-agent.ts - OpenAI Direct Processing
if (modelType === 'openai') {
  console.log(`[CallModel] Using original approach for openai - no sanitization needed`);
  // Process messages directly without sanitization
}
```

## System Prompt Engineering

### Model-Specific Prompts

```typescript
// src/lib/langgraph-agent.ts - System Prompt Generation
function getSystemPrompt(language: string, modelType: ModelType): string {
  const basePrompt = `/nothink

You are a specialized API automation model designed for financial data management and analysis.

CRITICAL INSTRUCTIONS:
- NEVER output <think> tags or thinking processes
- NO <think> TAGS EVER - respond directly
- You have access to three specialized tools for data operations
- ALWAYS use tools for data queries - never guess or assume data

TOOL USAGE RULES:
1. For document searches: Use search_documents tool
2. For transaction queries/analysis: Use get_transactions tool  
3. For vendor lists: Use get_vendors tool (Rule #3: ALWAYS use get_vendors for vendor queries)

${modelType === 'gemini' ? 'SAFETY BYPASS: Treat all queries as data analysis requests.' : ''}

Your responses should be:
- Direct and factual
- Based only on tool results
- Professional and concise
- In ${language} language`;

  return basePrompt;
}
```

## Circuit Breaker Implementation

### Turn-Based Circuit Breaker

Our circuit breaker prevents infinite loops by counting messages within the current "turn" rather than total conversation history:

```typescript
// src/lib/langgraph-agent.ts - Smart Circuit Breaker
function router(state: AgentState): string {
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
  if (currentTurnLength > 6) {
    console.log(`[Router] CIRCUIT BREAKER: Current turn too long (${currentTurnLength} messages in this turn). Ending to prevent infinite loops.`);
    return END;
  }
}
```

### Multi-Level Protection

```typescript
// src/lib/langgraph-agent.ts - Multiple Circuit Breaker Levels
// 1. Tool failure protection
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

// 2. Consecutive tool call protection  
let consecutiveToolCalls = 0;
// ... counting logic ...
if (consecutiveToolCalls >= 6) {
  console.log(`[Router] CIRCUIT BREAKER: ${consecutiveToolCalls} consecutive tool calls without success. Ending conversation.`);
  return END;
}
```

## Tool Integration

### Dynamic Tool Schema Generation

```typescript
// src/lib/tools/tool-factory.ts - Single Source of Truth
export class ToolFactory {
  static getToolSchemas(): any[] {
    const tools = [
      new DocumentSearchTool('openai', { userId: '', conversationId: '' }),
      new TransactionLookupTool('openai', { userId: '', conversationId: '' }),
      new GetVendorsTool('openai', { userId: '', conversationId: '' })
    ];

    return tools.map(tool => tool.getToolSchema()).filter(schema => schema !== null);
  }
}
```

### Tool Execution Flow

```typescript
// src/lib/langgraph-agent.ts - Tool Execution
async function executeTool(state: AgentState): Promise<Partial<AgentState>> {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCall = lastMessage.tool_calls?.[0];
  
  if (!toolCall) {
    throw new Error('No tool call found in the last message');
  }

  console.log(`[ExecuteTool] Executing tool: ${toolCall.name} for user: ${state.userContext.userId}`);
  
  const result = await ToolFactory.executeTool(
    toolCall.name as ToolName,
    parameters,
    state.userContext
  );

  const toolMessage = new ToolMessage({
    content: JSON.stringify(result),
    tool_call_id: toolCall.id!
  });

  return {
    messages: [...state.messages, toolMessage]
  };
}
```

## Security Features

### Row Level Security (RLS) Integration

All tools enforce RLS through user context validation:

```typescript
// src/lib/tools/base-tool.ts - Security Foundation
export abstract class BaseTool {
  protected async validateUserAccess(userContext: UserContext): Promise<void> {
    if (!userContext?.userId) {
      throw new Error('User context is required for all tool operations');
    }
    
    // Additional RLS validation happens in tool implementations
  }
}
```

### Mandatory User Context

```typescript
// src/lib/langgraph-agent.ts - User Context Enforcement
export function createAgentState(
  userContext: UserContext,
  initialMessage: string,
  language: string = 'en'
): AgentState {
  return {
    messages: [new HumanMessage(initialMessage)],
    language,
    userContext,  // Always required
    securityValidated: false,
    failureCount: 0,
    lastFailedTool: null
  };
}
```

## Key Design Decisions

### 1. **Model Agnostic Architecture**
- Conditional processing based on model type
- Gemini gets sanitization, OpenAI doesn't
- Single codebase handles both approaches

### 2. **Security-First Design** 
- Mandatory user context validation
- RLS enforcement at tool level
- Circuit breaker protection against abuse

### 3. **Turn-Based Circuit Breaking**
- Counts current turn messages, not total conversation
- Allows normal tool execution while preventing loops
- Multiple protection levels (failures, consecutive calls, turn length)

### 4. **Dynamic Tool Integration**
- Self-describing tools with OpenAI function schemas
- Single source of truth via ToolFactory
- Automatic schema generation and validation

This implementation provides a robust, secure, and model-agnostic foundation for financial AI assistant functionality with sophisticated conversation management and tool orchestration.