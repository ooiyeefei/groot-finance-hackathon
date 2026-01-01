# Feature Specification: Onboarding & Plan Selection Flow

**Feature Branch**: `001-onboarding-plan-selection`
**Created**: 2025-12-29
**Status**: Draft
**Input**: GitHub Issue #73 - Build self-service onboarding with plan selection for Southeast Asian SMEs

## Overview

This feature enables frictionless self-service user onboarding with plan selection. Users sign up, choose between paid plans or a 14-day free trial, complete a streamlined business setup, and reach the dashboard. This is a P0 launch blocker required for the self-serve business model.

**Business Model**: Paid plans only (Starter/Pro/Enterprise) with 14-day free trial option. No freemium tier. Pricing managed in Stripe.

**Plan Tiers** (pricing from Stripe):
- **Trial**: 14 days, no credit card required, 3 users
- **Starter**: 3 users
- **Pro**: 13 users + usage credits
- **Enterprise**: Unlimited users, contact sales

**User Journey**:
```
Landing → Sign Up → Choose Plan → [If Paid Plan: Payment] → Setup Business → Dashboard
                         ↓
              [If Free Trial: Skip Payment] → Setup Business → Dashboard
```

## Clarifications

### Session 2025-12-29
- Q: What are the team member limits per subscription tier? → A: Starter: 3 users, Pro: 13 users, Enterprise: Unlimited. Trial users get Starter-level limits (3 users).
- Q: Business model clarification → A: No free tier. Paid plans (Starter/Pro/Enterprise) with 14-day free trial. Trial requires NO credit card upfront.
- Q: Pricing structure → A: Pricing managed in Stripe. Tiers: Starter (3 users), Pro (13 users + credits), Enterprise (unlimited, contact sales).
- Q: Trial behavior → A: No credit card required during trial. User gets Pro-level feature access for 14 days. Only prompt for plan selection when trial expires.
- Q: Current state migration → A: Current system has free plan with 10 credits (code-side). Need to update: (1) code logic for credit tracking, (2) database tables, (3) Stripe products to match new tiers.
- Q: Onboarding flow structure → A: Frictionless with all questions optional. Questions: (1) Business name, (2) Business type, (3) Business country (infer currency), (4) Custom COGS categories, (5) Custom expense categories. All skippable with smart defaults.
- Q: Category input UX → A: Tag-style input. User types category name, presses Enter, shows as removable tag. Can continue adding.
- Q: AI category generation → A: When users add custom categories, AI auto-generates full category objects (description, category_code, ai_keywords, vendor_patterns) based on category name and business type. Keep ai_keywords and vendor_patterns in schema - they're used for pre-AI pattern matching.
- Q: Post-setup experience → A: Show "Setting up your business" loading screen with dynamic messaging while AI populates database with proper JSONB schema structure.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - New User Signup and Plan Selection (Priority: P1)

A prospective user visits the FinanSEAL website and wants to start using the financial co-pilot. They create an account and choose between paid plans or starting a 14-day free trial.

**Why this priority**: This is the core conversion funnel. Without signup and plan selection, no users can access the platform. This directly impacts revenue generation and user acquisition.

**Independent Test**: Can be fully tested by completing the signup flow with plan selection and verifying the user account is created with the correct plan/trial status assigned.

**Acceptance Scenarios**:

1. **Given** a visitor on the landing page, **When** they click "Sign Up" or "Start Free Trial", **Then** they are taken to the account creation page
2. **Given** a user creating an account, **When** they complete the signup form with valid email and password, **Then** their account is created and they proceed to plan selection
3. **Given** a user on the plan selection page, **When** they view the options, **Then** they see paid plans (Starter, Pro, Enterprise) with pricing from Stripe AND a prominent "Start 14-Day Free Trial" option
4. **Given** a user viewing plans, **When** they select a paid plan (Starter, Pro, or Enterprise), **Then** they are directed to the payment collection step (or contact form for Enterprise)
5. **Given** a user viewing plans, **When** they select "Start Free Trial", **Then** they skip payment and proceed directly to business setup

---

### User Story 2 - Paid Plan Signup with Payment (Priority: P1)

A user who wants to commit immediately selects a paid plan and enters payment information to activate their subscription.

**Why this priority**: Direct paid conversions are the primary revenue source. Payment flow must be seamless.

**Independent Test**: Can be fully tested by selecting a paid plan, entering payment, and verifying subscription is active with no trial period.

**Acceptance Scenarios**:

1. **Given** a user who selected a paid plan, **When** they reach the payment step, **Then** they see the selected plan details and total amount to be charged
2. **Given** a user entering payment details, **When** they submit valid card information, **Then** the payment is processed and subscription activates immediately
3. **Given** a user completing paid signup, **When** payment succeeds, **Then** they proceed to business setup with full plan access
4. **Given** a user with payment failure, **When** card is declined, **Then** they see a friendly error with option to try a different payment method

