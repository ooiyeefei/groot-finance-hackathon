# Quickstart: PDPA Data Retention Cleanup

**Feature**: 001-pdpa-data-retention-cleanup
**Date**: 2026-03-03

## What This Feature Does

Adds three automated daily cleanup jobs that permanently delete expired data per PDPA compliance requirements:
1. **Chat conversations + messages** → deleted after 2 years of inactivity
2. **Audit event logs** → deleted after 3 years
3. **Export history records + files** → deleted after 1 year

Also delivers a formal data retention policy document at `docs/compliance/data-retention-policy.md`.

## Files to Modify

| File | Change |
|------|--------|
| `convex/functions/conversations.ts` | Add `deleteExpired` internal mutation |
| `convex/functions/audit.ts` | Add `deleteExpired` internal mutation |
| `convex/functions/exportHistory.ts` | Add `deleteExpired` internal mutation |
| `convex/crons.ts` | Register 3 new daily cron jobs |
| `docs/compliance/data-retention-policy.md` | New file — retention policy document |

## Files NOT Modified

- `convex/schema.ts` — no schema changes needed (existing indexes are sufficient)
- Existing cleanup functions — notifications, drafts, credit packs remain as-is
- No frontend changes — all cleanup is background system operations

## Implementation Order

1. **conversations.deleteExpired** — highest impact, most complex (cascade delete)
2. **exportHistory.deleteExpired** — moderate, extends existing pattern
3. **audit.deleteExpired** — simplest, single table delete
4. **crons.ts** — register all three after functions are implemented
5. **data-retention-policy.md** — compliance document
6. **Deploy** — `npx convex deploy --yes`

## Key Technical Decisions

- **Batch size**: 500 records per cron run (prevents Convex mutation timeout)
- **Conversation age**: measured from `lastMessageAt` (fallback: `_creationTime` for empty conversations)
- **Audit trail**: structured `console.log()` JSON — visible in Convex dashboard logs
- **Export file cleanup**: delete Convex storage file before record (FR-009: if file fails, skip record)
- **No schema changes**: all queries use existing indexes or `_creationTime` system field

## Verification

After deployment:
1. Check Convex dashboard → Crons tab → verify 3 new crons appear
2. Check Convex dashboard → Logs → filter for "retention_cleanup" to see structured output
3. Verify no data is being deleted prematurely (conversations younger than 2 years should remain)
