# API Contracts: Gemini Migration + DSPy Self-Improving Chat Agent

## 1. Chat API (Existing — Modified)

**Route**: `POST /api/chat` (existing Next.js API route)
**Change**: No API contract change. Internal model endpoint swaps from Modal/Qwen to Gemini.

## 2. Correction Submission API (New)

**Route**: `POST /api/chat/correction`

### Request
```typescript
{
  messageId: string;            // ID of the message being corrected
  conversationId: string;       // Conversation context
  correctionType: "intent" | "tool_selection" | "parameter_extraction";

  // For intent corrections
  correctedIntent?: "personal_data" | "general_knowledge" | "other";

  // For tool selection corrections
  correctedToolName?: string;   // e.g., "get_ap_aging"

  // For parameter corrections
  correctedParameters?: Record<string, unknown>;
}
```

### Response
```typescript
{
  success: boolean;
  correctionId: string;         // Convex document ID
}
```

## 3. Convex Mutations (New)

### `chat_agent_corrections.submit`
**Type**: `mutation` (frontend-facing)
**Auth**: Clerk authenticated user

```typescript
args: {
  messageId: v.optional(v.string()),
  conversationId: v.optional(v.string()),
  correctionType: v.union(
    v.literal("intent"),
    v.literal("tool_selection"),
    v.literal("parameter_extraction")
  ),
  originalQuery: v.string(),
  originalIntent: v.optional(v.string()),
  originalToolName: v.optional(v.string()),
  originalParameters: v.optional(v.string()),
  correctedIntent: v.optional(v.string()),
  correctedToolName: v.optional(v.string()),
  correctedParameters: v.optional(v.string()),
}
```

## 4. Convex Internal Queries (New)

### `chatOptimization.getCorrectionsReadyForTraining`
**Type**: `internalQuery`

```typescript
args: {
  correctionType: v.string(),
  minCount: v.number(),
}
returns: {
  corrections: Array<ChatAgentCorrection>;
  totalCount: number;
  uniqueQueries: number;
  latestCorrectionId: string;
}
```

### `chatOptimization.getActiveModelVersion`
**Type**: `internalQuery`

```typescript
args: {
  domain: v.string(),  // "chat_intent" | "chat_tool_selector" | etc.
}
returns: {
  version: number;
  optimizedPrompt: string;  // JSON-serialized prompt + few-shot examples
  accuracy: number;
  trainedAt: number;
} | null
```

## 5. DSPy Lambda Tools (New — Added to Existing Lambda)

### `optimize_chat_module`
**Lambda**: `finanseal-dspy-optimizer` (existing)
**Invocation**: Convex cron → MCP tool call

```python
# Request
{
  "name": "optimize_chat_module",
  "arguments": {
    "moduleType": "intent" | "tool_selector" | "param_extractor" | "response_quality" | "clarification",
    "corrections": [...],           # Array of correction objects
    "currentModelS3Key": str | None,
    "optimizerType": "miprov2" | "bootstrap_fewshot" | "simba" | "knn_fewshot" | "better_together",
    "validationSplit": 0.2,         # Hold-out validation set ratio
  }
}

# Response
{
  "success": true,
  "optimizedPrompt": "...",         # JSON-serialized prompt + few-shot examples
  "accuracy": 0.95,
  "previousAccuracy": 0.82,
  "trainingExamples": 150,
  "validationAccuracy": 0.93,
  "rejected": false,                # True if new model worse than previous
  "s3Key": "dspy-models/chat_intent/v3.json",
}
```

## 6. TypeScript Model Version Loader (New)

### Interface for LangGraph nodes

```typescript
// Loaded by intent-node.ts, model-node.ts at initialization
interface OptimizedModuleConfig {
  domain: string;
  version: number;
  systemPrompt: string;           // Optimized system prompt from DSPy training
  fewShotExamples: Array<{
    query: string;
    expectedOutput: Record<string, unknown>;
  }>;
  trainedAt: number;
}

// Loader function
async function loadOptimizedConfig(domain: string): Promise<OptimizedModuleConfig | null>
```
