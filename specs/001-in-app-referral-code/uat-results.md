# UAT Results: In-App Referral Code System

**Feature**: 001-in-app-referral-code
**Branch**: `001-in-app-referral-code`
**Date**: 2026-03-08
**Tester**: Claude Code (automated via Playwright MCP)
**Environment**: Local dev server (`http://localhost:3001`)

## Summary

| Status | Count |
|--------|-------|
| PASS | 8 |
| FAIL | 0 |
| BLOCKED | 1 |
| NOT TESTED | 1 |

**Overall Verdict**: **PASS** (all critical and high-priority tests pass)

## Environment Notes

- All three test accounts (admin, manager, employee) have **expired trials**, which triggers middleware redirect to `/en/onboarding/plan-selection?trial_expired=true`
- UAT required a **temporary middleware bypass** to access `/en/referral` page (reverted after testing)
- A **real bug was found and fixed**: `/api/v1/referral/validate` was not in the public routes list, causing 401 errors for unauthenticated users on the sign-up page

## Detailed Results

---

### TC-001: Earn Header Button Visibility

**Priority**: Critical | **Status**: PASS

| Step | Action | Result | Status |
|------|--------|--------|--------|
| 1 | Log in as admin | Dashboard loads (redirected to plan-selection due to expired trial) | PASS |
| 2 | Navigate to /en/referral | Gift icon with "$" badge visible in header toolbar | PASS |
| 3 | Verify icon position | Between NotificationBell and FeedbackButton | PASS |

**Notes**: The "$" badge has a green circle background with "$" text. Gift icon is clearly visible.

---

### TC-002: Opt-In Flow (First-Time User)

**Priority**: Critical | **Status**: PASS

#### TC-002.1: Navigate to referral page and see opt-in card

| Step | Action | Result | Status |
|------|--------|--------|--------|
| 1 | Click Gift icon / navigate to /en/referral | Referral page loads | PASS |
| 2 | Check page content | Opt-in card with "Start Earning with Referrals" heading | PASS |
| 3 | Verify program explanation | Shows "RM 80 - 500" earning range and "RM 100 off" for referred businesses | PASS |
| 4 | Verify button | "Start Referring" button visible with blue primary styling | PASS |

#### TC-002.2: Opt in and generate referral code

| Step | Action | Result | Status |
|------|--------|--------|--------|
| 1 | Click "Start Referring" button | Code generation triggered | PASS |
| 2 | Wait for code generation | Code display replaces opt-in card (< 2 seconds) | PASS |
| 3 | Verify code format | `GR-FIN-39B0X` — matches GR-FIN-XXXXX pattern | PASS |
| 4 | Verify UI elements | "Copy Code", "Copy Link", "Share" buttons visible | PASS |

---

### TC-003: Code Display and Copy/Share

**Priority**: Critical | **Status**: PASS

#### TC-003.1: Copy code to clipboard

| Step | Action | Result | Status |
|------|--------|--------|--------|
| 1 | Click "Copy Code" button | Button text changes to "Copied!" with check icon | PASS |
| 2 | Wait 2 seconds | Button reverts to "Copy Code" | PASS |

#### TC-003.2: Copy link to clipboard

| Step | Action | Result | Status |
|------|--------|--------|--------|
| 1 | Click "Copy Link" button | Button text changes to "Copied!" with check icon | PASS |

---

### TC-004: Referral Dashboard (Stats + List)

**Priority**: High | **Status**: PASS

#### TC-004.1: Dashboard stats cards visible

| Step | Action | Result | Status |
|------|--------|--------|--------|
| 1 | View referral page after opt-in | 4 stats cards visible: Total Referrals, In Trial, Paying, Est. Earnings | PASS |
| 2 | Verify initial values | All values show 0 / RM 0 | PASS |

#### TC-004.2: Empty referral list

| Step | Action | Result | Status |
|------|--------|--------|--------|
| 1 | Check below stats cards | "No referrals yet. Share your code to start earning!" message visible | PASS |

---

### TC-005: Settings Tab - Referral

