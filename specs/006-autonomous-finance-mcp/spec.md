# Feature Specification: Autonomous Finance MCP Server

**Feature Branch**: `006-autonomous-finance-mcp`
**Created**: 2026-01-15
**Status**: Draft
**Input**: Build a Type 3 MCP Server for autonomous financial intelligence agent that: 1) Serves the detection/intelligence algorithms via MCP protocol, 2) Integrates with LangGraph agent as MCP client, 3) Explores E2B sandbox for safe code execution, 4) Studies Claude Code Agent patterns for browser/tool ecosystem, 5) Creates self-evolving autonomous finance agent for FinanSEAL

## Clarifications

### Session 2026-01-15

- Q: Core Agent Architecture Strategy - LangGraph+MCP vs Claude Code Agent+E2B? → A: Path 1 only - Keep LangGraph agent, build Type 3 MCP server for intelligence integration. No E2B sandbox, no Claude Code Agent swap.
- Q: MCP Server Deployment Model? → A: AWS Lambda + API Gateway (HTTP transport). Stateless - no durable functions needed. Memory handled by existing mem0 tools in LangGraph agent, not MCP.
- Q: Observability for MCP Server? → A: Sentry (existing setup, free tier) for error monitoring + CloudWatch Logs for Lambda execution logs.
- Q: MCP Client Authentication? → A: AWS IAM via Vercel OIDC (same pattern as existing doc processor Lambda).
- Q: Agent Location & Timeout? → A: Keep agent in Vercel with optimizations. SSE streaming already implemented (/api/v1/chat/stream) extends timeout. MCP tools use Convex one-shot queries (not real-time subscriptions).

## Executive Summary

This feature transforms FinanSEAL's disconnected intelligence layer into a unified autonomous finance agent by implementing a Type 3 MCP (Model Context Protocol) Server. The MCP server exposes detection algorithms (anomaly, cash flow, vendor intelligence) as standardized tools, enabling the existing LangGraph agent to access financial insights through the MCP protocol.

**Architecture Vision:**
```
┌─────────────────────────────────────────────────────────────────────┐
│                         Vercel (Next.js)                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              LangGraph StateGraph Agent                      │   │
│  │         (existing agent + MCP client integration)            │   │
│  │              + mem0 memory tools (stateful)                  │   │
│  └────────────────────────────┬────────────────────────────────┘   │
└───────────────────────────────│─────────────────────────────────────┘
                                │
                                ▼ MCP Protocol (JSON-RPC 2.0 over HTTP)
                                │
┌───────────────────────────────│─────────────────────────────────────┐
│                         AWS Lambda + API Gateway                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Type 3 MCP Server (FinanSEAL Intelligence)      │   │
│  │                        (stateless)                           │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌───────────────────────┐  │   │
│  │  │ Anomaly     │ │ Cash Flow   │ │ Vendor Intelligence   │  │   │
│  │  │ Detection   │ │ Forecast    │ │ (Concentration/Risk)  │  │   │
│  │  └─────────────┘ └─────────────┘ └───────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└───────────────────────────────│─────────────────────────────────────┘
                                │
                                ▼
                      ┌─────────────────┐
                      │   Convex DB     │
                      │   (Real-time)   │
                      └─────────────────┘
```

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Real-Time Financial Intelligence via Chat (Priority: P1)

As a business owner, I want to ask the AI assistant about financial anomalies, cash flow projections, and vendor risks so that I can make data-driven decisions without manually analyzing reports.

**Why this priority**: This is the core value proposition - connecting the intelligence layer to the conversational interface. Users currently cannot access the proactive insights through the chat, making the detection algorithms invisible.

**Independent Test**: Can be fully tested by asking the AI assistant "Are there any unusual transactions this month?" and receiving a response that includes real anomaly detection results from the MCP server.

**Acceptance Scenarios**:

