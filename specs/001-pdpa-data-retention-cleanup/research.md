# Research: PDPA Data Retention Cleanup

**Feature**: 001-pdpa-data-retention-cleanup
**Date**: 2026-03-03

## R1: Conversation Retention Query Strategy

**Decision**: Use `lastMessageAt` field with fallback to `_creationTime` for conversation age determination.

**Rationale**:
- `conversations` table already has `lastMessageAt: v.optional(v.number())` — a denormalized timestamp of the last message
- Index `by_lastMessageAt` already exists — enables efficient range queries without full table scan
- For conversations with zero messages, `lastMessageAt` is `undefined` — fallback to `_creationTime` (per FR-011 clarification)
- This aligns with the existing sorting pattern in `conversations.ts` list function: `a.lastMessageAt ?? a._creationTime`

**Alternatives considered**:
- Query every conversation's messages to find the latest `_creationTime` — rejected (N+1 query pattern, extremely slow)
- Use conversation `_creationTime` only — rejected (would delete conversations still actively used)
- Use conversation `updatedAt` — rejected (not reliably set on all records, especially migrated data)

## R2: Cascade Delete Pattern for Conversations

**Decision**: Delete all messages first (via `by_conversationId` index), then delete the conversation record.

**Rationale**:
- Existing `conversations.remove()` mutation already implements this exact pattern (lines 457-515)
- `messages.by_conversationId` index enables efficient lookup of all messages belonging to a conversation
- Messages have no file references (no `storageId` or `storagePath` fields) — pure database deletion
- Conversation deletion is the "parent" operation; message deletion is the "child" operation

**Alternatives considered**:
- Delete conversation first, then messages — rejected (orphans messages if job fails mid-execution)
- Soft-delete instead of hard-delete — rejected (PDPA requires actual data removal, not just flagging)

## R3: Audit Events Cleanup Index Strategy

**Decision**: Query `audit_events` using `_creationTime` system field. No new index needed initially — use paginated `collect()` with in-memory filtering.

**Rationale**:
- `audit_events` has no `expiresAt` field and no age-based index
- Convex does not support indexing on the system `_creationTime` field directly in user-defined indexes
- For the 3-year retention period, the volume of expired records will be low (system is <3 years old)
- Adding a compound index adds schema complexity for minimal initial benefit
- If volume grows, a future optimization can add an `expiresAt` field set at creation time

**Alternatives considered**:
- Add `by_creationTime` index — rejected (Convex doesn't support indexing `_creationTime` in user schema)
- Add `expiresAt` field + index on all existing records — rejected (requires backfill migration, over-engineering for initial launch)
- Full table scan with `.collect()` — rejected for large datasets, but acceptable with `.take(BATCH_SIZE)` pagination

## R4: Export History Cleanup Strategy

**Decision**: Add a new `deleteExpired` function that hard-deletes records older than 1 year, complementing the existing `archiveExpired` (90-day file cleanup).

**Rationale**:
- Existing `archiveExpired` handles 90-day file cleanup: deletes Convex storage file, patches status to "archived"
- After 1 year, the "archived" records themselves should be hard-deleted
- The `by_expiresAt` index is not useful here since `expiresAt` is set for the 90-day archival, not 1-year deletion
- Instead, query by `_creationTime` — records older than 365 days that are in "archived" or "failed" status
- The existing `deleteOldFailures` function (30-day failed record cleanup) already does a similar full-scan pattern

**Alternatives considered**:
- Reuse `archiveExpired` with longer timeout — rejected (different operation: archive vs delete)
- Set a second `expiresAt` on archival — rejected (adds schema complexity)

## R5: Batch Processing Strategy

**Decision**: Process up to 500 records per cron invocation using `.take(BATCH_SIZE)`. If more remain, they'll be picked up on the next daily run.

**Rationale**:
- Convex mutations have a 10-second execution timeout
- Existing patterns (notifications, exports) use `.collect()` which loads all matching records into memory — risky for large datasets
- `.take(500)` limits both memory usage and execution time
- Daily cron schedule means remaining records are processed the next day
- 500 is conservative enough to avoid timeouts even with cascading deletes (conversations with many messages)

**Alternatives considered**:
- Unlimited `.collect()` like existing patterns — rejected (timeout risk with large volumes)
- `.take(100)` — rejected (too conservative, would take many days to clear backlog)
- `.take(1000)` — rejected (risk of timeout with cascade deletes where each conversation may have hundreds of messages)
- Recursive scheduling (process batch, schedule another run) — rejected (adds complexity, daily schedule is sufficient)

## R6: Audit Trail Implementation

**Decision**: Use `console.log()` with structured JSON for cleanup audit trail. No dedicated database table.

**Rationale**:
- Convex captures all `console.log` output in the dashboard logs, with timestamps and function context
- Writing to a separate `cleanup_logs` table would create more data that itself needs retention management (circular problem)
- Structured JSON logging (e.g., `{ type: "retention_cleanup", table: "conversations", deleted: 42, timestamp: ... }`) is searchable in Convex dashboard
- Aligns with FR-013 requirement for summary counts without over-engineering
- If dedicated table is needed later, it can be added without changing the cleanup functions

**Alternatives considered**:
- Dedicated `cleanup_logs` Convex table — rejected (creates data that needs its own retention policy)
- Write to audit_events table — rejected (audit_events themselves have a 3-year retention; also circular)
- External logging service — rejected (over-engineering for current scale)

## R7: S3 File Cleanup Architecture (User Story 5 — P3)

**Decision**: Defer S3 file cleanup to future iteration. Current implementation only handles Convex File Storage deletion (already supported by export history archiver).

**Rationale**:
- For the three new cleanup targets (chat, audit, exports):
  - Chat conversations/messages: **no file references** — pure DB deletion
  - Audit events: **no file references** — pure DB deletion
  - Export history: uses **Convex File Storage** (not S3) — existing `ctx.storage.delete()` API handles this
- S3 file cleanup is only needed for 7-year retention records (expense claims, invoices) which are not being auto-deleted yet
- Per CLAUDE.md architecture rules: S3 operations must go through Lambda (Convex can't access S3 directly)
- Building Lambda integration now would be premature — no records need S3 cleanup for years

**Alternatives considered**:
- Build Lambda + S3 cleanup now — rejected (YAGNI, no records expire for ~5 more years)
- Add S3 cleanup to existing document-processing Lambda — rejected (scope creep, different function purpose)

## R8: Cron Schedule Timing

**Decision**: Schedule new cleanup jobs between 3:00–4:00 AM UTC, staggered 30 minutes apart.

**Rationale**:
- Existing cleanup crons: 2:00 AM (insights), 2:30 AM (notifications), 3:00 AM (credit packs)
- New crons should follow the same off-peak window (FR-001: 2:00–5:00 AM UTC)
- Stagger by 30 minutes to avoid concurrent execution pressure:
  - 3:00 AM — chat conversation cleanup (heaviest: cascade deletes)
  - 3:30 AM — audit event cleanup (lightweight: single table)
  - 4:00 AM — export history cleanup (moderate: file + record deletion)
- Wait, 3:00 AM conflicts with existing `expire-credit-packs`. Adjust to:
  - 3:30 AM — chat conversation cleanup
  - 4:00 AM — audit event cleanup
  - 4:30 AM — export history cleanup

**Alternatives considered**:
- Run all three at the same time — rejected (concurrent load on database)
- Run hourly instead of daily — rejected (over-engineering, daily is sufficient per FR-001)
