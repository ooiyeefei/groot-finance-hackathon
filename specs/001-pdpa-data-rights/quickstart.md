# Quickstart: PDPA Data Subject Rights & Clerk/Convex Name Sync

**Date**: 2026-03-03

## Prerequisites

- Node.js 20.x
- Convex CLI (`npx convex`)
- Clerk dashboard access (for verifying name sync)
- `.env.local` with Clerk keys configured

## Development Setup

```bash
# 1. Switch to feature branch
git checkout 001-pdpa-data-rights

# 2. Install dependencies (JSZip is new)
npm install

# 3. Start Convex dev server
npx convex dev

# 4. Start Next.js dev server
npm run dev
```

## Implementation Order

### Step 1: P1 — Name Sync Bug Fix (smallest, highest priority)

**Files to modify**:
1. `src/app/api/v1/users/update-clerk-profile/route.ts` — NEW API route
2. `src/domains/users/lib/user.service.ts` — Add Clerk call to `updateUserName()` and self-edit path in `updateUserProfile()`

**How to verify**:
1. Log in as admin at `http://localhost:3000/en/settings`
2. Go to Team Management tab
3. Edit a team member's name
4. Open Clerk Dashboard → Users → verify name changed
5. Check Convex Dashboard → users table → verify fullName matches

### Step 2: P2 — Compliance Documentation

**Files to create**:
1. `docs/compliance/data-subject-rights.md` — PDPA compliance document

**How to verify**:
- Read the document and verify each PDPA right maps to a specific in-app capability

### Step 3: P3 — Download My Data

**Files to modify/create**:
1. `convex/functions/exportJobs.ts` — Add `getMyDataExport` query
2. `src/domains/account-management/components/download-my-data.tsx` — NEW component
3. Profile settings page — Add Download My Data button

**How to verify**:
1. Log in as any user
2. Go to Profile Settings
3. Click "Download My Data"
4. Open the downloaded ZIP → verify CSVs contain only your records
5. If multi-business user, verify data organized by business folders

## Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Clerk updated FIRST, then webhook syncs Convex | Ensures identity provider is always source of truth |
| Client-side CSV + ZIP generation | Matches existing export pattern; avoids server-side complexity |
| Reuse existing `getRecordsByModule` functions | Proven, tested, role-scoped data access |
| JSZip for client-side ZIP | Lightweight, mature, works with Capacitor |
| No new Convex tables | Existing schema sufficient; export_history reused with `"pdpa_all"` module |

## Build Verification

```bash
npm run build  # MUST pass before task completion
npx convex deploy --yes  # After any Convex function changes
```
