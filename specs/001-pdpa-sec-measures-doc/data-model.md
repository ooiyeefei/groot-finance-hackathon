# Data Model: Security Measures Document Structure

**Feature**: 001-pdpa-sec-measures-doc
**Date**: 2026-03-03

## Document Entity Model

This feature produces a Markdown document, not a database schema. The "data model" defines the document structure and the format of each entry.

### Entity: Security Measures Document

**Location**: `docs/compliance/security-measures.md`
**Format**: GitHub-flavored Markdown

#### Top-Level Structure

```
Document
├── Header (title, last updated, version, document purpose)
├── Table of Contents (auto-generated from headings)
├── Executive Summary (1-paragraph non-technical overview)
├── Third-Party Provider Summary (table of providers + certifications)
├── Domain Section × 8 (one per security domain)
│   ├── Domain Introduction (what this domain covers)
│   └── Security Control × N (one per control)
│       ├── Description (human-readable, no code)
│       ├── Code Reference (file path → symbol name)
│       └── Status (Implemented | Planned)
├── Planned Controls (future roadmap items)
├── Version History (date, reviewer, changes)
└── References (links to provider security pages, related PDPA docs)
```

### Entity: Security Domain

A top-level section grouping related controls.

| Attribute | Type | Description |
|-----------|------|-------------|
| Name | String | Domain heading (e.g., "Authentication & Identity") |
| Order | Integer (1-8) | Fixed display order |
| Introduction | Text | 2-3 sentence description of what this domain covers |
| Controls | List[SecurityControl] | The controls within this domain |

**Fixed Domains (in order)**:
1. Authentication & Identity
2. Authorization & Access Control
3. Encryption & Secure Storage
4. Infrastructure Security
5. Audit & Monitoring
6. Code Security & Headers
7. Data Protection & Privacy
8. Payment Security

### Entity: Security Control

An individual security measure documented within a domain.

| Attribute | Type | Description |
|-----------|------|-------------|
| Name | String | Short control name (e.g., "Clerk JWT Validation") |
| Description | Text | Human-readable explanation of what it does and why, without code |
| Code Reference | String | `file/path.ts → SymbolName` format |
| Third-Party Provider | String (optional) | Provider name if control relies on external service |
| Status | Enum | `Implemented` or `Planned` |

**Per-Control Format Template**:
```markdown
#### [Control Name]

[Human-readable description of what this control does and why it exists.
Written for non-technical readers.]

**Implementation**: `file/path.ts → SymbolName`
**Provider**: [Provider name] ([Certification]) — *only if third-party*
**Status**: Implemented
```

### Entity: Third-Party Provider Summary

A table at the top of the document listing all providers.

| Attribute | Type | Description |
|-----------|------|-------------|
| Provider Name | String | e.g., "Clerk" |
| Role | String | e.g., "Authentication & Identity Management" |
| Certifications | String | e.g., "SOC 2 Type II, CCPA" |
| Security Page URL | URL | Link to official security/trust page |

### Entity: Version History Entry

| Attribute | Type | Description |
|-----------|------|-------------|
| Date | Date | When the review/update occurred |
| Reviewer | String | Name or role of the person who reviewed |
| Changes | Text | Brief description of what changed |

## Control Inventory by Domain

### 1. Authentication & Identity (3 controls)
- Clerk JWT Validation (`convex/auth.config.ts → auth.config`)
- Middleware Route Protection (`src/middleware.ts → clerkMiddleware`)
- Webhook User Lifecycle Sync (`src/domains/system/lib/webhook.service.ts → handleClerkUserCreated`)

### 2. Authorization & Access Control (4 controls)
- RBAC Role Model (`convex/schema.ts → business_memberships`)
- Permission Matrix (`src/domains/security/lib/rbac.ts → determineUserRoles`)
- Multi-Tenant Isolation (`src/lib/db/business-context.ts → business-context`)
- MCP Tool Permission Controls (`src/lib/ai/mcp/mcp-permissions.ts → canAccessMcpTool`)

### 3. Encryption & Secure Storage (3 controls)
- SSM SecureString / KMS Encryption (`infra/lib/digital-signature-stack.ts → DigitalSignatureStack`)
- CloudFront Signed URLs (`src/lib/cloudfront-signer.ts → cloudfront-signer`)
- S3 HTTPS-Only Policy (`infra/lib/cdn-stack.ts → CdnStack`)

### 4. Infrastructure Security (5 controls)
- IAM Least-Privilege Policies (`infra/lib/digital-signature-stack.ts → DigitalSignatureStack`)
- Vercel OIDC Federated Identity (`infra/lib/digital-signature-stack.ts → addPermission`)
- CloudFront OAC (`infra/lib/cdn-stack.ts → CdnStack`)
- Lambda IAM-Only Invocation (all stacks in `infra/lib/`)
- Certificate Expiry Monitoring (`infra/lib/digital-signature-stack.ts → CertExpiryAlarm`)

### 5. Audit & Monitoring (4 controls)
- Convex Audit Events (`convex/functions/audit.ts → logEvent`)
- Sentry PII Scrubbing (`sentry.client.config.ts → beforeSend`)
- CloudWatch Lambda Logs (CDK stack defaults)
- Audit Access Restriction (`convex/functions/audit.ts → list`)

### 6. Code Security & Headers (4 controls)
- Production Source Maps Disabled (`next.config.ts → productionBrowserSourceMaps`)
- X-Powered-By Removed (`next.config.ts → poweredByHeader`)
- React Strict Mode (`next.config.ts → reactStrictMode`)
- Sentry Source Map Security (`sentry.client.config.ts → hideSourceMaps`)

### 7. Data Protection & Privacy (5 controls)
- Soft Deletion Pattern (`convex/schema.ts → deletedAt fields`)
- User Anonymization (`src/domains/system/lib/webhook.service.ts → handleClerkUserDeleted`)
- Multi-Tenant Data Isolation (`convex/schema.ts → businessId foreign keys`)
- Webhook Idempotency (`src/app/api/v1/billing/webhooks/route.ts → stripeEventId`)
- Email Preference Management (`convex/schema.ts → emailPreferences`)

### 8. Payment Security (3 controls)
- Stripe Payment Delegation (`src/app/api/v1/billing/webhooks/route.ts → POST`)
- Webhook Signature Verification (`src/app/api/v1/billing/webhooks/route.ts → constructEvent`)
- Event Deduplication (`src/app/api/v1/billing/webhooks/route.ts → stripeEvents.exists`)

**Total**: 31 controls across 8 domains (minimum 3 per domain, satisfying SC-001).
