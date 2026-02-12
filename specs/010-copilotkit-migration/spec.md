# Feature Specification: CopilotKit Agent Migration

**Feature Branch**: `010-copilotkit-migration`
**Created**: 2026-02-11
**Status**: Draft
**Input**: User description: "Migrate AI assistant domain chat agent to CopilotKit agent with custom UI, integrating existing LangGraph agent, MCP tools, and RAG knowledge base"

## Clarifications

### Session 2026-02-11

- Q: Migration strategy — big-bang replacement vs side-by-side with feature flag vs new route? → A: Big-bang replacement. Remove the old chat UI and `/api/v1/chat` route entirely; replace with CopilotKit-powered implementation.
- Q: Existing conversation history — preserve, fresh start, or hybrid read-only? → A: Preserve history. The new CopilotKit UI loads and displays all existing conversations from Convex as-is, including prior messages and citations.
- Q: CopilotKit agent hosting model — JS runtime in-process, Python remote endpoint, or LangGraph Platform? → A: JS Runtime in-process. Wrap the existing TypeScript LangGraph agent via `@copilotkit/runtime` in a Next.js API route; the agent stays in-process with no separate service.
- Q: Chat UI placement — full page, sidebar, or floating widget? → A: Global floating chat button anchored at bottom-right of every page. Clicking opens an expandable chat window. The `/ai-assistant` page is removed entirely.
- Q: Rich content rendering — inline in chat, separate panel, or adaptive? → A: Adaptive. Simple results (tables, numbers, short summaries) render inline within chat messages. Complex visualizations (charts, multi-widget dashboards, analytics reports) open in an expanded panel alongside the chat.
- Q: Chat button scope — global, dashboard-only, or configurable? → A: Global. The chat button appears on every page. CopilotKit provider wraps the root layout.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manager Queries Employee Expenses (Priority: P1)

A manager clicks the floating chat button (bottom-right corner, available on any page) and asks natural language questions about their team's spending. For example: "How much did Sarah spend on Meals & Entertainment in January 2026?" or "Show me the team spending breakdown for January 2026." The chat window renders simple results (itemized tables, totals) inline within messages. When the manager requests analytics (e.g., "Show me a spending chart by category"), the window expands to display an interactive chart/dashboard panel alongside the conversation.

**Why this priority**: This is the core use case that validates the entire migration — proving that the LangGraph agent (with role-based tool access, intent analysis, and MCP integration) works correctly through CopilotKit's runtime, and that the custom UI delivers a superior experience to the current static implementation.

**Independent Test**: Can be tested by a manager user logging in, clicking the floating chat button on any page, and asking an employee expense question. The agent should route through topic guardrail → intent analysis → tool execution (get_employee_expenses) → formatted response with citations, all streamed via CopilotKit in the chat window.

**Acceptance Scenarios**:

1. **Given** a manager clicks the floating chat button on any page, **When** they ask "How much did Sarah spend on meals in January 2026?", **Then** the agent streams a response with itemized spending data, source citations, and the total amount — rendered inline in the chat window with markdown formatting.
4. **Given** a manager asks "Show me team spending by category for January 2026", **When** the agent returns complex analytics data, **Then** the chat window expands to display an interactive chart/dashboard panel alongside the conversation, with the visualization rendered as a dynamic UI component.
2. **Given** a manager sends a follow-up question in the same conversation, **When** the agent processes the message, **Then** it retains conversation context (prior messages, intent, and user role) and responds accurately without re-asking for clarification.
3. **Given** a manager asks a team-level question like "What is the total team expense for January 2026?", **When** the agent processes the query, **Then** it uses the `get_team_summary` tool and returns aggregate data with proper formatting.

---

### User Story 2 - Finance Admin Queries Vendor Analytics (Priority: P1)

A finance admin asks the assistant about vendor-related spending patterns: "How much did we spend with Vendor B in the past 3 months?", "Any price hikes from Vendor B in the past 6 months? If yes, which items and how much?", or "What is our cost breakdown by vendor this quarter?" The agent leverages MCP tools (vendor risk analysis, anomaly detection) and transaction data tools to provide detailed, citation-backed answers.

**Why this priority**: Vendor analytics is an equally critical persona use case that exercises the MCP tool integration path (Category 3 MCP server for analytics) and demonstrates the agent's ability to handle complex multi-step queries requiring cross-referencing of transaction data.

