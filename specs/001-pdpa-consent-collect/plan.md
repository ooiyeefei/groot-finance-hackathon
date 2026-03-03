# Implementation Plan: PDPA Consent Collection

**Branch**: `001-pdpa-consent-collect` | **Date**: 2026-03-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-pdpa-consent-collect/spec.md`

## Summary

Add PDPA-compliant consent collection across all user entry points (onboarding, invitation, existing-user banner) with a 30-day grace period escalating to a blocking overlay, consent revocation with immediate blocking, and self-service personal data export. Applies the strictest requirements across Malaysia PDPA 2010, Singapore PDPA 2012, Thailand PDPA 2019, and California CCPA/CPRA.

**Approach**: New `consent_records` Convex table with real-time queries. Consent UI integrates into existing onboarding wizard (Step 1 checkbox), invitation page (pre-accept checkbox), and dashboard layout (banner → blocking overlay). "Privacy & Data" tab added to account settings for data export and consent management. All consent recording goes through REST API routes for IP capture, proxied to Convex mutations.

## Technical Context

**Language/Version**: TypeScript 5.9.3
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0, Radix UI, lucide-react
**Storage**: Convex (new `consent_records` table, real-time subscriptions)
**Testing**: Manual UAT via test accounts (admin/manager/employee in `.env.local`)
**Target Platform**: Web (SPA, Next.js App Router)
**Project Type**: Web application (existing monorepo)
**Performance Goals**: Consent check query < 100ms, data export < 30s (SC-007)
**Constraints**: Semantic design tokens only (no hardcoded colors), Convex deploy required after schema changes, Vercel OIDC for AWS access
**Scale/Scope**: ~100-1000 users, 3 new UI touchpoints, 1 new Convex table, 3 new API routes, 1 new settings tab

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is a template (no project-specific principles defined). All gates pass trivially.

**Post-Phase-1 re-check**: No violations. Feature adds 1 new table, follows existing patterns (SubscriptionLockOverlay, tabbed settings), uses semantic tokens, and respects least-privilege (user-scoped queries only).

## Project Structure

### Documentation (this feature)

```text
specs/001-pdpa-consent-collect/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: Technical research & decisions
├── data-model.md        # Phase 1: Entity definitions & relationships
├── quickstart.md        # Phase 1: Developer setup guide
├── contracts/
│   └── consent-api.md   # Phase 1: Convex functions + REST API contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2: Implementation tasks (created by /speckit.tasks)
```

### Source Code (repository root)

```text
# New files
convex/functions/consent.ts                                         # Convex queries + mutations
src/components/consent-banner.tsx                                    # Non-blocking banner
src/components/consent-lock-overlay.tsx                              # Blocking overlay
src/domains/compliance/hooks/use-consent.ts                          # React hook for consent status
src/domains/account-management/components/privacy-data-section.tsx   # "Privacy & Data" tab
src/app/api/v1/consent/record/route.ts                              # POST — record consent (IP capture)
src/app/api/v1/consent/revoke/route.ts                               # POST — revoke consent (IP capture)
src/app/api/v1/users/data-export/route.ts                            # GET — personal data export (JSON)

