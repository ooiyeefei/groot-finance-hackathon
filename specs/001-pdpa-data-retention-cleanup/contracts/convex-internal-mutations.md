# Convex Internal Mutation Contracts

**Feature**: 001-pdpa-data-retention-cleanup
**Date**: 2026-03-03

These contracts define the new `internalMutation` functions to be registered as cron jobs.

## conversations.deleteExpired

**Location**: `convex/functions/conversations.ts`
**Type**: `internalMutation` (no args, no auth — cron-only)
**Cron schedule**: Daily at 3:30 AM UTC

**Contract**:
```
Input: none
Output: { deleted: number, messagesDeleted: number, skipped: number }

Behavior:
1. Calculate cutoff = Date.now() - (730 * 24 * 60 * 60 * 1000)
2. Query conversations table, take up to BATCH_SIZE (500)
3. For each conversation:
   a. Determine age = conversation.lastMessageAt ?? conversation._creationTime
   b. If age >= cutoff → skip (not expired)
   c. Query all messages via by_conversationId index
   d. Delete each message
   e. Delete the conversation
   f. Increment counters
4. Log structured summary: { type: "retention_cleanup", table: "conversations", deleted, messagesDeleted }
5. Return counts

Error handling:
- If message deletion fails mid-cascade, skip that conversation (logged as error)
- Conversation is NOT deleted if any of its messages fail to delete
```

## audit.deleteExpired

**Location**: `convex/functions/audit.ts`
**Type**: `internalMutation` (no args, no auth — cron-only)
**Cron schedule**: Daily at 4:00 AM UTC

**Contract**:
```
Input: none
Output: { deleted: number }

Behavior:
1. Calculate cutoff = Date.now() - (1095 * 24 * 60 * 60 * 1000)
2. Query audit_events table, take up to BATCH_SIZE (500)
3. For each audit event:
   a. If _creationTime >= cutoff → skip
   b. Delete the record
   c. Increment counter
4. Log structured summary: { type: "retention_cleanup", table: "audit_events", deleted }
5. Return count

Error handling:
- If individual delete fails, log error and continue to next record
```

## exports.deleteExpired

**Location**: `convex/functions/exportHistory.ts`
**Type**: `internalMutation` (no args, no auth — cron-only)
**Cron schedule**: Daily at 4:30 AM UTC

**Contract**:
```
Input: none
Output: { deleted: number, filesDeleted: number }

Behavior:
1. Calculate cutoff = Date.now() - (365 * 24 * 60 * 60 * 1000)
2. Query export_history table, take up to BATCH_SIZE (500)
3. For each export record:
   a. If _creationTime >= cutoff → skip
   b. If storageId exists → delete file via ctx.storage.delete(storageId)
   c. If file deletion succeeds (or no file) → delete the record
   d. If file deletion fails → skip record (logged as error, retry next run per FR-009)
   e. Increment counters
4. Log structured summary: { type: "retention_cleanup", table: "export_history", deleted, filesDeleted }
5. Return counts

Error handling:
- File deletion failure → do NOT delete DB record (FR-009)
- Log file deletion error with storageId for debugging
```

## Cron Registration

**Location**: `convex/crons.ts`

```
New entries (append to existing crons):

crons.daily("cleanup expired conversations", { hourUTC: 3, minuteUTC: 30 },
  internal.functions.conversations.deleteExpired)

crons.daily("cleanup old audit events", { hourUTC: 4, minuteUTC: 0 },
  internal.functions.audit.deleteExpired)

crons.daily("cleanup old export history", { hourUTC: 4, minuteUTC: 30 },
  internal.functions.exports.deleteExpired)
```

## Constants

All cleanup functions share these constants (define in a shared location or per-file):

```
BATCH_SIZE = 500          // Max records to process per cron invocation
CHAT_RETENTION_DAYS = 730  // 2 years
AUDIT_RETENTION_DAYS = 1095 // 3 years
EXPORT_RETENTION_DAYS = 365 // 1 year
```
