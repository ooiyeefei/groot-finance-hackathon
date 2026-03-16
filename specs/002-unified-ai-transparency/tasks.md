# Tasks: Daily AI Digest Email

**Input**: Design documents from `/specs/002-unified-ai-transparency/`

## Phase 1: Backend — Aggregation Query

- [x] T001 Create `convex/functions/aiDigest.ts` with `gatherAIActivity` internalQuery — aggregates last 24h AI activity from: sales_orders (AR: tier 2 matches by aiMatchStatus), bank_transactions (classifications by tier), order_matching_corrections (corrections count + learned aliases). Returns normalized: { totalAiActions, tier1Count, tier2Count, autoApprovedCount, correctedCount, pendingReviewCount, totalTimeSavedSeconds, topPendingItems[], topAutoApprovedItems[], uniqueLearnedAliases, featureBreakdown: { ar, bank, fee } }
- [x] T002 Add `getDigestRecipients` internalQuery to `convex/functions/aiDigest.ts` — for each business with AI activity, find admin users (membership role = "admin" or "owner") who haven't globally unsubscribed. Return: { businessId, businessName, adminEmail, adminName, timezone }
- [x] T003 Add `generateDigestForBusiness` internalAction to `convex/functions/aiDigest.ts` — calls gatherAIActivity, skips if zero activity, formats metrics, calls email API route to send

---

## Phase 2: Email Template + API Route

- [x] T004 Create email HTML template function in `convex/functions/aiDigest.ts` (inline HTML builder) — renders: header with Groot logo reference, "Your AI Summary for [date]" title, hero metric "X.X Hours Saved Today", three-column stats (Autonomy Rate %, Trust Summary, Corrections), Exceptions table (top 3 pending items with deep links), "Download Audit Summary" link, footer with unsubscribe
- [x] T005 Create `src/app/api/v1/ai-digest/send/route.ts` — POST endpoint, validates internal API key, accepts { businessId, recipientEmail, recipientName, digestData }, sends via SES using existing email-service pattern

---

## Phase 3: Cron + Integration

- [x] T006 Add `dailyDigest` internalAction to `convex/functions/aiDigest.ts` — the main cron entry point: get all businesses with AI activity → for each, check timezone (default Asia/Kuala_Lumpur) → if current hour is 18:00 in their timezone, generate and send digest
- [x] T007 Register daily digest cron in `convex/crons.ts` — runs hourly, checks each business's timezone to send at 6 PM local. Pattern: `crons.hourly("ai-daily-digest", { minuteUTC: 0 }, ...)`
- [x] T008 Run `npm run build` to verify TypeScript compilation passes

---

## Phase 4: Polish

- [x] T009 Update CLAUDE.md Recent Changes
- [x] T010 Final build verification
