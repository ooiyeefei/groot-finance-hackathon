# Research: PDPA Consent Collection

**Date**: 2026-03-03 | **Branch**: `001-pdpa-consent-collect`

## R1: Blocking Overlay Pattern

**Decision**: Follow the existing `SubscriptionLockOverlay` pattern for the consent blocking overlay.

**Rationale**: Production-tested pattern already in the codebase. Full-screen fixed overlay at `z-40` with blur backdrop, mounted in locale layout, with a whitelisted paths mechanism. The consent overlay reuses this exact structure.

**Key implementation details**:
- File: `src/domains/billing/components/subscription-lock-overlay.tsx`
- Mounted in: `src/app/[locale]/layout.tsx` (after children)
- Guard pattern: loading → status check → pathname whitelist → render overlay
- Z-index: `z-40` (sidebar at `z-[45]` stays accessible, Radix portals at `z-50`)
- No props — all state from custom hook
- Uses `useClerk()` for sign-out action

**Alternatives considered**:
- Modal dialog: Rejected — too easy to dismiss, doesn't convey blocking severity
- Route redirect: Rejected — breaks back button and deep links
- Custom portal: Rejected — SubscriptionLockOverlay already solves this

## R2: Consent Status Check Mechanism

**Decision**: Use Convex query (real-time subscription) for consent status, not REST API.

**Rationale**: Consent status needs to be reactive across concurrent sessions (edge case in spec). Convex real-time subscriptions automatically update all open tabs when consent is recorded. The SubscriptionLockOverlay uses REST because billing data comes from Stripe (external), but consent data lives entirely in Convex.

**Alternatives considered**:
- REST API + localStorage cache (like SubscriptionLockOverlay): Rejected — adds stale cache risk, requires manual invalidation
- Convex query with `useQuery()`: Chosen — automatic reactivity, zero cache management

## R3: Policy Version Storage

**Decision**: Store current policy version as an environment variable `NEXT_PUBLIC_CURRENT_POLICY_VERSION`.

**Rationale**: Policy version changes are infrequent (yearly or less). Environment variables can be updated via Vercel dashboard without code deployment. Using `NEXT_PUBLIC_` prefix makes it available client-side for the consent check query. No dedicated config table needed for a single value.

**Key details**:
- Variable: `NEXT_PUBLIC_CURRENT_POLICY_VERSION` (e.g., `"2026-01-15"`)
- Passed as argument to Convex queries: `hasAcceptedCurrentPolicy(policyVersion)`
- Update process: Change in Vercel dashboard → triggers redeploy → all users see new version

**Alternatives considered**:
- Convex `system_settings` table: Rejected — over-engineering for a single value that changes yearly. Adds a query hop on every page load.
- Hardcoded constant in code: Rejected — requires code deployment to update
- `.env.local` only: Rejected — not available in production without Vercel env vars

## R4: IP Address Capture

**Decision**: Reuse existing IP extraction pattern from `src/domains/security/lib/audit-logger.ts`.

**Rationale**: The codebase already has a utility that extracts IP from `x-forwarded-for`, `x-real-ip`, and `x-client-ip` headers. Consent recording happens via API route (not direct Convex mutation from client), so headers are available.

**Key details**:
- Extract from: `x-forwarded-for` (first IP) → `x-real-ip` → `x-client-ip` → undefined
- Pass as optional field to Convex mutation
- IP is best-effort — consent record is valid without it

**Alternatives considered**:
- Client-side IP detection (e.g., ipify API): Rejected — adds external dependency, latency, privacy concerns
- Skip IP entirely: Rejected — IP is useful for audit trail and fraud detection

## R5: "Download My Data" Placement

**Decision**: Add a new "Privacy & Data" tab in business settings, visible to all authenticated users.

**Rationale**: The existing Profile tab handles user preferences (currency, timezone, notifications). Privacy and data rights (consent management, data export, revocation) are a distinct concern. A dedicated tab provides a clear home for all PDPA-related actions and scales for future privacy features (data deletion requests, processing purpose management).

**Key details**:
- Settings route: `/[locale]/business-settings?tab=privacy`
- Tab label: "Privacy & Data"
- Sections: "Download My Data" (JSON export), "Consent History" (view records), "Revoke Consent" (with confirmation)
- Visible to ALL roles (not just owner/admin)
- Existing tabbed settings component: `src/domains/account-management/components/tabbed-business-settings.tsx`

**Alternatives considered**:
- Add to existing Profile tab: Rejected — Profile tab is about preferences, not rights. Mixing them creates confusion.
- Standalone route (`/privacy`): Rejected — breaks the established settings pattern

## R6: Grace Period Tracking

**Decision**: Track grace period start from the consent feature deployment date (stored as environment variable) or from the user's first login after a policy version change.

**Rationale**: The 30-day grace period for existing users needs a start date. Two scenarios:
1. **Initial deployment**: All existing users get 30 days from deployment date (`CONSENT_GRACE_PERIOD_START`)
2. **Policy version update**: Grace period starts from the first time the user sees the new version banner (tracked via a `firstPromptedAt` field on the consent check)

**Key details**:
- Environment variable: `CONSENT_GRACE_PERIOD_START` (ISO date, e.g., `"2026-03-15"`)
- Convex query logic: if user has no consent for current version AND current date > grace start + 30 days → blocking
- For policy version updates: use `_creationTime` of the "policy version change" event or a new `consent_prompts` table

**Alternatives considered**:
- Track per-user "first prompted" timestamp: More accurate but requires additional writes on every page load for unprompted users
- No grace period tracking (immediate blocking for existing users): Rejected — spec requires 30-day non-blocking grace period

## R7: Jurisdictional Compliance Matrix

**Decision**: Apply strictest standard across Malaysia PDPA 2010, Singapore PDPA 2012, Thailand PDPA 2019, and California CCPA/CPRA.

**Research findings** (from dedicated PDPA research agents):

| Requirement | MY | SG | TH | CA (CCPA) | Applied |
|-------------|----|----|----|-----------| --------|
| Opt-in consent | Yes | Yes | Yes | Yes | Yes |
| Pre-ticked boxes | No | No | No | No | No |
| Withdrawal right | Yes | Yes | Yes | Yes | Yes |
| Cessation on withdrawal | "ASAP" | "ASAP" | "ASAP" | 45 days | Immediate |
| Self-service export | No | No | No | **Yes** | Yes |
| Machine-readable format | No | No | **Yes** | **Yes** | Yes (JSON) |
| Breach notification | No | **3 days** | 72 hours | 72 hours | 3 days |
| Penalties | RM 300K + 2yr jail | 10% turnover / SGD 1M | Up to THB 5M | $7,500/violation | N/A |

**Alternatives considered**:
- Region-specific compliance (different behavior per jurisdiction): Rejected — too complex for MVP, risk of misconfiguration
- ASEAN-only (no CCPA): Rejected — user explicitly requested US coverage
