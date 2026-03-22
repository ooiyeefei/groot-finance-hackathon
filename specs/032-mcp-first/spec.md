# Feature Specification: MCP-First Tool Architecture

**Feature Branch**: `032-mcp-first`
**Created**: 2026-03-22
**Status**: Draft
**Input**: GitHub Issue #354 — MCP-first architecture: build new agent tools as MCP endpoints

## User Scenarios & Testing *(mandatory)*

### User Story 1 - New Agent Capabilities via MCP (Priority: P1)

When the development team builds a new agent tool (e.g., tax compliance check, fraud detection, budget alert), the tool is implemented as an MCP server endpoint first. The chat agent, future Slack bot, API partners, and mobile app all consume the same tool through a single MCP interface — ensuring consistent behavior, one place to fix bugs, and one place to add features.

**Why this priority**: This is the core architectural shift. Every new tool built the old way (tool-factory only) increases migration debt. Stopping the bleeding is the highest-value action.

**Independent Test**: Build one new tool exclusively as an MCP endpoint, verify the chat agent can call it via the MCP client layer, and confirm no parallel tool-factory implementation exists.

**Acceptance Scenarios**:

1. **Given** a developer needs to add a new agent tool, **When** they follow the MCP-first development guide, **Then** the tool is created as an MCP server endpoint with a defined contract, and the chat agent calls it through the MCP client layer.
2. **Given** a new MCP tool exists, **When** a different consumer (e.g., Slack bot or API partner) needs the same capability, **Then** they can call the same MCP endpoint without any additional implementation.
3. **Given** the development guidelines are updated, **When** a developer attempts to add a tool to the tool-factory directly, **Then** the CLAUDE.md rules and code review process flag it as a violation.

---

### User Story 2 - Migrate Existing Tool-Factory Tools to MCP (Priority: P2)

The 22 tools currently exclusive to the tool-factory are migrated to MCP endpoints in batches. After migration, the tool-factory becomes a thin client wrapper that translates LangGraph tool calls into MCP requests — no business logic remains in the tool-factory.

**Why this priority**: Reduces the dual-system maintenance burden. Each migrated tool removes one place where bugs can hide. However, existing tools already work — this is debt reduction, not new capability.

**Independent Test**: Migrate one batch of tools (e.g., the 4 data retrieval tools), verify the chat agent continues to function identically (same responses, same RBAC enforcement), and confirm the tool-factory delegates to MCP for those tools.

**Acceptance Scenarios**:

1. **Given** an existing tool-factory tool (e.g., `get_invoices`), **When** it is migrated to MCP, **Then** the chat agent produces identical results before and after migration for the same user query.
2. **Given** all tools in a migration batch are moved to MCP, **When** the tool-factory is updated to delegate to MCP, **Then** no business logic remains in the tool-factory for those tools — only MCP client calls and response formatting.
3. **Given** the migration is phased over 3 sprints, **When** only Phase 1 is complete, **Then** the system works correctly with a mix of direct tool-factory tools and MCP-delegated tools.

---

### User Story 3 - Tool Factory as Thin MCP Client Wrapper (Priority: P3)

After all tools are migrated, the tool-factory is refactored into a thin adapter layer. It handles only: (a) translating LangGraph/OpenAI-format tool schemas to MCP calls, (b) RBAC filtering (which tools each role can see), and (c) response formatting for the chat UI. All business logic lives in the MCP server.

**Why this priority**: This is the end-state that delivers the full architectural benefit. It depends on P1 and P2 being complete. Once achieved, there is truly one source of truth for all tool behavior.

**Independent Test**: After refactoring, the tool-factory file should be significantly smaller (schema generation + MCP client calls only). Verify that removing any tool from the MCP server causes the corresponding chat capability to fail (proving no fallback logic exists in the tool-factory).

**Acceptance Scenarios**:

1. **Given** all tools are MCP endpoints, **When** the tool-factory is refactored, **Then** it contains no direct database queries, no business logic, and no AI model calls — only MCP client invocations.
2. **Given** the thin wrapper is deployed, **When** a tool's behavior needs to change (e.g., fixing a bug in anomaly detection), **Then** the fix is made only in the MCP server and all consumers (chat, Slack, API) get the fix automatically.
3. **Given** the refactored tool-factory, **When** a new consumer (e.g., Slack bot) needs tool access, **Then** it can use the MCP server directly without any tool-factory dependency.

---

### Edge Cases

