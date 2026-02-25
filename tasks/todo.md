# Standardize Trial → Pro Plan + Lock Screen

**Goal**: Remove fake "trial" plan concept. Trial is a STATUS (`trialing`), not a PLAN. All new signups get Pro plan with 14-day free trial. After trial ends, account locks until they choose a plan.

---

## Phase 1: Migration + Start-Trial Route
- [ ] 1a. Write one-time Convex migration: `planName: 'trial'/'free'/null` → `planName: 'pro'` for existing trialing businesses
- [ ] 1b. Update `start-trial/route.ts`: subscribe to **Pro** price, set `planName: 'pro'`

## Phase 2: Remove 'trial' as PlanKey
- [ ] 2a. `catalog.ts`: Remove `TRIAL_PLAN`, remove `'trial'` from `PlanKey` type, update `normalizePlanKey()`
- [ ] 2b. `mcp-permissions.ts`: Update `PlanKey` type, replace `'trial'` references

## Phase 3: Update API Routes
- [ ] 3a. `subscription/route.ts`: Replace `planKey === 'trial'` → `subscriptionStatus === 'trialing'`
- [ ] 3b. `checkout/route.ts`: Replace `planName !== 'trial'` → status-based
- [ ] 3c. `usage/route.ts`: Default to `'starter'` not `'trial'`
- [ ] 3d. `trial-status/route.ts`: Replace `planName === 'trial'` → status check

## Phase 4: Update Convex Functions
- [ ] 4a. `aiMessageUsage.ts`, `salesInvoiceUsage.ts`, `einvoiceUsage.ts`: Remove `case "trial":`
- [ ] 4b. `businesses.ts`: Replace `planName === "trial"` → status-based logic

## Phase 5: Update Components
- [ ] 5a. `subscription-card.tsx`: `plan.name === 'trial'` → `subscription.status === 'trialing'`
- [ ] 5b. `upgrade-banner.tsx`: Same
- [ ] 5c. `pricing-table.tsx`: Remove 'trial' from plan ordering
- [ ] 5d. `billing-settings-content.tsx` + `billing/page.tsx`: Same

## Phase 6: Update Onboarding
- [ ] 6a. `business-initialization.service.ts`: Remove `plan === 'trial'` mapping
- [ ] 6b. `use-plan-selection.ts`: Ensure start-trial triggers for signups

## Phase 7: Lock Screen (New)
- [ ] 7a. Create `subscription-lock-overlay.tsx` — blur + upgrade prompt (default Pro, can pick Starter)
- [ ] 7b. Add to `[locale]/layout.tsx`
- [ ] 7c. Trigger on `status === 'paused'` OR trial expired

## Phase 8: Deploy & Verify
- [ ] 8a. `npx convex deploy --yes`
- [ ] 8b. `npm run build` passes
