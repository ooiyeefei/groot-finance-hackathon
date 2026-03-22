# Research: Debtor Self-Service Information Update

**Feature**: 032-self-service-debtors-info-update
**Date**: 2026-03-22

## Decision 1: Auto-Apply vs Approval Queue

- **Decision**: Auto-apply with change log and revert capability
- **Rationale**: Invoice PDF already shows debtor name, address, TIN, BRN — QR code exposes no additional sensitive data. Debtors know their own info best. Approval creates unnecessary friction.
- **Alternatives**: Approval queue (rejected — adds bottleneck for no security benefit), auto-approve with delay (rejected — unnecessary complexity)

## Decision 2: Token Strategy

- **Decision**: One UUID token per debtor (not per invoice), stored in `debtor_update_tokens` table with `by_token` index
- **Rationale**: Reduces token proliferation. Same debtor across multiple invoices uses same link. Token is time-limited (30 days default) and rate-limited (5 submissions/24h).
- **Alternatives**: Per-invoice token (rejected — creates many tokens, harder to manage), signed JWT (rejected — can't revoke without server-side state anyway)

## Decision 3: Public Page Routing

- **Decision**: `/[locale]/debtor-update/[token]` route added to middleware's public routes
- **Rationale**: Follows existing public page pattern (landing page, referral page). Middleware already supports public route matching via `isPublicRoute`. Server component validates token via Convex query before rendering form.
- **Alternatives**: Separate subdomain (rejected — overkill), API-only with external form (rejected — loses branding)

## Decision 4: QR Code Toggle

- **Decision**: Business-level toggle in `invoiceSettings.enableDebtorSelfServiceQr` (default: true)
- **Rationale**: Respects businesses that don't want extra elements. Follows existing `invoiceSettings` pattern. Easy to add without schema migration (optional field).
- **Alternatives**: Always show (rejected — not all businesses want it), per-invoice toggle (rejected — too granular)

## Decision 5: Notification Channel

- **Decision**: Action Center alert only (category: "compliance", priority: "low")
- **Rationale**: Reuses existing `actionCenterInsights` infrastructure. No additional email clutter for admins. Consistent with other automated alerts.
- **Alternatives**: Email notification (rejected — adds noise), in-app toast only (rejected — not persistent enough)

## Decision 6: Email Sending Architecture

- **Decision**: Convex HTTP action → Next.js API route → SES (using existing `notifications.hellogroot.com` domain)
- **Rationale**: SES already configured with domain identity and configuration set. Email template uses business name and self-service URL. Follows existing transactional email patterns.
- **Alternatives**: Lambda email sender (rejected — over-engineered for simple transactional email), direct SES from Convex (rejected — Convex can't use AWS SDK natively)

## Decision 7: Change Log vs Staging Table

- **Decision**: `debtor_change_log` table stores field-level diffs (old/new per field) plus full snapshots
- **Rationale**: Since we auto-apply (no staging), the change log serves as audit trail and enables revert. Field-level diffs enable highlighted display in UI. Full snapshots enable one-click revert.
- **Alternatives**: Only full snapshots (rejected — harder to show "what changed"), only field diffs (rejected — can't revert without full snapshot)

## Decision 8: QR Code Library

- **Decision**: Use existing `qrcode` npm package (already used by `lhdn-qr-code.tsx`)
- **Rationale**: Already in dependencies. Generates data URLs compatible with @react-pdf/renderer. Same pattern as LHDN QR code.
- **Alternatives**: New QR library (rejected — no benefit over existing)