- What happens when the MCP server is unavailable (cold start, timeout, error)? The chat agent retries once, then shows a user-friendly error ("I couldn't fetch that right now, please try again"). No fallback to direct tool-factory execution — the MCP server is the single source of truth, and maintaining fallback logic defeats the purpose of consolidation.
- What happens when a tool exists on MCP but the tool-factory hasn't been updated to delegate to it yet? During the transition period, the system must work correctly with mixed direct/delegated tools.
- What happens when RBAC rules differ between tool-factory filtering and MCP-level validation? RBAC must be enforced consistently — the tool-factory filters which tools are visible, the MCP server validates authorization on each call.
- What happens when an MCP tool contract changes (input/output schema)? Breaking changes are deployed as coordinated releases — the MCP server and all consumers are updated in the same release. No versioned endpoints are maintained.
- What happens when multiple consumers call the same MCP tool concurrently? The MCP server must handle concurrent requests without state corruption.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All new agent tools MUST be implemented as MCP server endpoints first, with no parallel implementation in the tool-factory.
- **FR-002**: The MCP server MUST expose a defined contract (input schema, output schema, description) for each tool, following the existing JSON-RPC 2.0 protocol.
- **FR-003**: The chat agent MUST be able to call MCP tools via the existing MCP client helper (`callMCPTool()` / `callMCPToolsBatch()`), with no changes to the user-facing chat experience.
- **FR-004**: The tool-factory MUST support a mixed mode during migration — some tools delegate to MCP, others remain direct — without degrading the chat experience.
- **FR-005**: RBAC enforcement MUST be maintained at two levels: (a) the tool-factory filters tool visibility by user role, (b) the MCP server validates authorization on each request.
- **FR-006**: The MCP server MUST return errors in a structured format that the tool-factory wrapper can translate into user-friendly chat messages.
- **FR-007**: Existing tool behavior MUST be preserved exactly after migration — same inputs produce same outputs for all 22 tools being migrated.
- **FR-008**: The migration MUST be phased (3 phases) with each phase independently deployable and rollback-safe. Phase 2 tools MUST be grouped by domain (finance/AP/AR, team/manager, memory, misc) so that complete user workflows can be regression-tested after each batch.
- **FR-009**: The development guidelines MUST be updated to enforce MCP-first tool development for all future tools.
- **FR-010**: All MCP tool endpoints MUST be callable by any authenticated consumer (chat agent, EventBridge jobs, future Slack bot, API partners) through the same interface.
- **FR-011**: Memory tools (`memory_store`, `memory_search`, `memory_recall`, `memory_forget`) MUST maintain their current latency characteristics (<100ms) after migration to MCP.
- **FR-012**: Write-operation tools MUST use the existing MCP proposal pattern (create_proposal → confirm_proposal → execute) for operations that modify data.
- **FR-013**: When an MCP tool call fails, the tool-factory wrapper MUST retry once, then return a user-friendly error message to the chat. No fallback to direct tool-factory execution is permitted.
- **FR-014**: Each MCP tool call MUST be logged with structured fields (tool name, latency, success/error, consumer, businessId) using the existing MCP server logger. CloudWatch alarms MUST alert the dev team on error spikes. Per-tool execution metrics MUST be tracked in the existing daily metrics table.

### Key Entities

- **MCP Tool**: A capability exposed by the MCP server — has a name, input schema, output schema, description, and authorization requirements.
- **Tool-Factory Wrapper**: The adapter layer in the chat agent that translates LangGraph tool calls into MCP requests and formats responses for the chat UI.
- **MCP Contract**: The formal definition of a tool's interface — input parameters, output shape, error codes, and required permissions.
- **Consumer**: Any system that calls MCP tools — the chat agent (via tool-factory), EventBridge cron jobs (via internal actions), future Slack bot, API partners, mobile app.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All new tools developed after this feature is complete are MCP-first — zero new tools added directly to the tool-factory.
- **SC-002**: Chat agent response quality is unchanged after migration — same queries produce equivalent results (verified by regression testing against a set of representative queries per tool).
- **SC-003**: Chat response latency increases by less than 150ms per tool call after migration to MCP (accounting for the network hop to the MCP server).
- **SC-004**: After Phase 3, the tool-factory contains no business logic — only MCP client calls, RBAC filtering, and response formatting.
- **SC-005**: Any new consumer (e.g., Slack bot) can access all agent tools by calling the MCP server directly, without depending on the tool-factory.
- **SC-006**: Bug fixes to tool behavior require changes in only one place (the MCP server), not multiple locations.
- **SC-007**: The migration is completed across 3 phases with no user-facing downtime or degradation.

## Clarifications

### Session 2026-03-22

- Q: When MCP server is unavailable during chat, what should the agent do? → A: Retry once, then show user-friendly error. No fallback to direct tool-factory execution.
- Q: How should the 22 unmigrated tools be grouped into migration batches? → A: By domain (finance/AP/AR batch, team/manager batch, memory batch, misc batch) so complete user workflows can be tested after each batch.
- Q: What level of observability is needed for MCP tool calls? → A: B+ — reuse existing structured logger (`logger.ts`), add CloudWatch alarms to `mcp-server-stack.ts` (copy pattern from scheduled-intelligence), extend `dspy_metrics_daily` table for MCP tool names. Dashboard deferred to follow-up issue.
- Q: How should MCP tool contract changes (input/output schema) be handled? → A: Breaking changes allowed with coordinated deploys — all consumers updated in the same release. No versioned endpoints needed at current scale.

## Assumptions

- The existing MCP server infrastructure has sufficient capacity for the additional tool traffic from the chat agent. Current MCP usage is limited to EventBridge jobs and some internal actions.
- The ~50-100ms latency added by the MCP server network hop is acceptable for chat UX (current chat responses take 3-6 seconds).
- Memory tools can be migrated to MCP without violating the <100ms latency requirement — this may require keeping vector search calls within the MCP server or accepting a slight latency increase.
- The JSON-RPC 2.0 protocol and internal service key authentication used by the current MCP server are sufficient for all consumers.
- RBAC rules currently defined in the tool-factory can be replicated or referenced in the MCP server without duplicating the role definitions.

## Dependencies

- Existing MCP server infrastructure (Lambda + API Gateway + CDK stack)
- MCP client helper for internal service calls
- Tool-factory and all 34 registered tools
- RBAC system in tool-factory (role-based tool filtering)
- EventBridge scheduled intelligence stack (existing MCP consumer)
