# Research: CopilotKit Agent Migration

**Feature**: 010-copilotkit-migration
**Date**: 2026-02-11

## R1: CopilotKit Runtime Integration with Custom TypeScript LangGraph Agent

### Decision
Use `@copilotkit/runtime` with `GoogleGenerativeAIAdapter` for the service adapter, and expose the existing LangGraph agent via a custom adapter that bridges the agent's `createFinancialAgent()` with CopilotKit's runtime expectations. The runtime endpoint lives at `/api/copilotkit/route.ts`.

### Rationale
- CopilotKit's `LangGraphAgent` class in the JS runtime (`@copilotkit/runtime`) expects a LangGraph Platform deployment URL or a remote endpoint — our agent runs in-process in Next.js.
- Instead of deploying to LangGraph Platform (which would add infrastructure complexity), we use CopilotKit's runtime directly with `GoogleGenerativeAIAdapter` for the LLM layer, and bridge the LangGraph agent via the `useCoAgent` hook or by handling the agent invocation within the runtime's action system.
- Alternative approach: Use `copilotRuntimeNextJSAppRouterEndpoint` with a custom agent handler that invokes our `createFinancialAgent()` directly, passing through CopilotKit's message format.

### Alternatives Considered
1. **LangGraph Platform deployment**: Would require deploying the agent as a separate service on LangGraph Cloud. Rejected because: adds infrastructure cost, deployment complexity, and violates the in-process constraint.
2. **Python CopilotKitRemoteEndpoint**: Would require porting the agent adapter to Python. Rejected because: the agent is TypeScript, and this adds a language boundary.
3. **HttpAgent wrapper**: Expose the existing `/api/v1/chat` route as an `HttpAgent` to CopilotKit. Rejected because: the old route is being deleted (big-bang migration), and the response format doesn't match CopilotKit's protocol.

## R2: CopilotKit LLM Adapter for Gemini 3 Flash Preview

### Decision
Use `GoogleGenerativeAIAdapter` from `@copilotkit/runtime` with model `gemini-3-flash-preview` and the existing `GEMINI_API_KEY` environment variable.

### Rationale
- CopilotKit natively provides `GoogleGenerativeAIAdapter` which wraps `@google/generative-ai` SDK.
- Our codebase already uses `@google/genai` (v1.19.0) for Gemini integration — CopilotKit's adapter may use its own dependency, which is fine since they're compatible.
- The adapter handles streaming, tool calling, and message formatting for Gemini models.
- However: The LangGraph agent already manages its own LLM calls internally (in the `callModel` node via `ChatGoogleGenerativeAI`). The `GoogleGenerativeAIAdapter` is for CopilotKit's own LLM needs (e.g., frontend actions, suggestions). The agent's internal LLM usage remains unchanged.

### Alternatives Considered
1. **OpenAIAdapter with Gemini-compatible endpoint**: Use OpenAI-compatible API wrapper. Rejected because: CopilotKit provides a native Gemini adapter.
2. **ExperimentalEmptyAdapter**: Use when the LLM is fully managed by the agent. Viable fallback if `GoogleGenerativeAIAdapter` causes issues — the agent handles its own LLM calls.

## R3: CopilotKit Headless UI Approach

### Decision
Use `useCopilotChat` hook from `@copilotkit/react-core` for the headless chat interface. This provides `visibleMessages`, `appendMessage`, `isLoading`, `stopGeneration`, and `deleteMessage` — sufficient to build the custom UI.

### Rationale
- The `useCopilotChat` hook gives full control over message rendering, which is essential for our custom citation overlay, markdown rendering, and FinanSEAL design system styling.
- CopilotKit's built-in `CopilotChat` or `CopilotSidebar` components offer customization via props (AssistantMessage, UserMessage, Messages), but our UI requirements (conversation sidebar, citation overlays, warmup loading) go beyond what these built-in components support out of the box.
- The headless approach also lets us maintain our Convex-based conversation persistence as a parallel data store — CopilotKit manages the active session messages, while we sync to Convex for history.

### Alternatives Considered
1. **CopilotChat with custom components**: Use CopilotKit's built-in chat with custom `AssistantMessage` and `Messages` props. Partially viable but doesn't support our conversation sidebar or citation overlay without significant wrapping.
2. **useCoAgent hook**: Provides bidirectional state sync with the LangGraph agent. More powerful but more complex — better suited if we need to render intermediate agent state in the UI. May be adopted later for showing agent "thinking" steps.

