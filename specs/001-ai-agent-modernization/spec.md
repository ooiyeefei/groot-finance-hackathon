# Feature Specification: Next-Gen Agent Architecture - Memory, Context Engineering, MCP & Real-time Integration

**Feature Branch**: `001-ai-agent-modernization`
**Created**: 2026-01-11
**Status**: Draft
**Input**: GitHub Issue #124 - P1: Next-Gen Agent Architecture upgrade for FinanSEAL's AI agent

## Executive Summary

Upgrade FinanSEAL's existing LangGraph-based AI agent to implement state-of-the-art 2025-2026 patterns including hierarchical memory systems, intelligent context engineering, real-time streaming responses, MCP (Model Context Protocol) server integration, and event-driven proactive insights.

### Framework Decision: LangGraph (Enhanced)

After comprehensive analysis of LangGraph, Claude Agent SDK, and Google ADK:

| Framework | Benchmark Score | Memory Support | MCP | Streaming | Multi-Agent | Deployment |
|-----------|-----------------|----------------|-----|-----------|-------------|------------|
| **LangGraph** | 88.5-92.2 | Native (InMemorySaver, InMemoryStore) | Via external | streamEvents() | Swarm support | Self-hosted, LangGraph Cloud |
| Claude Agent SDK | 83.3-86.5 | Session-based | Native built-in | Native | Limited | Claude-managed |
| Google ADK | 43.6-82.7 | Custom | External | Native | SequentialAgent | Agent Engine (GCP) |

**Recommendation**: Enhance existing **LangGraph** implementation rather than migrate:
1. **Already integrated** - existing codebase uses LangGraph StateGraph
2. **Highest benchmark scores** - most mature and well-documented
3. **Best memory architecture** - native checkpointer + store pattern matches MemGPT requirements
4. **MCP compatibility** - can implement MCP server alongside LangGraph agent
5. **Streaming support** - streamEvents() API already available in v0.2+

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Real-time Streaming Responses (Priority: P1)

As a FinanSEAL user, I want to see the AI assistant's response as it's being generated, rather than waiting for the complete response, so that I can start reading immediately and feel the system is responsive.

**Why this priority**: Addresses the most visible UX issue - users currently wait 3-5 seconds before seeing any response. Streaming provides perceived performance improvement from 3-5s to <1s time-to-first-token.

**Independent Test**: Can be fully tested by sending a query and observing token-by-token streaming in the chat UI. Delivers immediate value by reducing perceived latency.

**Acceptance Scenarios**:

1. **Given** a logged-in user with an active conversation, **When** they send a message to the AI assistant, **Then** they see the response appearing word-by-word within 1 second of sending the message.
2. **Given** the AI is executing a tool (e.g., searching transactions), **When** the tool is running, **Then** the user sees a progress indicator showing which tool is being executed.
3. **Given** a slow network connection, **When** the user sends a message, **Then** the streaming continues gracefully without interruption or timeout.

---

### User Story 2 - Persistent Memory Across Sessions (Priority: P1)

As a returning FinanSEAL user, I want the AI assistant to remember my preferences, past interactions, and key business context from previous sessions, so that I don't have to repeat information every conversation.

**Why this priority**: Core differentiator for financial co-pilot - users expect personalized assistance. Currently agent "forgets" everything between sessions causing repetitive interactions.

**Independent Test**: Can be tested by setting preferences in one session, ending the session, starting a new session, and verifying the agent recalls the preferences.

**Acceptance Scenarios**:

1. **Given** a user who previously told the AI their preferred currency is SGD, **When** they ask about transaction amounts in a new session, **Then** the AI automatically displays amounts in SGD.
2. **Given** a user who frequently queries a specific vendor, **When** they start a new conversation, **Then** the AI proactively offers relevant insights about that vendor.
3. **Given** a user who asked complex tax questions in past sessions, **When** they return, **Then** the AI references relevant past discussions when appropriate.

---

### User Story 3 - Intelligent Context Management (Priority: P2)

As a user with long conversation histories, I want the AI to intelligently summarize and retrieve relevant context rather than losing important information, so that I can have meaningful extended conversations.

**Why this priority**: Enables complex multi-turn workflows without context degradation. Current 50-message fixed window causes loss of important context in extended sessions.

**Independent Test**: Can be tested by having a 30+ message conversation and verifying the agent recalls key information from early messages.

**Acceptance Scenarios**:

1. **Given** a conversation exceeding 20 messages, **When** the user references something from early in the conversation, **Then** the AI retrieves and uses that context accurately.
2. **Given** a conversation with multiple entities discussed (vendors, amounts, dates), **When** the user asks about a specific entity, **Then** the AI provides context without confusion between entities.
3. **Given** cached tool results from earlier in the session, **When** the user asks a similar question, **Then** the AI uses cached data rather than re-fetching.

---

### User Story 4 - MCP Server for Claude Desktop Integration (Priority: P2)

As a power user, I want to access my FinanSEAL data directly from Claude Desktop using MCP, so that I can query my financial data alongside other tools in my workflow.

**Why this priority**: Extends FinanSEAL's reach beyond the web app, enabling integration with AI-native workflows. Growing MCP ecosystem makes this future-proof.

**Independent Test**: Can be tested by configuring Claude Desktop with FinanSEAL MCP server and successfully querying transaction data.

