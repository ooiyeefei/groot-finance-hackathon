# Feature Specification: Category 3 MCP Server with Domain Intelligence

**Feature Branch**: `001-category-3-mcp`
**Created**: 2026-01-28
**Status**: Draft
**Input**: User description: "Category 3 MCP implementation with domain-specific intelligence following Clockwise pattern and engineering best practices"

## Clarifications

### Session 2026-01-28

- Q: Where should proposals (pending write operations awaiting human confirmation) be stored? → A: Convex stores proposals with business-scoped access, consistent with existing data architecture.
- Q: How should API keys be validated (caching vs real-time)? → A: Validate against Convex on each request for immediate revocation support.
- Q: What observability signals should be emitted for production monitoring? → A: Structured logs only + Lambda's free built-in metrics (invocations, errors, duration). Cost-effective and upgradeable later.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - External AI Agent Queries Financial Intelligence (Priority: P1)

A user using Claude Desktop, Cursor, or any MCP-compatible AI assistant wants to query their FinanSEAL financial data and receive intelligent insights without opening the FinanSEAL web application.

**Why this priority**: This is the core value proposition of Category 3 MCP - exposing domain intelligence to external consumers. It differentiates FinanSEAL by making financial insights accessible from any AI tool, enabling "Your CFO Everywhere" positioning.

**Independent Test**: Can be fully tested by configuring Claude Desktop to connect to the MCP server and asking "What are my unusual expenses?" - delivers immediate value of financial intelligence in the user's preferred AI tool.

**Acceptance Scenarios**:

1. **Given** a user has Claude Desktop configured with FinanSEAL MCP server and valid API key, **When** they ask "What unusual expenses do I have?", **Then** they receive a structured response with anomaly details (vendor, amount, z-score, severity, explanation) within 5 seconds.

2. **Given** a user has authorized their business via API key, **When** they query "What's my cash runway?", **Then** they receive runway days, burn rate, and any critical alerts in human-readable format.

3. **Given** an external AI agent sends an MCP `tools/call` request for `detect_anomalies`, **When** the business has fewer than 5 transactions in the period, **Then** the server returns a helpful error with INSUFFICIENT_DATA code and suggestion to expand date range.

4. **Given** an unauthorized API request, **When** the MCP server receives the request, **Then** it returns UNAUTHORIZED error without exposing any business data.

---

### User Story 2 - Tool Discovery for AI Agents (Priority: P1)

An AI agent connecting to FinanSEAL MCP server for the first time needs to discover what financial intelligence tools are available and understand their parameters.

**Why this priority**: Self-describing tools are fundamental to MCP protocol - without proper tool discovery, no AI agent can use the server. This enables "write once, run anywhere" for any MCP-compatible client.

**Independent Test**: Can be tested by sending `tools/list` request to MCP server and verifying complete tool schemas are returned with descriptions.

**Acceptance Scenarios**:

1. **Given** a properly authenticated MCP client, **When** it sends `tools/list` request, **Then** it receives complete tool definitions including name, description, and JSON Schema for inputs.

2. **Given** the MCP server initialization, **When** a client sends `initialize` request, **Then** it receives server capabilities including protocol version, server name, and tool availability.

3. **Given** any MCP tool definition, **When** a developer reads the schema, **Then** they can understand the purpose and all required/optional parameters without external documentation.

---

### User Story 3 - Workflow Automation Integration (Priority: P2)

A finance team wants to set up automated workflows using Zapier, n8n, or Slack bots that call FinanSEAL intelligence tools to receive alerts and reports on schedule.

**Why this priority**: Automation integration extends the value beyond direct AI queries to proactive financial monitoring, enabling scenarios like "alert CFO when anomalies detected" or "weekly cash flow digest."

**Independent Test**: Can be tested by making HTTP POST requests to the MCP endpoint simulating Zapier webhook calls and verifying correct JSON-RPC responses.

