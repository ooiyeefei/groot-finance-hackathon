# Data Model: Gemini Migration + DSPy Self-Improving Chat Agent

**Branch**: `027-gemini-dspy-chat-agent` | **Date**: 2026-03-19

## New Tables

### `chat_agent_corrections`

Stores user corrections for chat agent behavior — intent misclassification, tool selection errors, parameter extraction errors. Global pool across all businesses for DSPy training.

```typescript
chat_agent_corrections: defineTable({
  businessId: v.id("businesses"),           // Retained for audit, not used for model isolation
  messageId: v.optional(v.string()),        // ID of the chat message being corrected
  conversationId: v.optional(v.string()),   // Conversation context

  // What went wrong
  correctionType: v.string(),               // "intent" | "tool_selection" | "parameter_extraction"

  // Original (wrong) output
  originalQuery: v.string(),                // The user's original message
  originalIntent: v.optional(v.string()),   // e.g., "general_knowledge" (for intent corrections)
  originalToolName: v.optional(v.string()), // e.g., "search_documents" (for tool corrections)
  originalParameters: v.optional(v.string()), // JSON string of wrong parameters

  // Corrected (right) output
  correctedIntent: v.optional(v.string()),    // e.g., "personal_data"
  correctedToolName: v.optional(v.string()),  // e.g., "get_ap_aging"
  correctedParameters: v.optional(v.string()), // JSON string of correct parameters

  // Metadata
  createdBy: v.string(),                    // Clerk user ID
  createdAt: v.number(),                    // Unix timestamp
  consumed: v.optional(v.boolean()),        // Whether this correction has been used in training
  consumedAt: v.optional(v.number()),       // When consumed by optimization
})
  .index("by_correctionType", ["correctionType"])
  .index("by_createdAt", ["createdAt"])
  .index("by_consumed", ["consumed"])
  .index("by_businessId", ["businessId"]),
```

**Follows existing pattern from**: `fee_classification_corrections`, `bank_recon_corrections`

### Extended: `dspy_model_versions`

The existing `dspy_model_versions` table already supports multiple domains via the `domain` field. New domain values:

| Domain Value | Module | Description |
|---|---|---|
| `chat_intent` | Intent Classifier | Optimized intent classification prompt + few-shot examples |
| `chat_tool_selector` | Tool Selector | Optimized tool selection prompt + few-shot examples |
| `chat_param_extractor` | Parameter Extractor | Optimized parameter extraction prompt + few-shot examples |
| `chat_response_quality` | Response Quality | Optimized response comparison prompt |
| `chat_clarification` | Clarification Judge | Optimized clarification trigger prompt |

**New field needed**:
```typescript
// Add to existing dspy_model_versions table
optimizedPrompt: v.optional(v.string()),    // JSON-serialized optimized prompt + few-shot examples
                                            // Small enough for Convex (< 10KB per version)
                                            // Loaded by TypeScript nodes at inference time
```

### Extended: `dspy_optimization_runs`

No schema changes needed — existing table supports any `platform` string. New platform values for chat modules will be: `chat_intent`, `chat_tool_selector`, `chat_param_extractor`, `chat_response_quality`, `chat_clarification`.

## Entity Relationships

```
chat_agent_corrections ──(consumed by)──> dspy_optimization_runs
                                              │
                                              ▼
                                    dspy_model_versions (new domain values)
                                              │
                                              ▼
                                    TypeScript LangGraph nodes (load at inference)
```

## Existing Tables Referenced (No Changes)

| Table | Used For |
|---|---|
| `messages` | Chat message storage (adding correctionId link optional) |
| `businesses` | Business context for corrections |
| `business_memberships` | RBAC role lookup for tool filtering |
| `fee_classification_corrections` | Existing DSPy training data (unchanged) |
| `bank_recon_corrections` | Existing DSPy training data (unchanged) |

## State Transitions

### Chat Correction Lifecycle
```
Created (user submits correction)
  → consumed=false
  → Optimization cron picks up
  → consumed=true, consumedAt=timestamp
```

### DSPy Model Version Lifecycle (existing)
```
training → Optimization runs
  → success → active (previous version → archived)
  → failure → failed (previous version remains active)
```

**Automatic quality gating** (per clarification Q4): If new model accuracy < previous model accuracy on held-out validation set, the new model is marked `failed` and the previous version remains `active`.
