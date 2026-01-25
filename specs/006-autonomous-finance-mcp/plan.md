# Implementation Plan: Autonomous Finance MCP Server

**Branch**: `006-autonomous-finance-mcp` | **Date**: 2026-01-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-autonomous-finance-mcp/spec.md`

## Summary

Build a Type 3 MCP Server that exposes FinanSEAL's financial intelligence algorithms (anomaly detection, cash flow forecasting, vendor intelligence) via the Model Context Protocol. The server deploys on AWS Lambda + API Gateway (HTTP transport) and integrates with the existing LangGraph agent as an MCP client, enabling users to access proactive financial insights through the chat interface.

**Key Decisions from Clarification:**
1. **Architecture**: LangGraph + MCP only (no E2B sandbox, no Claude Code Agent swap)
2. **Deployment**: AWS Lambda + API Gateway (stateless, HTTP transport)
3. **Observability**: Sentry (existing) + CloudWatch Logs
4. **Authentication**: AWS IAM via Vercel OIDC (same pattern as doc processor)
5. **Memory**: Handled by existing mem0 tools in LangGraph agent (not in MCP server)

## Technical Context

**Language/Version**: TypeScript 5.x (MCP server), Python 3.11 (existing detection algorithms via Convex)
**Primary Dependencies**:
- `@modelcontextprotocol/sdk` - Official MCP TypeScript SDK
- `aws-cdk-lib` - AWS CDK for infrastructure
- `@langchain/langgraph` - Existing agent framework
- `convex` - Real-time database (detection algorithms)

**Storage**: Convex (actionCenterInsights table, accounting_entries)
**Testing**: Vitest (TypeScript), pytest (if Python components)
**Target Platform**: AWS Lambda (Node.js 20.x runtime), Vercel (Next.js API routes)
**Project Type**: Web application (serverless microservices)

**Performance Goals**:
- MCP tool response: <3 seconds
- Lambda cold start: <1 second with provisioned concurrency
- 100 concurrent MCP connections

**Constraints**:
- Lambda 15-minute timeout (more than sufficient)
- Vercel 60-second API timeout (SSE streaming extends this)
- Rate limit: 60 MCP calls/minute per user

**Scale/Scope**:
- Initial: <1000 concurrent users
- 3 MCP tools (detect_anomalies, forecast_cash_flow, analyze_vendor_risk)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No project constitution file found. Using standard engineering principles:
- [x] Security-first: IAM OIDC authentication, business_id validation
- [x] Simplicity: Single Lambda, stateless MCP server
- [x] Observability: Sentry + CloudWatch
- [x] Testability: Contract tests for MCP protocol

## Project Structure

### Documentation (this feature)

```text
specs/006-autonomous-finance-mcp/
├── plan.md              # This file
├── research.md          # Phase 0 output (MCP SDK patterns, Lambda HTTP handler)
├── data-model.md        # Phase 1 output (MCP tool schemas, request/response types)
├── quickstart.md        # Phase 1 output (MVP implementation path)
├── contracts/           # Phase 1 output (MCP tool interfaces, Zod schemas)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# MCP Server (new Lambda)
src/lambda/mcp-server/
├── handler.ts           # Lambda entry point with MCP SDK
├── tools/
│   ├── detect-anomalies.ts
│   ├── forecast-cash-flow.ts
│   └── analyze-vendor-risk.ts
├── lib/
│   ├── convex-client.ts # HTTP client for Convex queries
│   └── auth.ts          # Business ID validation
└── package.json         # Standalone dependencies

# Infrastructure
infra/lib/
└── mcp-server-stack.ts  # CDK stack for MCP Lambda + API Gateway