**Acceptance Scenarios**:

1. **Given** Claude Desktop with FinanSEAL MCP server configured, **When** the user asks about recent transactions, **Then** Claude retrieves and displays actual transaction data from FinanSEAL.
2. **Given** an authenticated MCP connection, **When** the user requests expense claim approval, **Then** the action is performed securely in FinanSEAL.
3. **Given** an unauthenticated or invalid token, **When** MCP tools are invoked, **Then** the request is rejected with clear error messaging.

---

### User Story 5 - Proactive Financial Insights (Priority: P3)

As a business owner, I want the AI to proactively notify me about important financial events (anomalies, trends, deadlines), so that I can act on them before they become problems.

**Why this priority**: Transforms agent from reactive Q&A to proactive financial advisor. Enables high-value insights without user prompting.

**Independent Test**: Can be tested by creating a transaction anomaly and verifying the user receives a notification.

**Acceptance Scenarios**:

1. **Given** a transaction that deviates significantly from typical patterns, **When** it's detected, **Then** the user receives a notification explaining the anomaly.
2. **Given** an approaching tax deadline relevant to the user's jurisdiction, **When** it's within 14 days, **Then** the user is notified with relevant preparation steps.
3. **Given** user preference settings for notifications, **When** the user disables proactive insights, **Then** no unsolicited notifications are sent.

---

### Edge Cases

- What happens when memory storage reaches capacity limits?
- How does the system handle conflicting memories (user preference changed)?
- What happens when MCP server loses connection during tool execution?
- How does streaming behave when client disconnects mid-response?
- What happens when proactive insight detection runs during high-load periods?

## Requirements *(mandatory)*

### Functional Requirements

#### Memory Architecture
- **FR-001**: System MUST persist user preferences across sessions using database storage
- **FR-002**: System MUST store episodic memories (past conversations) with vector embeddings
- **FR-003**: System MUST implement `remember()` and `recall()` tools accessible to the agent
- **FR-004**: System MUST cache frequently accessed entities (vendors, recent transactions) within session
- **FR-005**: System MUST support memory operations: store, retrieve, update, and forget

#### Context Engineering
- **FR-006**: System MUST automatically summarize conversations exceeding 20 messages
- **FR-007**: System MUST extract and cache entities (vendors, amounts, dates) from conversations
- **FR-008**: System MUST implement sliding window context with important message preservation
- **FR-009**: System MUST inject relevant memories into agent context before invocation
- **FR-010**: System MUST cache tool results within session to avoid redundant queries

#### Real-time Streaming
- **FR-011**: System MUST stream agent responses token-by-token using Server-Sent Events (SSE)
- **FR-012**: System MUST emit tool execution status events during streaming
- **FR-013**: System MUST support graceful degradation to non-streaming for incompatible clients
- **FR-014**: System MUST implement typing indicators during response generation

#### MCP Server
- **FR-015**: System MUST expose FinanSEAL data as MCP resources (transactions, expense claims, documents)
- **FR-016**: System MUST expose FinanSEAL actions as MCP tools (lookup, search, create, approve)
- **FR-017**: System MUST implement OAuth2 authentication for MCP connections
- **FR-018**: System MUST enforce business isolation (multi-tenancy) for all MCP operations
- **FR-019**: System MUST provide MCP prompt templates for common financial queries

#### Event-Driven Features
- **FR-020**: System MUST detect transaction anomalies and queue notifications
- **FR-021**: System MUST allow users to configure notification preferences
- **FR-022**: System MUST deliver proactive insights via real-time subscriptions

### Key Entities

- **AgentMemory**: Persistent memory record containing userId, businessId, memoryType (episodic/semantic/procedural/entity), content, embedding, and metadata
- **UserPreference**: User-specific settings including preferred currency, notification settings, frequent vendors, and language
- **AgentNotification**: Queued proactive insight with userId, type, context, status, and delivery timestamp
- **MCPSession**: OAuth2 session for MCP connections with token, scope, and expiration

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users see first token of response within 1 second of sending a message (down from 3-5 seconds)
- **SC-002**: Agent correctly recalls user preferences in 95% of new sessions
- **SC-003**: Memory retrieval relevance achieves 85% accuracy based on user feedback
- **SC-004**: System maintains consistent response quality for conversations exceeding 30 messages
- **SC-005**: MCP server successfully authenticates and serves requests from external AI clients
- **SC-006**: Users with proactive insights enabled receive relevant notifications within 5 minutes of triggering events
- **SC-007**: Context utilization improves from fixed 50-message window to dynamic retrieval-augmented context
- **SC-008**: Tool execution feedback displayed to users in real-time during streaming

## Assumptions

1. Existing database can handle additional memory tables without performance degradation
2. Vector database has sufficient capacity for episodic memory embeddings
3. Users have stable internet connections for SSE streaming (with graceful fallback)
4. External AI clients follow MCP specification v1.0
5. LangGraph v0.2+ streamEvents() API is production-stable

## Dependencies

- LangGraph 0.2+ (for streaming support)
- Real-time database for subscriptions
- Vector database for memory storage
- MCP SDK 1.0+ for server implementation

## Out of Scope

- Migration away from LangGraph to alternative frameworks
- Multi-modal context (images/documents in conversation) - future phase
- Voice interface capabilities
- Mobile push notifications (web-only for this phase)
