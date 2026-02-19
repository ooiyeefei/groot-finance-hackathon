# Feature Specification: Usage Tracking (AI Chat, E-Invoice, Credit Packs)

**Feature Branch**: `001-usage-tracking`
**Created**: 2026-02-19
**Status**: Draft
**Input**: GitHub Issue #195 — Build usage tracking tables (AI chat, e-invoice, credit packs)

## Clarifications

### Session 2026-02-19

- Q: Does usage tracking apply to trial businesses, and if so, what limits apply? → A: Yes. Trial businesses receive full Pro plan limits (300 AI msg/mo, unlimited invoices/e-invoices, 500 OCR/mo) for 14 days. Tracking covers all subscription states: trialing, active-Starter, active-Pro, and Enterprise.
- Q: If a sales invoice is voided or an e-invoice is cancelled/rejected, does the usage count decrease? → A: No. Usage counts are permanent — once an action is counted, it remains counted regardless of subsequent voiding, cancellation, or rejection.
- Q: If the usage tracking system is temporarily unavailable, should the system block the user action or allow it through? → A: Fail-open. Allow the action through and reconcile usage after the system recovers. Protecting user experience takes priority over strict limit enforcement during transient failures.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — AI Chat Usage Enforcement (Priority: P1)

As a business using FinanSEAL, when any team member sends an AI chat message, the system checks whether the business has remaining AI chat allocation (from the plan or active credit packs) before processing the message. If the allocation is exhausted, the system blocks the message and informs the user of their options (purchase a credit pack or upgrade their plan).

**Why this priority**: AI chat is the #1 differentiator and the primary upgrade trigger. Without usage enforcement, Starter businesses would consume unlimited messages, eliminating upgrade pressure and breaking the pricing model.

**Independent Test**: Can be fully tested by sending AI chat messages as a Starter business (30/month limit) and verifying the system blocks the 31st message with an appropriate notification.

**Acceptance Scenarios**:

1. **Given** a Starter business with 29 messages used this month, **When** a team member sends a message, **Then** the message is processed and the count updates to 30.
2. **Given** a Starter business with 30 messages used this month and no active credit packs, **When** a team member attempts to send a message, **Then** the system blocks the message and displays a notification explaining the limit has been reached with options to upgrade or purchase credits.
3. **Given** a Starter business with 30 messages used this month and an active credit pack with 20 remaining credits, **When** a team member sends a message, **Then** the message is processed by consuming one credit from the oldest active pack.
4. **Given** a Pro business with 300 messages used this month, **When** a team member attempts to send a message, **Then** the system blocks the message (same behavior as Starter at limit).
5. **Given** an Enterprise business, **When** a team member sends a message, **Then** the message is always processed regardless of count (unlimited allocation).
6. **Given** a trial business (within 14-day trial period), **When** a team member sends a message, **Then** the system applies Pro plan limits (300 messages/month) — the message is processed if the business has used fewer than 300 messages this month.

---

### User Story 2 — E-Invoice Submission Tracking (Priority: P2)

As a business submitting LHDN e-invoices through FinanSEAL, the system tracks each e-invoice submission against the business's monthly allocation. When the allocation is exhausted, the system prevents further submissions and informs the user.

**Why this priority**: E-invoicing is mandatory for Malaysian businesses (since July 2025). Tracking is required to enforce plan-based limits (100/month for Starter, unlimited for Pro/Enterprise) and is a key upgrade trigger.

**Independent Test**: Can be tested by submitting e-invoices as a Starter business and verifying the 101st submission is blocked.

**Acceptance Scenarios**:

1. **Given** a Starter business with 99 e-invoices submitted this month, **When** the business submits an e-invoice, **Then** the submission is processed and the count updates to 100.
2. **Given** a Starter business with 100 e-invoices submitted this month, **When** the business attempts to submit an e-invoice, **Then** the system blocks the submission and displays a notification explaining the limit.
3. **Given** a Pro business, **When** the business submits an e-invoice, **Then** the submission is always processed (unlimited allocation).
4. **Given** a trial business, **When** the business submits an e-invoice, **Then** Pro plan limits apply (unlimited) — the submission is always processed.

---

### User Story 3 — Credit Pack Purchase and Consumption (Priority: P2)

