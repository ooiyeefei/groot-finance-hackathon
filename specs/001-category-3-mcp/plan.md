# Implementation Plan: Category 3 MCP Server with Domain Intelligence

**Branch**: `001-category-3-mcp` | **Date**: 2026-01-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-category-3-mcp/spec.md`

## Summary

Implement a production-ready MCP (Model Context Protocol) server that exposes FinanSEAL's financial intelligence algorithms to external AI agents (Claude Desktop, Cursor, Zapier). Following the Clockwise pattern: domain intelligence stays server-side, tools self-describe via JSON-RPC 2.0, and write operations require human approval via proposals.

**Key deliverables:**
1. Complete MCP JSON-RPC 2.0 handler (exists partially)
2. API key authentication with per-request Convex validation
3. Full tool schema self-description for `tools/list`
4. Proposal system for write operations (P2)
5. Rate limiting and structured logging

## Technical Context

**Language/Version**: TypeScript 5.3+ / Node.js 20.x (Lambda runtime)
**Primary Dependencies**:
- `@modelcontextprotocol/sdk` ^1.0.0 - MCP protocol implementation
- `zod` ^3.22.0 - Runtime schema validation
- `convex` - Backend database and intelligence queries
- AWS Lambda + API Gateway - Hosting

**Storage**:
- Convex (existing) - Business data, financial intelligence
- Convex (new) - API keys table, proposals table

**Testing**: Vitest (existing in main project), manual MCP client testing

**Target Platform**: AWS Lambda (ARM64) behind API Gateway, public HTTPS endpoint

**Project Type**: Serverless function (single Lambda) + Convex backend

**Performance Goals**:
- <5 seconds end-to-end response (SC-001)
- 100 concurrent requests without degradation (SC-006)

**Constraints**:
- Lambda timeout: 30 seconds
- API Gateway rate limit: 100 req/s burst, 200 sustained
- Cold start latency acceptable (<3s typical for Node.js)

**Scale/Scope**:
- Initially targeting <100 businesses
- ~60 requests/minute per API key (rate limit)
- 3 read tools + 3 proposal tools (P2)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Note**: Project constitution (`constitution.md`) contains template placeholders only. No specific gates defined. Proceeding with industry best practices:

| Principle | Status | Notes |
|-----------|--------|-------|
| Test coverage | PASS | Will add Vitest tests for MCP handler |
| API contracts | PASS | Zod schemas + OpenAPI in contracts/ |
| Security | PASS | API key auth, per-request validation |
| Observability | PASS | Structured logs + Lambda built-in metrics |
| Simplicity | PASS | Single Lambda, no new services |

## Project Structure

### Documentation (this feature)

```text
specs/001-category-3-mcp/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (OpenAPI specs)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/lambda/mcp-server/           # EXISTS - MCP Lambda handler
├── handler.ts                   # Main Lambda entry point
├── contracts/                   # Zod schemas for MCP protocol
│   ├── mcp-protocol.ts          # JSON-RPC 2.0 types
│   └── mcp-tools.ts             # Tool input/output schemas
├── tools/                       # Tool implementations
│   ├── index.ts                 # Tool registry
│   ├── detect-anomalies.ts      # EXISTS
│   ├── forecast-cash-flow.ts    # EXISTS
│   └── analyze-vendor-risk.ts   # EXISTS
└── lib/                         # Shared utilities
    ├── auth.ts                  # API key validation (TO ENHANCE)
    └── convex-client.ts         # Convex HTTP client

convex/                          # EXISTS - Convex backend
├── functions/
│   └── financialIntelligence.ts # EXISTS - Intelligence algorithms
├── schema.ts                    # TO ADD: api_keys, mcp_proposals tables
└── lib/

infra/lib/                       # EXISTS - CDK infrastructure
└── mcp-server-stack.ts          # Lambda + API Gateway (deployed)
```

**Structure Decision**: Extend existing `src/lambda/mcp-server/` structure. Add Convex tables for api_keys and proposals. No new services or packages needed.

## Complexity Tracking

No constitution violations requiring justification.

| Decision | Rationale |
|----------|-----------|
| Single Lambda | Sufficient for <100 businesses, simpler than microservices |
| Convex for proposals | Consistent with existing data layer, business-scoped access |
| No Redis cache | Per-request Convex validation preferred for immediate revocation |

---

## Phase Completion Status

| Phase | Status | Output |
|-------|--------|--------|
| Phase 0: Research | **COMPLETE** | [research.md](./research.md) |
| Phase 1: Design | **COMPLETE** | [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md) |
| Phase 2: Tasks | PENDING | Run `/speckit.tasks` to generate |

### Generated Artifacts

- `research.md` - Technical decisions and alternatives
- `data-model.md` - Convex schema for api_keys, proposals, rate_limits
- `contracts/mcp-server-openapi.yaml` - OpenAPI 3.0 specification
- `quickstart.md` - Developer setup and testing guide
- `CLAUDE.md` - Updated with active technology context
