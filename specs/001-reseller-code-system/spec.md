# Feature Specification: Reseller Code System

**Feature Branch**: `001-reseller-code-system`
**Created**: 2026-03-10
**Status**: Draft
**Input**: Extend the existing referral code system to support reseller codes with higher discounts and commissions.

## Clarifications

### Session 2026-03-10

- Q: Should the dashboard show reseller-specific messaging, or defer UI changes? → A: Use the existing `type` field on referral_codes to drive both commission calculation (backend) and dashboard messaging (frontend) dynamically. If type is `partner_reseller`, show reseller rates; if `customer`, show regular rates. No separate page needed — just conditional rendering on the same dashboard. This is a small change, not a new feature.
- Q: Schema approach — new table or extend existing referral_codes? → A: Extend the existing `referral_codes` table. The `type` field already exists and supports `partner_reseller`. Admin manually creates the record with `type: "partner_reseller"` and the GR-RES-* code. The same table, same queries, same dashboard — the `type` field is the single branching point that drives: (1) commission calculation (RM 300/800 vs RM 80/200), (2) dashboard messaging (reseller vs customer rates), (3) Stripe promo code discount (RM 200 vs RM 100 — handled by separate Stripe coupons). No new tables, no schema migration needed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reseller Views Code on Dashboard (Priority: P1)

A reseller partner logs into their Groot Finance business account (which doubles as their demo account) and navigates to the Referral page. They see the same dashboard as any user, but the messaging adapts based on their code type — the existing `type` field on the referral code drives what commission rates are displayed. Resellers see RM 300 (Starter) / RM 800 (Pro) rates; regular users see RM 80 / RM 200. No separate page — just conditional rendering on the same dashboard components.

**Why this priority**: Resellers need to see and share their code before any referrals can happen. This is the entry point for the entire reseller flow.

**Independent Test**: Can be fully tested by creating a reseller code record in the database and verifying the dashboard displays the correct code, commission rates, and share functionality.

**Acceptance Scenarios**:

1. **Given** a reseller has a `partner_reseller` type code in the system, **When** they visit the Referral page, **Then** they see their GR-RES-* code with copy and share buttons.
2. **Given** a reseller views the dashboard, **When** they look at commission information, **Then** they see "RM 300 (Starter) / RM 800 (Pro) per annual subscription" — not the regular RM 80/200 rates.
3. **Given** a reseller has referrals, **When** they view the dashboard, **Then** estimated earnings reflect the reseller-tier commissions (RM 300 or RM 800 per referral).

---

### User Story 2 - Referred Business Gets RM 200 Off at Checkout (Priority: P1)

A potential customer receives a reseller's referral link or code. When they sign up and reach the Stripe checkout for an annual plan, the RM 200 discount is automatically applied (via Stripe Promotion Code). The customer sees the discount clearly on the checkout page.

**Why this priority**: The discount is the value proposition that makes reseller referrals attractive. Without it, there's no incentive for referred businesses to use the reseller's code.

**Independent Test**: Can be tested by using a reseller referral link during sign-up flow and verifying the Stripe checkout shows RM 200 off (vs. RM 100 for regular referrals).

**Acceptance Scenarios**:

1. **Given** a new user signs up via a reseller referral link, **When** they reach Stripe checkout for an annual plan, **Then** the RM 200 discount is applied automatically.
2. **Given** Stripe's one-promo-per-checkout rule, **When** a user already has a regular referral code applied, **Then** the reseller promo code cannot be stacked (Stripe enforces this).
3. **Given** a user signs up via a reseller link for a monthly plan, **When** they reach checkout, **Then** no discount is applied (annual plans only).

---

### User Story 3 - Reseller Earns Higher Commission on Conversion (Priority: P1)

When a referred business converts to a paid annual plan, the system records the reseller-tier commission: RM 300 for Starter plan, RM 800 for Pro plan. The reseller sees this reflected in their dashboard earnings.

**Why this priority**: The higher commission structure is the core differentiator between regular referrals and reseller partnerships. It must be calculated correctly from day one.

**Independent Test**: Can be tested by simulating a conversion event (updating referral status to "paid" with a plan) and verifying the estimated earning matches reseller rates.

**Acceptance Scenarios**:

1. **Given** a business was referred by a reseller code and converts to Starter annual, **When** the system records the conversion, **Then** the estimated earning is RM 300 (not RM 80).
2. **Given** a business was referred by a reseller code and converts to Pro annual, **When** the system records the conversion, **Then** the estimated earning is RM 800 (not RM 200).
3. **Given** a reseller has multiple conversions, **When** they view the stats cards, **Then** total estimated earnings correctly sums all reseller-tier commissions.

---

### User Story 4 - Admin Manually Onboards a Reseller (Priority: P2)

An admin onboards a new reseller partner through a manual process: (1) create a Stripe Coupon for RM 200 off if it doesn't exist, (2) create a Stripe Promotion Code linked to that coupon with the GR-RES-* code, (3) insert/update the referral code record in the database with type `partner_reseller`. The reseller's dashboard then automatically shows the code.