---

### User Story 3 - Free Trial Signup (Priority: P1)

A user wants to try FinanSEAL before committing financially. They start a 14-day free trial with full Pro-level feature access—no credit card required upfront.

**Why this priority**: Trial signups are critical for conversion. Removing credit card friction maximizes trial starts. Users only see payment when trial expires.

**Independent Test**: Can be fully tested by selecting free trial, verifying NO credit card is requested, and confirming trial period is active with Pro-level feature access.

**Acceptance Scenarios**:

1. **Given** a user who selected "Start Free Trial", **When** they proceed, **Then** they are NOT asked for credit card and go directly to business setup
2. **Given** a user on free trial, **When** they complete onboarding, **Then** they have full Pro-level feature access for 14 days (team limit: 3 users like Starter)
3. **Given** a user on trial, **When** they view their account, **Then** they can see remaining trial days and option to upgrade early
4. **Given** a user whose trial is expiring, **When** 3 days remain, **Then** they receive notification about trial ending
5. **Given** a user whose trial has expired, **When** they try to access the platform, **Then** they see plan selection prompt to choose Starter/Pro/Enterprise to continue

---

### User Story 4 - Frictionless Business Setup (Priority: P1)

A new user who has selected their plan/trial completes a streamlined business setup wizard. All questions are optional with smart defaults, making it possible to reach the dashboard in under 60 seconds.

**Why this priority**: Business profile data enables core platform functionality. However, friction kills conversion, so all fields must be optional with sensible defaults.

**Independent Test**: Can be fully tested by skipping all questions and verifying defaults are applied correctly, OR by completing all questions and verifying custom values are saved.

**Acceptance Scenarios**:

1. **Given** a user entering business setup, **When** the wizard loads, **Then** they see a clean, minimal interface with progress indication showing 5 optional steps
2. **Given** a user on any setup question, **When** they want to skip, **Then** they can click "Skip" or "Use Default" to proceed with smart defaults
3. **Given** a user entering business name (Q1), **When** they type and submit, **Then** the name is saved; if skipped, default is "[User's Name]'s Business"
4. **Given** a user selecting business type (Q2), **When** they choose from options (F&B, CPG/Retail, Services, etc.), **Then** the type is saved and influences default categories; if skipped, default is "General Business"
5. **Given** a user selecting business country (Q3), **When** they select a country, **Then** home currency is automatically inferred; if skipped, default is based on IP geolocation
6. **Given** a user on custom COGS categories (Q4), **When** they type a category name and press Enter, **Then** it appears as a tag that can be removed; if skipped, platform defaults are used
7. **Given** a user on custom expense categories (Q5), **When** they add tags, **Then** categories are saved; if skipped, platform defaults are used
8. **Given** a user who completes setup, **When** they submit, **Then** they see "Setting up your business..." with dynamic loading messages

---

### User Story 5 - AI-Powered Business Initialization (Priority: P1)

After the user completes the setup wizard, the system uses AI to initialize their business with properly structured data including smart defaults and AI-enhanced custom categories.

**Why this priority**: This "magical" setup experience differentiates FinanSEAL and ensures data is properly structured for downstream features (OCR categorization, expense matching).

**Independent Test**: Can be fully tested by completing setup with custom categories and verifying the database contains properly structured JSONB objects with AI-generated metadata.

**Acceptance Scenarios**:

1. **Given** a user who submitted the setup wizard, **When** initialization begins, **Then** they see an engaging loading screen with progress messages like "Creating your workspace...", "Configuring categories...", "Almost ready..."
2. **Given** a user who skipped custom categories, **When** initialization completes, **Then** the business has platform default COGS and expense categories populated
3. **Given** a user who added custom category names (e.g., "Ingredients", "Packaging"), **When** AI processes them, **Then** each category gets AI-generated description, category_code, ai_keywords, and vendor_patterns based on category name AND business type
4. **Given** AI-generated categories, **When** stored in database, **Then** they follow the exact JSONB schema structure including id, is_active, sort_order, created_at, etc.
5. **Given** initialization completes, **When** user is redirected to dashboard, **Then** all business settings are immediately active and usable

---

### User Story 6 - First-Time User Guidance (Priority: P2)

A new user who reaches the dashboard for the first time sees optional orientation to understand key features.

**Why this priority**: While users can technically use the platform without guidance, onboarding guidance improves activation rates. Lower priority than core signup/setup flow.

**Independent Test**: Can be fully tested by completing onboarding as a new user and verifying guidance is shown and can be dismissed.

**Acceptance Scenarios**:

1. **Given** a new user reaching the dashboard for the first time, **When** the dashboard loads, **Then** they see an optional onboarding tooltip or checklist highlighting key features
2. **Given** a user viewing the guidance, **When** they want to skip it, **Then** they can dismiss it with one click
3. **Given** a user who dismissed the guidance, **When** they want to revisit later, **Then** they can restart from account settings

---

### User Story 7 - Team Invitation Flow (Priority: P2)

A business owner who has set up their account invites team members to collaborate on the platform.

**Why this priority**: Team collaboration is important but not required for initial single-user functionality. Users can invite team members after they've started using the platform.

**Independent Test**: Can be fully tested by sending an invitation, accepting it as the invitee, and verifying both users can access the shared business.

**Acceptance Scenarios**:

1. **Given** a user who has completed onboarding, **When** they access team settings, **Then** they can invite team members via email
2. **Given** a business owner inviting a team member, **When** they enter a valid email address, **Then** an invitation email is sent
3. **Given** an invitee who received an invitation, **When** they click the invitation link, **Then** they can accept and join the business
4. **Given** a user on Starter plan, **When** they have 3 team members, **Then** they cannot invite more without upgrading to Pro
5. **Given** a user on Pro plan, **When** they have 13 team members, **Then** they cannot invite more without upgrading to Enterprise
6. **Given** a user on Enterprise plan, **When** they invite team members, **Then** there is no limit on team size

---

### Edge Cases

- **What happens when a user enters an already-registered email during signup?** System displays clear error message and offers password reset option
- **What happens if payment card is declined?** User sees friendly error message with option to try different payment method
- **What happens if user abandons signup mid-flow?** Progress is saved where possible; user can resume on next login
- **What happens if user's trial expires without adding payment?** Account access is suspended; user sees prompt to upgrade to continue
- **What happens if user tries to invite more team members than their plan allows?** System shows upgrade prompt with plan comparison
- **What happens if AI category generation fails?** Fall back to basic category structure with just the user's input as category_name; log error for monitoring
- **What happens if geolocation fails for country inference?** Default to Singapore (SGD) as primary SEA market
- **What happens if user refreshes during "Setting up your business" loading?** Initialization continues in background; on refresh, check status and resume or complete

## Requirements *(mandatory)*

### Functional Requirements

**Plan Selection**
- **FR-001**: System MUST display plan selection with two paths: (1) Paid plans (Starter/Pro/Enterprise) with pricing, (2) "Start 14-Day Free Trial" option
- **FR-002**: System MUST clearly differentiate paid plans with feature comparison table
- **FR-003**: System MUST display pricing from Stripe (currency configured in Stripe)
- **FR-004**: System MUST route paid plan selection to payment step, trial selection directly to business setup

**Payment (Paid Plans Only)**
- **FR-005**: System MUST collect payment via Stripe Elements for users selecting paid plans
- **FR-006**: System MUST activate subscription immediately upon successful payment
- **FR-007**: System MUST handle payment failures gracefully with retry option

**Free Trial (No Credit Card Required)**
- **FR-008**: System MUST offer 14-day free trial with Pro-level feature access and NO credit card required
- **FR-009**: System MUST track trial start date and expiration
- **FR-010**: System MUST notify users when trial is expiring (3 days before)
- **FR-011**: System MUST prompt plan selection (Starter/Pro/Enterprise) when trial expires—user cannot continue without selecting a plan

**Business Setup (Frictionless)**
- **FR-012**: System MUST present 5 optional setup questions in sequence with skip option for each
- **FR-013**: System MUST support business name input with default fallback to "[User]'s Business"
- **FR-014**: System MUST support business type selection (F&B, CPG/Retail, Services, Manufacturing, Professional Services, Other) with default "General Business"
- **FR-015**: System MUST support country selection with automatic currency inference
- **FR-016**: System MUST support tag-style input for custom COGS categories (type → Enter → tag appears)
- **FR-017**: System MUST support tag-style input for custom expense categories
- **FR-018**: System MUST apply platform default categories when user skips Q4/Q5
- **FR-019**: System MUST allow completing entire setup in under 60 seconds by skipping all questions

**AI-Powered Initialization**
- **FR-020**: System MUST show engaging loading screen during business initialization with progress messages
- **FR-021**: System MUST use AI to generate full category objects from user-provided category names
- **FR-022**: AI-generated categories MUST include: description, category_code, category_name, ai_keywords, vendor_patterns, and all required JSONB fields
- **FR-023**: AI category generation MUST consider business type for contextual keyword/pattern generation
- **FR-024**: System MUST store categories in proper JSONB format matching existing schema
- **FR-025**: System MUST handle AI generation failures gracefully with fallback to minimal structure

**Team Management**
- **FR-026**: System MUST allow business owners to invite team members via email
- **FR-027**: System MUST enforce team size limits: Trial/Starter = 3 users, Pro = 13 users, Enterprise = Unlimited
- **FR-028**: System MUST send invitation emails with secure, time-limited links

