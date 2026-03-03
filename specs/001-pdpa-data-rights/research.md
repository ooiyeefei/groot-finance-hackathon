# Research: PDPA Data Subject Rights & Clerk/Convex Name Sync

**Date**: 2026-03-03

## R1: Clerk Backend API — `updateUser` for Name Sync

**Decision**: Use `clerkClient.users.updateUser(clerkUserId, { firstName, lastName })` server-side.

**Rationale**: Clerk's Backend API supports updating user profiles programmatically. The `updateUser` method accepts `firstName` and `lastName` as optional parameters. After update, Clerk fires the `user.updated` webhook event, which the existing `handleUserUpdated` action in `convex/functions/webhooks.ts` already handles — syncing name and email back to Convex.

**Alternatives considered**:
- Direct Convex mutation + manual Clerk sync: Rejected — introduces dual-write risk and doesn't leverage existing webhook.
- Frontend Clerk SDK `user.update()`: Rejected — only works for the current user's own profile (no admin editing of others).

**Key findings**:
- `@clerk/nextjs/server` already imported in `user.service.ts` (line 21).
- Clerk name is split into `firstName` + `lastName` but Convex stores `fullName` as single string. Need to split on first space.
- Clerk Backend API rate limit: 20 requests/second — not a concern for name edits.
- `clerkClient.users.updateUser()` throws on invalid `userId` or deactivated accounts — map to user-friendly error.

## R2: Current Name Edit Code Paths (Bug Analysis)

**Decision**: Fix both code paths — admin edit and self-edit.

**Rationale**: Both paths have the same bug:

| Path | Current Code | Bug |
|------|-------------|-----|
| Admin edits team member | `user.service.ts:409` → `updateFullNameByAdmin` mutation | Only updates Convex |
| Self-edit own name | `user.service.ts:400` → `updateProfile` mutation | Only updates Convex |
| Admin edits self via team mgmt | Same as admin path above | Only updates Convex |

**Fix approach**: Add Clerk `updateUser` call in `user.service.ts` BEFORE the Convex mutation calls. On Clerk success, the webhook handles Convex update automatically — we can optionally keep the direct Convex update for immediate UI feedback (optimistic) or remove it and rely solely on webhook.

**Recommendation**: Keep the direct Convex update for instant UI feedback (Convex real-time subscription picks it up immediately). The webhook will fire shortly after with the same data — no conflict since values match.

## R3: Existing Export Infrastructure Reuse

**Decision**: Compose existing per-module export functions into a single "Download My Data" flow.

**Rationale**: The export system in `convex/functions/exportJobs.ts` has clean domain separation:
- `getRecordsByModule(module, businessId, userId, role, filters)` — dispatches to domain-specific functions
- `enrichByModule(module, records)` — joins related data (employee names, vendor info)
- Role-based filtering built into each module function

For "Download My Data", we create a new Convex query that:
1. Gets all business memberships for the user
2. For each business, calls `getRecordsByModule` for all 4 modules with forced `userId` filtering
3. Returns structured data grouped by business → module

**Key findings**:
- `getRecordsByModule` and `enrichByModule` are private functions (not exported). Options:
  - A) Extract to shared utility module — cleanest but touches existing code
  - B) Create a new query that duplicates the dispatch logic — avoids modifying existing code
  - C) Create an internal query that calls the existing per-module functions directly
- **Chosen**: Option A — extract to `convex/lib/exportDataAccess.ts` as shared internal functions
- Max records per module: 10,000. For PDPA export (single user), volumes will be much smaller.
- CSV generation happens client-side using `export-engine.ts` — can reuse `generateFlatExport()`.

## R4: ZIP Generation in Browser

**Decision**: Use JSZip library for client-side ZIP creation.

**Rationale**: The export flow is client-side (data fetched from Convex → formatted in browser → download triggered). For bundling multiple CSVs into a ZIP:
- JSZip is a mature, lightweight library (~100KB) for creating ZIP files in the browser
- Already used across the JS ecosystem, no security concerns
- Works with Capacitor's Browser plugin for mobile download

**Alternatives considered**:
- Server-side ZIP (Convex action or Lambda): Rejected — unnecessary complexity for small user-scoped exports. Client-side matches existing export pattern.
- Multiple individual file downloads: Rejected — poor UX, browsers may block multiple downloads.

## R5: PDPA Sections 24-26 Requirements

**Decision**: Document maps to three rights with specific in-app capability references.

**Rationale**: PDPA (Thailand's Personal Data Protection Act B.E. 2562) and Malaysia's PDPA 2010 both define:

| Right | PDPA Reference | Groot Finance Capability | Status |
|-------|---------------|------------------------|--------|
| Right of Access (Section 24) | Data subject may request access to personal data | Export engine (reporting page) + "Download My Data" (new) | Partially implemented |
| Right of Correction (Section 25) | Data subject may request correction of inaccurate data | Profile settings (currency, timezone, language) + Admin name edit (P1 fix) | Needs P1 fix |
| Right of Deletion (Section 26) | Data subject may request deletion | Soft delete via Clerk webhook + manual email process | Implemented (manual) |

**Key findings**:
- Compliance documentation should be in `docs/compliance/` directory alongside other compliance artifacts.
- Document should be internal/audit-facing, not a user-facing privacy policy.
- Must distinguish "implemented today" vs "planned enhancement" for each right.
