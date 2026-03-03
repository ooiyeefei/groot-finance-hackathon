# Data Model: PDPA Data Retention Cleanup

**Feature**: 001-pdpa-data-retention-cleanup
**Date**: 2026-03-03

## Existing Entities (No Schema Changes)

### conversations
Existing table — no modifications needed.

| Field | Type | Retention Relevance |
|-------|------|-------------------|
| `_id` | `Id<"conversations">` | Primary key |
| `_creationTime` | `number` (ms) | Fallback age for empty conversations |
| `userId` | `Id<"users">` (optional) | Owner reference |
| `businessId` | `Id<"businesses">` (optional) | Tenant isolation |
| `lastMessageAt` | `number` (optional, ms) | **Primary age field** — timestamp of last message |
| `messageCount` | `number` (optional) | Quick check for zero-message conversations |
| `isActive` | `boolean` (optional) | Not used for retention (inactive conversations still retained) |

**Existing indexes used**:
- `by_lastMessageAt`: Range query for finding old conversations

**Retention rule**: Delete when `lastMessageAt ?? _creationTime` is older than 730 days (2 years).

### messages
Existing table — no modifications needed.

| Field | Type | Retention Relevance |
|-------|------|-------------------|
| `_id` | `Id<"messages">` | Primary key |
| `_creationTime` | `number` (ms) | Not used for retention (parent conversation age determines deletion) |
| `conversationId` | `Id<"conversations">` | **Cascade link** — deleted when parent conversation expires |
| `content` | `string` | Personal data — must be permanently deleted |
| `metadata` | `any` (optional) | May contain personal data |
| `toolCalls` | `array` (optional) | AI tool invocations |

**Existing indexes used**:
- `by_conversationId`: Find all messages belonging to a conversation for cascade delete

**Retention rule**: Cascade delete with parent conversation.

### audit_events
Existing table — no modifications needed.

| Field | Type | Retention Relevance |
|-------|------|-------------------|
| `_id` | `Id<"audit_events">` | Primary key |
| `_creationTime` | `number` (ms) | **Primary age field** |
| `businessId` | `Id<"businesses">` | Tenant isolation |
| `actorUserId` | `Id<"users">` | Actor reference |
| `eventType` | `string` | Event classification |
| `targetEntityType` | `string` | Affected entity type |
| `targetEntityId` | `string` | Affected entity ID |
| `details` | `any` (optional) | Event metadata |

**Existing indexes**: `by_businessId`, `by_actorUserId`, `by_eventType`, `by_targetEntityType`
**No age-based index** — use paginated scan with `_creationTime` filter.

**Retention rule**: Delete when `_creationTime` is older than 1,095 days (3 years).

### export_history
Existing table — no modifications needed.

| Field | Type | Retention Relevance |
|-------|------|-------------------|
| `_id` | `Id<"export_history">` | Primary key |
| `_creationTime` | `number` (ms) | **Primary age field** |
| `businessId` | `Id<"businesses">` | Tenant isolation |
| `storageId` | `Id<"_storage">` (optional) | **File reference** — must delete file before record |
| `status` | `"completed" \| "failed" \| "archived"` | Filter for cleanup eligibility |
| `expiresAt` | `number` (optional, ms) | Used by existing 90-day archiver (not for 1-year deletion) |

**Existing indexes**: `by_businessId`, `by_expiresAt`

**Retention rule**: Delete when `_creationTime` is older than 365 days (1 year). Delete associated Convex storage file first.

## Entity Relationships for Cleanup

```
conversations (1) ──── (N) messages
     │                        │
     │  Delete conversation    │  Cascade: delete all messages
     │  when lastMessageAt     │  belonging to conversation
     │  > 2 years              │
     │                        │
     └────────────────────────┘

audit_events (independent)
     │
     │  Delete when _creationTime > 3 years
     │  No cascade required
     │
     └────────────────────────

export_history (independent)
     │
     │  Delete file (storageId) first
     │  Then delete record when _creationTime > 1 year
     │
     └────────────────────────
```

## State Transitions

### Export History Lifecycle (existing + new)
```
created → completed → archived (90-day file cleanup) → DELETED (1-year record cleanup) [NEW]
created → failed → DELETED (30-day existing cleanup)
```

### Conversation Lifecycle (new)
```
active (messages flowing) → inactive (no messages for 2 years) → DELETED [NEW]
```

### Audit Event Lifecycle (new)
```
created → DELETED (after 3 years) [NEW]
```