**Acceptance Scenarios**:

1. **Given** a Zapier workflow configured with FinanSEAL MCP endpoint, **When** it calls `detect_anomalies` daily at 9am, **Then** it receives structured JSON that can be parsed to trigger Slack notifications.

2. **Given** an n8n workflow calling `forecast_cash_flow`, **When** the response shows runway_days < 30, **Then** the response structure allows triggering multi-channel alerts.

3. **Given** external systems calling MCP tools concurrently, **When** multiple requests arrive simultaneously, **Then** each request is processed independently with correct business context isolation.

---

### User Story 4 - Human Approval for Write Operations (Priority: P2)

A user interacting through an external AI agent wants to take action (approve expense, schedule payment) but the system requires human confirmation before executing state-changing operations.

**Why this priority**: Following the Clockwise pattern - "The system never auto-writes to calendars" - financial write operations require human oversight. This builds trust and prevents AI-initiated financial mistakes.

**Independent Test**: Can be tested by requesting an approval action through MCP, receiving a proposal, then confirming or rejecting it.

**Acceptance Scenarios**:

1. **Given** a user asks Claude "Approve all pending expenses under MYR 500", **When** the AI calls `create_proposal`, **Then** the system returns a proposal_id with summary of actions requiring explicit confirmation.

2. **Given** a pending proposal, **When** the user calls `confirm_proposal` with the proposal_id, **Then** the write operations execute and the user receives confirmation of completed actions.

3. **Given** a pending proposal, **When** 24 hours pass without confirmation, **Then** the proposal expires and no write operations are executed.

---

### User Story 5 - Rate Limiting and Abuse Prevention (Priority: P3)

The system needs to protect itself from abuse while allowing legitimate high-volume integrations.

**Why this priority**: Production readiness requires protection against runaway automation, credential abuse, and denial of service while maintaining good experience for legitimate users.

**Independent Test**: Can be tested by sending requests at various rates and verifying correct rate limit responses and headers.

**Acceptance Scenarios**:

1. **Given** an API key with standard rate limits, **When** more than 60 requests are made in 1 minute, **Then** subsequent requests receive RATE_LIMITED error with retry-after header.

2. **Given** a rate-limited response, **When** the client waits for the retry-after period, **Then** subsequent requests are processed normally.

3. **Given** all errors and responses, **When** logged, **Then** audit trail includes timestamp, API key (masked), business_id, tool called, and response status.

---

### Edge Cases

- What happens when the Convex backend is temporarily unavailable?
  - System returns CONVEX_ERROR with retry suggestion, does not expose internal details

- How does the system handle malformed JSON-RPC requests?
  - Returns PARSE_ERROR or INVALID_REQUEST per JSON-RPC 2.0 spec

- What happens when a tool returns partial results due to timeout?
  - Returns partial data with warning flag, includes transaction count of processed items

- How are concurrent requests for the same business handled?
  - Each request is stateless and isolated; no locking required for read operations

- What happens when API key is valid but business no longer exists?
  - Returns specific error indicating business not found, suggests re-authentication

## Requirements *(mandatory)*

### Functional Requirements

**MCP Protocol Compliance**

- **FR-001**: System MUST implement JSON-RPC 2.0 protocol for all MCP communication
- **FR-002**: System MUST respond to `initialize` method with protocol version, capabilities, and server info
- **FR-003**: System MUST respond to `tools/list` method with complete tool definitions including JSON Schemas
- **FR-004**: System MUST respond to `tools/call` method by executing the specified tool with provided arguments
- **FR-005**: System MUST use standard JSON-RPC error codes (-32700 to -32603) for protocol errors
- **FR-006**: System MUST use MCP-specific error codes (-32001 to -32099) for domain errors

**Tool Intelligence (Category 3)**

