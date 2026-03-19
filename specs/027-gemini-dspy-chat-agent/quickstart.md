# Quickstart: Gemini Migration + DSPy Self-Improving Chat Agent

## Prerequisites

- `GEMINI_API_KEY` in `.env.local` (already exists for other DSPy features)
- Convex dev environment running
- Access to `finanseal-bucket` S3 bucket

## Environment Variables

### Changed
```bash
# REMOVE these (no longer needed for chat):
# CHAT_MODEL_ENDPOINT_URL=https://...modal.run
# CHAT_MODEL_MODEL_ID=qwen3-8b
# CHAT_MODEL_API_KEY=...

# Chat now uses GEMINI_API_KEY (already set for DSPy features)
# No new env vars needed
```

### ai-config.ts Changes
The `chat` config section changes from:
```typescript
chat: {
  endpointUrl: process.env.CHAT_MODEL_ENDPOINT_URL,
  modelId: process.env.CHAT_MODEL_MODEL_ID,
  apiKey: process.env.CHAT_MODEL_API_KEY,
}
```
To:
```typescript
chat: {
  endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  modelId: 'gemini-3.1-flash-lite-preview',
  apiKey: process.env.GEMINI_API_KEY,
}
```

## Verification Steps

1. **Chat basic response**: Send "Hello" → should respond within 2s
2. **Intent classification**: Send "Show me my invoices" → should classify as personal_data and call get_invoices tool
3. **General knowledge**: Send "What is GST?" → should classify as general_knowledge and respond without tool
4. **Cold start**: Wait 30 min, send query → should still respond within 6s (no Modal cold start)
5. **Correction UI**: Click thumbs-down on a response → dropdown should appear with correction types
6. **Build check**: `npm run build` must pass

## Key Files Modified

```
src/lib/ai/config/ai-config.ts              # Gemini endpoint config
src/lib/ai/agent/nodes/intent-node.ts        # DSPy-optimized intent classification
src/lib/ai/agent/nodes/model-node.ts         # Gemini API calls
src/lib/ai/agent/nodes/guardrail-nodes.ts    # Gemini for topic guardrail
src/lib/ai/agent/config/prompts.ts           # Updated system prompts
src/domains/chat/components/                  # Correction UI (thumbs-down + dropdown)
convex/schema.ts                              # chat_agent_corrections table
convex/functions/chatOptimization.ts          # New optimization pipeline
convex/crons.ts                               # New Sunday cron jobs
src/lambda/fee-classifier-python/             # New DSPy chat modules
```
