# Tasks: PDPA Data Subject Rights & Clerk/Convex Name Sync

**Input**: Design documents from `/specs/001-pdpa-data-rights/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: No test tasks generated (not explicitly requested in feature specification).

**Organization**: Tasks grouped by user story — P1 (bug fix), P2 (documentation), P3 (download my data). P4 is documentation-only and folded into P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Install new dependency and configure git author

- [x] T001 Install JSZip dependency: `npm install jszip` and `npm install -D @types/jszip` (for P3 client-side ZIP generation)
- [x] T002 Configure git author per CLAUDE.md: `git config user.name "grootdev-ai" && git config user.email "dev@hellogroot.com"`

---

## Phase 2: Foundational (No blocking prerequisites)

**Purpose**: No foundational tasks needed — all existing infrastructure (Clerk SDK, Convex, export engine) is already in place. User stories can begin immediately after setup.

**Checkpoint**: Setup complete — user story implementation can begin.

---

## Phase 3: User Story 1 — Admin & Self Name Sync Bug Fix (Priority: P1) — MVP

**Goal**: Fix the bug where name edits (admin or self) only update Convex, not Clerk. All name changes must go through Clerk first, then webhook syncs back to Convex.

**Independent Test**: Edit a team member's name as admin → verify name matches in Clerk dashboard AND Convex within 10 seconds. Also edit own name via profile → verify same sync.

### Implementation for User Story 1

- [x] T003 [US1] Create new API route `POST /api/v1/users/update-clerk-profile` in `src/app/api/v1/users/update-clerk-profile/route.ts` — accepts `clerk_user_id`, `first_name`, `last_name`; calls `clerkClient.users.updateUser()`; requires Clerk auth; admin/owner check for editing others; returns success/error JSON
- [x] T004 [US1] Modify `updateUserName()` in `src/domains/users/lib/user.service.ts` (line 378-417) — before calling Convex mutations, call the new Clerk profile update API to sync name to Clerk first; split `fullName` into `firstName`/`lastName` on first space; if Clerk update fails, throw error without touching Convex
- [x] T005 [US1] Modify self-edit path in `updateUserProfile()` in `src/domains/users/lib/user.service.ts` (line 115-150) — when `full_name` is in the update payload, call the Clerk profile update API first (same identity-first pattern); if Clerk update fails, throw error without touching Convex
- [x] T006 [US1] Add error handling for Clerk API failures in the new route — handle deactivated user accounts (404), rate limits (429), and Clerk downtime (500); return clear user-facing error messages per contracts/api-contracts.md
- [x] T007 [US1] Add soft-deleted user guard — in the new API route, check if the target user has been soft-deleted (anonymized to "Deleted User") before attempting Clerk update; return 400 error if deleted
- [x] T008 [US1] Run `npm run build` to verify no TypeScript errors, then `npx convex deploy --yes` if any Convex changes were made

**Checkpoint**: Name sync bug is fixed. Admin edits and self-edits both go through Clerk first. Webhook syncs back to Convex automatically. Verify by editing a name and checking Clerk dashboard.

---

## Phase 4: User Story 2 — PDPA Compliance Documentation (Priority: P2)

**Goal**: Create formal data subject rights documentation covering Right of Access, Right of Correction, and Right of Deletion per PDPA requirements.

**Independent Test**: Review document against PDPA Sections 24-26 — each right must map to a specific in-app capability or documented process.

### Implementation for User Story 2

- [x] T009 [US2] Create `docs/compliance/data-subject-rights.md` with three sections — Right of Access (existing export engine + planned "Download My Data"), Right of Correction (profile self-edit fields + admin name edit with Clerk sync from US1), Right of Deletion (soft-delete via Clerk webhook + manual email process at admin@hellogroot.com)
- [x] T010 [US2] In the document, clearly distinguish "Implemented Today" vs "Planned Enhancement" for each right — mark "Download My Data" button (P3) and "Self-Service Account Deletion" (P4) as planned future enhancements
- [x] T011 [US2] Document the architecture decision: Clerk = source of truth for identity (name, email, auth), Convex = source of truth for business context (role, preferences, membership)
- [x] T012 [US2] Include a capability matrix table mapping each PDPA right → in-app feature → user-facing process → status (live/planned)

**Checkpoint**: Compliance document complete. Passes review against PDPA Sections 24-26 with specific in-app capability mappings for all three rights.

---

## Phase 5: User Story 3 — "Download My Data" Button (Priority: P3)

**Goal**: Add a "Download My Data" button in user profile settings that exports the user's personal data across all businesses as a ZIP of CSVs. Reuses existing export infrastructure.

**Independent Test**: Log in as any user → go to profile settings → click "Download My Data" → verify downloaded ZIP contains only own records organized by business with per-domain CSVs.

### Implementation for User Story 3

- [x] T013 [US3] Create new Convex query `getMyDataExport` in `convex/functions/exportJobs.ts` — for authenticated user, fetches all active business memberships, then for each business calls existing `getRecordsByModule()` for all 4 modules (expense, invoice, leave, accounting) with forced userId-only filtering; also returns user profile data (email, fullName, currency, timezone, language, createdAt); returns structured result per contracts/api-contracts.md
- [x] T014 [US3] Extract `getRecordsByModule()` and `enrichByModule()` from private scope into callable internal functions within `convex/functions/exportJobs.ts` so the new query can reuse them (keep them non-exported, just accessible within the same file)
- [x] T015 [P] [US3] Create `src/domains/account-management/components/download-my-data.tsx` — React component with "Download My Data" button; on click, fetches data via `getMyDataExport` Convex query; shows loading state; generates per-domain CSVs using existing `generateFlatExport()` from `src/domains/exports/lib/export-engine.ts`; bundles into ZIP using JSZip with folder structure: `groot-finance-my-data-YYYY-MM-DD/profile.csv` + `{business-name}/expense_claims.csv` etc; triggers download; disables button while generating to prevent concurrent exports
- [x] T016 [US3] Create profile CSV generation logic in the download component — generates `profile.csv` with columns: Email, Full Name, Currency, Timezone, Language, Account Created; single row with user's data
- [x] T017 [US3] Handle multi-business ZIP organization — for each active business membership, create a subfolder named after the business (sanitized); only include CSVs for modules with records (omit empty modules); use existing Generic prebuilt template field mappings for readable column headers
- [x] T018 [US3] Integrate the "Download My Data" component into the user profile settings page — find the existing profile/account settings component and add the download button in an appropriate section (e.g., "Data & Privacy" or at the bottom of settings)
- [x] T019 [US3] Handle edge cases — user with no business memberships (export profile only); user with revoked memberships (skip inactive); export with 0 total records across all domains (show informational message instead of empty ZIP); Convex query timeout for large datasets (show error with retry option)
- [x] T020 [US3] Run `npm run build` to verify no TypeScript errors, then `npx convex deploy --yes` for the new Convex query

**Checkpoint**: "Download My Data" fully functional. Any authenticated user can download their personal data as a ZIP of CSVs from profile settings. Existing export dashboard wizard is unchanged.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, build verification, and deployment

- [x] T021 Run full `npm run build` — fix any TypeScript errors across all changes
- [x] T022 Run `npx convex deploy --yes` to deploy all Convex function changes to production
- [x] T023 Manual UAT verification: test P1 name sync (admin edit + self edit), P2 document review, P3 download my data (single-business + multi-business user)
- [x] T024 Update spec.md status from "Draft" to "Complete" in `specs/001-pdpa-data-rights/spec.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: No blocking prerequisites — skip
- **User Story 1 (Phase 3)**: Can start after Setup — no dependencies on other stories
- **User Story 2 (Phase 4)**: Can start after Setup — no code dependencies, but references US1 fix in documentation
- **User Story 3 (Phase 5)**: Can start after Setup (T001 for JSZip) — no dependencies on US1 or US2
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent — can start immediately after Setup
- **User Story 2 (P2)**: Soft dependency on US1 (references the fix in documentation) — can write in parallel, finalize after US1 is verified
- **User Story 3 (P3)**: Independent — depends only on JSZip installation (T001); reuses existing Convex functions

