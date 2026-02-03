# Data Model: Category 3 MCP Server

**Phase**: 1 - Design
**Date**: 2026-01-28

## Overview

Two new Convex tables required for MCP server functionality:
1. `mcp_api_keys` - API key authentication and authorization
2. `mcp_proposals` - Human approval workflow for write operations

Existing tables remain unchanged. New tables follow existing patterns (business-scoped, soft-delete capable).

---

## New Entities

### 1. MCP API Key (`mcp_api_keys`)

**Purpose**: Authenticate external MCP clients, authorize access to specific businesses and tools.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | Hashed API key (bcrypt) - never store plaintext |
| `keyPrefix` | string | Yes | First 8 chars for identification (e.g., `fsk_abc1`) |
| `businessId` | id("businesses") | Yes | Business this key has access to |
| `name` | string | Yes | Human-readable name (e.g., "Zapier Integration") |
| `permissions` | string[] | Yes | Allowed tools: `["detect_anomalies", "forecast_cash_flow", ...]` |
| `rateLimitPerMinute` | number | Yes | Requests per minute (default: 60) |
| `expiresAt` | number | No | Optional expiration timestamp |
| `lastUsedAt` | number | No | Last successful request timestamp |
| `createdBy` | id("users") | Yes | User who created this key |
| `createdAt` | number | Yes | Creation timestamp |
| `revokedAt` | number | No | Soft-delete: revocation timestamp |

**Indexes**:
- `by_keyPrefix` - Fast lookup during authentication
- `by_businessId` - List all keys for a business
- `by_businessId_status` - List active keys for a business

**Validation Rules**:
- `keyPrefix` must be unique
- `permissions` must only contain valid tool names
- `rateLimitPerMinute` must be 1-1000
- `businessId` must reference active business

**State Transitions**:
```
created → active → revoked (terminal)
                 ↘ expired (if expiresAt set)
```

---

### 2. MCP Proposal (`mcp_proposals`)

**Purpose**: Store pending write operations awaiting human confirmation (Clockwise pattern).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `businessId` | id("businesses") | Yes | Business context for this proposal |
| `createdBy` | id("mcp_api_keys") | Yes | API key that created proposal |
| `operations` | Operation[] | Yes | List of operations to execute |
| `summary` | string | Yes | Human-readable summary |
| `status` | enum | Yes | `pending`, `confirmed`, `cancelled`, `expired` |
| `expiresAt` | number | Yes | Auto-expire timestamp (created + 24h) |
| `confirmedAt` | number | No | When proposal was confirmed |
| `confirmedBy` | string | No | API key prefix or user ID who confirmed |
| `executionResult` | object | No | Result after execution (success/errors) |
| `createdAt` | number | Yes | Creation timestamp |

**Operation Type**:
```typescript
Operation = {
  type: string,      // "approve_expense", "reject_expense", "schedule_payment"
  targetId: string,  // Entity ID to operate on
  params: object,    // Operation-specific parameters
}
```

**Indexes**:
- `by_businessId_status` - List pending proposals for a business
- `by_expiresAt` - Find expired proposals for cleanup cron

**Validation Rules**:
- `operations` must have at least 1 operation
- `operations` must only reference valid operation types
- Each operation's `targetId` must exist and be accessible to business
- `expiresAt` must be within 24 hours of creation

**State Transitions**:
```
pending → confirmed (user approves) → [operations executed]
       ↘ cancelled (user cancels)
       ↘ expired (24h timeout, cron job)
```

---

## Convex Schema Addition

```typescript
// Add to convex/schema.ts

export const mcp_api_keys = defineTable({
  key: v.string(),
  keyPrefix: v.string(),
  businessId: v.id("businesses"),
  name: v.string(),
  permissions: v.array(v.string()),
  rateLimitPerMinute: v.number(),
  expiresAt: v.optional(v.number()),
  lastUsedAt: v.optional(v.number()),
  createdBy: v.id("users"),
  createdAt: v.number(),
  revokedAt: v.optional(v.number()),
})
  .index("by_keyPrefix", ["keyPrefix"])
  .index("by_businessId", ["businessId"])
  .index("by_businessId_active", ["businessId", "revokedAt"]);

export const mcp_proposals = defineTable({
  businessId: v.id("businesses"),
  createdBy: v.id("mcp_api_keys"),
  operations: v.array(v.object({
    type: v.string(),
    targetId: v.string(),
    params: v.any(),
  })),
  summary: v.string(),
  status: v.union(
    v.literal("pending"),
    v.literal("confirmed"),
    v.literal("cancelled"),
    v.literal("expired")
  ),
  expiresAt: v.number(),
  confirmedAt: v.optional(v.number()),
  confirmedBy: v.optional(v.string()),
  executionResult: v.optional(v.any()),
  createdAt: v.number(),
})
  .index("by_businessId_status", ["businessId", "status"])
  .index("by_expiresAt", ["expiresAt"]);

// Optional: Rate limiting table (if not using in-memory)
export const mcp_rate_limits = defineTable({
  apiKeyId: v.id("mcp_api_keys"),
  windowStart: v.number(),
  requestCount: v.number(),
})
  .index("by_apiKeyId", ["apiKeyId"]);
```

---

## Entity Relationships

```
┌─────────────────┐     ┌─────────────────┐
│   businesses    │────<│  mcp_api_keys   │
└─────────────────┘     └────────┬────────┘
                                 │
                                 │ creates
                                 ▼
                        ┌─────────────────┐
                        │  mcp_proposals  │
                        └─────────────────┘
                                 │
                                 │ operates on
                                 ▼
                        ┌─────────────────┐
                        │ expense_claims  │
                        │    invoices     │
                        │    payments     │
                        └─────────────────┘
```

---

## Supported Operations (P2)

| Operation Type | Target Entity | Params | Effect |
|---------------|---------------|--------|--------|
| `approve_expense` | expense_claims | `{ note?: string }` | Set status to approved |
| `reject_expense` | expense_claims | `{ reason: string }` | Set status to rejected |
| `request_revision` | expense_claims | `{ comments: string }` | Set status to needs_revision |

Additional operations can be added incrementally.

---

## Migration Notes

1. **Schema deployment**: Run `npx convex deploy` after schema.ts changes
2. **No data migration**: New tables, no existing data affected
3. **Backward compatible**: Existing MCP handler continues to work without auth until auth middleware added
