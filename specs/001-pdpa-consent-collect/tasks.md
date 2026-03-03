# Tasks: PDPA Consent Collection

**Input**: Design documents from `/specs/001-pdpa-consent-collect/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/consent-api.md

**Tests**: Not explicitly requested — tests omitted. Manual UAT via test accounts per CLAUDE.md.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1–US6)
- Exact file paths included

---

## Phase 1: Setup

**Purpose**: Environment configuration

- [x] T001 Add `NEXT_PUBLIC_CURRENT_POLICY_VERSION="2026-01-15"` and `CONSENT_GRACE_PERIOD_START` to `.env.local`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Consent data layer — schema, Convex functions, API routes, and shared hook. All user stories depend on this.

- [x] T002 Add `consent_records` table definition to `convex/schema.ts` with fields: userId, businessId, policyType (union: privacy_policy, terms_of_service), policyVersion, acceptedAt, ipAddress, userAgent, source (union: onboarding, invitation, banner, settings), revokedAt; indexes: by_userId, by_userId_policyType, by_userId_policyType_policyVersion, by_businessId (see data-model.md)
- [x] T003 Create `convex/functions/consent.ts` with four functions per contracts/consent-api.md: query `hasAcceptedCurrentPolicy` (checks for valid non-revoked consent for given type+version), query `getConsentHistory` (returns all records for user with optional policyType filter), mutation `recordConsent` (creates consent record with idempotency check — returns existing if duplicate), mutation `revokeConsent` (adds revokedAt timestamp to active record)
- [x] T004 [P] Create `src/app/api/v1/consent/record/route.ts` — POST handler: Clerk auth, Zod validation of body (policyType, policyVersion, source), extract IP from x-forwarded-for/x-real-ip headers and userAgent from request, call Convex `recordConsent` mutation, return `{success, data: {consentRecordId}}`
- [x] T005 [P] Create `src/app/api/v1/consent/revoke/route.ts` — POST handler: Clerk auth, Zod validation of body (policyType, policyVersion), extract IP, call Convex `revokeConsent` mutation, return `{success, data: {revokedRecordId}}`
- [x] T006 [P] Create `src/domains/compliance/hooks/use-consent.ts` — custom React hook wrapping Convex `useQuery(api.functions.consent.hasAcceptedCurrentPolicy, {policyType: "privacy_policy", policyVersion: process.env.NEXT_PUBLIC_CURRENT_POLICY_VERSION})`. Export `useConsent()` returning `{hasConsent, isLoading, record}`. Also export `useConsentHistory()` wrapping `getConsentHistory`
- [x] T007 Deploy Convex schema and functions: run `npx convex deploy --yes`

**Checkpoint**: Consent data layer deployed. Convex functions callable. API routes return correct responses.

---

## Phase 3: User Story 1 — New User Consent at Onboarding (P1) MVP

**Goal**: Consent checkbox on onboarding Step 1 that blocks progression until accepted. Creates consent record on accept.

**Independent Test**: Create new account → onboarding Step 1 → verify checkbox appears unchecked, blocks "Next" when unchecked, creates consent record when accepted.

### Implementation

- [x] T008 [US1] Modify `src/domains/onboarding/components/business-onboarding-modal.tsx` Step 1: add a consent checkbox (unchecked by default) below the business name/country fields. Checkbox text: "I agree to the [Privacy Policy](https://hellogroot.com/privacy) and consent to processing of my personal data as described" with "Privacy Policy" as external link (target=_blank). Use semantic tokens: `text-foreground`, `text-muted-foreground` for label. Add local state `consentChecked` (default false).
- [x] T009 [US1] Wire consent checkbox validation in `business-onboarding-modal.tsx`: block "Next" button when `consentChecked` is false. Show validation message below checkbox (e.g., "You must accept the Privacy Policy to continue") using `text-destructive` token. Disable/dim "Next" button when unchecked.
- [x] T010 [US1] On Step 1 "Next" click (when checkbox is checked), call `POST /api/v1/consent/record` with `{policyType: "privacy_policy", policyVersion: NEXT_PUBLIC_CURRENT_POLICY_VERSION, source: "onboarding"}`. Handle success (proceed to Step 2) and error (show toast, keep checkbox). Pass `businessId` if available from onboarding context.

**Checkpoint**: New users cannot proceed past onboarding Step 1 without consenting. Consent record created in Convex.

---

## Phase 4: User Story 2 — Existing User Consent Banner + Blocking Overlay (P2)

**Goal**: Non-blocking banner for existing users without consent. Escalates to blocking overlay after 30-day grace period.

**Independent Test**: Log in as existing user without consent record → verify banner appears → persists across pages → accept dismisses permanently. Simulate past grace period → verify blocking overlay appears.

### Implementation

- [x] T011 [P] [US2] Create `src/components/consent-banner.tsx` — persistent top banner component. Uses `useConsent()` hook to check status. If `!hasConsent && !isLoading`: render a fixed-top banner with `bg-primary/10 border-b border-primary/20` styling. Text: "We've updated our Privacy Policy. Please review and accept to continue." with "Review & Accept" button (`bg-primary text-primary-foreground`). On click: call `POST /api/v1/consent/record` with `source: "banner"`. Include dismiss animation on success. Show nothing if `hasConsent` or `isLoading`.
- [x] T012 [P] [US2] Create `src/components/consent-lock-overlay.tsx` — blocking overlay following `SubscriptionLockOverlay` pattern exactly (see research.md R1). Fixed inset-0 z-40, blur backdrop, centered Card. Guard: return null if isLoading, if hasConsent, or if pathname is in UNBLOCKED_PATHS (settings, sign-out, api). Include grace period check: only show blocking overlay if `CONSENT_GRACE_PERIOD_START` + 30 days has elapsed (otherwise banner handles it). "Accept Policy" button calls `/api/v1/consent/record` with `source: "banner"`. Include "Sign Out" secondary action via `useClerk().signOut()`.
- [x] T013 [US2] Mount both components in `src/app/[locale]/layout.tsx`: import `ConsentBanner` and `ConsentLockOverlay`, render after `SubscriptionLockOverlay` inside `MobileAppShellConnected`. Ensure consent overlay takes visual precedence when both subscription lock and consent lock conditions are met.

**Checkpoint**: Existing users see banner. After grace period, blocking overlay appears. Accept creates consent record and dismisses.

---

## Phase 5: User Story 3 — Invited User Consent at Acceptance (P2)

**Goal**: Consent checkbox on invitation acceptance page. Blocks acceptance until consent is given. Skips if user already has consent.

**Independent Test**: Send invitation → click accept link → verify checkbox appears if no consent on file → blocks accept when unchecked → creates consent record before activating membership.

### Implementation

- [x] T014 [US3] Modify `src/app/[locale]/invitations/accept/page.tsx`: add `useConsent()` hook to check if user already has valid consent. If `hasConsent`: skip checkbox (existing behavior). If `!hasConsent`: render consent checkbox before the "Accept Invitation" button with same text and styling as onboarding checkbox (US1). Add `consentChecked` state (default false).
- [x] T015 [US3] Wire consent validation in invitation page: block "Accept Invitation" button when `consentChecked` is false and `!hasConsent`. Show validation message. On accept (with checkbox checked): call `POST /api/v1/consent/record` with `source: "invitation"` BEFORE calling the invitation acceptance endpoint. Only proceed with `activateMembership` after consent record is confirmed.

**Checkpoint**: Invited users without consent see checkbox. Those with existing consent do not. Consent recorded before membership activation.

---

## Phase 6: User Story 4 — Policy Version Update Re-Consent (P3)

**Goal**: When policy version changes (env var update), all users must re-consent. Existing consent for old version does not satisfy new version.

**Independent Test**: Change `NEXT_PUBLIC_CURRENT_POLICY_VERSION` → rebuild → verify previously-consented users see banner again.

### Implementation

- [x] T016 [US4] Verify that all consent check queries (in `use-consent.ts`, `consent-banner.tsx`, `consent-lock-overlay.tsx`, onboarding modal, invitation page) use `process.env.NEXT_PUBLIC_CURRENT_POLICY_VERSION` as the `policyVersion` argument — not a hardcoded string. This ensures changing the env var triggers re-consent for all users automatically.
- [x] T017 [US4] Verify that `recordConsent` mutation creates a NEW record for each policy version (not an upsert). Confirm the idempotency check in T003 is scoped to the exact `userId + policyType + policyVersion` combination — a user who consented to version "2026-01-15" should NOT be treated as having consented to "2026-06-01".

**Checkpoint**: Changing the policy version env var triggers re-consent flow. Old and new consent records coexist.

---

## Phase 7: User Story 5 — Consent Revocation (P3)

**Goal**: Users can revoke consent from settings. Immediate blocking overlay. Confirmation dialog with data export link.

**Independent Test**: Navigate to Privacy & Data settings → revoke consent → verify confirmation dialog appears with consequences + export link → confirm → verify blocking overlay appears immediately → re-consent restores access.

### Implementation

- [x] T018 [US5] Create revocation confirmation dialog in `src/domains/account-management/components/privacy-data-section.tsx` (will be fully built in Phase 8 — this task creates the revocation section only). Dialog explains: "Revoking consent will immediately block your access to Groot Finance until you re-consent." Includes a link "Download My Data first" pointing to `?tab=privacy#download-my-data`. Two buttons: "Cancel" and "Revoke Consent" (`bg-destructive text-destructive-foreground`).
- [x] T019 [US5] Wire revocation action: on "Revoke Consent" confirm, call `POST /api/v1/consent/revoke` with `{policyType: "privacy_policy", policyVersion: NEXT_PUBLIC_CURRENT_POLICY_VERSION}`. On success: Convex real-time subscription automatically updates `useConsent()` → `consent-lock-overlay.tsx` renders blocking overlay immediately (no page refresh needed).