### Within Each User Story

- T003 (API route) → T004, T005 (service modifications depend on route existing)
- T004 → T006, T007 (error handling and guards depend on core fix)
- T013, T014 (Convex query) → T015 (component depends on query being available)
- T015 → T016, T017, T018, T019 (component enhancements depend on base component)

### Parallel Opportunities

- **US1 + US2**: Can proceed in parallel (US2 is documentation only)
- **US1 + US3**: Can proceed in parallel (different files entirely)
- **Within US3**: T013/T014 (Convex) and T015 (React component) can be developed concurrently once API contract is agreed

---

## Parallel Example: User Story 1

```bash
# After T003 (API route) is complete, these can run in parallel:
Task T004: "Modify updateUserName() in user.service.ts"
Task T005: "Modify updateUserProfile() self-edit path in user.service.ts"
# Note: T004 and T005 modify the same file — run sequentially within the file
# But T006 (error handling) and T007 (soft-delete guard) are in the route file and can parallel with T004/T005
```

## Parallel Example: User Story 3

```bash
# After T001 (JSZip install), these can run in parallel:
Task T013: "Create getMyDataExport Convex query in exportJobs.ts"
Task T015: "Create download-my-data.tsx React component" (can stub Convex query)

# After T015 base component, these can run in parallel (different concerns):
Task T016: "Profile CSV generation"
Task T017: "Multi-business ZIP organization"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 3: User Story 1 — Name Sync Bug Fix (T003-T008)
3. **STOP and VALIDATE**: Test name edit as admin + self-edit, verify Clerk dashboard matches
4. Deploy — bug fix is live, immediate user value

### Incremental Delivery

1. T001-T002 → Setup complete
2. T003-T008 → US1 Name Sync fixed → **Deploy** (bug fix, highest value)
3. T009-T012 → US2 Compliance doc → **Review** (documentation, audit-ready)
4. T013-T020 → US3 Download My Data → **Deploy** (PDPA self-service access)
5. T021-T024 → Polish → **Final validation**

### Total Effort Estimate

| Phase | Tasks | Parallel? |
|-------|-------|-----------|
| Setup | 2 | Sequential |
| US1 — Name Sync | 6 | Mostly sequential (same files) |
| US2 — Compliance Doc | 4 | All sequential (single file) |
| US3 — Download My Data | 8 | Some parallel (Convex + React) |
| Polish | 4 | Sequential |
| **Total** | **24** | |

---

## Notes

- No new Convex tables needed — existing schema supports everything
- P4 (Self-Service Account Deletion) is explicitly out of scope for implementation — documented in P2 compliance doc only
- JSZip is the only new dependency
- All Convex changes require `npx convex deploy --yes` before production verification
- Commit after each completed user story for clean git history
