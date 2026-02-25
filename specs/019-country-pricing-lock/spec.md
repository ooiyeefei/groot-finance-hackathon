# Feature Specification: Country-Based Pricing Lockdown

**Feature Branch**: `019-country-pricing-lock`
**Created**: 2026-02-25
**Status**: Draft
**Input**: User description: "Country-Based Pricing Lockdown - Implement registration-number-based country lockdown for billing plans, preventing users from switching between MYR and SGD currencies. Lock pricing to business country determined by verified business registration number (UEN for Singapore, SSM for Malaysia)."

## Problem Statement

Currently, Groot Finance displays a currency dropdown (MYR/SGD) on the pricing page that allows any user to freely switch between Malaysian Ringgit and Singapore Dollar pricing. This creates a revenue leakage risk: Singapore-based companies can select the cheaper MYR plans (e.g., RM249/mo vs S$149/mo) to save money, undermining the regional pricing strategy.

Large SaaS platforms (Google Workspace, Stripe, Atlassian) solve this by locking billing currency to a verified business profile — not by IP detection (which is easily bypassed), but by requiring a verified business registration number that ties the account to a specific country.

The Groot Admin product has already implemented this pattern with a registration-based country lockdown: businesses declare their country, provide a verifiable registration number (UEN for Singapore, SSM/ROC for Malaysia), and the billing currency is locked at first checkout and cannot be changed.

This feature brings the same country-pricing lockdown to Groot Finance.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - New Business Onboarding with Country Declaration (Priority: P1)

A new business owner signs up for Groot Finance and goes through onboarding. Before they can select a plan or start a trial, they must declare their business country (Singapore or Malaysia) and provide their official business registration number. The system validates the registration number format matches the declared country. Once validated, the business is permanently associated with that country and its corresponding billing currency.

**Why this priority**: This is the core lockdown mechanism. Without it, the currency switching loophole remains open. Every new business must go through this step to ensure pricing integrity from day one.

**Independent Test**: Can be fully tested by creating a new account, completing the country declaration step with a valid registration number, and verifying the business record stores the correct country and that the pricing page shows only the locked currency without a currency switcher.

**Acceptance Scenarios**:

1. **Given** a new user is signing up for Groot Finance, **When** they reach the onboarding flow, **Then** they must declare their business country (SG or MY) and provide a business registration number before proceeding to plan selection.
2. **Given** a user selects "Singapore" as their country, **When** they enter a valid Singapore UEN (e.g., `200012345X` or `T20SS0001A`), **Then** the system accepts the registration number and locks the business to Singapore/SGD.
3. **Given** a user selects "Malaysia" as their country, **When** they enter a valid Malaysia SSM/ROC number (e.g., `1234567-H` or `202301234567`), **Then** the system accepts the registration number and locks the business to Malaysia/MYR.
4. **Given** a user selects "Singapore" as their country, **When** they enter a Malaysia-format SSM number, **Then** the system rejects the input with a clear error message indicating the expected format.
5. **Given** a registration number that is already associated with another business account, **When** a new user tries to use the same number, **Then** the system rejects it to prevent duplicate accounts.

---

### User Story 2 - Locked Pricing Display (Priority: P1)

After a business has been locked to a country, the pricing page shows plans exclusively in that country's currency. The currency dropdown/switcher is removed. The user sees prices only in their locked currency (SGD for Singapore, MYR for Malaysia) with no ability to switch.

**Why this priority**: This is the visible manifestation of the lockdown. Users must see only their country's pricing — showing both currencies defeats the purpose of the lockdown.

**Independent Test**: Can be tested by logging in as a business locked to Singapore, navigating to the pricing page, and verifying that only SGD prices are shown with no currency selector visible.

**Acceptance Scenarios**:

1. **Given** a business locked to Singapore (SGD), **When** the owner visits the pricing page, **Then** all plan prices are displayed in SGD with no currency selector/dropdown visible.
2. **Given** a business locked to Malaysia (MYR), **When** the owner visits the pricing page, **Then** all plan prices are displayed in MYR with no currency selector/dropdown visible.
3. **Given** a business locked to SGD, **When** they attempt to access the pricing page with a `?currency=MYR` query parameter, **Then** the system ignores the parameter and displays SGD pricing.
4. **Given** an unauthenticated visitor from Singapore (detected via geo-IP), **When** they visit the public pricing page, **Then** they see SGD pricing with no currency selector.
5. **Given** an unauthenticated visitor from Malaysia or any other country, **When** they visit the public pricing page, **Then** they see MYR pricing (default) with no currency selector.

---

### User Story 3 - Backend Checkout Currency Enforcement (Priority: P1)