**Checkpoint**: Revocation creates timestamped record, triggers immediate blocking overlay. Re-consent via overlay restores access.

---

## Phase 8: User Story 6 — Self-Service Personal Data Export + Privacy Tab (P3)

**Goal**: "Privacy & Data" tab in account settings with: Download My Data (JSON export), Consent History (view records), Revoke Consent (from Phase 7).

**Independent Test**: Navigate to settings → Privacy & Data tab → click "Download My Data" → verify JSON file downloads with user profile, consent history, activity summary.

### Implementation

- [x] T020 [P] [US6] Create `src/app/api/v1/users/data-export/route.ts` — GET handler: Clerk auth (any role), fetch user profile from Convex (excluding internal fields: _id, sesEmailVerified, sesVerificationToken), fetch consent history via `getConsentHistory`, fetch business memberships (names + roles only), aggregate activity counts (expense claims, invoices). Return JSON with `Content-Disposition: attachment; filename="groot-my-data-YYYY-MM-DD.json"` header. Follow export schema from data-model.md.
- [x] T021 [US6] Build full `src/domains/account-management/components/privacy-data-section.tsx` with three sections: (1) "Download My Data" card with download button that fetches `GET /api/v1/users/data-export` and triggers browser download, loading state during generation; (2) "Consent History" card displaying all consent records from `useConsentHistory()` in a table (policyType, version, accepted date, source, revoked date); (3) "Revoke Consent" card (from T018) with revocation button and confirmation dialog. Use semantic tokens: `bg-card`, `text-foreground`, `border-border`. Use lucide-react icons: `Download`, `History`, `ShieldOff`.
- [x] T022 [US6] Add "Privacy & Data" tab to `src/domains/account-management/components/tabbed-business-settings.tsx`: add `"privacy"` to `validTabs` array, add tab trigger with `Shield` icon and label "Privacy & Data", render `PrivacyDataSection` component in tab content. Tab must be visible to ALL roles (no permission gate — unlike other owner-only tabs).