1. **Given** anomaly detection has flagged a $500 expense (5x normal) in Office Supplies, **When** user asks "Show me any unusual expenses," **Then** agent responds with the specific anomaly, amount, and z-score context from MCP server.

2. **Given** cash flow projection shows negative balance in 45 days, **When** user asks "How is my cash flow looking?", **Then** agent provides the burn rate analysis and projected runway from MCP server.

3. **Given** vendor concentration shows 85% of Software spend goes to single vendor, **When** user asks "Any supplier risks I should know about?", **Then** agent highlights the concentration risk with specific vendor name and percentage.

---

### User Story 2 - Self-Evolving Agent Learning (Priority: P2)

As a repeat user, I want the AI agent to remember my financial patterns, preferences, and previous analyses so that it provides increasingly personalized and relevant insights over time.

**Why this priority**: This transforms the agent from stateless tool to intelligent partner. Building on the memory tools already in LangGraph, this extends to financial pattern learning.

**Independent Test**: Can be tested by asking the same category of question after 2 weeks and observing the agent reference previous context or learned patterns.

**Acceptance Scenarios**:

1. **Given** user has asked about vendor concentration 3 times, **When** user opens chat, **Then** agent proactively mentions any new concentration risks without being asked.

2. **Given** user previously set an alert threshold for expense anomalies, **When** new anomaly exceeds threshold, **Then** agent references the user's preference in its notification.

3. **Given** agent has analyzed user's spending patterns, **When** user asks "How do my expenses compare to usual?", **Then** agent uses learned baseline rather than just raw statistics.

---

### User Story 3 - Multi-Tool Orchestration (Priority: P3)

As a power user, I want the AI agent to intelligently combine multiple intelligence tools (anomaly + cash flow + vendor) in a single response so that I get comprehensive insights without multiple questions.

**Why this priority**: This demonstrates the orchestration capability of the MCP architecture. The agent should determine which tools are relevant and combine their outputs coherently.

**Independent Test**: Can be tested by asking "Give me a complete financial health check" and receiving a combined response using all three intelligence tools.

**Acceptance Scenarios**:

1. **Given** all three detection algorithms have findings, **When** user asks "What should I know about my finances this week?", **Then** agent calls anomaly, cash_flow, and vendor tools via MCP and synthesizes a unified summary.

2. **Given** only cash flow tool has critical alert, **When** user asks for health check, **Then** agent prioritizes the critical alert and mentions other tools showed no issues.

---

### Edge Cases

- What happens when MCP server is unreachable? → Agent falls back to cached insights or informs user of temporary unavailability.
- How does system handle concurrent MCP calls? → MCP server supports parallel tool invocations; results aggregated in agent response.
- What if user asks about data outside their business scope? → MCP server enforces business_id filtering; returns empty results for unauthorized queries.
- What if detection algorithms return conflicting signals? → Agent acknowledges uncertainty and presents both perspectives with confidence levels.
- What if MCP tool execution takes too long? → 10-second timeout per tool with graceful degradation.

## Requirements *(mandatory)*

### Functional Requirements

#### MCP Server Core
- **FR-001**: System MUST implement an MCP server following the Model Context Protocol specification (JSON-RPC 2.0 over stdio or HTTP transport)
- **FR-002**: System MUST expose anomaly detection as an MCP tool with parameters for date range, category filters, and sensitivity threshold
- **FR-003**: System MUST expose cash flow forecasting as an MCP tool with parameters for projection period and scenario inputs
- **FR-004**: System MUST expose vendor intelligence as an MCP tool combining concentration risk, spending changes, and vendor risk scores
- **FR-005**: System MUST return tool results in standardized MCP response format with typed schemas

#### LangGraph Integration
- **FR-006**: System MUST integrate MCP client into existing LangGraph agent (src/lib/ai/langgraph-agent.ts)
- **FR-007**: System MUST register MCP tools in tool-factory.ts alongside existing tools (search_documents, get_transactions, etc.)
- **FR-008**: System MUST maintain user authentication context when invoking MCP tools (business_id, user_id)
- **FR-009**: System MUST support streaming responses when MCP tools are invoked during chat