As a business owner or finance admin, I can purchase credit packs to add additional AI chat messages or OCR scans beyond my plan allocation. Credits are consumed automatically when plan allocation is exhausted, drawing from the oldest purchased pack first (FIFO). Packs expire 90 days after purchase.

**Why this priority**: Credit packs are the "pressure valve" that prevents user frustration when limits are hit, while creating a natural upgrade funnel (repeated pack purchases become more expensive than upgrading).

**Independent Test**: Can be tested by purchasing a credit pack, exhausting the plan allocation, and verifying the system draws from the credit pack automatically.

**Acceptance Scenarios**:

1. **Given** a business purchases an AI Chat Boost pack (50 messages), **Then** the pack is immediately available with 50 credits, an expiration date 90 days from purchase, and an active status.
2. **Given** a business has two active AI credit packs (Pack A purchased 60 days ago with 10 remaining, Pack B purchased 30 days ago with 50 remaining), **When** the plan allocation is exhausted and a message is sent, **Then** the system deducts from Pack A first (FIFO — oldest first).
3. **Given** a credit pack purchased 90 days ago with 15 unused credits, **When** the system runs its daily expiry check, **Then** the pack status changes to "expired" and the 15 remaining credits are forfeited.
4. **Given** a business has a credit pack with 1 remaining credit, **When** that credit is consumed, **Then** the pack status changes to "depleted."
5. **Given** a business has both AI credit packs and OCR credit packs, **When** AI plan allocation is exhausted, **Then** only AI credit packs are consumed (not OCR credit packs).

---

### User Story 4 — Sales Invoice Count Enforcement (Priority: P3)

As a business creating sales invoices, the system counts the number of invoices created this month against the plan limit (10/month for Starter, unlimited for Pro/Enterprise). When the limit is reached, the system prevents further invoice creation.

**Why this priority**: Sales invoice limits are a key differentiation between Starter and Pro tiers, and a natural upgrade trigger for businesses issuing more than 10 invoices per month.

**Independent Test**: Can be tested by creating 10 sales invoices as a Starter business and verifying the 11th is blocked.

**Acceptance Scenarios**:

1. **Given** a Starter business with 9 invoices created this month, **When** the business creates a new invoice, **Then** the invoice is created successfully and the count is now 10.
2. **Given** a Starter business with 10 invoices created this month, **When** the business attempts to create a new invoice, **Then** the system blocks creation and displays a notification explaining the limit.
3. **Given** a Pro business, **When** the business creates an invoice, **Then** the invoice is always created (unlimited allocation).

---

### User Story 5 — Unified Usage Dashboard (Priority: P3)

As a business owner or finance admin, I can view a summary of all current usage across my business: AI chat messages, OCR scans, sales invoices, and LHDN e-invoices — each showing used/limit for the current billing month. Active credit packs are also visible with their remaining balances and expiration dates.

**Why this priority**: Visibility into usage is necessary for informed decision-making about upgrades and credit pack purchases. Without it, limits feel arbitrary and frustrating.

**Independent Test**: Can be tested by viewing the billing/usage section and verifying all four usage types display correct current-month counts against plan limits, plus any active credit packs.

**Acceptance Scenarios**:

1. **Given** a Starter business with 20 AI messages used, 5 invoices, 45 e-invoices, and 80 OCR scans this month, **When** the admin views the usage summary, **Then** all four usage types are displayed with used/limit values (e.g., "20 / 30 AI messages").
2. **Given** a business with two active credit packs, **When** the admin views the usage summary, **Then** each pack is shown with its type, remaining credits, and expiration date.
3. **Given** a Pro business with unlimited invoice and e-invoice allocation, **When** the admin views the usage summary, **Then** those categories show the count used with "Unlimited" as the limit.

---

### Edge Cases