**Why this priority**: This enables the business to start onboarding resellers immediately without building self-service tooling. Manual onboarding is sufficient for the initial small number of reseller partners.

**Independent Test**: Can be tested by following the documented manual steps and verifying the reseller can see their code on the dashboard afterward.

**Acceptance Scenarios**:

1. **Given** an admin wants to onboard a new reseller, **When** they follow the documented manual process (Stripe + database), **Then** the reseller sees their code on the dashboard within minutes.
2. **Given** a reseller code is created with type `partner_reseller`, **When** the system calculates commissions for that code's referrals, **Then** reseller-tier rates apply automatically.

---

### User Story 5 - Track Future Self-Service Onboarding (Priority: P3)

A GitHub issue is filed to track the future development of a self-service reseller onboarding flow, where approved partners can generate their own reseller codes. This is explicitly out of scope for the current iteration.

**Why this priority**: Captures the future requirement without blocking the current manual workflow. Self-service can be built once the reseller program proves viable.

**Independent Test**: Can be verified by confirming the GitHub issue exists with clear acceptance criteria for the future self-service flow.

**Acceptance Scenarios**:

1. **Given** the reseller code system is live, **When** the team reviews the backlog, **Then** a GitHub issue exists documenting the self-service onboarding requirements for future implementation.

---

### Edge Cases

- What happens when a reseller code and a regular referral code both claim the same business? First-touch attribution applies — whichever code was captured first wins. Stripe prevents stacking promo codes at checkout.
- What happens if a reseller is downgraded or removed? The reseller's existing referrals and earned commissions remain unchanged. The code can be deactivated in Stripe to prevent new usage.
- What happens if a referred business upgrades from Starter to Pro? The commission difference (RM 800 - RM 300 = RM 500) should be credited when upgrade tracking is implemented. For now, only the initial plan commission is recorded.
- What happens if admin creates a reseller code but forgets the Stripe promo code? The code appears on the dashboard but the discount won't apply at checkout. The admin checklist documents both steps.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support two code types: `customer` (GR-FIN-*) with RM 100 off / RM 80-200 commission, and `partner_reseller` (GR-RES-*) with RM 200 off / RM 300-800 commission.
- **FR-002**: Commission calculation MUST branch on code type: customer codes earn RM 80 (Starter) / RM 200 (Pro); reseller codes earn RM 300 (Starter) / RM 800 (Pro). Annual plans only.
- **FR-003**: The referral dashboard MUST read the viewer's code `type` field and conditionally display the appropriate commission rates and messaging — no separate reseller page or route.
- **FR-004**: Reseller codes MUST use the prefix `GR-RES-` followed by the business short name (same pattern as `GR-FIN-` for customer codes).
- **FR-005**: The system MUST use first-touch attribution — the first referral code captured for a business determines the referrer, regardless of code type.
- **FR-006**: Reseller onboarding MUST be a documented manual process: admin creates Stripe Promotion Code and database record. No self-service flow in this iteration.
- **FR-007**: The existing referral dashboard, stats cards, and referral list MUST work for both code types without separate pages or navigation.
- **FR-008**: System MUST NOT allow a business to have both a customer referral and a reseller referral — first-touch attribution prevents this.

### Key Entities

- **Referral Code**: Represents a shareable code belonging to a user/business. Key attributes: code string, code type (customer or partner_reseller), associated Stripe promo code ID, owner user/business. The `type` field determines commission tier and discount amount.
- **Referral**: Represents a single referral event — a business that signed up using someone's code. Key attributes: referrer code, referred business, status (trial/paid/churned), estimated earning (calculated based on referrer's code type and referred plan), capture timestamp.
- **Commission Tier**: A business rule (not a stored entity) that maps code type + plan name to commission amount. Customer: Starter=RM 80, Pro=RM 200. Reseller: Starter=RM 300, Pro=RM 800.

## Assumptions

- Reseller partners are given their own Groot Finance business account (used as a demo account), so they access the referral dashboard like any other user.
- The existing `type` field on the referral codes table (already supporting `partner_reseller`) is sufficient — no schema changes needed.
- Stripe's built-in one-promo-per-checkout rule is sufficient to prevent discount stacking. No additional application-level validation is needed.
- Monthly plan referrals earn RM 0 commission regardless of code type (annual plans only).
- The number of reseller partners will be small enough (< 50) that manual onboarding is viable for at least 6 months.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Reseller partners can view their code and share it within 5 minutes of admin onboarding completion.
- **SC-002**: Commission calculations are 100% accurate — reseller referrals always show RM 300 (Starter) or RM 800 (Pro), never customer-tier rates.
- **SC-003**: Admin can onboard a new reseller partner in under 15 minutes following the documented process.
- **SC-004**: Referred businesses see the correct discount (RM 200 for reseller codes) at Stripe checkout with no manual intervention.
- **SC-005**: Dashboard earnings correctly reflect the code type — a reseller with 2 Starter + 1 Pro conversion shows RM 1,400 total (2×300 + 800).
