# Quickstart: PDPA Consent Collection

**Branch**: `001-pdpa-consent-collect` | **Date**: 2026-03-03

## Overview

This feature adds PDPA-compliant consent collection across three entry points (onboarding, invitation, existing-user banner), with consent revocation, a 30-day grace period escalating to a blocking overlay, and self-service personal data export.

## Prerequisites

- Node.js 20.x
- Convex CLI (`npx convex`)
- Clerk account (authentication)
- Vercel environment variables access

## Environment Variables (New)

Add to Vercel dashboard and `.env.local`:

```bash
NEXT_PUBLIC_CURRENT_POLICY_VERSION="2026-01-15"
CONSENT_GRACE_PERIOD_START="2026-03-15"  # Deployment date — update when deploying
```

## New Files to Create

| File | Purpose |
|------|---------|
| `convex/functions/consent.ts` | Convex queries + mutations for consent records |
| `src/components/consent-banner.tsx` | Non-blocking banner component |
| `src/components/consent-lock-overlay.tsx` | Blocking overlay (post-grace-period + revocation) |
| `src/domains/compliance/hooks/use-consent.ts` | React hook for consent status (Convex query) |
| `src/domains/account-management/components/privacy-data-section.tsx` | "Privacy & Data" tab content |
| `src/app/api/v1/consent/record/route.ts` | API route for consent recording (with IP capture) |
| `src/app/api/v1/consent/revoke/route.ts` | API route for consent revocation |
| `src/app/api/v1/users/data-export/route.ts` | API route for personal data export (JSON) |

## Existing Files to Modify

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `consent_records` table definition |
| `src/app/[locale]/layout.tsx` | Mount `ConsentBanner` and `ConsentLockOverlay` |
| `src/domains/onboarding/components/business-onboarding-modal.tsx` | Add consent checkbox to Step 1 |
| `src/app/[locale]/invitations/accept/page.tsx` | Add consent checkbox before acceptance |
| `src/domains/account-management/components/tabbed-business-settings.tsx` | Add "Privacy & Data" tab |

## Key Patterns to Follow

### Consent Check (Convex Query)
```typescript
// Use in components via useQuery
const consentStatus = useQuery(api.functions.consent.hasAcceptedCurrentPolicy, {
  policyType: "privacy_policy",
  policyVersion: process.env.NEXT_PUBLIC_CURRENT_POLICY_VERSION!,
})
```

### Blocking Overlay (Follow SubscriptionLockOverlay)
```typescript
// Same pattern: fixed inset-0 z-40, blur backdrop, Card with CTA
// Unblocked paths: /settings, /sign-out, /api/
// Mount in locale layout after SubscriptionLockOverlay
```

### IP Capture (Existing Pattern)
```typescript
// In API routes — reuse from src/domains/security/lib/audit-logger.ts
const ip = request.headers.get('x-forwarded-for')?.split(',')[0]
  || request.headers.get('x-real-ip')
  || undefined
```

## Post-Implementation Checklist

1. `npm run build` must pass
2. `npx convex deploy --yes` for schema + function changes
3. Set env vars in Vercel dashboard
4. Verify consent checkbox blocks onboarding progression
5. Verify banner appears for existing users
6. Verify blocking overlay activates after grace period
7. Verify "Download My Data" generates valid JSON export
8. Verify consent revocation triggers immediate blocking