- **Month boundary rollover**: When a new billing month begins, all monthly usage counters (AI messages, e-invoices, sales invoices, OCR) reset to zero. Credit pack balances are unaffected by monthly resets.
- **Concurrent usage**: If two team members send AI chat messages simultaneously and only one message worth of allocation remains, only one message should be processed; the other should be blocked with the limit-reached notification.
- **Credit pack expiry during active use**: If a user sends a message that would consume from a credit pack, but the pack expires between the pre-flight check and the actual consumption, the system should still process the message (graceful handling — do not fail a message that was approved by the pre-flight check).
- **Plan downgrade with active credit packs**: If a business downgrades from Pro to Starter, any active credit packs remain valid until their expiration. The new (lower) plan limits take effect immediately.
- **Plan upgrade mid-month**: If a business upgrades from Starter to Pro mid-month, the higher plan limits take effect immediately. Existing usage counts for the current month are retained (not reset).
- **All credit packs expired**: When a business's plan allocation is exhausted and all credit packs are either expired or depleted, the system blocks the action and offers the option to purchase a new credit pack or upgrade.
- **Zero-usage months**: If a business has no activity in a given month, no usage record needs to exist. The system should treat the absence of a record as zero usage.
- **Trial expiry to paid conversion**: When a trial expires and the business subscribes to a paid plan (Starter or Pro), the new plan's limits take effect immediately. Any usage accumulated during the trial month carries over into the current calendar month (usage counters are not reset on conversion).
- **Trial expiry without conversion**: When a trial expires and the business does not subscribe, the business enters read-only mode. Usage tracking stops (no new actions can be initiated).
- **Voided invoice or rejected e-invoice**: If a sales invoice is voided or an LHDN e-invoice submission is rejected/cancelled after creation, the usage count does NOT decrease. The allocation was consumed at the point of action. This prevents abuse via create-void-create cycles.
- **Usage tracking unavailable**: If the system cannot read or write usage data during a pre-flight check (transient failure), the action proceeds (fail-open). The usage is reconciled when tracking recovers. This may result in a business temporarily exceeding their plan limit, which is acceptable to avoid blocking paying users.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST track AI chat message usage per-business per-calendar-month, incrementing the count after each message is processed.
- **FR-002**: System MUST track LHDN e-invoice submission usage per-business per-calendar-month, incrementing the count after each successful submission.
- **FR-003**: System MUST count sales invoices created per-business per-calendar-month from existing invoice records (no separate usage counter required).
- **FR-004**: System MUST perform a pre-flight check before processing any AI chat message, e-invoice submission, or sales invoice creation to verify the business has remaining allocation (plan limit + available credit pack credits where applicable).
- **FR-005**: System MUST block the action and display a user-friendly notification when a business exceeds their plan allocation and has no available credit packs for the relevant resource type.
- **FR-006**: System MUST support credit pack purchases for AI chat messages (Boost: 50 messages, Power: 150 messages) and OCR scans (Extra OCR: 100 scans).
- **FR-007**: System MUST consume credit pack credits using FIFO order — always deducting from the oldest active (non-expired, non-depleted) pack first.
- **FR-008**: System MUST automatically expire credit packs 90 days after purchase, forfeiting any unused credits.
- **FR-009**: System MUST mark credit packs as depleted when all credits are consumed.
- **FR-010**: System MUST expose all usage data (AI messages, OCR scans, sales invoices, e-invoices) with used/limit values through the billing information available to the client application.
- **FR-011**: System MUST expose active credit pack data (pack type, remaining credits, expiration date) through the billing information.
- **FR-012**: System MUST reset monthly usage counters at the start of each calendar month. Credit pack balances are NOT reset monthly.
- **FR-013**: System MUST treat unlimited plan allocations (Pro/Enterprise for invoices and e-invoices; Enterprise for all resources) as never reaching a limit — the pre-flight check always passes.
- **FR-014**: System MUST read plan limits (AI message limit, invoice limit, e-invoice limit) from the subscription plan configuration so that limit changes propagate without code changes.
- **FR-015**: System MUST resolve usage limits based on the business's current subscription state: trialing businesses use Pro plan limits, active businesses use their subscribed plan's limits (Starter or Pro), and Enterprise businesses have unlimited allocation.
- **FR-016**: System MUST fail-open when usage tracking is temporarily unavailable — the user action proceeds, and the usage count is reconciled after the tracking system recovers. The system MUST NOT block a user action due to an internal tracking failure.

### Key Entities