**Independent Test**: Can be tested by a finance admin user asking vendor-related questions and verifying that the agent correctly calls MCP analytics tools (analyze_vendor_risk, detect_anomalies) alongside data retrieval tools (get_transactions, get_vendors).

**Acceptance Scenarios**:

1. **Given** a finance admin is in the AI assistant, **When** they ask "How much did we spend with Vendor B in the past 3 months?", **Then** the agent returns a monthly breakdown with totals, sourced from transaction data with proper citations.
2. **Given** a finance admin asks about price hikes, **When** the agent processes "Any price hikes from Vendor B in the past 6 months?", **Then** it identifies items with price changes, shows the percentage increase, and provides specific transaction references.
3. **Given** the MCP server is unavailable, **When** the agent attempts to use an MCP analytics tool, **Then** it gracefully degrades to basic data retrieval tools and informs the user that advanced analytics are temporarily unavailable.

---

### User Story 3 - Compliance Knowledge Base Queries (Priority: P2)

Any user asks cross-border compliance questions such as "What are the GST rules for Singapore for meal expenses?", "Is this expense eligible for tax deduction in Malaysia?", or "What are the OVR requirements for overseas vendors in Thailand?" The agent queries the RAG knowledge base (Qdrant) containing embedded compliance documents for Singapore, Malaysia, Thailand, and Indonesia, and returns answers with citations linking to the original regulatory documents.

**Why this priority**: The RAG integration is a differentiating feature but relies on the same agent pipeline as P1 stories. It validates the searchRegulatoryKnowledgeBase tool works through CopilotKit and that citation rendering (PDF links, page numbers, confidence scores) functions correctly in the custom UI.

**Independent Test**: Can be tested by asking a compliance question and verifying the response includes citations with source document names, page numbers, and confidence scores rendered in the citation overlay component.

**Acceptance Scenarios**:

1. **Given** a user asks "What are the GST rules for meal expenses in Singapore?", **When** the agent processes the query, **Then** it calls the searchRegulatoryKnowledgeBase tool, retrieves relevant compliance documents from Qdrant, and returns an answer with clickable citation references.
2. **Given** the user clicks a citation superscript in the response, **When** the citation overlay opens, **Then** it displays the source document name, country, section, page number, confidence score, and a link to the original PDF.

---

### User Story 4 - Floating Chat Widget with Dynamic UI (Priority: P2)

Users interact with a floating chat button anchored at the bottom-right corner of every page in the app. Clicking the button opens a chat window with real-time message streaming, markdown rendering, citation overlays, and conversation history — all styled with FinanSEAL's design system tokens. The widget supports adaptive content rendering: simple results (tables, numbers, text) render inline within messages, while complex visualizations (charts, dashboards, analytics reports) expand the window to show a rich content panel alongside the conversation. The widget includes a minimal conversation switcher (not a full sidebar) for managing multiple conversations.

**Why this priority**: The floating widget UX is the primary interaction model — it replaces the dedicated `/ai-assistant` page with a globally-accessible assistant that can be invoked from any context in the app.

**Independent Test**: Can be tested by navigating to any page, clicking the floating chat button, sending a message, verifying streaming response, switching conversations via the conversation switcher, and confirming that a complex analytics query expands the panel with a visualization.

**Acceptance Scenarios**:

1. **Given** a user is on any page in the app, **When** they look at the bottom-right corner, **Then** they see a floating chat button styled with the FinanSEAL design system.
2. **Given** a user clicks the floating chat button, **When** the chat window opens, **Then** they see their most recent conversation with a message input field, a minimal conversation history switcher, and a close button.
3. **Given** a user sends a message, **When** the agent is processing, **Then** they see a real-time streaming response with a typing indicator, and the message appears incrementally.
4. **Given** a user asks for analytics (e.g., "Show me spending by category this month"), **When** the agent returns complex data, **Then** the chat window expands to show a dashboard/chart panel alongside the conversation, with interactive visualizations rendered as dynamic React components.
5. **Given** a user has multiple conversations, **When** they open the conversation switcher in the widget, **Then** they can select a previous conversation and its messages load in the chat window.

---

### User Story 5 - Agent Self-Evolution via Memory (Priority: P3)

