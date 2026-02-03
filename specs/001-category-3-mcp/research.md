# Research: Category 3 MCP Server

**Phase**: 0 - Research & Discovery
**Date**: 2026-01-28

## Research Summary

All technical unknowns resolved. No blocking questions remain.

---

## 1. MCP Protocol Implementation

**Question**: What is the correct MCP protocol version and message format?

**Decision**: Use MCP Protocol Version `2024-11-05` with JSON-RPC 2.0

**Rationale**:
- Existing handler already implements correct protocol version
- JSON-RPC 2.0 is the MCP standard transport format
- `@modelcontextprotocol/sdk` ^1.0.0 provides type-safe implementation

**Alternatives Considered**:
- Server-Sent Events (SSE) streaming - Deferred to future enhancement (FR-026 mentions stdio support)
- WebSocket - Overkill for stateless Lambda architecture

**Source**: Existing `src/lambda/mcp-server/contracts/mcp-protocol.ts` + MCP specification

---

## 2. API Key Storage & Validation

**Question**: How should API keys be stored and validated?

**Decision**: Store in Convex `mcp_api_keys` table, validate per-request via Convex query

**Rationale**:
- Immediate revocation support (clarification session decision)
- Consistent with existing Convex data architecture
- Business-scoped access via existing membership patterns
- No additional infrastructure (Redis, DynamoDB) needed

**Alternatives Considered**:
- Lambda memory cache - Rejected: revocation delay until cold start
- Redis cache with short TTL - Rejected: additional cost, complexity
- JWT tokens - Rejected: harder to revoke, requires token refresh flow

**Schema Design**:
```typescript
mcp_api_keys: defineTable({
  key: v.string(),              // Hashed key (stored), plaintext never persisted
  keyPrefix: v.string(),        // First 8 chars for identification (fsk_abc123...)
  businessId: v.id("businesses"),
  name: v.string(),             // Human-readable name
  permissions: v.array(v.string()), // Tool access list
  rateLimitPerMinute: v.number(), // Default 60
  expiresAt: v.optional(v.number()), // Optional expiration
  lastUsedAt: v.optional(v.number()),
  createdAt: v.number(),
  revokedAt: v.optional(v.number()),
})
```

---

## 3. Rate Limiting Strategy

**Question**: How should rate limiting be implemented?

**Decision**: Sliding window counter in Convex with Lambda enforcement

**Rationale**:
- API Gateway provides burst protection (100 req/s)
- Per-API-key rate limiting requires state (Convex)
- Simple sliding window counter sufficient for 60 req/min
- Returns `RATE_LIMITED` error with `retry-after` header

**Alternatives Considered**:
- API Gateway usage plans - Doesn't support per-API-key limits
- Redis rate limiter - Additional infrastructure cost
- Token bucket algorithm - Overkill for simple rate limiting

**Implementation**:
```typescript
// Convex mutation to check and increment rate limit
mcp_rate_limits: defineTable({
  apiKeyId: v.id("mcp_api_keys"),
  windowStart: v.number(),      // Timestamp of window start
  requestCount: v.number(),     // Requests in current window
})
```

---

## 4. Proposal System for Write Operations

**Question**: How should the human approval proposal system work?

**Decision**: Convex `mcp_proposals` table with 24-hour expiration cron job

**Rationale**:
- Follows Clockwise pattern: "system never auto-writes"
- Proposals stored with business-scoped access
- AI agent creates proposal → User reviews in FinanSEAL UI or confirms via MCP
- Expired proposals cleaned up by scheduled function

**Alternatives Considered**:
- In-memory proposals - Rejected: lost on Lambda cold start
- External queue (SQS) - Overkill: adds complexity without benefit

**Schema Design**:
```typescript
mcp_proposals: defineTable({
  businessId: v.id("businesses"),
  createdBy: v.id("mcp_api_keys"),
  operations: v.array(v.object({
    type: v.string(),           // "approve_expense", "schedule_payment", etc.
    targetId: v.string(),       // Entity ID to operate on
    params: v.any(),            // Operation-specific parameters
  })),
  summary: v.string(),          // Human-readable summary
  status: v.union(
    v.literal("pending"),
    v.literal("confirmed"),
    v.literal("cancelled"),
    v.literal("expired")
  ),
  expiresAt: v.number(),        // Created + 24 hours
  confirmedAt: v.optional(v.number()),
  confirmedBy: v.optional(v.string()), // API key prefix or user ID
  createdAt: v.number(),
})
```

---

## 5. Tool Schema Self-Description

**Question**: How should tools describe themselves for AI agent discovery?

**Decision**: Zod schemas with `.describe()` annotations, converted to JSON Schema for `tools/list`

**Rationale**:
- Existing implementation uses Zod for validation
- Zod `.describe()` provides documentation in schema
- `zod-to-json-schema` can generate JSON Schema for MCP response
- Single source of truth: validation + documentation

**Current Gap**: Existing `tools/list` handler returns incomplete schema (missing property types)

**Fix Required**:
```typescript
// Current (incomplete):
properties: Object.fromEntries(
  Object.entries(tool.inputSchema.shape || {}).map(([key, schema]) => {
    return [key, { type: 'string', description: schema.description }];
  })
)

// Fixed (complete JSON Schema):
import { zodToJsonSchema } from 'zod-to-json-schema';
inputSchema: zodToJsonSchema(tool.inputSchema, { target: 'openApi3' })
```

---

## 6. Observability & Logging

**Question**: What logging and metrics should be implemented?

**Decision**: Structured JSON logs + Lambda built-in CloudWatch metrics

**Rationale**:
- Cost-effective (free Lambda metrics + minimal log storage)
- Structured logs enable CloudWatch Insights queries
- Lambda automatically tracks invocations, errors, duration
- Can upgrade to custom metrics later if needed

**Log Format**:
```json
{
  "timestamp": "2026-01-28T10:30:00Z",
  "level": "info",
  "event": "mcp_request",
  "method": "tools/call",
  "tool": "detect_anomalies",
  "apiKeyPrefix": "fsk_abc1****",
  "businessId": "biz_123",
  "duration_ms": 1234,
  "status": "success"
}
```

---

## 7. Transport Mode (Claude Desktop stdio)

**Question**: How will Claude Desktop connect to the MCP server?

**Decision**: HTTP-only for initial release, stdio deferred

**Rationale**:
- spec.md Assumption #5: "Initial deployment will be HTTP-only"
- HTTP via API Gateway already deployed and working
- stdio requires local proxy or different architecture
- Can add stdio wrapper later that calls HTTP endpoint

**Claude Desktop Config (HTTP mode)**:
```json
{
  "mcpServers": {
    "finanseal": {
      "url": "https://api.finanseal.com/v1/mcp",
      "headers": {
        "Authorization": "Bearer fsk_..."
      }
    }
  }
}
```

---

## Best Practices Applied

| Area | Best Practice | Implementation |
|------|---------------|----------------|
| Security | Never store plaintext API keys | Hash with bcrypt, store prefix only |
| Security | Validate on every request | Convex query, no caching |
| Protocol | JSON-RPC 2.0 error codes | Standard codes + MCP-specific range |
| Resilience | Graceful degradation | Return helpful errors, never expose internals |
| Observability | Structured logging | JSON format with correlation IDs |
| Simplicity | Single Lambda | No microservices until scale requires |

---

## Open Items (None Blocking)

All research questions resolved. Ready for Phase 1 design.
