# UAT Results: DSPy CUA Integration — Pre-Deployment Regression

**Date**: 2026-03-15
**Target**: https://finance.hellogroot.com (Production)
**Account**: Admin (yeefei+test2@hellogroot.com)
**Purpose**: Verify existing e-invoice flow works before deploying DSPy backend changes
**Branch**: `001-dspy-cua-integration` (not yet deployed — this is a baseline regression test)

## Summary

| Status | Count |
|--------|-------|
| PASS   | 7     |
| FAIL   | 0     |
| BLOCKED| 0     |

**Overall Verdict: PASS**

## Test Results

### TC-001: Login and Dashboard Load (P1 - Critical) — PASS
- Login with admin credentials: successful
- Dashboard loaded with sidebar, AI Action Center (11 new insights), financial metrics
- All sidebar navigation items present: Dashboard, Invoices, Accounting, Expense Claims, Leave & Timesheet, Manager Approvals, Reporting & Exports, Settings
- Screenshot: `uat-tc001-dashboard.png`

### TC-002: Expense Claims Page Load (P1 - Critical) — PASS
- Page loaded with 31 total claims, 4 submissions
- Status filter tabs visible: All, Draft, Pending, Approved, Rejected, Reimbursed
- Summary cards: Total Claims (31), Pending Approval (0), Approved Amount ($52.00), Rejected (0)
- Submissions displayed with correct status badges (Reimbursed, Draft, Approved)
- Screenshot: `uat-tc002-expense-claims.png`

### TC-003: E-Invoice Status Visibility (P2 - High) — PASS
- Clicked into "99 SPEED MART SDN. BHD." claim (Reimbursed)
- E-Invoice section clearly visible with:
  - Status: "E-Invoice Received" (green badge)
  - Source: "Merchant Issued"
  - Requested: 10 Mar 2026, 03:02 pm
  - Received: 11 Mar 2026, 10:15 am
  - PDF attachment: `einvoice-jn73s28kwv.pdf` with "View PDF" button
  - "Replace E-Invoice" option available
- Line items rendered correctly (7 items, total RM52.00)
- Screenshot: `uat-tc003-einvoice-status.png`

### TC-004: Notification Bell (P2 - High) — PASS
- Notification panel opened with 41 notifications
- E-invoice notifications present and correctly categorized:
  - "E-Invoice Requested" (STERLING STATION, A M DYNAMIC, FamilyMart)
  - "E-Invoice Received" (from Shell via SES, from rgtech)
  - "E-Invoice Request Failed" (7-Eleven Malaysia)
  - "E-Invoice Request Confirmed"
- AI insight notifications also present (Cash Flow, Vendor Risk, Expense patterns)
- "Mark all read" and "Clear all" buttons functional
- Screenshot: `uat-tc004-notifications.png`

### TC-005: Business Settings / E-Invoice Config (P2 - High) — PASS
- Settings page loaded with all tabs: Business, Categories, Leave, Timesheet, Team, API Keys, Billing, Integrations, Referral, Privacy & Data, Profile
- E-Invoice Settings section visible (Early Access badge)
- Fields present: LHDN TIN, BRN, SST Registration, MSIC Code, LHDN Client ID, LHDN Client Secret, Peppol ID
- E-Invoice Email Forwarding: Verified status
- Auto self-billed e-invoice toggle available
- Screenshot: `uat-tc005-settings.png`

### TC-006: Expense Claim Detail View (P2 - High) — PASS
- Tested via TC-003 (same flow)
- Claim detail modal rendered with: vendor, amount, category, date, status, line items, e-invoice section
- Receipt image preview with zoom controls
- Business purpose and reference number displayed

### TC-007: Navigate Core Pages (P3 - Medium) — PASS
- **Invoices**: AR dashboard loaded with debtor aging table, receivables (RM3,053.00), tabs for Sales Invoices, Debtors, Product Catalog, Reconciliation
- **Accounting**: Dashboard loaded with Revenue (RM2,859.00), Expenses (RM6,648.30), tabs for Journal Entries, Chart of Accounts, Periods, Bank Recon
- No console errors beyond pre-existing Clerk deprecation warnings
- Screenshot: `uat-tc007-accounting.png`

## Console Errors Observed

All pre-existing, not related to our changes:
- `Failed to load resource: /api/v1/users/role` (401 — pre-existing auth timing issue)
- `[CacheUtils] Error fetching role data` (consequence of above)
- `Clerk: The prop "afterSignInUrl" is deprecated` (Clerk v6.30.0 deprecation warning)

## Fixes Applied
None needed — all tests passed.

## Notes

- This is a **pre-deployment regression test**. The DSPy backend changes (Python Lambda + Convex functions) are NOT deployed to production yet.
- All changes are backend-only (no frontend modifications), so this test confirms the existing UI is stable and ready for the backend deployment.
- After deploying, the real DSPy validation will be: trigger an e-invoice form fill, then check CloudWatch logs for `[DSPy]`, `[Tier 0]`, `[Tier 0.5]` markers and verify `dspyModuleVersion` in Convex `einvoice_request_logs`.
