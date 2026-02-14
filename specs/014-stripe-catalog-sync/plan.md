# Implementation Plan: Stripe Key Migration to AWS SSM

**Branch**: `014-stripe-catalog-sync` | **Date**: 2026-02-14 | **Spec**: [spec.md](./spec.md)
**Input**: Migrate Stripe secret key storage from Convex plaintext to AWS SSM Parameter Store, moving Stripe-touching operations from Convex actions to Next.js API routes via Vercel OIDC.

## Summary

The Stripe secret key is currently stored as **plaintext in Convex DB** (`stripe_integrations.stripeSecretKey`). This migration:
1. Moves key storage to **AWS SSM Parameter Store** (SecureString, KMS-encrypted)
2. Moves Stripe API operations from **Convex actions** to **Next.js API routes** (which have Vercel OIDC → AWS IAM access)
3. Removes the `stripeSecretKey` field from Convex schema entirely
4. Preserves real-time sync progress via Convex `sync_logs` (API routes write progress, frontend subscribes)
5. Cleans up all unused Convex functions (internal queries/mutations that only existed to support the action)

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, Stripe SDK 20.1.0, @aws-sdk/client-ssm 3.982.0
**Storage**: AWS SSM Parameter Store (SecureString) for keys, Convex for metadata
**Auth**: Clerk (user auth) → Vercel OIDC → AWS IAM → SSM (key access)
**Target Platform**: Vercel (Next.js API routes) + Convex (database/real-time)

## Constitution Check

Constitution is a template (not configured for this project). No gates to check.

## Architecture

### Data Flow — Before vs After

```
BEFORE (insecure):
Browser → Convex action (connect) → Stripe API → stores key in Convex DB (plaintext)
Browser → Convex action (syncFromStripe) → reads key from Convex DB → Stripe API

AFTER (secure):
Browser → Next.js API route (connect) → Stripe API → stores key in AWS SSM (encrypted)
Browser → Next.js API route (sync) → reads key from AWS SSM → Stripe API → writes to Convex
```

### SSM Parameter Path Convention

```
/finanseal/stripe/{businessId}/secret-key    (SecureString)
```

Following existing pattern: `/finanseal/cloudfront/private-key`

### Existing Pattern to Reuse

`src/lib/cloudfront-signer.ts` lines 44-66: SSM client with Vercel OIDC credentials.
Extract this into a shared `src/lib/aws-ssm.ts` utility.

## Project Structure

### New Files
```
src/lib/aws-ssm.ts                                    # Shared SSM client (extracted from cloudfront-signer pattern)
src/app/api/v1/stripe-integration/connect/route.ts     # POST: validate key + store in SSM
src/app/api/v1/stripe-integration/disconnect/route.ts  # POST: delete SSM param + update Convex
src/app/api/v1/stripe-integration/sync/route.ts        # POST: fetch key from SSM + Stripe sync
```

### Modified Files
```
convex/schema.ts                                       # Remove stripeSecretKey from stripe_integrations
convex/functions/stripeIntegrations.ts                  # Remove connect action, getIntegrationInternal, upsertIntegration (secret key logic)
convex/functions/catalogItems.ts                        # Remove syncFromStripe action + all internal helpers
convex/_generated/api.d.ts                              # Will be updated by npx convex dev
src/lib/cloudfront-signer.ts                            # Refactor: use shared aws-ssm.ts
src/domains/sales-invoices/hooks/use-stripe-integration.ts  # Switch from Convex action to fetch()
src/domains/sales-invoices/components/stripe-sync-button.tsx # Switch from useAction to fetch()
src/domains/account-management/components/stripe-integration-card.tsx # Switch from useAction to fetch()
```

### Deleted Files
```
(none — all changes are modifications)
```

## Implementation Phases

### Phase 1: Shared SSM Utility

Create `src/lib/aws-ssm.ts` — extract the SSM client pattern from `cloudfront-signer.ts`:
- `createSSMClient()` — Vercel OIDC for prod, default chain for local dev
- `getSSMParameter(name)` — GetParameter with WithDecryption
- `putSSMParameter(name, value)` — PutParameter as SecureString
- `deleteSSMParameter(name)` — DeleteParameter
- Refactor `cloudfront-signer.ts` to import from the shared utility

### Phase 2: API Routes

**POST `/api/v1/stripe-integration/connect`**
- Auth: `auth()` from Clerk → get userId
- Auth: `getAuthenticatedConvex()` → verify user is owner via Convex query
- Validate key format (`sk_test_` / `sk_live_`)
- Validate against Stripe API (`stripe.accounts.retrieve()`)
- Store key in SSM: `putSSMParameter('/finanseal/stripe/{businessId}/secret-key', key)`
- Update Convex metadata via mutation (account ID, name, status — NO secret key)
- Return `{ success, accountName, accountId }`

**POST `/api/v1/stripe-integration/disconnect`**
- Auth: Clerk + Convex owner check
- Delete SSM parameter: `deleteSSMParameter('/finanseal/stripe/{businessId}/secret-key')`
- Update Convex: set status to "disconnected", clear timestamps
- Return `{ success }`