**General**
- **FR-029**: System MUST validate all user inputs with appropriate error messaging
- **FR-030**: System MUST provide mobile-responsive onboarding experience
- **FR-031**: System MUST allow users to modify all setup choices from dashboard settings after onboarding

### Key Entities

- **User Account**: Authenticated user with email, profile, and business association
- **Business**: SME business with name, type, country, home currency, subscription, and custom categories
- **Subscription**: Plan tier (trial/starter/pro/enterprise), status (trial/active/suspended/expired), trial_end_date, billing info, usage credits (for Pro)
- **Custom COGS Categories**: JSONB array with structure: id, category_name, category_code, description, cost_type, ai_keywords, vendor_patterns, is_active, sort_order, created_at, updated_at, gl_account
- **Custom Expense Categories**: JSONB array with structure: id, category_name, category_code, description, ai_keywords, vendor_patterns, is_active, sort_order, tax_treatment, requires_receipt, receipt_threshold, requires_manager_approval, policy_limit
- **Team Member**: User's relationship to business with role (owner/member)
- **Invitation**: Pending team invitation with recipient email, sender, expiration, status

### Business Type Options

| Value | Display Name | Category Context |
|-------|-------------|------------------|
| `fnb` | Food & Beverage | Ingredients, kitchen equipment, food packaging |
| `cpg_retail` | CPG / Retail | Inventory, packaging, store supplies |
| `services` | Services Company | Professional fees, contractors, software |
| `manufacturing` | Manufacturing | Raw materials, machinery, production labor |
| `professional` | Professional Services | Consulting, legal, accounting tools |
| `other` | General Business | Standard expense/COGS categories |

### Country to Currency Mapping

| Country | Currency | Country | Currency |
|---------|----------|---------|----------|
| Singapore | SGD | Malaysia | MYR |
| Thailand | THB | Indonesia | IDR |
| Vietnam | VND | Philippines | PHP |
| USA | USD | Others | USD (default) |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete the entire onboarding flow (signup to dashboard) in under 3 minutes
- **SC-002**: Users who skip all optional questions reach dashboard in under 60 seconds
- **SC-003**: 80% of users who start signup complete through to dashboard access
- **SC-004**: Trial-to-paid conversion rate meets or exceeds 15% industry benchmark
- **SC-005**: Less than 5% of users contact support for onboarding-related issues
- **SC-006**: 90% of users successfully select a plan on first attempt
- **SC-007**: AI category generation succeeds for 95% of custom category inputs
- **SC-008**: Business initialization completes in under 10 seconds for 95% of users

## Migration Requirements

**Current State** (to be deprecated):
- Free plan with 10 credits (handled in code)
- Stripe products: Pro and Enterprise only

**Target State**:
- No free plan—14-day trial (no credit card) + paid plans only
- New plan tiers: Trial, Starter, Pro, Enterprise (pricing in Stripe)

**Required Changes**:
- **MR-001**: Create/update Stripe products for Starter tier
- **MR-002**: Update Stripe products for Pro tier with credits
- **MR-003**: Remove free plan logic from codebase (credit allocation for free users)
- **MR-004**: Update database schema for subscription status to include 'trial' and 'expired' states
- **MR-005**: Update credit usage tracking to work with new plan tiers
- **MR-006**: Add trial_start_date and trial_end_date fields to subscription tracking
- **MR-007**: Implement trial expiration check and plan selection prompt logic

## Assumptions

- The existing Stripe integration (from issue #80) provides the payment processing foundation
- Clerk authentication is already configured and will handle account creation
- AI model (Gemini/GPT) is available for category generation via existing infrastructure
- Default COGS and expense categories exist in codebase at `src/domains/invoices/lib/default-cogs-categories.ts` and `src/domains/expense-claims/lib/default-expense-categories.ts`
- Existing JSONB schema for categories is stable and should be preserved
- IP-based geolocation service is available for country inference fallback
- Current free plan users will need a migration strategy (out of scope for this feature—separate task)

## Dependencies

- **Stripe Subscription Integration** (Issue #80 - completed): Payment collection and subscription management
- **Clerk Authentication**: User account creation and session management
- **Existing Category Schema**: JSONB structure for custom_cogs_categories and custom_expense_categories
- **AI Model Access**: Gemini or similar for category metadata generation

## Out of Scope

- Freemium tier (paid-only with trial model—this is intentional)
- Annual billing options (monthly only for MVP)
- Advanced team permission granularity (owner/member roles only)
- Enterprise custom pricing negotiation flows (Enterprise shows "Contact Sales")
- A/B testing of onboarding flows (future optimization)
- SSO/SAML enterprise authentication options
- Onboarding wizard re-run (can edit settings individually post-setup)
- Migration path for existing free plan users (separate task)