When a user proceeds to checkout (whether for a new subscription, upgrade, or plan change), the system validates that the checkout currency matches the business's locked currency. Any mismatch is rejected. The currency lock is set permanently at the first successful checkout if not already set during onboarding.

**Why this priority**: Backend enforcement is the security backstop. Even if a user manipulates the frontend, the server must reject currency mismatches. This is critical for fraud prevention.

**Independent Test**: Can be tested by attempting a checkout API call with a mismatched currency and verifying it returns an error. Also testable by completing a legitimate checkout and verifying the currency lock is recorded.

**Acceptance Scenarios**:

1. **Given** a business locked to SGD, **When** the checkout process is initiated with an SGD price, **Then** the checkout proceeds normally.
2. **Given** a business locked to SGD, **When** a checkout is attempted with an MYR price (e.g., via API manipulation), **Then** the system rejects the request with a clear error: "This account is configured for SGD billing."
3. **Given** a business that has declared its country but has not yet completed a checkout, **When** they complete their first checkout, **Then** the system permanently records the billing currency matching their declared country.
4. **Given** a currency mismatch attempt, **When** the system rejects it, **Then** the attempt is logged for audit and fraud monitoring purposes.

---

### User Story 4 - Existing Subscriber Migration (Priority: P2)

All existing Groot Finance businesses with active subscriptions are automatically migrated to have a locked billing currency based on their current subscription. Existing subscribers continue to use the system without disruption. Their currency is locked based on their current subscription's currency.

**Why this priority**: Migration ensures the lockdown applies retroactively to all accounts, not just new signups. Without it, existing users could still exploit the currency switching loophole.

**Independent Test**: Can be tested by running the migration on a staging environment and verifying that all existing businesses with active subscriptions have a `subscribedCurrency` value set, and that the pricing page shows the correct locked currency for each.

**Acceptance Scenarios**:

1. **Given** an existing business with an active MYR subscription, **When** the migration runs, **Then** the business is auto-locked to MYR (no registration number required) and sees only MYR pricing going forward.
2. **Given** an existing business with an active SGD subscription, **When** the migration runs, **Then** the business is auto-locked to SGD (no registration number required).
3. **Given** an existing business on a free trial (no payment yet) with a `countryCode` set, **When** the migration runs, **Then** the business is auto-locked based on their `countryCode`/`homeCurrency` field value (no registration number required).
4. **Given** an existing business with no subscription and no `countryCode`, **When** the migration runs, **Then** the business is left unlocked and will be prompted for the full declaration (country + registration number) when they next visit a billing page.

---

### User Story 5 - Operator Manual Country Assignment (Priority: P3)

Groot operators can manually set or correct a business's country and billing currency for special cases (e.g., bank transfer customers, support corrections, businesses that made an error during registration).

**Why this priority**: Edge cases and support scenarios require manual intervention. This is a lower priority because it affects a small number of accounts and can be handled via direct database edits initially.

**Independent Test**: Can be tested by an operator updating a business's country/currency and verifying the pricing page reflects the change for that business.

**Acceptance Scenarios**:

1. **Given** a business that registered with the wrong country, **When** an operator updates the country and currency fields, **Then** the business sees pricing in the corrected currency.
2. **Given** a bank transfer customer with no Stripe subscription, **When** an operator sets their country and currency, **Then** the business's pricing page reflects the operator-assigned currency.

---

### Edge Cases

- What happens when a business owner enters a registration number with extra spaces or lowercase letters? The system should normalize (trim, uppercase) before validation.
- What happens when a user tries to create a second business account with the same registration number? The system rejects it with a clear error about the number already being in use.
- What happens when an existing subscriber's `homeCurrency` doesn't match their Stripe subscription currency? The Stripe subscription currency takes precedence during migration.
- What happens when a business has team members (non-owners) who view the pricing page? They see the same locked-currency pricing as the owner — currency lock applies to the business, not individual users.
- What happens if a business was created before this feature and has neither `countryCode` nor `homeCurrency`? The system prompts them to complete the country declaration step before they can access billing or checkout.
- What happens when a user owns multiple businesses in different countries (e.g., one in SG, one in MY)? Each business has its own independent currency lock. When the user switches between businesses, the pricing page reflects the active business's locked currency.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST require all new businesses to declare their country (Singapore or Malaysia) and provide a valid business registration number during onboarding, before plan selection or trial activation.
- **FR-002**: System MUST validate business registration numbers against country-specific formats: Singapore UEN format (e.g., `200012345X`, `T20SS0001A`) for SG, and Malaysia SSM/ROC format (e.g., `1234567-H`, `202301234567`) for MY.
- **FR-003**: System MUST enforce uniqueness of business registration numbers — no two business accounts may use the same registration number.
- **FR-004**: System MUST permanently associate a billing currency (SGD for Singapore, MYR for Malaysia) with each business based on their declared country. This association is immutable after the first subscription checkout.
- **FR-005**: System MUST remove the currency selector/dropdown from the pricing page entirely. For authenticated businesses, display plans in their locked currency. For unauthenticated visitors, display plans in the geo-IP-detected currency (SGD for Singapore, MYR for all others as default) with no manual switching.
- **FR-006**: System MUST reject any checkout attempt where the requested price currency does not match the business's locked billing currency, returning a clear error message.
- **FR-007**: System MUST log all currency mismatch checkout attempts for fraud monitoring and audit purposes.
- **FR-008**: System MUST migrate all existing businesses with active subscriptions to have a locked billing currency based on their current subscription's currency.
- **FR-009**: System MUST normalize business registration numbers (trim whitespace, convert to uppercase) before validation and storage.
- **FR-010**: System MUST display country-appropriate pricing information — showing SGD prices for Singapore businesses and MYR prices for Malaysian businesses — across all surfaces (pricing page, billing settings, upgrade prompts, trial banners).
- **FR-011**: System MUST auto-lock existing businesses that already have a `countryCode` set, using that value to determine their billing currency — no registration number is required retroactively. Only businesses missing `countryCode` are prompted to complete the full declaration (country + registration number) when they navigate to billing-related pages. The prompt does not block general app usage.

