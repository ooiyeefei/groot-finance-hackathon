# UAT Test Cases: In-App Referral Code System

**Feature**: 001-in-app-referral-code
**Branch**: `001-in-app-referral-code`
**Date**: 2026-03-08
**Tester**: Claude Code (automated via Playwright MCP)
**Environment**: Production (`https://finance.hellogroot.com`)

## Prerequisites

1. **Production deployed**: `npm run build` passed, `npx convex deploy --yes` completed
2. **Test accounts**: Admin (yeefei+test2), Manager (yeefei+manager1), Employee (yeefei+employee1)
3. **Stripe test mode**: Promotion codes work in test/live mode

## Test Cases

---

## TC-001: Earn Header Button Visibility

**User Story**: US1 - View and Share Referral Code
**Priority**: Critical

### TC-001.1: Header button visible for admin user

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in as admin (yeefei+test2) | Dashboard loads |
| 2 | Look at header toolbar (right side) | Gift icon with "$" badge visible between NotificationBell and FeedbackButton |
| 3 | Hover over the gift icon | Tooltip shows "Earn $ with referrals" |

**Pass criteria**: Gift icon with "$" badge is visible in header for admin user

---

## TC-002: Opt-In Flow (First-Time User)

**User Story**: US4 - Auto-Generate Referral Code on Opt-In
**Priority**: Critical

### TC-002.1: Navigate to referral page and see opt-in card

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click the Gift icon in header | Navigate to /en/referral page |
| 2 | Check page content | See opt-in card with "Start Earning with Referrals" heading |
| 3 | Verify program explanation | Shows "RM 80 - 500" earning range and "RM 100 off" for referred businesses |
| 4 | Verify button | "Start Referring" button visible with blue primary styling |

**Pass criteria**: Opt-in card renders correctly with program details

### TC-002.2: Opt in and generate referral code

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Start Referring" button | Button shows loading spinner "Setting up..." |
| 2 | Wait for code generation (< 2 seconds) | Code display replaces opt-in card |
| 3 | Verify code format | Code matches GR-FIN-XXXXX pattern (5+ uppercase alphanumeric chars) |
| 4 | Verify UI elements | "Copy Code", "Copy Link", and "Share" buttons visible |

**Pass criteria**: Referral code generated and displayed with action buttons

---

## TC-003: Code Display and Copy/Share

**User Story**: US1 - View and Share Referral Code
**Priority**: Critical

### TC-003.1: Copy code to clipboard

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Copy Code" button | Button text changes to "Copied!" with green check icon |
| 2 | Wait 2 seconds | Button reverts to "Copy Code" |

**Pass criteria**: Copy code button shows visual confirmation

### TC-003.2: Copy link to clipboard

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Copy Link" button | Button text changes to "Copied!" with green check icon |

**Pass criteria**: Copy link button shows visual confirmation

---

## TC-004: Referral Dashboard (Stats + List)

**User Story**: US3 - Track Referral Performance
**Priority**: High

### TC-004.1: Dashboard stats cards visible

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | View referral page after opt-in | 4 stats cards visible: Total Referrals, In Trial, Paying, Est. Earnings |
| 2 | Verify initial values | All values show 0 (no referrals yet) |

**Pass criteria**: Stats cards render with correct labels and zero values

### TC-004.2: Empty referral list

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scroll down on referral page | "No referrals yet" message visible |

**Pass criteria**: Empty state message shown when no referrals exist

---

## TC-005: Settings Tab - Referral

**User Story**: US1 - Secondary Access Point
**Priority**: High

### TC-005.1: Referral tab visible in Settings

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to /en/business-settings?tab=referral | Settings page loads with Referral tab selected |
| 2 | Verify tab content | Same referral dashboard as /en/referral page |

**Pass criteria**: Referral tab accessible in Settings for all users

---

## TC-006: Return Visit (Already Opted In)

**User Story**: US4 - Auto-Generate Referral Code on Opt-In
**Priority**: High

### TC-006.1: Returning user sees code directly

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to /en/referral | Page loads directly to code display (no opt-in card) |
| 2 | Verify same code | Same GR-FIN-XXXXX code as first opt-in |

**Pass criteria**: Previously generated code persists across sessions

---

## TC-007: Sign-Up Page Referral Badge

**User Story**: US6 - Referral Code Entry on Sign-Up Page
**Priority**: High

### TC-007.1: Referral badge on sign-up page with valid code

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to /en/sign-up?ref=GR-FIN-XXXXX (use actual code from TC-002) | Sign-up page loads |
| 2 | Wait for badge to appear | "Referred by [Business Name]" badge visible above sign-up form |
| 3 | Verify badge styling | Uses bg-card, border-border, rounded-full, Gift icon |

**Pass criteria**: Referral badge shows referrer name when valid code is in URL

### TC-007.2: No badge with invalid code

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to /en/sign-up?ref=INVALID-CODE | Sign-up page loads |
| 2 | Check for badge | No referral badge visible (invalid code) |

**Pass criteria**: No badge shown for invalid referral codes

---

## TC-008: Checkout Promotion Code Support

**User Story**: US2 - Checkout with Referral Attribution
**Priority**: Critical

### TC-008.1: Checkout allows promotion codes

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify checkout route has `allow_promotion_codes: true` | Code review verification (already confirmed in build) |

**Pass criteria**: Stripe checkout sessions created with promotion code support enabled

---

## TC-009: Responsive Design

**User Story**: US3 - Mobile Responsiveness
**Priority**: Medium

### TC-009.1: Referral page on mobile viewport

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Resize browser to 375x667 (iPhone SE) | Page adapts to mobile layout |
| 2 | Verify stats cards | 2-column grid on mobile |
| 3 | Verify action buttons | All buttons visible and tappable |

**Pass criteria**: All referral UI elements are usable on mobile viewports
