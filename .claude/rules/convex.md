---
paths:
  - "convex/**"
---
# Convex Bandwidth & Query Budget

**Free plan limits**: 2M function calls, **2 GB database bandwidth/month**, 1 GB storage. Every byte counts.

## Rules

**Rule 1: Never use reactive `query` for heavy aggregations.**
- Convex `query` creates a reactive subscription. Every table change re-runs and re-reads ALL documents. Each re-read counts toward bandwidth.
- **Use `action` + `internalQuery`** for dashboard widgets, analytics, reports, or anything scanning multiple tables.
- Pattern: `internalQuery` does DB reads -> public `action` calls via `ctx.runQuery` -> client uses `useAction` + `useEffect`.
- **Use `query`** only for small, single-document lookups or data that genuinely needs live updates.

**Rule 2: Never `.collect()` entire tables without limits.**
- Always ask: "How many documents could this return at scale?" If "thousands", use `.take(N)` or tighter index range filters.
- Prefer filtering at index level (`.withIndex(..., q => q.eq(...).gte(...))`) over collecting and filtering in JS.

**Rule 3: Audit crons for bandwidth impact.**
- Before adding a cron: calculate `(docs_read x avg_doc_size x runs_per_month)`. If >50 MB/month, reconsider frequency or scope.
- **Currently disabled**: `ai-daily-digest` (was hourly, scanning all businesses). Re-enable only on Pro plan.

**Rule 4: Kill stray `convex dev` processes.**
- `npx convex dev` from worktrees auto-syncs to shared deployment, consuming bandwidth and causing deploy conflicts.
- Before deploying: `ps aux | grep convex | grep -v grep` -- kill any stray processes.

**Rule 5: NEVER run `convex dev` or `npm run dev` from worktrees.**
- All worktrees share the **same Convex production deployment** (`kindhearted-lynx-129`). Running `convex dev` from any worktree **overwrites production functions** with that branch's older code.
- **Only run `convex dev` from the main working directory** (`groot-finance/groot-finance`).
- **Before starting any dev session**: Kill ALL convex processes, then `npx convex deploy --yes` from `main`.
- **After finishing a worktree branch**: `git worktree remove <name>` to prevent accidental future runs.

**Rule 6: EventBridge-first for scheduled jobs (CRITICAL).**
- For any scheduled job reading >10 documents, use AWS EventBridge -> Lambda -> Convex HTTP API instead of Convex crons.
- Pattern: EventBridge schedule -> Lambda dispatcher -> Convex HTTP API -> business logic in Convex action
- Stack: `infra/lib/scheduled-intelligence-stack.ts` (13 EventBridge rules, 1 Lambda dispatcher, SQS DLQ)
- Migration complete 2026-03-20: 94% bandwidth reduction (~446MB -> ~25MB/month)
- Convex crons now ONLY for lightweight cleanup (<10 documents per run)
- See `specs/030-eventbridge-migration/` for architecture and verification guide

## Anti-patterns that burn bandwidth
- `useQuery` with `.collect()` on large tables (reactive re-runs on every change)
- Crons running hourly that scan entire tables
- Using Convex crons for DSPy optimization or analytics (use EventBridge -> Lambda)
- Multiple worktrees running `convex dev` against the same deployment
- Dashboard widgets using reactive queries for aggregations (use `action` instead)
- Running `npm run dev` in old worktrees (auto-starts `convex dev` which overwrites production)
