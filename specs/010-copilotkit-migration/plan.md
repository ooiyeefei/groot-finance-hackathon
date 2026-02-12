# Implementation Plan: CopilotKit Agent Migration

**Branch**: `010-copilotkit-migration` | **Date**: 2026-02-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-copilotkit-migration/spec.md`

## Summary

Migrate the AI assistant domain from a custom LangGraph + Next.js API route architecture to a CopilotKit-powered **global floating chat widget**. The existing TypeScript LangGraph agent (8-node StateGraph) will be wrapped by `@copilotkit/runtime` in-process within Next.js, using `GoogleGenerativeAIAdapter` for Gemini 3 Flash Preview. The old chat UI, API routes (`/api/v1/chat`), service layer, and `/ai-assistant` page will be completely removed. The new UI is a floating button (bottom-right, every page) that opens an expandable chat window with adaptive rich content rendering — simple results inline, complex visualizations (charts, dashboards) in an expanded panel. Existing Convex conversation history is preserved. CopilotKit provider wraps the root layout for global availability.

## Technical Context

**Language/Version**: TypeScript 5.9.3 / Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, @copilotkit/runtime (new), @copilotkit/react-core (new), @copilotkit/react-ui (new), @copilotkit/sdk-js (new), @langchain/langgraph 0.4.5, Convex 1.31.3, Clerk 6.30.0
**Storage**: Convex (conversations, messages), Qdrant Cloud (RAG embeddings), Mem0 (conversation memory)
**Testing**: Manual integration testing with role-based personas (manager, finance admin, employee)
**Target Platform**: Vercel (Next.js SSR/SSG), AWS Lambda (MCP server)
**Project Type**: Web application (Next.js full-stack)
**Performance Goals**: Streaming response latency parity with current implementation; 30+ concurrent users
**Constraints**: Gemini 3 Flash Preview as primary LLM; in-process JS runtime (no separate agent service); zero changes to LangGraph agent internals, MCP server, or Qdrant knowledge base
**Scale/Scope**: ~12 files to create, ~3 files to modify, ~18 files to delete (old chat domain + ai-assistant page)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution file is an unfilled template — no project-specific gates are defined. Proceeding with standard engineering best practices:
- Prefer modification over creation (per CLAUDE.md)
- Use semantic design tokens (per CLAUDE.md)
- Maintain existing patterns where possible
- Build must pass before completion

## Project Structure

### Documentation (this feature)

```text
specs/010-copilotkit-migration/
├── plan.md              # This file
├── research.md          # Phase 0: CopilotKit integration research
├── data-model.md        # Phase 1: Entity model (unchanged from current)
├── quickstart.md        # Phase 1: Developer setup guide
├── contracts/           # Phase 1: API contracts
│   └── copilotkit-runtime.md  # CopilotKit runtime endpoint contract
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# Files to CREATE (new CopilotKit integration)
src/app/api/copilotkit/route.ts                    # CopilotKit runtime endpoint
src/domains/chat/components/chat-widget.tsx         # Floating chat button + expandable window
src/domains/chat/components/chat-window.tsx         # Chat window content (messages, input, header)
src/domains/chat/components/copilot-provider.tsx    # CopilotKit provider wrapper (global)
src/domains/chat/components/message-renderer.tsx    # Custom message rendering (markdown + citations)
src/domains/chat/components/rich-content-panel.tsx  # Expandable panel for charts/dashboards
src/domains/chat/components/conversation-switcher.tsx  # Minimal conversation picker (dropdown/list)
src/domains/chat/hooks/use-copilot-chat.ts         # Bridge hook: CopilotKit ↔ Convex sync
src/lib/ai/copilotkit-adapter.ts                   # Adapter: wraps LangGraph agent for CopilotKit

# Files to MODIFY (integrate CopilotKit globally)
src/app/[locale]/layout.tsx                        # Add CopilotKit provider + ChatWidget to root layout
src/domains/chat/components/citation-overlay.tsx    # Retain as-is (pure UI component)
src/domains/chat/hooks/use-realtime-chat.ts        # Adapt: sync CopilotKit messages → Convex

# Files to DELETE (old chat implementation)
src/app/[locale]/ai-assistant/page.tsx             # Old AI assistant page (replaced by floating widget)
src/app/api/v1/chat/route.ts                       # Old chat endpoint
src/app/api/v1/chat/conversations/route.ts          # Old conversations endpoint
src/app/api/v1/chat/conversations/[conversationId]/route.ts  # Old conversation detail
src/app/api/v1/chat/warmup/route.ts                 # Old warmup endpoint
src/app/api/v1/chat/messages/[messageId]/route.ts   # Old message deletion
src/app/api/v1/chat/citation-preview/route.ts       # Keep if still needed for PDF proxy
src/domains/chat/lib/chat.service.ts                # Old service layer
src/domains/chat/components/chat-interface.tsx       # Old chat UI component
src/domains/chat/components/chat-interface-client.tsx  # Old client wrapper
src/domains/chat/components/conversation-sidebar.tsx   # Old full sidebar (replaced by minimal switcher)
src/domains/chat/components/warmup-loading.tsx         # Old warmup overlay
```

**Structure Decision**: Reuse existing `src/domains/chat/` directory structure for new widget components. Add the CopilotKit provider to the root layout (`src/app/[locale]/layout.tsx`) for global availability. The floating `ChatWidget` renders in the root layout, visible on every page. The `/ai-assistant` page route is deleted. The LangGraph agent (`src/lib/ai/`) remains untouched.

## Complexity Tracking

No constitution violations to justify.