The agent improves over time by storing conversation memories (via Mem0/Qdrant) that capture user preferences, business patterns, and frequently asked questions. When a returning user asks a question, the agent recalls relevant memories to provide more contextual and personalized responses without re-asking for clarification.

**Why this priority**: Memory-based personalization enhances the "self-evolving" nature of the assistant but builds on top of the core query functionality. It can be incrementally improved after the migration is stable.

**Independent Test**: Can be tested by having a user ask a question, then in a later conversation asking a related question and verifying the agent uses stored memories to provide a more contextual response.

**Acceptance Scenarios**:

1. **Given** a manager previously asked about Sarah's expenses in January, **When** they later ask "What about February?", **Then** the agent recalls the prior context (Sarah, expenses) and responds about Sarah's February expenses without needing clarification.
2. **Given** the memory service is unavailable, **When** the agent attempts to recall memories, **Then** it proceeds normally without memories and does not show any error to the user.

---

### Edge Cases

- What happens when the CopilotKit runtime connection drops mid-stream? The UI should show a reconnection indicator and allow the user to retry the last message.
- How does the system handle when a user's role changes between sessions (e.g., promoted from employee to manager)? The agent's tool access should reflect the current role at query time.
- What happens when the LangGraph agent hits the circuit breaker (3 consecutive tool failures or 20-message turn limit)? The agent should gracefully end the turn with an explanatory message.
- How does the system handle concurrent sessions from the same user across multiple browser tabs? Conversation state should remain consistent via Convex real-time subscriptions.
- What happens when the Qdrant vector database is unreachable? RAG queries should fail gracefully with a message indicating compliance information is temporarily unavailable, while non-RAG queries continue to function.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose the existing LangGraph agent (8-node StateGraph) through a CopilotKit-compatible runtime endpoint, preserving all nodes: topic guardrail, validation, intent analysis, clarification, model call, tool execution, and tool correction.
- **FR-002**: System MUST provide a CopilotKit runtime API route in the Next.js application (e.g., `/api/copilotkit`) using `@copilotkit/runtime`, wrapping the existing TypeScript LangGraph agent in-process — no separate Python service or LangGraph Platform deployment.
- **FR-003**: The chat UI MUST be a floating widget (button anchored at bottom-right, expandable chat window) available globally on every page, built using CopilotKit's headless hooks (useCopilotChat or useCoAgent) to manage message lifecycle, streaming, and agent state — with the CopilotKit provider wrapping the root layout.
- **FR-004**: System MUST preserve all existing tool integrations: data retrieval tools (search_documents, get_transactions, get_vendors), compliance tools (searchRegulatoryKnowledgeBase, analyze_cross_border_compliance), analytics tools via MCP (detect_anomalies, analyze_cash_flow, analyze_vendor_risk), and manager tools (get_employee_expenses, get_team_summary).
- **FR-005**: System MUST enforce role-based tool access: managers/admins/owners see team tools; employees see only personal tools. Tool filtering MUST happen server-side before tool execution.
- **FR-006**: System MUST support real-time message streaming from the agent to the UI, with incremental rendering of the response as tokens arrive.
- **FR-007**: System MUST render citation references (superscript markers) in agent responses, with a clickable overlay showing source document name, country, section, page number, confidence score, and PDF link.
- **FR-008**: System MUST integrate with Convex for conversation persistence — creating, listing, switching, and deleting conversations with real-time updates across tabs.
- **FR-009**: System MUST integrate with the existing RAG pipeline: queries to the Qdrant vector database via the VectorStorageService, with embedding generation and semantic search for compliance documents.
- **FR-010**: System MUST integrate with the Mem0-based memory system for conversation memory recall and storage, enabling contextual responses across sessions.
- **FR-011**: System MUST support the existing multi-language capability (English, Thai, Indonesian) in agent prompts and responses.
- **FR-012**: System MUST maintain the existing rate limiting (30 messages per hour per user) at the API layer.
- **FR-013**: System MUST connect to the Category 3 MCP server (AWS Lambda) for advanced analytics tools, with graceful degradation when the MCP server is unavailable.
- **FR-014**: System MUST support topic guardrails to keep the agent focused on financial/business queries, redirecting off-topic questions with an appropriate response.
- **FR-015**: System MUST provide a minimal conversation switcher within the chat widget (not a full sidebar) for listing, switching, creating, and deleting conversations.
- **FR-016**: Migration MUST be a complete replacement: the old chat UI (`src/domains/chat/`), the old API route (`/api/v1/chat`), the old chat service layer, and the `/ai-assistant` page route MUST be removed and replaced by the CopilotKit floating widget. No parallel running of old and new systems.
- **FR-017**: The new CopilotKit widget MUST load and display all existing conversations from Convex, including prior messages and citations. Users MUST NOT lose access to conversation history after the migration.
- **FR-018**: System MUST support adaptive rich content rendering: simple results (tables, numbers, text summaries) render inline within chat messages; complex visualizations (charts, graphs, multi-widget dashboards) render in an expandable panel alongside the chat conversation using CopilotKit's Generative UI or custom React components.
- **FR-019**: The `/ai-assistant` page route MUST be removed entirely. The floating chat widget is the sole interface for the AI assistant.

