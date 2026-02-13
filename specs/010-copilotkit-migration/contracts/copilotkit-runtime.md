# API Contract: CopilotKit Runtime Endpoint

**Feature**: 010-copilotkit-migration
**Date**: 2026-02-11

## Endpoint

`POST /api/copilotkit`

## Description

CopilotKit runtime endpoint that handles all agent communication. Replaces the old `/api/v1/chat` endpoint. This endpoint is called by CopilotKit's frontend SDK (`CopilotKit` provider) and handles message streaming, tool execution, and agent state management.

## Authentication

- **Method**: Clerk session token (extracted via `@clerk/nextjs`)
- **Header**: `Authorization: Bearer <clerk-session-token>` (managed automatically by CopilotKit provider)
- **Rate Limit**: 30 messages per hour per user

## Request

CopilotKit manages the request format internally via its protocol. The endpoint receives CopilotKit's internal JSON-RPC-like messages. Developers do not construct these requests manually — the `CopilotKit` React provider handles communication.

## Response

CopilotKit manages the response format internally. Responses are streamed (Server-Sent Events) for real-time token delivery to the UI.

## Runtime Configuration

```typescript
// src/app/api/copilotkit/route.ts
import {
  CopilotRuntime,
  GoogleGenerativeAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";

const serviceAdapter = new GoogleGenerativeAIAdapter({
  model: "gemini-3-flash-preview",
  apiKey: process.env.GEMINI_API_KEY,
});

const runtime = new CopilotRuntime();

export const POST = async (req: NextRequest) => {
  // 1. Authenticate via Clerk
  // 2. Rate limit check (30/hour/user)
  // 3. Extract UserContext (userId, businessId, role)
  // 4. Pass to CopilotKit runtime
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });
  return handleRequest(req);
};
```

## Preserved Endpoints

The following endpoints are retained (not CopilotKit-specific):

### `GET /api/v1/chat/citation-preview`

Proxies government PDF documents for citation display. This endpoint remains because it serves a distinct purpose (PDF proxying with domain validation) separate from the chat agent.

**Note**: May be renamed to `/api/v1/citations/preview` for clarity since it's no longer under the `/chat` namespace.

## Removed Endpoints

| Old Endpoint | Replacement |
|-------------|-------------|
| `POST /api/v1/chat` | `POST /api/copilotkit` (via CopilotKit protocol) |
| `GET/POST /api/v1/chat/conversations` | Convex queries via `useConversations()` hook (direct client access) |
| `GET /api/v1/chat/conversations/[id]` | Convex query via `useMessages()` hook |
| `POST /api/v1/chat/warmup` | Not needed — CopilotKit manages connection lifecycle |
| `DELETE /api/v1/chat/messages/[id]` | Convex mutation via `useDeleteMessage()` hook |

## Error Handling

| Error | Status | Behavior |
|-------|--------|----------|
| Unauthenticated | 401 | CopilotKit returns auth error; UI shows login prompt |
| Rate limited | 429 | Agent responds with rate limit message; UI disables input temporarily |
| Agent failure | 500 | CopilotKit returns error; UI shows "Something went wrong" with retry option |
| MCP unavailable | 200 | Agent degrades gracefully (handled internally); response indicates limited analytics |
| Qdrant unavailable | 200 | RAG queries return empty; agent responds with limited compliance info |