- **AI Message Usage**: Represents the count of AI chat messages sent by a business in a given calendar month. Attributes: business reference, month identifier, messages used count, plan limit for that month.
- **E-Invoice Usage**: Represents the count of LHDN e-invoice submissions by a business in a given calendar month. Attributes: business reference, month identifier, submissions used count, plan limit for that month.
- **Credit Pack**: Represents a purchased bundle of additional credits (AI messages or OCR scans). Attributes: business reference, pack type (AI credits or OCR credits), total credits purchased, credits used, credits remaining, purchase date, expiration date (90 days from purchase), payment reference, status (active, expired, depleted).
- **Sales Invoice Count**: Derived count of sales invoices created by a business in a given calendar month. No separate entity required — counted from existing sales invoice records.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of AI chat messages, e-invoice submissions, and sales invoice creations are checked against business allocation before processing, with zero instances of usage exceeding the plan limit without credit pack consumption.
- **SC-002**: When a business reaches its plan limit, the blocking notification appears within 2 seconds and clearly communicates the limit, remaining options (credit pack purchase or upgrade), and does not result in data loss.
- **SC-003**: Credit pack credits are consumed in strict FIFO order with 100% accuracy — no newer pack is drawn from before an older active pack is fully depleted.
- **SC-004**: Credit packs expire exactly 90 days after purchase, with expired packs no longer available for consumption within the same day of expiry.
- **SC-005**: The billing usage summary displays all four usage types with current-month data that is accurate to within the last completed action (near real-time accuracy).
- **SC-006**: Monthly usage counters reset correctly on the first day of each calendar month — no residual counts from the prior month affect the new month's allocation.
- **SC-007**: Usage tracking operates without perceptible delay to end users — the pre-flight check and usage recording add no more than 1 second to any user-initiated action.

## Assumptions

- **Per-business tracking**: All usage limits are per-business (shared across all team members), not per-user. This is consistent with the pricing strategy rationale.
- **Calendar month cycle**: Monthly usage resets align with calendar months (1st of each month), not subscription billing anniversary dates.
- **Trial uses Pro plan limits**: Businesses in the trialing state receive the same usage limits as Pro plan subscribers (300 AI msg/mo, 500 OCR/mo, unlimited invoices, unlimited e-invoices) for the duration of their 14-day trial. This applies monthly tracking — not total-based limits.
- **Automatic credit pack fallback**: When plan allocation is exhausted, the system automatically draws from available credit packs without requiring explicit user action. Users are notified that credits are being consumed from a purchased pack.
- **No credit pack refunds**: Expired credit pack credits are forfeited. There is no pro-rated refund for unused credits.
- **Sales invoice count from existing data**: Sales invoices do not require a separate usage tracking table. The count is derived from the existing sales invoice records filtered by business and month.
- **OCR usage already tracked**: OCR scan usage tracking already exists and is not in scope for this feature. However, OCR credit packs (Extra OCR Pack) must integrate with the existing OCR tracking mechanism.
- **Unlimited represented as -1**: Plan limits use -1 (or equivalent sentinel value) to represent "unlimited" allocation where the pre-flight check always passes.
- **Credit pack availability**: Credit packs are available for purchase by any plan tier (Starter, Pro, Enterprise), though Enterprise has no practical need for them.
- **No rollover of plan allocation**: Unused monthly plan messages/invoices/e-invoices do not carry over to the next month.

## Dependencies

- **Existing OCR usage tracking**: The credit pack consumption logic for OCR credits must integrate with the existing OCR usage tracking system.
- **Subscription plan configuration**: Plan limits (AI message limit, invoice limit, e-invoice limit) must be available from the plan/catalog configuration. The pricing strategy document and Stripe metadata already define these values.
- **Billing/payment system**: Credit pack purchases require integration with the existing payment system for processing purchases and recording payment references.

## Out of Scope

- **Usage analytics or historical reporting**: This feature tracks current-month usage only. Historical usage dashboards or trend reporting are separate features.
- **Usage-based billing or metering**: This feature enforces pre-set plan limits. It does not implement pay-per-use billing.
- **Notification system for approaching limits**: Proactive warnings (e.g., "You've used 80% of your AI messages") are a separate feature. This spec covers only the hard limit enforcement.
- **Admin controls for usage allocation**: Ability for business admins to allocate usage budgets to individual team members is not included.
- **Credit pack gifting or transfer**: Credit packs are tied to the purchasing business and cannot be transferred.