**POST `/api/v1/stripe-integration/sync`**
- Auth: Clerk + Convex role check (owner/finance_admin/manager)
- Check for concurrent sync via Convex query (hasRunningSync)
- Fetch key from SSM: `getSSMParameter('/finanseal/stripe/{businessId}/secret-key')`
- Create sync_log in Convex (status: "running")
- Call Stripe API: fetch products with pagination
- Iterate products, upsert catalog items in Convex (reuse existing mutations)
- Update sync_log progress every 20 products
- Deactivate orphaned items
- Finalize sync_log
- Return `{ success, created, updated, deactivated, skipped, errors }`

### Phase 3: Convex Schema & Function Cleanup

**Schema changes (`convex/schema.ts`)**:
- Remove `stripeSecretKey` field from `stripe_integrations` table

**Remove from `convex/functions/stripeIntegrations.ts`**:
- Remove `getIntegrationInternal` (internalQuery) — key is no longer in Convex
- Remove `upsertIntegration` (internalMutation) — replaced by API route + simple mutation
- Remove `connect` (action) — replaced by API route
- Keep `getConnection` (query) — still needed for UI status
- Keep `disconnect` (mutation) — but simplify (no key to clear, just status update)
- Add `updateConnection` (mutation) — for API route to write metadata after SSM store

**Remove from `convex/functions/catalogItems.ts`**:
- Remove `syncFromStripe` (action) — replaced by API route
- Remove `verifyFinanceAdminRole` (internalQuery) — auth moves to API route via Clerk
- Remove `hasRunningSync` (internalQuery) — convert to public query for API route to call
- Remove `getStripeSyncedItems` (internalQuery) — convert to public query for API route
- Remove `createSyncLog` (internalMutation) — convert to public mutation for API route
- Remove `updateSyncLog` (internalMutation) — convert to public mutation for API route
- Remove `upsertSyncedItem` (internalMutation) — convert to public mutation for API route
- Remove `deactivateSyncedItem` (internalMutation) — convert to public mutation for API route
- Remove `updateIntegrationLastSync` (internalMutation) — move logic to stripeIntegrations
- Keep `getSyncProgress` (query) — still needed for real-time UI
- Keep `restoreFromStripe` (mutation) — still needed for UI

Note: "convert to public" means changing from `internalQuery/internalMutation` to `query/mutation` with proper auth checks, since they'll be called from the authenticated Convex HTTP client in API routes instead of from Convex actions.

### Phase 4: Frontend Hook Migration

**`use-stripe-integration.ts`**:
- `useStripeConnect()` → change from `useAction(api...connect)` to `fetch('/api/v1/stripe-integration/connect')`
- `useStripeDisconnect()` → change from `useMutation(api...disconnect)` to `fetch('/api/v1/stripe-integration/disconnect')`
- `useStripeConnection()` → keep as-is (Convex query for real-time status)

**`stripe-integration-card.tsx`**:
- Update to use new hook signatures

**`stripe-sync-button.tsx`**:
- Change from `useAction(api...syncFromStripe)` to `fetch('/api/v1/stripe-integration/sync')`
- Keep Convex `useQuery(getSyncProgress)` for real-time progress

### Phase 5: Convex Deploy + Build Validation

- Run `npx convex dev --once` to push schema/function changes
- Run `npm run build` to verify TypeScript + Next.js build
- Update `convex/_generated/api.d.ts` if needed

### Phase 6: IAM Policy Update

Document the IAM policy additions needed for `FinanSEAL-Vercel-S3-Role`:
- `ssm:PutParameter` on `/finanseal/stripe/*`
- `ssm:DeleteParameter` on `/finanseal/stripe/*`
- (ssm:GetParameter already granted for CloudFront key — verify scope covers new path)

## IAM Policy Required

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "StripeKeySSMAccess",
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:PutParameter",
        "ssm:DeleteParameter"
      ],
      "Resource": "arn:aws:ssm:us-west-2:837224017779:parameter/finanseal/stripe/*"
    }
  ]
}
```

**Note**: Check if the existing `ssm:GetParameter` permission is path-scoped to `/finanseal/cloudfront/*` only. If so, either widen to `/finanseal/*` or add the above as a separate statement.

## Research Findings

### Decision: SSM Parameter Store over Secrets Manager
- **Rationale**: Free tier (10,000 standard parameters), project already uses SSM for CloudFront key, KMS encryption included with AWS-managed key
- **Alternatives**: Secrets Manager ($0.40/secret/month — overkill for current scale), Convex env vars (doesn't scale per-business)

### Decision: Next.js API Routes over Convex Actions
- **Rationale**: Convex actions run on Convex infrastructure, cannot use Vercel OIDC for AWS access. Moving to API routes leverages existing Vercel → AWS IAM pattern.
- **Trade-off**: Lose Convex action retry semantics, but gain proper secret management. Sync progress preserved via Convex mutations from the API route.

### Decision: Convert internal functions to public with auth
- **Rationale**: Internal functions can only be called from Convex actions. Since sync moves to API routes using `ConvexHttpClient`, all DB operations must be public queries/mutations with auth checks.
- **Pattern**: Each converted function gets the same `requireFinanceAdmin` check used by existing public mutations.