### Key Entities

- **Conversation**: A chat session between a user and the agent, persisted in Convex with metadata (title, language, message count, last message preview). Linked to a userId and businessId for multi-tenant isolation.
- **Message**: An individual message within a conversation (user or assistant role), stored in Convex with optional metadata including citations and agent state.
- **Citation**: A reference to a source document returned by the agent, containing source name, country, section, page number, PDF URL, text coordinates, content snippet, and confidence score.
- **UserContext**: Runtime context passed to the agent containing userId, businessId, and role — used for RLS enforcement and tool filtering.
- **AgentState**: The LangGraph state machine state including messages, security validation status, current intent, phase tracking, failure count, and citations.
- **Memory**: Stored conversation memories in Mem0/Qdrant, scoped by businessId and userId, used for cross-session context recall.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can send a message and receive a streamed response within the same interaction latency as the current implementation (excluding cold start time).
- **SC-002**: All existing agent capabilities (manager queries, finance admin queries, compliance queries, MCP analytics) function correctly through CopilotKit with no regression in accuracy or tool routing.
- **SC-003**: The custom UI renders messages with markdown formatting, citation overlays, and conversation management features at feature parity with the current implementation.
- **SC-004**: Role-based access control correctly filters tools — employees cannot access manager tools, and managers cannot access other managers' team data.
- **SC-005**: The system handles 30+ concurrent users without degradation in streaming performance or conversation state consistency.
- **SC-006**: Agent responds accurately to persona-specific queries: manager expense queries return correct employee spending data; finance admin vendor queries return correct vendor analytics; compliance queries return relevant regulatory information with citations.
- **SC-007**: Conversation history persists across sessions and synchronizes in real-time across browser tabs via Convex.
- **SC-008**: The migration requires zero changes to the existing LangGraph agent logic, MCP server, or Qdrant knowledge base — the integration is purely at the runtime and UI layer.

## Assumptions

- The existing LangGraph agent (StateGraph with 8 nodes) will be wrapped by CopilotKit's JS runtime (`@copilotkit/runtime`) in-process within the Next.js application, without requiring changes to the agent's internal logic or deploying a separate service.
- CopilotKit's runtime can be configured to work with Gemini 3 Flash Preview as the primary LLM (via a compatible service adapter or by delegating LLM calls to the LangGraph agent itself).
- The existing Convex conversation storage will continue to be the source of truth for conversation persistence, with CopilotKit's message management operating as a client-side layer.
- The MCP server on AWS Lambda will continue to be accessed via the existing McpClientManager from within the LangGraph agent's tool execution nodes.
- The RAG integration uses **Qdrant Cloud** as the vector database (confirmed by QDRANT_URL, QDRANT_API_KEY, QDRANT_COLLECTION_NAME environment variables in the codebase).
- The Mem0 memory service integration will remain unchanged, accessed from within the agent's pipeline.
- CopilotKit's headless UI hooks provide sufficient control to build the floating chat widget with custom features (citation overlays, conversation switcher, message deletion, adaptive rich content panel).
- CopilotKit's Generative UI feature (or custom React components rendered via `useCopilotAction`) can render charts and dashboards inline or in an expanded panel within the chat widget.
- The floating chat button and window can be implemented as a global component in the root layout without interfering with existing page layouts or navigation.