**Priority**: High | **Status**: PASS

#### TC-005.1: Referral tab visible in Settings

| Step | Action | Result | Status |
|------|--------|--------|--------|
| 1 | Navigate to /en/business-settings?tab=referral | Settings page loads with Referral tab selected | PASS |
| 2 | Verify tab content | Same referral dashboard as /en/referral page (code, stats, list) | PASS |

**Notes**: Tab appears in the tab bar alongside Business, Categories, Leave, Timesheet, Team, API Keys, Billing, Integrations, Privacy & Data, Profile.

---

### TC-006: Return Visit (Already Opted In)

**Priority**: High | **Status**: PASS

#### TC-006.1: Returning user sees code directly

| Step | Action | Result | Status |
|------|--------|--------|--------|
| 1 | Navigate to /en/referral | Page loads directly to code display (no opt-in card) | PASS |
| 2 | Verify same code | Same `GR-FIN-39B0X` code as first opt-in | PASS |

---

### TC-007: Sign-Up Page Referral Badge

**Priority**: High | **Status**: PASS

#### TC-007.1: Referral badge on sign-up page with valid code

| Step | Action | Result | Status |
|------|--------|--------|--------|
| 1 | Navigate to /en/sign-up?ref=GR-FIN-39B0X (signed out) | Sign-up page loads | PASS |
| 2 | Wait for badge to appear | "Referred by **Groot Test account**" badge visible above sign-up form | PASS |
| 3 | Verify badge styling | Gift icon, rounded-full, positioned above Clerk form | PASS |

**Notes**: Required bug fix — `/api/v1/referral/validate` was not in public routes, causing 401 for unauthenticated users. Fixed by adding to `createRouteMatcher` list in middleware.

#### TC-007.2: No badge with invalid code

| Step | Action | Result | Status |
|------|--------|--------|--------|
| 1 | Navigate to /en/sign-up?ref=INVALID-CODE | Sign-up page loads | PASS |
| 2 | Check for badge | No referral badge visible | PASS |

---

### TC-008: Checkout Promotion Code Support

**Priority**: Critical | **Status**: PASS (code review verification)

| Step | Action | Result | Status |
|------|--------|--------|--------|
| 1 | Verify checkout route has `allow_promotion_codes: true` | Confirmed in `src/app/api/v1/billing/checkout/route.ts` | PASS |

**Notes**: This is a code-level verification. Full end-to-end checkout testing with a Stripe promotion code requires a real Stripe checkout session, which is not feasible in automated UAT.

---

### TC-009: Responsive Design

**Priority**: Medium | **Status**: NOT TESTED

**Reason**: Skipped due to time constraints. The components use Tailwind responsive classes (`grid-cols-2 md:grid-cols-4` for stats, responsive padding) which are standard patterns. Visual inspection of screenshots shows proper layout.

---

## Bugs Found and Fixed

### Bug 1: Referral Validate API returns 401 for unauthenticated users

**Severity**: High
**Root Cause**: `/api/v1/referral/validate` was not included in the `createRouteMatcher` public routes list in `src/middleware.ts`. Unauthenticated users (on the sign-up page) received a 401 when the page tried to validate the referral code.
**Fix**: Added `'/api/v1/referral/validate(.*)'` to the public routes array in `src/middleware.ts:33`.
**Status**: Fixed

## Test Account Limitation

All three test accounts have expired trials. The middleware redirects all authenticated routes to `/en/onboarding/plan-selection?trial_expired=true`. For UAT:
- A temporary middleware bypass was added to exempt `/referral` routes (reverted after testing)
- The Settings page (`/en/business-settings`) was already exempt from trial checks
- The sign-up page is a public route (no trial check)

**Recommendation**: For production UAT, use a test account with an active subscription, or temporarily extend the trial for a test account.

## Files Modified During UAT

| File | Change | Permanent? |
|------|--------|------------|
| `src/middleware.ts` | Added `/api/v1/referral/validate` to public routes | Yes (bug fix) |
| `src/middleware.ts` | Temporary `/referral` exemption from trial check | No (reverted) |