# Modified files
convex/schema.ts                                                     # Add consent_records table
src/app/[locale]/layout.tsx                                          # Mount ConsentBanner + ConsentLockOverlay
src/domains/onboarding/components/business-onboarding-modal.tsx      # Consent checkbox on Step 1
src/app/[locale]/invitations/accept/page.tsx                         # Consent checkbox before accept
src/domains/account-management/components/tabbed-business-settings.tsx # Add "Privacy & Data" tab
```

**Structure Decision**: Follows existing domain structure. Consent Convex functions in `convex/functions/`. UI components split: shared components in `src/components/` (banner, overlay), domain-specific in `src/domains/` (settings section, hooks). API routes follow existing `src/app/api/v1/` pattern.

## Implementation Phases

### Phase 1: Data Foundation (P1 — Consent Infrastructure)

**Goal**: Consent records table + Convex functions + API routes. No UI yet.

1. Add `consent_records` table to `convex/schema.ts` (see data-model.md)
2. Create `convex/functions/consent.ts` with all queries + mutations (see contracts)
3. Create REST API routes for IP capture: `POST /api/v1/consent/record`, `POST /api/v1/consent/revoke`
4. Add environment variables: `NEXT_PUBLIC_CURRENT_POLICY_VERSION`, `CONSENT_GRACE_PERIOD_START`
5. Run `npx convex deploy --yes`

**Verification**: Convex functions callable from dashboard, schema deployed.

### Phase 2: Onboarding Consent (P1 — Highest Priority Entry Point)

**Goal**: Consent checkbox on onboarding Step 1 that blocks progression.

1. Create `use-consent` hook (`src/domains/compliance/hooks/use-consent.ts`)
2. Modify `business-onboarding-modal.tsx` Step 1: add checkbox below business fields
3. Wire checkbox to block "Next" button when unchecked
4. On "Next" click (with checkbox): call `/api/v1/consent/record` with `source: "onboarding"`
5. Add validation message for unchecked state

**Verification**: New user cannot proceed past Step 1 without consent. Record created in Convex.

### Phase 3: Existing User Banner + Blocking Overlay (P2)

**Goal**: Non-blocking banner for existing users, escalating to blocking after 30 days.

1. Create `consent-banner.tsx` — persistent top banner querying consent status
2. Create `consent-lock-overlay.tsx` — follows SubscriptionLockOverlay pattern exactly
3. Mount both in `src/app/[locale]/layout.tsx` (after SubscriptionLockOverlay)
4. Implement grace period logic: compare `CONSENT_GRACE_PERIOD_START` + 30 days vs now
5. Banner "Review & Accept" calls `/api/v1/consent/record` with `source: "banner"`

**Verification**: Existing user sees banner. After 30 days, sees blocking overlay. Accept dismisses permanently.

### Phase 4: Invitation Consent (P2)

**Goal**: Consent checkbox on invitation acceptance page.

1. Modify `src/app/[locale]/invitations/accept/page.tsx`
2. Add consent checkbox before "Accept Invitation" button
3. Query `hasAcceptedCurrentPolicy` — skip checkbox if consent already on file
4. On accept: call `/api/v1/consent/record` with `source: "invitation"` before `activateMembership`

**Verification**: Invited user without consent sees checkbox. Invited user with consent does not.

### Phase 5: Privacy & Data Settings (P3)

**Goal**: Self-service data export + consent management in account settings.

1. Create `privacy-data-section.tsx` with three sections:
   - "Download My Data" — triggers `/api/v1/users/data-export`
   - "Consent History" — displays all consent records via Convex query
   - "Revoke Consent" — confirmation dialog → `/api/v1/consent/revoke`
2. Create `GET /api/v1/users/data-export` route — aggregates personal data into JSON
3. Add "Privacy & Data" tab to `tabbed-business-settings.tsx` (visible to all roles)
4. Wire revocation confirmation dialog with data export link + consequence explanation

**Verification**: Any user can download JSON export. Revocation triggers immediate blocking overlay.

### Phase 6: Policy Version Update Support (P3)

**Goal**: When policy version changes, re-consent is triggered for all users.

1. Verify consent check queries use `NEXT_PUBLIC_CURRENT_POLICY_VERSION` from env
2. Test: change env var → rebuild → existing-consented users see banner again
3. Grace period resets for policy version updates (new `CONSENT_GRACE_PERIOD_START` value)

**Verification**: Changing policy version env var triggers re-consent flow for all users.

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Grace period edge case: user first logs in on day 29 | User gets only 1 day non-blocking | Acceptable — 30 days from deployment is the compliance window, not per-user |
| Convex query latency on consent check (every page) | Flash of banner/overlay | Use Convex `useQuery` with suspense boundary; query is simple index lookup |
| Data export for users with large activity | Slow export > 30s | Aggregate counts only for activity summary, not full records |
| Concurrent overlay: subscription lock + consent lock | User sees stacked overlays | Consent overlay takes precedence — if consent is missing, show consent overlay regardless of subscription status |

## Artifacts Generated

| Artifact | Path | Phase |
|----------|------|-------|
| Research decisions | `specs/001-pdpa-consent-collect/research.md` | Phase 0 |
| Data model | `specs/001-pdpa-consent-collect/data-model.md` | Phase 1 |
| API contracts | `specs/001-pdpa-consent-collect/contracts/consent-api.md` | Phase 1 |
| Quickstart guide | `specs/001-pdpa-consent-collect/quickstart.md` | Phase 1 |