# LangGraph Integration (modifications)
src/lib/ai/
├── tools/
│   └── mcp/
│       ├── mcp-client.ts        # MCP client wrapper
│       └── mcp-tool-adapter.ts  # Adapts MCP tools to ToolFactory
└── langgraph-agent.ts           # Updated to include MCP tools
```

**Structure Decision**: Hybrid approach - new Lambda microservice for MCP server (follows existing document-processor-python pattern), modifications to existing LangGraph agent for MCP client integration.

## Complexity Tracking

> No constitution violations identified. Simple architecture:
> - 1 new Lambda (MCP server)
> - 3 existing detection algorithms (Convex functions)
> - 1 MCP client adapter (in existing agent)

## Phase 0: Research Requirements

### R1: MCP SDK HTTP Transport for Lambda
- How to configure `@modelcontextprotocol/sdk` for HTTP transport (not stdio)?
- Lambda handler pattern for JSON-RPC 2.0 request/response

### R2: MCP Client Integration Pattern
- How to create MCP client in LangGraph context?
- How to convert MCP tool responses to LangGraph tool results?

### R3: Convex HTTP API from Lambda
- How to call Convex queries from Lambda (not in Next.js context)?
- Authentication pattern for internal Lambda → Convex calls

### R4: MCP Tool Schema Design
- Best practices for MCP tool input/output schemas
- How to handle complex return types (anomalies, forecasts, risk scores)

## Phase 1: Design Deliverables

### D1: data-model.md
- MCP tool schemas (detect_anomalies, forecast_cash_flow, analyze_vendor_risk)
- Request/response TypeScript interfaces
- Error response format

### D2: contracts/mcp-tools.ts
- Zod schemas for MCP tool inputs
- Tool result types matching Convex insight data

### D3: contracts/mcp-protocol.ts
- JSON-RPC 2.0 message types
- MCP server capability declaration

### D4: quickstart.md
- Step-by-step MVP implementation (detect_anomalies only)
- Test commands for local validation
- Deployment checklist

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Vercel (Next.js)                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              LangGraph StateGraph Agent                      │   │
│  │         (existing agent + MCP client integration)            │   │
│  │              + mem0 memory tools (stateful)                  │   │
│  │                                                              │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │  ToolFactory                                         │    │   │
│  │  │  - search_documents, get_transactions, ...           │    │   │
│  │  │  - memory_store, memory_recall, ...                  │    │   │
│  │  │  + mcp_detect_anomalies (NEW)                       │    │   │
│  │  │  + mcp_forecast_cash_flow (NEW)                     │    │   │
│  │  │  + mcp_analyze_vendor_risk (NEW)                    │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  └────────────────────────────┬────────────────────────────────┘   │
└───────────────────────────────│─────────────────────────────────────┘
                                │
                                ▼ AWS IAM OIDC (Vercel → Lambda)
                                │
┌───────────────────────────────│─────────────────────────────────────┐
│                         AWS Lambda + API Gateway                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Type 3 MCP Server                               │   │
│  │              @modelcontextprotocol/sdk                       │   │
│  │              (stateless, HTTP transport)                     │   │
│  │                                                              │   │
│  │  Tools:                                                      │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌───────────────────────┐  │   │
│  │  │ detect_     │ │ forecast_   │ │ analyze_vendor_risk   │  │   │
│  │  │ anomalies   │ │ cash_flow   │ │                       │  │   │
│  │  └─────────────┘ └─────────────┘ └───────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                │                                    │
│                                ▼ Convex HTTP API                   │
└───────────────────────────────│─────────────────────────────────────┘
                                │
                      ┌─────────────────┐
                      │   Convex DB     │
                      │   (Real-time)   │
                      │                 │
                      │ Tables:         │
                      │ - actionCenter  │
                      │   Insights      │
                      │ - accounting_   │
                      │   entries       │
                      │ - vendors       │
                      └─────────────────┘
```

## Implementation Phases

### Phase 0: Research (research.md)
1. MCP SDK HTTP transport configuration
2. Lambda handler pattern for JSON-RPC
3. Convex HTTP API client pattern
4. MCP client in TypeScript

### Phase 1: Design (data-model.md, contracts/, quickstart.md)
1. MCP tool schemas and interfaces
2. Error handling patterns
3. MVP implementation guide

### Phase 2: Tasks (tasks.md via /speckit.tasks)
Generated after Phase 1 approval

## Next Steps

1. **Phase 0 Research** - Resolve MCP SDK unknowns
2. **Phase 1 Design** - Create contracts and data models
3. **Phase 2 Tasks** - Generate implementation tasks
4. **Implementation** - Build MCP server and client integration