### Key Entities

- **Business Profile (extended)**: Existing business record extended with `businessRegNumber` (unique, formatted registration number), `subscribedCurrency` (immutable after first checkout: 'SGD' or 'MYR'), and a link between `countryCode` and billing currency. The currency lock is per-business — a single user may own multiple businesses in different countries, each with its own independent lock.
- **Registration Number Validation**: Country-specific validation rules — UEN patterns for Singapore, SSM/ROC patterns for Malaysia. Acts as the authoritative proof of business country.
- **Currency Lock State**: Tracks the lifecycle of currency assignment: NULL (new) → declared (country set, awaiting checkout) → locked (first checkout completed, immutable). Determines what the user sees on pricing pages and what the checkout API accepts.

## Clarifications

### Session 2026-02-25

- Q: Must existing businesses provide a registration number retroactively, or auto-lock from existing data? → A: Auto-lock from existing data. Existing businesses with `countryCode` already set are auto-locked without requiring a registration number. Only businesses missing `countryCode` are prompted for the full declaration (country + reg number) on billing page access.
- Q: What should unauthenticated visitors see on the public pricing page? → A: Geo-IP default, no switcher. Use geo-IP detection to auto-show the matching currency (SGD for SG visitors, MYR for others). No manual currency switching allowed. The lock is fully enforced after signup.
- Q: Can one user own businesses in different countries with different currency locks? → A: Yes, allow per-business. Each business has an independent country lock and registration number. The currency lock is a business-level attribute, not user-level.

## Assumptions

- **Two countries only (MVP)**: This feature supports Singapore (SGD) and Malaysia (MYR) only. Additional countries can be added later by extending the validation rules and currency mappings.
- **Format-only validation**: Business registration numbers are validated by format (regex), not by calling external government APIs (ACRA for SG, SSM for MY). External verification may be added in a future iteration.
- **Same features across countries**: All plan features (Starter, Pro, Enterprise) are identical across countries; only pricing differs. No country-specific feature gating.
- **Owner-only declaration**: Only the business owner (the user who created the business during onboarding) can declare the country and registration number. Team members cannot change it.
- **Existing `homeCurrency` and `countryCode` alignment**: The existing onboarding flow already collects `countryCode` and `homeCurrency`. This feature adds the registration number requirement and the immutable currency lock on top of those existing fields.
- **Operator tooling is manual for MVP**: Operators use direct database access (Convex dashboard) to correct country/currency assignments. A dedicated admin UI is out of scope for this feature.
- **Trial subscriptions respect the lock**: Free trial activation also respects the country lock — a Singapore business gets an SGD trial, a Malaysia business gets an MYR trial.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of new businesses complete country declaration with a validated registration number before accessing any paid plan or trial — no business can bypass this step.
- **SC-002**: 0% of active businesses can view or select plans in a currency different from their locked currency — the currency switcher is completely removed for locked businesses.
- **SC-003**: 100% of checkout attempts with mismatched currencies are rejected by the backend — no successful purchase in the wrong currency is possible.
- **SC-004**: All existing businesses with active subscriptions are migrated to have a locked currency within one deployment cycle, with zero disruption to their current service.
- **SC-005**: Currency mismatch attempts are logged and auditable, enabling the operations team to detect and investigate potential fraud patterns.
- **SC-006**: Business registration number uniqueness is enforced — no two businesses can register with the same number, preventing multi-account arbitrage.