- **FR-007**: System MUST compute anomaly detection using z-score analysis server-side, returning structured insights
- **FR-008**: System MUST compute cash flow projections including burn rate and runway calculations server-side
- **FR-009**: System MUST compute vendor risk scores using multi-factor analysis server-side
- **FR-010**: System MUST return business-ready insights, not raw data requiring LLM analysis
- **FR-011**: Each tool response MUST include explanations in human-readable format

**Authentication & Authorization**

- **FR-012**: System MUST authenticate requests using API key in Authorization header
- **FR-013**: System MUST validate business access rights before returning any business data
- **FR-014**: System MUST NOT return data from businesses the API key is not authorized for
- **FR-015**: System MUST return UNAUTHORIZED error for invalid or missing credentials

**Human Approval Pattern**

- **FR-016**: System MUST implement proposal pattern for any state-changing operations
- **FR-017**: System MUST NOT execute write operations without explicit confirmation via `confirm_proposal`
- **FR-018**: System MUST expire unconfirmed proposals after a configurable timeout (default 24 hours)
- **FR-019**: System MUST allow cancellation of pending proposals via `cancel_proposal`

**Error Handling & Resilience**

- **FR-020**: System MUST return helpful error messages with actionable suggestions
- **FR-021**: System MUST handle Convex backend unavailability gracefully
- **FR-022**: System MUST log all requests and responses for audit purposes
- **FR-023**: System MUST implement rate limiting to prevent abuse

**External Access**

- **FR-024**: System MUST be accessible via public HTTPS endpoint
- **FR-025**: System MUST include CORS headers allowing access from any origin
- **FR-026**: System MUST support both stdio (Claude Desktop) and HTTP (webhooks) transport modes

### Key Entities

- **MCPRequest**: Incoming JSON-RPC request with method, params, and id
- **MCPResponse**: Outgoing JSON-RPC response with result or error
- **ToolDefinition**: Self-describing tool schema with name, description, and inputSchema
- **ToolResult**: Structured output from intelligence computation including content array
- **Proposal**: Pending write operation awaiting human confirmation; stored in Convex with business-scoped access, expires after configurable timeout
- **APIKey**: Authentication credential with associated business permissions and rate limits; validated against Convex on each request for immediate revocation support
- **AuditLog**: Record of all MCP interactions for compliance and debugging; implemented as structured CloudWatch logs with Lambda's built-in metrics for cost-effective monitoring

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can receive financial intelligence responses in Claude Desktop within 5 seconds of asking
- **SC-002**: Any MCP-compatible AI assistant can discover and use FinanSEAL tools without custom integration code
- **SC-003**: Automation platforms (Zapier, n8n) can successfully call MCP tools and parse structured responses
- **SC-004**: Zero unauthorized data exposure - all requests without valid credentials receive appropriate error
- **SC-005**: Write operations require explicit human confirmation 100% of the time
- **SC-006**: System handles 100 concurrent requests without degradation
- **SC-007**: External developers can understand all tools from tool schemas alone without reading implementation code
- **SC-008**: Audit trail captures 100% of MCP interactions with business context

## Assumptions

1. **API Key Management**: API keys will be generated and managed through the existing FinanSEAL web application; this spec does not cover key generation UI
2. **Convex Functions**: Existing `financialIntelligence.ts` queries are production-ready and will be the intelligence backend
3. **Lambda Deployment**: AWS Lambda infrastructure already exists; this spec covers the MCP handler code only
4. **Rate Limits**: Standard tier allows 60 requests/minute; premium tiers may have higher limits (not specified here)
5. **Transport Mode**: Initial deployment will be HTTP-only; stdio transport for direct Claude Desktop integration is future enhancement

## Out of Scope

- API key generation and management UI
- Billing and subscription enforcement for MCP access
- MCP Consumer functionality (connecting TO external systems like QuickBooks/Xero)
- WhatsApp/Telegram bot implementations (these are MCP clients, not the server)
- Real-time streaming responses (future enhancement)