**Checkpoint**: Any user can access Privacy & Data tab, download personal data JSON, view consent history, and revoke consent.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Build verification, Convex deployment, and final checks.

- [x] T023 Run `npm run build` and fix any TypeScript compilation errors
- [x] T024 Run `npx convex deploy --yes` to deploy final schema and function changes to production
- [x] T025 Verify consent overlay priority: when both subscription lock AND consent lock conditions are met, consent overlay should take visual precedence (consent check runs before subscription check in layout render order)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1)**: Depends on Phase 2 — can start immediately after
- **Phase 4 (US2)**: Depends on Phase 2 — can run in parallel with Phase 3
- **Phase 5 (US3)**: Depends on Phase 2 — can run in parallel with Phase 3 & 4
- **Phase 6 (US4)**: Depends on Phase 2 — verification only, can run after any US implementation
- **Phase 7 (US5)**: Depends on Phase 2 + Phase 4 (uses blocking overlay from US2)
- **Phase 8 (US6)**: Depends on Phase 2 + Phase 7 (revocation section created in US5)
- **Phase 9 (Polish)**: Depends on all phases complete

### User Story Dependencies

- **US1 (P1)**: Independent — only needs foundational data layer
- **US2 (P2)**: Independent — creates banner + overlay components
- **US3 (P2)**: Independent — only needs foundational data layer + `useConsent` hook
- **US4 (P3)**: Depends on US1/US2/US3 being built (verification task, not new code)
- **US5 (P3)**: Depends on US2 (uses `consent-lock-overlay.tsx` for immediate blocking)
- **US6 (P3)**: Depends on US5 (revocation dialog is part of privacy tab)

### Parallel Opportunities

```
After Phase 2 completes:
  ├── [Parallel] Phase 3 (US1 - Onboarding)
  ├── [Parallel] Phase 4 (US2 - Banner + Overlay)
  └── [Parallel] Phase 5 (US3 - Invitation)

After Phase 4 completes:
  └── Phase 7 (US5 - Revocation)

After Phase 7 completes:
  └── Phase 8 (US6 - Data Export + Privacy Tab)
```

Within phases, tasks marked [P] can run in parallel (different files).

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (env vars)
2. Phase 2: Foundational (schema + functions + API routes + hook)
3. Phase 3: User Story 1 (onboarding consent)
4. **STOP & VALIDATE**: Test with new user onboarding
5. Deploy if ready — core PDPA compliance achieved for new users

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready
2. Phase 3 (US1) → New users covered → Deploy
3. Phase 4 (US2) → Existing users covered → Deploy
4. Phase 5 (US3) → Invited users covered → Deploy
5. Phase 6 (US4) → Version updates verified
6. Phase 7 + 8 (US5 + US6) → Revocation + data export → Deploy
7. Phase 9 → Polish, build check, final Convex deploy

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- All consent recording goes through REST API routes (for IP capture)
- All consent status checks use Convex real-time queries (for cross-tab reactivity)
- Semantic design tokens ONLY — no hardcoded colors
- `npx convex deploy --yes` required after schema/function changes
