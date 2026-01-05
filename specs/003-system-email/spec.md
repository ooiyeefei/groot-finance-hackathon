# Feature Specification: Critical Transactional Emails

**Feature Branch**: `003-system-email`
**Created**: 2026-01-04
**Status**: Draft
**GitHub Issue**: [#81](https://github.com/grootdev-ai/finanseal-mvp/issues/81)
**Priority**: P0 - Launch Blocker

## Overview

FinanSEAL currently lacks critical transactional emails that users expect from a subscription-based SaaS product. This feature adds essential lifecycle emails including trial expiration warnings, payment failure notifications, and welcome messages to build customer trust, protect revenue, and reduce churn.

**Business Context**: Reddit MVP Checklist insight - "Send welcome, trial-ending, support, and failed payment emails" is critical for customer trust and retention.

## Clarifications

### Session 2026-01-04

- Q: For trial ending and payment failure emails, should the system delegate to Stripe's native email automation or build custom? → A: Option A - Stripe native for billing emails (trial ending 7-day reminder + payment failure/recovery); Custom implementation only for Welcome email and future drip sequences
- Q: Should Welcome email use Lambda Durable Functions (preparing for future drip sequences) or simpler single-trigger? → A: Option B - Lambda Durable Functions from day one; Welcome email as first step of durable workflow with infrastructure ready for Phase 2 multi-day sequences
- Q: What endpoint protection should secure Lambda Durable Functions invocation? → A: Option A - API Gateway with IAM authentication; Clerk webhook signs requests, API Gateway validates IAM signature before invoking Lambda
- Q: Should we consolidate email providers (current Resend for invitations vs new SES for workflows)? → A: Option B - Migrate everything to Amazon SES; consolidate invitations + welcome + future drips to SES, deprecate Resend

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trial Ending Reminder (Priority: P1) *(Stripe-Delegated)*

As a business owner approaching the end of my trial period, I need to receive a reminder email so that I can decide whether to upgrade before losing access to my financial data and workflows.

**Implementation**: Delegated to Stripe's native trial reminder emails (sent 7 days before expiration). Stripe handles delivery, timing, and Customer Portal integration.

**Why this priority**: Direct revenue impact - without this notification, users may forget about their trial and churn silently. Trial conversion is a key business metric.

**Independent Test**: Verify Stripe Dashboard trial reminder settings are enabled and Customer Portal link is configured. Create trial subscription and confirm Stripe sends reminder 7 days before expiration.

**Acceptance Scenarios**:

1. **Given** a business is on a trial subscription with 7 days remaining, **When** Stripe's trial reminder schedule triggers, **Then** the business owner receives Stripe's email with:
   - Clear notification that trial ends in 7 days
   - Stripe-branded content with FinanSEAL merchant branding
   - Direct link to Stripe Customer Portal for payment method entry
   - Information about upcoming subscription start

2. **Given** a business has already upgraded to a paid plan, **When** the trial end date passes, **Then** no trial ending email is sent.

3. **Given** a business owner has multiple businesses with trials ending, **When** trial periods approach expiration, **Then** they receive one email per business (not consolidated).

---

### User Story 2 - Failed Payment Notification (Priority: P1) *(Stripe-Delegated)*

As a paying customer whose payment method has failed, I need to be notified immediately so that I can update my payment information before my service is interrupted.

**Implementation**: Delegated to Stripe's revenue recovery with Smart Retries and customer emails. Stripe handles failure detection, retry logic, customer notifications, and payment recovery confirmation.

**Why this priority**: Direct revenue recovery - failed payments without notification lead to involuntary churn. Industry data shows timely payment failure emails recover 30-50% of failed payments.

**Independent Test**: Verify Stripe Dashboard revenue recovery settings are enabled. Trigger test payment failure and confirm Stripe sends notification with Customer Portal link.

**Acceptance Scenarios**:

1. **Given** a subscription payment attempt fails, **When** Stripe detects the failure, **Then** Stripe sends the business owner an email with:
   - Clear notification that payment failed
   - Reason for failure (expired card, insufficient funds, etc.)
   - Direct link to Stripe Customer Portal to update payment method
   - Information about Stripe's retry schedule

2. **Given** a payment fails multiple times, **When** Stripe's Smart Retries attempt recovery, **Then** Stripe sends escalating urgency emails per configured schedule.

3. **Given** a failed payment is successfully recovered, **When** payment succeeds (via retry or manual update), **Then** Stripe sends a payment confirmation email.

---

### User Story 3 - Welcome Email (Priority: P2) *(Custom - Lambda Durable Functions)*

As a new user who just signed up for FinanSEAL, I want to receive a welcome email so that I know my account was created successfully and I have guidance on getting started.

**Implementation**: AWS Lambda Durable Functions workflow triggered by Clerk user creation webhook. Welcome email is the first step of a durable workflow that will extend to multi-day onboarding sequences in Phase 2.

**Why this priority**: User engagement and trust building. Welcome emails set expectations and reduce support requests. Lower priority than revenue-related emails but important for user experience.

**Independent Test**: Create new user account, verify Lambda Durable Function execution starts, and confirm welcome email arrives within 5 minutes. Verify workflow state is tracked in CloudWatch/EventBridge.

**Acceptance Scenarios**:

1. **Given** a user completes account registration, **When** their account is successfully created, **Then** they receive a welcome email with:
   - Confirmation that their account is ready
   - Brief introduction to key features
   - Link to getting started guide or first action
   - Support contact information

2. **Given** a user is invited to an existing business, **When** they accept the invitation and create their account, **Then** they receive a welcome email tailored to joining an existing team (not generic signup).

3. **Given** a user signs up but email delivery fails, **When** they log in, **Then** they can still access their account (email is not a blocker).

---

### User Story 4 - Email Preference Management (Priority: P3)

As a user receiving marketing or non-essential emails from FinanSEAL, I need to be able to unsubscribe or manage my email preferences so that I only receive communications I want.

**Why this priority**: Compliance (CAN-SPAM, GDPR) and user experience. Required for marketing emails but transactional emails (payment, security) must always be delivered.

**Independent Test**: Can be fully tested by clicking unsubscribe link and verifying marketing emails stop while transactional emails continue.

**Acceptance Scenarios**:

1. **Given** a user receives a marketing email, **When** they click the unsubscribe link, **Then** they can opt out of marketing communications with one click.

2. **Given** a user has unsubscribed from marketing emails, **When** a payment failure occurs, **Then** they still receive the payment failure notification (transactional).

3. **Given** a user wants granular control, **When** they access email preferences, **Then** they can separately control: onboarding tips, product updates, and promotional content.

---

### Edge Cases

- What happens when a user's email address is invalid or bounces?
  - System should track bounce status and prevent repeated send attempts
  - Admin dashboard should flag accounts with delivery issues

- What happens when multiple payment failures occur in quick succession?
  - Rate limit to prevent email flooding (max 1 email per type per 24 hours)

- What happens when a trial ends but the user hasn't logged in during the trial?
  - Still send trial ending email (they may have forgotten about the service)

- What happens when a user changes their email address?
  - Future emails go to new address
  - No re-send of historical emails

## Requirements *(mandatory)*

### Functional Requirements

**Trial Ending Emails** *(Delegated to Stripe)*
- **FR-001**: System MUST enable Stripe's native trial reminder emails (7 days before expiration)
- **FR-002**: System MUST configure Stripe Customer Portal link in trial reminder emails
- **FR-003**: Stripe automatically suppresses trial reminders for already-upgraded customers

**Failed Payment Emails** *(Delegated to Stripe)*
- **FR-004**: System MUST enable Stripe's Smart Retries and customer email notifications
- **FR-005**: Stripe automatically includes failure reason and Customer Portal link for payment updates
- **FR-006**: Stripe automatically sends payment success confirmation when recovered
- **FR-007**: Stripe's revenue recovery handles email cadence and retry limits

**Welcome Emails** *(Custom - Lambda Durable Functions)*
- **FR-008**: System MUST send welcome email within 5 minutes of successful account creation via Lambda Durable Functions workflow
- **FR-009**: System MUST differentiate welcome content for new signups vs. invited team members
- **FR-010**: System MUST NOT block account access if welcome email fails to send
- **FR-010a**: Lambda Durable Function workflow MUST checkpoint after welcome email send for future extension to multi-day sequences

**Workflow Infrastructure**
- **FR-019**: System MUST use AWS Lambda Durable Functions for custom email workflows (welcome, future onboarding sequences)
- **FR-020**: System MUST track workflow execution state via CloudWatch metrics and EventBridge status events
- **FR-021**: System MUST enable monitoring dashboard showing customer lifecycle stage (workflow progress)

**Security & Access Control**
- **FR-022**: Lambda Durable Functions MUST NOT be publicly accessible via direct Lambda URL
- **FR-023**: Clerk webhooks MUST be verified using Svix HMAC-SHA256 signatures via `@clerk/nextjs/webhooks`
- **FR-024**: Next.js webhook route MUST invoke Lambda via AWS SDK with IAM credentials (not direct API Gateway)
- **FR-025**: Lambda invocation IAM policy MUST scope to only the welcome workflow function
- **FR-026**: System MUST use CDK to provision Lambda with least-privilege IAM roles

**Email Service (Amazon SES)**
- **FR-027**: System MUST use Amazon SES as the sole email service provider for all transactional emails
- **FR-028**: System MUST migrate existing invitation emails from Resend to Amazon SES
- **FR-029**: System MUST configure SES domain verification, DKIM, and SPF via CDK
- **FR-030**: System MUST track email delivery via SES SNS notifications (bounces, complaints, deliveries)
- **FR-031**: System MUST deprecate and remove Resend dependency after migration validation

**Email Delivery & Compliance**
- **FR-011**: System MUST include unsubscribe link in all marketing/promotional emails
- **FR-012**: System MUST honor unsubscribe requests within 24 hours
- **FR-013**: System MUST always deliver transactional emails (payment, security) regardless of unsubscribe status
- **FR-014**: System MUST track email delivery status (sent, delivered, bounced, opened)
- **FR-015**: All emails MUST be mobile-responsive and render correctly on major email clients
- **FR-016**: All emails MUST include both HTML and plain text versions

**Branding & Content**
- **FR-017**: All emails MUST use consistent FinanSEAL branding (logo, colors, typography)
- **FR-018**: All emails MUST include clear sender identification and physical address (CAN-SPAM compliance)

### Key Entities

- **Email Preference**: User's communication preferences (marketing opt-in/out, transactional always on)
- **Email Log**: Record of emails sent with delivery status, timestamps, and recipient
- **Email Template**: Reusable email content templates for each email type
- **Workflow Execution**: Lambda Durable Function execution state tracking customer lifecycle stage (started, welcome_sent, onboarding_day1, etc.)
- **Workflow Checkpoint**: Durable execution checkpoint data for resume/replay capability

## Success Criteria *(mandatory)*

### Measurable Outcomes

**Revenue Protection**
- **SC-001**: 95% of trial ending emails delivered successfully to inbox (not spam)
- **SC-002**: Trial-to-paid conversion rate improves by at least 10% after implementation
- **SC-003**: 50% of failed payment emails result in payment update within 48 hours

**User Engagement**
- **SC-004**: 80% of welcome emails delivered within 5 minutes of signup
- **SC-005**: Welcome email open rate above 60% (industry benchmark)
- **SC-006**: Reduce "I never received confirmation" support tickets by 50%

**Compliance & Operations**
- **SC-007**: 100% of unsubscribe requests processed within 24 hours
- **SC-008**: Zero CAN-SPAM/GDPR complaints related to email communications
- **SC-009**: All emails render correctly on top 5 email clients (Gmail, Outlook, Apple Mail, Yahoo, mobile)

**Reliability**
- **SC-010**: Email delivery success rate above 98%
- **SC-011**: Zero missed trial ending or payment failure emails due to system errors

## Assumptions

- Users have provided valid email addresses during registration
- Stripe is the payment processor and provides built-in email automation for billing events
- Stripe Customer Portal is configured for self-service payment updates
- Stripe Dashboard email settings are enabled for trial reminders and payment recovery
- Authentication system (Clerk) provides user creation event notifications via webhooks
- Clerk webhooks use Svix HMAC-SHA256 signatures (verified via `@clerk/nextjs/webhooks`)
- Subscription system provides trial expiration date information
- Amazon SES is available and domain verification is achievable (notifications.hellogroot.com or similar)
- Amazon SES has capacity for expected volume with proper warmup plan
- Mobile email rendering uses standard responsive email practices
- AWS CDK is available for infrastructure provisioning (API Gateway, Lambda, IAM, SES)
- AWS account has permissions to create Lambda Durable Functions (Node.js 22.x runtime)
- Existing Resend email templates can be migrated to SES-compatible HTML templates

## Out of Scope (for this feature)

- Onboarding drip sequence (Day 1, 3, 7 tips) - defer to Phase 2
- Monthly usage summary emails - defer to Phase 2
- First receipt processed celebration email - defer to Phase 2
- Email A/B testing framework
- Custom email domain configuration (using existing notification domain)
- SMS notifications
