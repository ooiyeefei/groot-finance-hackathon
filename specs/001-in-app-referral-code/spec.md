# Feature Specification: In-App Referral Code System

**Feature Branch**: `001-in-app-referral-code`
**Created**: 2026-03-07
**Status**: Draft
**GitHub Issue**: [#266](https://github.com/grootdev-ai/groot-finance/issues/266)
**Input**: Build a universal in-app referral code system accessible from the dashboard for all users (customers and partners). Each user gets a unique referral code to share. Track referrals accurately with real-time status updates as referred businesses progress through signup → trial → paid subscription.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View and Share My Referral Code (Priority: P1)

As any Groot Finance user (owner, manager, or employee), I want to see my unique personal referral code in my dashboard so I can share it with other business owners I know, via WhatsApp, email, or any messaging channel.

**Why this priority**: This is the core action — without a visible, shareable referral code, nothing else matters. Every referral starts with a share. Must be frictionless (1 tap to copy, 1 tap to share) and work perfectly on mobile since most SEA business owners use phones.

**Independent Test**: Can be fully tested by logging in as any user (owner, manager, or employee), navigating to the referral section, seeing a unique code, copying it, and sharing via native share sheet. Delivers immediate value — users can start referring even before tracking is visible.

**Acceptance Scenarios**:

1. **Given** a logged-in user (any role) who has never visited the referral section, **When** they tap the "Earn $" header icon or navigate to the referral page, **Then** the system auto-generates a unique personal referral code (e.g., `GR-FIN-3AR5M`) and displays it prominently with a copy button and a share button.
2. **Given** a user viewing their referral code on mobile, **When** they tap "Share", **Then** the device's native share sheet opens (WhatsApp, Telegram, SMS, email, etc.) with a pre-composed message containing the referral link.
3. **Given** a user viewing their referral code on desktop, **When** they click "Copy Code" or "Copy Link", **Then** the referral code or full referral URL is copied to clipboard with visual confirmation (e.g., "Copied!" toast).
4. **Given** a user's referral link (e.g., `finance.hellogroot.com/sign-up?ref=GR-FIN-3AR5M`), **When** a new visitor opens that link, **Then** the referral code is captured and pre-filled so the new user doesn't need to manually enter it.

---

### User Story 2 - Checkout with Referral Attribution (Priority: P1)

As a new business signing up for Groot Finance, I want to enter a referral code during checkout (or have it auto-filled from a referral link) so that I get RM 100 off my annual plan and my referrer gets credit for bringing me in.

**Why this priority**: Attribution at checkout is the revenue event — this is where referrals convert to tracked, paid outcomes. The referee gets RM 100 off annual plans; the referrer earns the bounty (RM 80–500) when the referred business becomes a paying annual subscriber. Without accurate checkout attribution, the referral system has no measurable impact.

**Independent Test**: Can be tested by creating a checkout session with a referral/promotion code applied, completing payment, and verifying that the referral attribution is stored on the new business record.

**Acceptance Scenarios**:

1. **Given** a new user who arrived via a referral link (`?ref=GR-FIN-3AR5M`), **When** they reach the checkout page, **Then** the referral code is pre-applied showing "RM 100 off" on annual plans and a "Referred by [Referrer Name]" badge, and the user can proceed without any extra steps.
2. **Given** a new user at checkout without a referral link, **When** they see a "Have a referral code?" field and enter a valid code, **Then** the code is validated and applied to their checkout session.
3. **Given** a new user enters an invalid or expired referral code, **When** they submit, **Then** they see a clear error message ("Invalid referral code") and can still proceed with checkout without a code.
4. **Given** a successful checkout with a referral code, **When** the payment completes, **Then** the system records the referral attribution: which code was used, which user referred, which business they belong to, and the timestamp.

---

### User Story 3 - Track My Referral Performance (Priority: P2)

As a referrer, I want to see a dashboard showing how many people I've referred, their current status (signed up, in trial, became a paying customer), and any earnings I've accumulated, so I feel motivated to refer more.

**Why this priority**: Tracking creates a feedback loop. Referrers who can see their impact and earnings refer more. Without visibility, the referral program feels like a black box. This is the "stickiness" feature inspired by the Luckin Coffee and Endowus examples — showing invitation counts, progress toward milestones, and reward status.

**Independent Test**: Can be tested by creating a referrer with 3+ referrals at different stages and verifying the dashboard shows accurate, real-time counts and statuses.

**Acceptance Scenarios**:

1. **Given** a referrer who has shared their code with 5 people, and 3 have signed up (1 in trial, 1 paying Starter, 1 paying Pro), **When** they visit their referral dashboard, **Then** they see: Total Referrals: 3, In Trial: 1, Paying Customers: 2, with plan details visible for each.
2. **Given** a referred business that just upgraded from trial to paid subscription, **When** the referrer views their dashboard (or refreshes), **Then** the status updates in real-time (within seconds, not requiring a page refresh) to reflect the new "Paying" status.
3. **Given** a referrer on a mobile device, **When** they view their referral dashboard, **Then** the layout is fully responsive — stats are clearly readable, referral list scrolls smoothly, and all actions (copy code, share) are thumb-reachable.

---

### User Story 4 - Auto-Generate Referral Code on Opt-In (Priority: P2)

As any Groot Finance user (owner, manager, or employee), I want to opt into the referral program with minimal friction — ideally a single button tap — and immediately receive my unique personal referral code without filling out any forms or waiting for approval.

**Why this priority**: Reducing friction to near-zero is critical for adoption. The existing partner application form (name, email, phone, company, etc.) is appropriate for external resellers but too heavy for existing users who just want to refer a friend. One-tap opt-in is the difference between 5% and 50% participation. Since codes are per-user, even employees can participate — a business with 10 users means 10 potential referrers.

**Independent Test**: Can be tested by navigating to the referral page as any user who hasn't opted in, tapping "Start Referring", and immediately seeing a generated code ready to share.

**Acceptance Scenarios**:

1. **Given** a logged-in user (any role) who hasn't opted into the referral program, **When** they tap the "Earn $" header icon, **Then** they see a brief explanation of the program (earn RM 80–500 per referral) and a single "Start Referring" button.
2. **Given** the user taps "Start Referring", **When** the system processes, **Then** within 2 seconds they see their unique referral code (format: `GR-FIN-XXXXX` derived from their Clerk user ID) and sharing options — no form fields, no approval wait.
3. **Given** the user already has a referral code, **When** they return to Settings > Referral, **Then** they go directly to their referral dashboard (code + stats) without seeing the opt-in prompt again.

---

### User Story 5 - Referral Status Auto-Updates When Referred Business Subscribes (Priority: P2)

As a referrer, I want the status of my referred businesses to automatically update when they move through the funnel (signed up → trial → paid → upgraded), so I don't need to manually check or ask the Groot team.

**Why this priority**: Accurate, automatic status tracking is the infrastructure backbone of the referral system. Manual tracking doesn't scale and erodes trust. This enables both the referrer dashboard (Story 3) and the internal payout reconciliation.

**Independent Test**: Can be tested by creating a referred business, simulating subscription events (trial start, payment, upgrade), and verifying the referral record updates automatically within seconds.

**Acceptance Scenarios**:

1. **Given** a referral code was used during signup, **When** the referred business completes onboarding and starts a trial, **Then** the referral record status updates to "Trial" automatically.
2. **Given** a referred business in trial, **When** they complete their first payment and become a paying subscriber, **Then** the referral record status updates to "Paid" with the plan name and payment date.
3. **Given** a referred business on Starter plan, **When** they upgrade to Pro within 12 months, **Then** the referral record status updates to "Upgraded" and the referrer is eligible for the upgrade bonus (per program rules).
4. **Given** a referred business cancels their subscription, **When** the cancellation processes, **Then** the referral record status updates to "Churned" and clawback rules apply if within 90 days.

---

### User Story 6 - Referral Code Entry on Sign-Up Page (Priority: P3)

As a new visitor arriving at the sign-up page via a referral link, I want to see who referred me and feel confident I'm getting the right link, so the experience feels personal rather than generic.

**Why this priority**: A warm welcome for referred users improves conversion. Showing "Referred by [Company Name]" builds trust. Lower priority because the core attribution works without it (Story 2 handles checkout), but this improves the end-to-end UX.

**Independent Test**: Can be tested by visiting the sign-up page with a `?ref=CODE` parameter and verifying the referral badge appears.

**Acceptance Scenarios**:

1. **Given** a visitor opens `finance.hellogroot.com/sign-up?ref=GR-FIN-3AR5M`, **When** the page loads, **Then** they see a badge like "Referred by [Referrer's Name]" near the sign-up form, and the code is stored for later use at checkout.
2. **Given** a visitor opens the sign-up page without a `ref` parameter, **When** the page loads, **Then** no referral badge is shown and the flow is unchanged.

---

### Edge Cases

- **Self-referral attempt**: A user tries to use their own referral code when signing up a new business. System must prevent self-referrals (same Clerk user ID check).
- **Duplicate referral**: Two referrers share codes with the same prospect. First-touch attribution applies — the first code used (at signup or checkout) gets credit.
- **Expired attribution window**: A referral code was captured at signup but the business doesn't subscribe until 91+ days later. The 90-day attribution window has lapsed — no credit given.
- **Referrer's business churns**: The referrer's own subscription is cancelled. Their existing referral codes and earnings remain valid (code stays active for new referrals).
- **Invalid/deactivated code at checkout**: A code that was valid when shared has since been deactivated. User sees a clear error and can proceed without a code.
- **Multiple businesses, same owner**: A Clerk user owns multiple businesses. They have one referral code (per-user); they cannot use it to refer businesses they themselves own.
- **Code collision**: Since codes are derived from Clerk user ID (first 5 chars), collisions are possible but rare. If a generated code conflicts, append additional characters from the user ID until unique.
- **Offline/slow connection on mobile**: Share action must work with native OS share sheet (no custom UI that requires connectivity). Copy-to-clipboard works offline.
- **Referred business downgrades within 90 days**: Payout adjusts to the lower plan level per commercial rules. Status shows "Downgraded" with adjusted earning.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST auto-generate a unique referral code for each user upon opt-in (format: `GR-FIN-XXXXX` where XXXXX is the first 5 characters of their Clerk user ID, uppercase). Referral codes are per-user — a business with 10 users has 10 independent referral codes. All user roles (owner, manager, employee) can participate.
- **FR-002**: System MUST provide a one-tap copy-to-clipboard action for the referral code and the full referral URL.
- **FR-003**: System MUST trigger the device's native share sheet (Web Share API) on mobile when user taps "Share", with a pre-composed message containing the referral link.
- **FR-004**: System MUST capture the referral code from URL query parameter (`?ref=CODE`) on the sign-up page and persist it through to checkout.
- **FR-005**: System MUST allow manual entry of a referral/promotion code during the checkout flow.
- **FR-006**: System MUST validate referral codes in real-time — checking existence, active status, and that it's not a self-referral.
- **FR-007**: System MUST record referral attribution on the referred business record upon successful first payment, linking to the referring user and their business.
- **FR-008**: System MUST sync referral codes with the payment provider as promotion codes that apply RM 100 off annual plans for the referee. The referrer earns a separate bounty (RM 80–500) upon the referred business's first paid annual subscription.
- **FR-009**: System MUST automatically update referral status when the referred business's subscription changes (trial → paid → upgraded → churned → cancelled).
- **FR-010**: System MUST display a referral dashboard showing: referral code, total referrals, referral statuses (trial, paid, upgraded, churned), and total estimated earnings.
- **FR-011**: System MUST enforce first-touch attribution — if multiple codes are associated with the same referred business, the first code used gets credit.
- **FR-012**: System MUST enforce the 90-day attribution window — referrals that convert after 90 days from code capture receive no attribution.
- **FR-013**: System MUST prevent self-referrals — a user cannot use their own referral code (same Clerk user ID check).
- **FR-014**: System MUST be fully responsive across mobile (320px+), tablet, and desktop viewports. All referral actions (view code, copy, share, view stats) must be usable on mobile.
- **FR-015**: System MUST support both customer-type referral codes (existing Groot users) and partner-type referral codes (external resellers/referrers from the partner program), with the same underlying attribution mechanism.
- **FR-016**: System MUST display referral status updates in real-time (within seconds of the subscription event) without requiring a page refresh.
- **FR-017**: System MUST display a persistent "Earn $" entry point in the top header bar (alongside notifications, theme toggle, language selector) with an animated reward/gift/money icon. Tapping it navigates to the referral page. This is the primary discoverability mechanism — visible on every page of the app.
- **FR-018**: System MUST apply a flat RM 100 discount on annual plan checkout when a valid referral code is used. Monthly plans are not eligible for the referral discount.

### Key Entities

- **Referral Code**: A unique, shareable identifier linked to a user (not a business). Attributes: code string (format: `GR-FIN-XXXXX`), owner user (Clerk user ID), owner's business at time of creation, code type (customer/partner_referrer/partner_reseller), active/inactive status, creation date, associated payment promotion code ID. One code per user — if a user belongs to multiple businesses, they still have one referral code tied to their user identity.
- **Referral**: A record linking a referral code to a referred business. Attributes: referral code used, referring user, referring user's business, referred business, status (signed_up/trial/paid/upgraded/churned/cancelled), referral capture date, conversion date, plan at conversion, estimated earning amount.
- **Referred Business (extension)**: Existing business entity gains referral attribution fields: which code referred them, which user referred them, which business they belong to, referral capture timestamp.

## Assumptions

- Referral codes are per-user, not per-business. Every user (owner, manager, employee) gets their own code. A business with 10 team members has 10 independent referral codes, each tracked separately.
- The reward structure follows the existing partner program: RM 80 (Starter annual), RM 200 (Pro annual), RM 500 (Enterprise). Customer-to-customer referrals use the same "Referrer" payout tier.
- Payouts are managed manually for v1 (Groot team processes monthly). The dashboard shows "estimated earnings" but actual payout processing is out of scope for this feature.
- The referral opt-in is available to all users regardless of role or subscription status. Even trial users and employees can refer.
- Referral codes do not expire, but the attribution window (90 days from code capture to first payment) does.
- No vanity/custom codes for v1 — codes are auto-generated. Vanity codes can be added in a future iteration.
- The referral landing page at `/referral` continues to exist for external traffic; the in-app experience lives in Settings > Referral.
- Monthly billing referrals are not commissionable in v1 (annual-only per program rules). The code still tracks the referral, but earnings show "Annual plans only" for monthly conversions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can view their referral code and share it within 2 taps (tap header "Earn $" icon → share/copy) from anywhere in the app.
- **SC-002**: 80%+ of users (any role) who visit the referral section complete opt-in and generate a code (low-friction test).
- **SC-003**: Referral attribution accuracy is 100% — every checkout that uses a valid referral code results in a stored attribution record on the referred business.
- **SC-004**: Referral status updates reflect within 30 seconds of a subscription lifecycle event (payment, upgrade, cancellation).
- **SC-005**: The referral page loads and is fully interactive within 2 seconds on a 4G mobile connection.
- **SC-006**: At least 20% of referred sign-ups arrive via referral link (vs. manual code entry), indicating the share flow is working well.
- **SC-007**: Zero referral attribution is lost due to the code not persisting between sign-up and checkout (session persistence test).
- **SC-008**: Partner-sourced referral codes and customer-sourced referral codes both flow through the same attribution pipeline with no manual reconciliation needed.

## Clarifications

### Session 2026-03-07

- Q: Does the referred business (referee) receive a discount or incentive when using a referral code? → A: Yes. Referee gets RM 100 off annual plans. Referrer earns bounty (RM 80–500) when referred business becomes a paying annual subscriber. Monthly plans are not eligible for the referral discount.
- Q: Where is the primary entry point for the referral feature in the app? → A: Top header bar with an animated reward/gift/money icon labeled "Earn $", visible on every page (alongside notification bell, theme toggle, language selector, avatar). Tapping navigates to the referral page. Settings > Referral tab remains as a secondary access point.
- Q: Are referral codes per-business or per-user, and what is the code format? → A: Per-user. Every user (owner, manager, employee) gets their own code. Format: `GR-FIN-XXXXX` where XXXXX is the first 5 characters of their Clerk user ID (uppercase). Example: `GR-FIN-3AR5M`. A business with 10 users has 10 independent referral codes.
