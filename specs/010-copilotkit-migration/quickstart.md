# Quickstart: CopilotKit Agent Migration

**Feature**: 010-copilotkit-migration
**Date**: 2026-02-11

## Prerequisites

- Node.js 20.x
- npm (package manager)
- Running Convex dev server (`npx convex dev`)
- `GEMINI_API_KEY` in `.env.local`
- Clerk authentication configured

## Setup

### 1. Install CopilotKit Dependencies

```bash
npm install @copilotkit/runtime @copilotkit/react-core @copilotkit/react-ui @copilotkit/sdk-js
```

### 2. Add Environment Variables

Ensure these exist in `.env.local`:

```bash
# Already present
GEMINI_API_KEY=your-gemini-api-key

# New (if needed for CopilotKit)
NEXT_PUBLIC_COPILOTKIT_ENDPOINT=/api/copilotkit
```

### 3. Start Development

```bash
# Terminal 1: Convex dev server
npx convex dev

# Terminal 2: Next.js dev server
npm run dev
```

### 4. Verify

1. Navigate to `http://localhost:3000/en/ai-assistant`
2. You should see the CopilotKit-powered chat interface
3. Send a test message: "What is the total team expense for January 2026?"
4. Verify streaming response, citations, and conversation persistence

## Key Files

| File | Purpose |
|------|---------|
| `src/app/api/copilotkit/route.ts` | CopilotKit runtime endpoint |
| `src/domains/chat/components/copilot-provider.tsx` | CopilotKit provider wrapper |
| `src/domains/chat/components/copilot-chat.tsx` | Main chat component (headless UI) |
| `src/domains/chat/components/message-renderer.tsx` | Custom message rendering |
| `src/domains/chat/hooks/use-copilot-chat.ts` | CopilotKit ↔ Convex bridge |
| `src/lib/ai/copilotkit-adapter.ts` | LangGraph → CopilotKit adapter |

## Architecture Overview

```
Browser                          Server (Next.js)
┌─────────────────┐             ┌──────────────────────────────┐
│ CopilotKit       │   POST     │ /api/copilotkit/route.ts     │
│ Provider         │ ────────── │   ├─ Clerk auth              │
│   └─ useCopilot  │   SSE      │   ├─ Rate limiting           │
│      Chat hook   │ ◄───────── │   ├─ CopilotRuntime          │
│                  │            │   │   └─ GoogleGenAIAdapter   │
│ Custom UI        │            │   └─ LangGraph Agent          │
│   ├─ Messages    │            │       ├─ Topic Guardrail      │
│   ├─ Citations   │            │       ├─ Intent Analysis      │
│   ├─ Sidebar     │            │       ├─ Tool Execution       │
│   └─ Input       │            │       │   ├─ MCP Tools (AWS)  │
│                  │            │       │   ├─ RAG (Qdrant)     │
│ Convex Client    │            │       │   └─ Data Tools       │
│   └─ Real-time   │ ◄──────── │       └─ Response + Citations │
│      subscriptions│  Convex   │                               │
└─────────────────┘  sync      └──────────────────────────────┘
```

## Troubleshooting

| Issue | Solution |
|-------|---------|
| "Cannot find module @copilotkit/runtime" | Run `npm install` to install new dependencies |
| Chat not loading | Verify `NEXT_PUBLIC_COPILOTKIT_ENDPOINT` is set in `.env.local` |
| Messages not persisting | Check Convex dev server is running (`npx convex dev`) |
| Agent not responding | Verify `GEMINI_API_KEY` is valid and model `gemini-3-flash-preview` is accessible |
| Citations not rendering | Check that the agent response includes citation metadata in the expected format |
| Rate limit errors | Wait for the 1-hour window to reset, or increase the limit for development |
