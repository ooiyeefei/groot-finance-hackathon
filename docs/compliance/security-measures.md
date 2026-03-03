# Security Measures — Groot Finance

**Last Updated**: 2026-03-03
**Version**: 1.0
**Status**: Active
**Purpose**: Comprehensive inventory of all security controls implemented in the Groot Finance platform, organized by domain. Used for PDPA compliance audits and as an internal reference for answering customer security questionnaires.

> **Internal Document** — This document is for internal use only. It is never shared directly with external parties. The sales team uses it to extract answers into customer security questionnaire forms.

---

## Executive Summary

Groot Finance is a financial co-pilot for Southeast Asian SMEs that handles sensitive business financial data including expense claims, invoices, accounting records, and payment processing. The platform implements defense-in-depth security across authentication, authorization, encryption, infrastructure, audit logging, code hardening, data protection, and payment handling. All authentication is managed by Clerk (SOC 2 Type II certified), all payment processing by Stripe (PCI DSS Level 1), and all infrastructure runs on AWS with IAM least-privilege policies. No credit card data, passwords, or long-lived credentials are stored in the application. The platform enforces multi-tenant data isolation at the database level, maintains a comprehensive audit trail, and scrubs personally identifiable information from error tracking before transmission.

---

## Table of Contents

- [Third-Party Provider Summary](#third-party-provider-summary)
- [1. Authentication & Identity](#1-authentication--identity)
- [2. Authorization & Access Control](#2-authorization--access-control)
- [3. Encryption & Secure Storage](#3-encryption--secure-storage)
- [4. Infrastructure Security](#4-infrastructure-security)
- [5. Audit & Monitoring](#5-audit--monitoring)
- [6. Code Security & Headers](#6-code-security--headers)
- [7. Data Protection & Privacy](#7-data-protection--privacy)
- [8. Payment Security](#8-payment-security)
- [Planned Controls](#planned-controls)
- [Version History](#version-history)
- [References](#references)

---

## Third-Party Provider Summary

Groot Finance relies on the following certified third-party providers for critical security functions. All providers maintain independently audited security certifications.

| Provider | Role | Certifications | Security Page |
|----------|------|----------------|---------------|
| **Clerk** | Authentication & Identity Management | SOC 2 Type II, CCPA | [clerk.com/security](https://clerk.com/security) |
| **Stripe** | Payment Processing | PCI DSS Level 1, SOC 1/2/3 Type II | [docs.stripe.com/security](https://docs.stripe.com/security) |
| **Sentry** | Error Tracking & Monitoring | SOC 2 Type II, ISO 27001, GDPR | [sentry.io/security](https://sentry.io/security/) |
| **Convex** | Real-Time Database | SOC 2 Type II, HIPAA, GDPR | [docs.convex.dev](https://docs.convex.dev) |
| **AWS** | Cloud Infrastructure (Lambda, S3, SSM, CloudFront) | SOC 2 Type II, ISO 9001, PCI-DSS, HIPAA, FedRAMP | [aws.amazon.com/compliance](https://aws.amazon.com/compliance/) |
| **Vercel** | Application Deployment & Hosting | SOC 2 Type 2, ISO 27001:2022, PCI DSS v4.0 | [vercel.com/security](https://vercel.com/security) |

---

## 1. Authentication & Identity

This domain covers how users prove their identity and how sessions are managed. All authentication is delegated to Clerk, a SOC 2 Type II certified identity provider.

#### Clerk JWT Validation

All requests to the Convex backend are authenticated using JSON Web Tokens (JWT) issued by Clerk. The Convex server validates each token against the Clerk issuer domain before processing any query or mutation. This ensures that only users who have successfully authenticated through Clerk can access backend data.

**Implementation**: `convex/auth.config.ts → AuthConfig`
**Provider**: Clerk (SOC 2 Type II) | [clerk.com/security](https://clerk.com/security)
**Status**: Implemented

#### Middleware Route Protection

Every incoming HTTP request passes through Clerk middleware that enforces authentication. Public routes (sign-in, sign-up, webhooks, health checks, pricing) are explicitly allowlisted. All other routes require a valid Clerk session — unauthenticated page requests redirect to sign-in, and unauthenticated API requests receive a 401 JSON response. The middleware also checks trial expiration status and redirects expired users to the plan selection page.

**Implementation**: `src/middleware.ts → clerkMiddleware`
**Provider**: Clerk (SOC 2 Type II) | [clerk.com/security](https://clerk.com/security)
**Status**: Implemented

#### Webhook User Lifecycle Sync

User account events from Clerk (user created, updated, deleted) are received via webhook with Svix signature verification. Each webhook payload is cryptographically validated before processing to prevent spoofed events. This ensures the application's user records stay synchronized with the identity provider and that account deletions trigger proper data cleanup.

**Implementation**: `src/domains/system/lib/webhook.service.ts → handleClerkUserCreated`
**Provider**: Clerk (SOC 2 Type II) | [clerk.com/security](https://clerk.com/security)
**Status**: Implemented

> **Note**: Clerk supports Multi-Factor Authentication (MFA) including TOTP and SMS verification. MFA can be enabled per-organization via the Clerk Dashboard. The application's authentication flow supports MFA-protected sessions without additional code changes.

---

## 2. Authorization & Access Control

This domain covers how the system determines what authenticated users are allowed to do. Groot Finance implements role-based access control (RBAC) with multi-tenant data isolation.

#### RBAC Role Model

The system enforces a four-tier role hierarchy: **Owner > Admin > Manager > Employee**. Each user's role is stored in the `business_memberships` table and determines their permissions across the platform. Roles are assigned when a user joins a business (via invitation or direct signup) and can be changed by the business owner.

- **Owner**: Full access including subscription management, ownership transfer, and business deletion
- **Admin** (Finance Admin): All permissions except ownership operations
- **Manager**: View all business data, approve expenses, manage categories
- **Employee**: View and manage only their own data

**Implementation**: `convex/schema.ts → business_memberships`
**Status**: Implemented

#### Permission Matrix

Server-side functions check the current user's role before executing any operation. The permission system determines available actions based on role, including read/write access to financial records, approval authority for expense claims, and administrative capabilities. Role checks happen on every mutation — the frontend permission gating is supplementary, not the primary control.

**Implementation**: `src/domains/security/lib/rbac.ts → determineUserRoles`
**Status**: Implemented

#### Multi-Tenant Isolation

All database queries are scoped to the user's active business via a `businessId` filter. This means users can only access data belonging to their own business — there is no path to query another tenant's records even if a valid user session exists. The isolation is enforced at the database query layer, not just in the UI.

**Implementation**: `src/lib/db/business-context.ts → business-context`
**Status**: Implemented

> **Cross-reference**: Multi-tenant isolation is also enforced in the [Data Protection & Privacy](#7-data-protection--privacy) domain at the schema level via `businessId` foreign keys on all data tables.

#### MCP Tool Permission Controls

The AI assistant (MCP integration) uses a deny-by-default permission system. Each tool is explicitly allowed based on the user's subscription plan (starter/pro/enterprise) and their role (owner/admin/manager). Sensitive operations require elevated roles, and tool access can be overridden per-tool. This prevents the AI from performing actions the user is not authorized to do.

**Implementation**: `src/lib/ai/mcp/mcp-permissions.ts → canAccessMcpTool`
**Status**: Implemented

---

## 3. Encryption & Secure Storage

This domain covers how data is encrypted at rest and in transit, and how secrets are managed.

#### SSM SecureString / KMS Encryption

All application secrets (API keys, private keys, certificates, per-business credentials) are stored in AWS Systems Manager (SSM) Parameter Store as SecureString parameters. These are encrypted at rest using AWS Key Management Service (KMS) with the default AWS-managed key. No secrets are stored in application code, environment variables, or the database. Lambda functions read secrets at runtime via IAM-authorized SSM API calls.

**Implementation**: `infra/lib/digital-signature-stack.ts → DigitalSignatureStack`
**Provider**: AWS (SOC 2 Type II, FedRAMP) | [aws.amazon.com/compliance](https://aws.amazon.com/compliance/)
**Status**: Implemented

#### CloudFront Signed URLs

Private documents (receipts, invoices, PDFs) stored in S3 are never accessed directly. Instead, the application generates time-limited CloudFront signed URLs using an RSA key pair. Each URL is valid for a configurable duration (typically 1 hour for downloads, 10 minutes for processing). This ensures that even if a URL is intercepted, it expires quickly and cannot be reused indefinitely.

**Implementation**: `src/lib/cloudfront-signer.ts → cloudfront-signer`
**Provider**: AWS CloudFront | [aws.amazon.com/compliance](https://aws.amazon.com/compliance/)
**Status**: Implemented

#### S3 HTTPS-Only Policy

All CloudFront distribution behaviors enforce HTTPS-only viewer protocol policy. This means the CDN rejects any HTTP request and only serves content over TLS 1.2+. Combined with CloudFront Origin Access Control (OAC), the S3 bucket is never directly accessible — all access goes through the encrypted CloudFront edge.

**Implementation**: `infra/lib/cdn-stack.ts → CdnStack`
**Provider**: AWS CloudFront + S3 | [aws.amazon.com/compliance](https://aws.amazon.com/compliance/)
**Status**: Implemented

> **Secret Management Policy**: Groot Finance follows a strict "SSM Parameter Store only" rule for secrets. No credentials are stored in the Convex database (which is plain-text at the application layer), environment variables on the frontend, or hardcoded in source code. This is enforced by code review and documented in the project's CLAUDE.md guidelines.

---

## 4. Infrastructure Security

This domain covers how the cloud infrastructure is secured, including IAM policies, network controls, and monitoring.

#### IAM Least-Privilege Policies

Every AWS Lambda function runs with a dedicated IAM execution role scoped to the minimum permissions needed. IAM policies specify exact resource ARNs (not wildcards) and include conditions where possible. For example, the digital signature Lambda can only read SSM parameters matching `/finanseal/*/digital-signature/*`, and its CloudWatch PutMetricData permission is conditioned on the `FinanSEAL/DigitalSignature` namespace.

**Implementation**: `infra/lib/digital-signature-stack.ts → DigitalSignatureStack`
**Provider**: AWS IAM | [aws.amazon.com/compliance](https://aws.amazon.com/compliance/)
**Status**: Implemented

#### Vercel OIDC Federated Identity

The Vercel deployment platform authenticates to AWS using OpenID Connect (OIDC) federation — not long-lived access keys. Vercel's OIDC provider issues short-lived tokens that are exchanged for temporary AWS credentials via IAM role assumption. This eliminates the risk of leaked AWS access keys and follows the zero-trust principle of no persistent credentials.

**Implementation**: `infra/lib/digital-signature-stack.ts → addPermission`
**Provider**: Vercel (SOC 2 Type 2, ISO 27001) | [vercel.com/security](https://vercel.com/security)
**Status**: Implemented

#### CloudFront Origin Access Control

The S3 bucket storing private documents is not publicly accessible. CloudFront uses Origin Access Control (OAC) with SigV4 automatic signing to authenticate requests to S3. This means the bucket's own policy only allows access from the specific CloudFront distribution — no other entity can read bucket contents directly.

**Implementation**: `infra/lib/cdn-stack.ts → CdnStack`
**Provider**: AWS CloudFront | [aws.amazon.com/compliance](https://aws.amazon.com/compliance/)
**Status**: Implemented

#### Lambda IAM-Only Invocation

No Lambda function exposes a public Function URL or unauthenticated API Gateway endpoint. All Lambda invocations require IAM authorization — either from the Vercel OIDC role, from another Lambda's execution role, or from an internal service. This prevents unauthorized external access to backend processing functions.

**Implementation**: All stacks in `infra/lib/`
**Provider**: AWS Lambda | [aws.amazon.com/compliance](https://aws.amazon.com/compliance/)
**Status**: Implemented

#### Certificate Expiry Monitoring

A CloudWatch alarm monitors the digital signature certificate's expiry date. When the certificate is within 30 days of expiration, an SNS notification is triggered to alert the operations team. This prevents service disruptions from expired certificates used for document signing.

**Implementation**: `infra/lib/digital-signature-stack.ts → CertExpiryAlarm`
**Provider**: AWS CloudWatch + SNS | [aws.amazon.com/compliance](https://aws.amazon.com/compliance/)
**Status**: Implemented

> **Infrastructure as Code**: All AWS resources are defined in CDK stacks under `infra/lib/`. No ad-hoc CLI changes are permitted — CDK is the single source of truth. This ensures infrastructure changes are version-controlled, reviewed, and reproducible.

---

## 5. Audit & Monitoring

This domain covers how the system records security-relevant events and monitors for issues.

#### Convex Audit Events

A dedicated `audit_events` table records all security-relevant actions with full context: who performed the action (`actorUserId`), what entity was affected (`targetEntityType`, `targetEntityId`), what happened (`eventType`), and when (automatic `_creationTime` timestamp). Event types include permission changes, data access, deletions, and configuration changes. All audit queries are scoped by `businessId` for multi-tenant isolation.

**Implementation**: `convex/functions/audit.ts → logEvent`
**Status**: Implemented

#### Sentry PII Scrubbing

Before any error event is transmitted to Sentry, a `beforeSend` hook automatically scrubs sensitive data. This includes:
- Authorization headers → `[REDACTED]`
- Cookie headers → `[REDACTED]`
- Any header containing "token" or "key" → `[REDACTED]`
- Request body fields matching password, token, credit_card, ssn, api_key → `[REDACTED]`
- User email → removed from event context
- Absolute file paths → `[path-redacted]` (server-side)

This ensures that no personally identifiable information or credentials reach the third-party error tracking service.

**Implementation**: `sentry.client.config.ts → beforeSend`
**Provider**: Sentry (SOC 2 Type II, ISO 27001) | [sentry.io/security](https://sentry.io/security/)
**Status**: Implemented

> **Cross-reference**: PII scrubbing complements the [Code Security & Headers](#6-code-security--headers) domain's source map hiding — together they prevent sensitive information from leaking through error reports.

#### CloudWatch Lambda Logs

All Lambda function executions are automatically logged to AWS CloudWatch Logs. Logs include invocation metadata, execution duration, and any application-level log output. CloudWatch log groups are configured with retention policies to manage storage costs while preserving audit-relevant data.

**Implementation**: CDK stack defaults (all Lambda stacks in `infra/lib/`)
**Provider**: AWS CloudWatch | [aws.amazon.com/compliance](https://aws.amazon.com/compliance/)
**Status**: Implemented

#### Audit Access Restriction

The audit log query endpoint is restricted to users with the "owner" role only. This prevents employees, managers, and even admins from viewing the complete audit trail — only the business owner can review all logged events. Query results are paginated (100 items per page) and filtered by `businessId`.

**Implementation**: `convex/functions/audit.ts → list`
**Status**: Implemented

---

## 6. Code Security & Headers

This domain covers security measures applied at the application code and HTTP response level.

#### Production Source Maps Disabled

Browser source maps are disabled in production builds. This prevents attackers from reconstructing the original source code from the minified JavaScript served to browsers. Source maps are only uploaded to Sentry (via CI) for error debugging and are hidden from the client-side bundle.

**Implementation**: `next.config.ts → productionBrowserSourceMaps: false`
**Status**: Implemented

#### X-Powered-By Header Removed

The `X-Powered-By: Next.js` HTTP response header is suppressed. This removes a fingerprinting vector that could help attackers identify the framework and target known vulnerabilities. It is a defense-in-depth measure that reduces information disclosure.

**Implementation**: `next.config.ts → poweredByHeader: false`
**Status**: Implemented

#### React Strict Mode

React Strict Mode is enabled, which activates additional development-time checks for potential issues including unsafe lifecycle methods, legacy API usage, and side-effect detection. While primarily a development tool, it helps catch security-relevant coding mistakes (like unintended side effects) before they reach production.

**Implementation**: `next.config.ts → reactStrictMode: true`
**Status**: Implemented

#### Sentry Source Map Security

Source maps are uploaded to Sentry during CI builds for error debugging, but the `hideSourceMaps: true` option removes them from the client-side bundle. This means Sentry can display readable stack traces for debugging, but the source maps are never served to browsers. The Sentry logger is also disabled (`disableLogger: true`) to reduce the client-side bundle size and remove debug instrumentation.

**Implementation**: `next.config.ts → sentryWebpackPluginOptions.hideSourceMaps`
**Status**: Implemented

---

## 7. Data Protection & Privacy

This domain covers how personal and business data is protected, retained, and deleted.

#### Soft Deletion Pattern

When records are deleted by users, they are not physically removed from the database. Instead, a `deletedAt` timestamp is set on the record. This preserves the audit trail and enables recovery if needed. Active queries filter out soft-deleted records (`WHERE deletedAt IS NULL`), so they are invisible to users but available for compliance investigations.

Soft deletion is applied to:
- Accounting entries (`deletedAt` field)
- Expense claims (`deletedAt` field)
- Line items (`deletedAt` field)
- Invoices (`deletedAt` field)

**Implementation**: `convex/schema.ts → deletedAt fields`
**Status**: Implemented

#### User Anonymization

When a user account is deleted through Clerk, the webhook handler anonymizes the user's record in the database. Personal information is replaced with generic placeholders (e.g., "Deleted User") while preserving the record's existence for referential integrity and audit trail purposes. This balances the right to erasure with the need to maintain financial record integrity.

**Implementation**: `src/domains/system/lib/webhook.service.ts → handleClerkUserDeleted`
**Provider**: Clerk (SOC 2 Type II) | [clerk.com/security](https://clerk.com/security)
**Status**: Implemented

#### Multi-Tenant Data Isolation

Every data table in the database includes a `businessId` foreign key. All queries are filtered by the current user's active business, ensuring complete data isolation between tenants. This is enforced at the database schema level — there is no way to construct a query that returns data from another business, even through API manipulation.

**Implementation**: `convex/schema.ts → businessId foreign keys`
**Status**: Implemented

> **Cross-reference**: This complements the application-level [Multi-Tenant Isolation](#multi-tenant-isolation) control in the Authorization domain, creating defense-in-depth: schema-level keys enforce isolation even if application logic has a bug.

#### Webhook Idempotency

Stripe webhook events are deduplicated before processing. Each incoming event's `stripeEventId` is checked against a record of previously processed events. If the event has already been processed, it is skipped. Events are recorded before processing begins, preventing race conditions where the same event arrives simultaneously. Failed events are marked with error details for investigation.

**Implementation**: `src/app/api/v1/billing/webhooks/route.ts → stripeEventId`
**Provider**: Stripe (PCI DSS Level 1) | [docs.stripe.com/security](https://docs.stripe.com/security)
**Status**: Implemented

#### Email Preference Management

Users control their email communication preferences through granular settings: marketing emails, product updates, and a global unsubscribe option. The system records `unsubscribedAt` timestamps for CAN-SPAM/PDPA compliance. Email verification status is tracked via AWS SES integration to ensure delivery integrity.

**Implementation**: `convex/schema.ts → emailPreferences`
**Status**: Implemented

---

## 8. Payment Security

This domain covers how payment data is handled. Groot Finance does not process or store any payment card data — all payment handling is delegated to Stripe.

#### Stripe Payment Delegation

All payment processing is handled entirely by Stripe, a PCI DSS Level 1 certified service provider (the highest level of payment security certification). Groot Finance never receives, processes, or stores credit card numbers, CVVs, or other sensitive payment data. Users enter payment details directly into Stripe-hosted checkout sessions. The application only stores Stripe customer IDs and subscription metadata — never payment instruments.

**Implementation**: `src/app/api/v1/billing/webhooks/route.ts → POST`
**Provider**: Stripe (PCI DSS Level 1, SOC 1/2/3 Type II) | [docs.stripe.com/security](https://docs.stripe.com/security)
**Status**: Implemented

#### Webhook Signature Verification

All incoming Stripe webhook events are cryptographically verified before processing. The application uses `Stripe.webhooks.constructEvent()` with the webhook signing secret to validate the `stripe-signature` header on every request. Any event that fails signature verification is rejected with a 400 Bad Request response. This prevents attackers from sending forged webhook events to trigger unauthorized actions.

**Implementation**: `src/app/api/v1/billing/webhooks/route.ts → constructEvent`
**Provider**: Stripe (PCI DSS Level 1) | [docs.stripe.com/security](https://docs.stripe.com/security)
**Status**: Implemented

#### Event Deduplication

Stripe webhook events are deduplicated to prevent double-processing. Before handling any event, the system checks whether the event ID has already been recorded. This protects against Stripe's retry mechanism (which resends events on timeout) causing duplicate charges, subscription changes, or other unintended side effects.

**Implementation**: `src/app/api/v1/billing/webhooks/route.ts → stripeEvents.exists`
**Provider**: Stripe (PCI DSS Level 1) | [docs.stripe.com/security](https://docs.stripe.com/security)
**Status**: Implemented

---

## Planned Controls

The following security controls are on the roadmap but not yet implemented:

#### Dedicated Data Export API (Right of Access)

A self-service API endpoint that allows users to request a complete export of their personal data, supporting PDPA right-of-access requirements. Currently, data export requests are handled manually.

**Status**: Planned

#### Automated Compliance Scanning

Automated scanning of infrastructure and code for security misconfigurations, dependency vulnerabilities, and compliance drift. This would complement the manual review process.

**Status**: Planned

#### Data Processing Activity Register

A formal register of all data processing activities, including purpose, legal basis, data categories, retention periods, and third-party transfers — as required by PDPA for data controllers.

**Status**: Planned

---

## Version History

| Date | Reviewer | Changes |
|------|----------|---------|
| 2026-03-03 | grootdev-ai | Initial document creation — 31 controls across 8 domains from codebase audit |

---

## References

### Provider Security Pages

- Clerk Security: [clerk.com/security](https://clerk.com/security)
- Clerk DPA: [clerk.com/legal/dpa](https://clerk.com/legal/dpa)
- Stripe Security: [docs.stripe.com/security](https://docs.stripe.com/security)
- Stripe Compliance: [docs.stripe.com/compliance](https://docs.stripe.com/compliance)
- Sentry Security: [sentry.io/security](https://sentry.io/security/)
- Sentry Trust Center: [sentry.io/trust](https://sentry.io/trust/)
- Convex Documentation: [docs.convex.dev](https://docs.convex.dev)
- AWS Compliance: [aws.amazon.com/compliance](https://aws.amazon.com/compliance/)
- Vercel Security: [vercel.com/security](https://vercel.com/security)
- Vercel Trust Center: [security.vercel.com](https://security.vercel.com/)

### Related PDPA Compliance Documents

- Breach Notification SOP: `001-pdpa-breach-notif-sop`
- Consent Collection: `001-pdpa-consent-collect`
- Data Retention Cleanup: `pdpa-data-retention-cleanup`
- Data Rights (Clerk + Convex): `pdpa-data-right-clerk-convex`

### Maintenance Guide

For instructions on adding, updating, or maintaining security controls in this document, see: `specs/001-pdpa-sec-measures-doc/quickstart.md`