#### Security & Authorization
- **FR-010**: System MUST validate user's business_id before executing any MCP tool
- **FR-011**: System MUST log all MCP tool invocations to CloudWatch for audit purposes
- **FR-012**: System MUST rate-limit MCP tool calls to prevent abuse (max 60 calls/minute per user)
- **FR-016**: System MUST report errors to Sentry (existing setup) for monitoring and alerting

#### Memory & Learning
- **FR-013**: System MUST persist user-specific financial patterns learned from repeated queries
- **FR-014**: System MUST allow users to set custom alert thresholds for each detection type
- **FR-015**: System MUST surface proactive insights based on learned preferences

### Key Entities

- **MCPServer**: The Type 3 intelligence server exposing detection algorithms as tools
  - Attributes: transport type (stdio/HTTP), tool registry, resource registry
  - Relationships: Connects to Convex database, serves LangGraph agent

- **MCPTool**: Individual intelligence capability exposed via MCP
  - Attributes: name, description, input schema (Zod), output schema
  - Examples: `detect_anomalies`, `forecast_cash_flow`, `analyze_vendor_risk`

- **UserFinancialProfile**: Learned patterns and preferences
  - Attributes: baseline_metrics, alert_thresholds, query_history, learned_patterns
  - Relationships: Belongs to user, informs agent responses

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can receive intelligence-backed chat responses within 3 seconds of asking financial questions
- **SC-002**: 90% of anomaly detection queries return relevant results (based on user feedback/rating)
- **SC-003**: System handles 100 concurrent MCP connections without performance degradation
- **SC-004**: Agent demonstrates context retention by referencing previous financial patterns in 80% of follow-up conversations
- **SC-005**: Users report 40% reduction in time spent manually analyzing financial data (survey metric)
- **SC-006**: Zero security incidents related to unauthorized data access via MCP tools

## Assumptions

1. **MCP SDK Maturity**: The @modelcontextprotocol/sdk TypeScript package is stable enough for production use. Fallback: implement JSON-RPC manually.

2. **Convex Real-time Compatibility**: Convex queries can be invoked from MCP server context with acceptable latency (<200ms).

3. **LangGraph Tool Registration**: Existing tool-factory.ts architecture supports adding MCP client tools without major refactoring.

4. **User Volume**: Initial deployment targets <1000 concurrent users; scaling strategy documented but not implemented in v1.

## Out of Scope

- E2B sandbox code execution (deferred to future exploration)
- Claude Code Agent swap (keep existing LangGraph agent)
- Browser automation or web scraping capabilities
- Multi-agent orchestration (single agent with multiple tools, not multiple coordinating agents)
- Custom model fine-tuning for financial domain
- Real-time data ingestion from external sources (bank feeds, accounting software)
- Mobile-specific optimizations

## Dependencies

- **@modelcontextprotocol/sdk** - Official MCP TypeScript SDK
- **Existing Systems**:
  - Convex database with `actionCenterInsights` table
  - LangGraph agent (src/lib/ai/langgraph-agent.ts)
  - Detection algorithms (convex/functions/insights/*.ts)
  - Tool factory (src/lib/ai/tools/tool-factory.ts)

## Technical Notes (for planning phase)

These notes capture architectural decisions to be detailed during planning:

1. **MCP Deployment**: AWS Lambda + API Gateway (HTTP transport, stateless)
2. **MCP Transport**: HTTP transport with JSON-RPC 2.0 (same pattern as existing Lambda doc processor)
3. **Tool Schemas**: Use Zod for input validation, matching existing pattern in tool-factory
4. **Memory Storage**: Use existing mem0 memory tools in LangGraph agent (not in MCP server)
5. **Infrastructure**: Deploy via AWS CDK alongside existing Lambda infrastructure in `infra/`