## R4: Convex Conversation Persistence Bridge

### Decision
Maintain Convex as the source of truth for conversation history. CopilotKit's `useCopilotChat` manages the active session's message state, while a bridge hook syncs messages to/from Convex:
- On conversation load: Fetch messages from Convex, populate CopilotKit's message state via `setMessages`.
- On new message: CopilotKit handles the streaming response; after completion, persist both user message and assistant response to Convex.
- On conversation switch: Clear CopilotKit state, load new conversation from Convex.

### Rationale
- Convex provides real-time subscriptions for cross-tab sync — CopilotKit's internal state is per-tab.
- Existing conversation data in Convex must remain accessible (per FR-017).
- The bridge pattern is clean: CopilotKit handles the "active" session, Convex handles persistence and cross-device access.

### Alternatives Considered
1. **CopilotKit-only storage**: Let CopilotKit manage all message state, abandon Convex for chat. Rejected because: loses real-time cross-tab sync, loses existing conversation history, and diverges from the rest of the app's data layer.
2. **Convex-only, bypass CopilotKit message state**: Use CopilotKit only for agent communication, render messages from Convex. Rejected because: loses CopilotKit's streaming state management and would require reimplementing streaming logic.

## R5: Citation Rendering in CopilotKit Messages

### Decision
Parse citation markers from the agent's response text (superscript markers like `^1`, `^2`) during message rendering. The existing `CitationOverlay` component is retained as-is. Citation metadata is passed through the CopilotKit message's metadata field or extracted from the agent response's structured data.

### Rationale
- The LangGraph agent returns citations as part of its response metadata (the `citations` array in AgentState). These need to be associated with the rendered message.
- CopilotKit's `visibleMessages` include the message content as text — we parse citation markers in our custom `MessageRenderer` component and attach click handlers that open the `CitationOverlay`.
- The citation-preview API route (`/api/v1/chat/citation-preview`) should be preserved for PDF proxying (it's not chat-specific).

### Alternatives Considered
1. **CopilotKit's generativeUI**: Use CopilotKit's generative UI feature to render citations as React components from the agent. More native but requires agent changes (violates SC-008).
2. **Custom message metadata**: Store citations in CopilotKit's message metadata and parse on render. This is compatible with our approach.

## R6: Rate Limiting Strategy

### Decision
Apply rate limiting at the CopilotKit runtime endpoint (`/api/copilotkit/route.ts`), maintaining the existing 30 messages/hour/user limit. Extract user identity from Clerk auth in the request handler before passing to CopilotKit runtime.

### Rationale
- The current rate limiting is applied in `/api/v1/chat/route.ts` before the agent is invoked. The same pattern applies to the new CopilotKit endpoint.
- CopilotKit's `copilotRuntimeNextJSAppRouterEndpoint` returns a `handleRequest` function — we wrap it with rate limiting middleware before calling it.

### Alternatives Considered
1. **Rate limit inside the agent**: Apply limits within the LangGraph graph nodes. Rejected because: violates SC-008 (no agent changes).
2. **Middleware-based**: Use Next.js middleware for rate limiting. Rejected because: middleware runs on the edge and may not have access to Convex/Clerk for rate counting.

## R7: MCP and RAG Integration Unchanged

### Decision
The MCP server integration (Category 3 MCP on AWS Lambda) and RAG pipeline (Qdrant Cloud) remain completely unchanged. They are invoked from within the LangGraph agent's tool execution nodes, which are not modified by this migration.

### Rationale
- SC-008 explicitly requires zero changes to the LangGraph agent logic, MCP server, or Qdrant knowledge base.
- CopilotKit wraps the agent at the runtime level — the agent's internal tool calls (MCP, Qdrant, Mem0) are transparent to CopilotKit.
- CopilotKit does offer its own MCP integration via `createMCPClient`, but this is for exposing MCP tools to CopilotKit's frontend — not needed here since our tools are server-side only.

### Alternatives Considered
1. **CopilotKit MCP integration**: Expose MCP tools via CopilotKit's `createMCPClient`. Rejected because: would duplicate tool management and risk inconsistency with the agent's tool routing.
