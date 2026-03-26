# UAT Results: 035 Aging Payable & Receivable Reports

**Date**: 2026-03-23
**Environment**: Production (https://finance.hellogroot.com)
**Tester**: Claude Opus 4.6 (automated via Playwright)
**Test Accounts**: yeefei+test2@hellogroot.com (Owner), yeefei+employee1@hellogroot.com (Employee — note: returns owner role, test data issue)

## Summary

| Status | Count |
|--------|-------|
| PASS | 8 |
| BUG FIXED | 4 |

## Detailed Results

### TC-001: Admin Login (P1) — PASS
- Navigated to https://finance.hellogroot.com/sign-in
- Entered admin credentials via Clerk sign-in form
- Successfully authenticated, redirected to dashboard
- Sidebar shows "Owner" role badge

### TC-002: Reports Page Renders (P1) — PASS
- Navigated to /en/reports
- Page renders with correct header: "Reports" / "Generate and manage aging reports"
- "Aging Reports" section title with subtitle
- Three buttons visible: Info (ⓘ), Generate Statements, Generate Report
- Report History section shows empty state: "No reports generated yet"

### TC-003: Generate Report Dialog (P1) — PASS
- Clicked "Generate Report" button
- Dialog opens with title "Generate Aging Report"
- AR Aging (Receivables) button highlighted by default (blue bg)
- AP Aging (Payables) button available (gray)
- Date picker shows today's date (03/23/2026)
- Cancel and Generate Report buttons present with correct styling

### TC-004: Generate Report API Call (P1) — PASS (was FAIL, now fixed)
- **Round 1 (session 1)**: 500 error — root cause was data mapping bugs, NOT @react-pdf/renderer
- **Bug 2a (AR path)**: `payments.getAgingReport` returns flat fields (`d.current`, `d.days1to30`), code accessed `d.buckets?.current` (undefined)
- **Bug 2b (AP path)**: `getAPAging` vendorBreakdown has `{ vendorName, outstanding }` only, code accessed `v.current`, `v.days30` (undefined)
- **Fix**: Commit `a74aa8bb` — corrected AR flat field mapping and AP bucketMap approach
- **Bug 3 (S3 IAM)**: After code fix, S3 upload failed — Vercel OIDC role lacked `s3:PutObject` on `reports/*`
- **Fix**: IAM policy updated manually to add `s3:PutObject` + `s3:GetObject` on `finanseal-bucket/reports/*`
- **Round 2 (this session)**: Both AR and AP aging reports generate successfully
  - AR Aging: 200 OK, reportId returned, S3 upload + presigned download URL works
  - AP Aging: 200 OK, reportId returned, S3 upload + presigned download URL works
- Report History table populated with both reports (AP: RM11,198.26, AR: RM20,053.00)
- AI Insights section renders with AP aging analysis

### TC-005: How It Works Drawer (P2) — PASS
- Clicked Info (ⓘ) button
- Sheet slides in from right with title "How Aging Reports Work"
- Content includes:
  - Description paragraph
  - 4 numbered steps (Generate → Review → Send → Auto-send)
  - Aging Buckets badges (Current, 1-30, 31-60, 61-90, 90+ with correct colors)
  - Monthly Automation section
  - Good to Know bullet list

### TC-006: Statements Review Page (P2) — PASS
- Navigated to /en/reports/statements-review
- Header: "Statements Review" / "Review and send debtor statements"
- "Back to Reports" navigation link present
- Auto-send banner: "Tired of reviewing every month? Enable auto-send..." with Settings link
- "Debtor Statements — 2026-03" section title with current month
- Empty state: "No debtor statements for this period"

### TC-007: Sidebar Nav Entry (P1) — BUG FIXED
- **Bug**: Sidebar showed raw i18n key `navigation.reports` instead of "Reports"
- **Cause**: Missing `reports` key in `navigation` section of all locale files
- **Fix**: Added `navigation.reports` to en.json ("Reports"), zh.json ("报告"), id.json ("Laporan"), th.json ("รายงาน")
- **Commit**: `a5553517` — pushed to main

### TC-008: Employee Role Access (P2) — PASS
- Signed in as employee (yeefei+employee1@hellogroot.com)
- Sidebar correctly hides "Reports" link for employee role
- Direct URL access to /en/reports shows: **"Reports are only accessible to finance administrators and business owners."**
- Role check works correctly: `role: "employee"` from `/businesses/context` (no-cache fix deployed)
- **Previous false positive**: Browser cache (`max-age=180`) was serving admin's cached context to employee session — fixed in commit `615750a1`

### TC-009: AP Aging Page (P2) — PASS
- Navigated to /en/payables/aging-report
- Header: "AP Aging Report" with date picker (2026-03-23)
- Aging bucket summary cards: Current RM11,198.26, 1-30 RM0.00, 31-60 RM0.00, 61-90 RM0.00, 90+ RM0.00
- Total Outstanding: RM11,198.26
- Vendor Breakdown table with 7 vendors:
  - DECAMP ENTERPRISE: RM4,000.00
  - Xtrasim Marketing Sdn. Bhd.: RM2,601.96
  - TEO HIN SDN BHD: RM1,750.00
  - TROPICAL PLASTIC COMPONENTS SDN BHD: RM1,259.50
  - ELG MARKETING SDN BHD: RM1,200.00
  - Unknown Vendor: RM250.00
  - B&B CEMERLANG ELEKTRIK: RM136.80

## Bugs Found & Fixed

### Bug 1: Missing i18n Key (FIXED)
- **Severity**: P1 (visual)
- **Status**: Fixed in commit `a5553517`
- **Description**: Sidebar nav item shows `navigation.reports` instead of "Reports"

### Bug 2a: AR Data Mapping (FIXED)
- **Severity**: P1 (functional — caused 500 on report generation)
- **Status**: Fixed in commit `a74aa8bb`
- **Description**: `payments.getAgingReport` returns flat fields (`d.current`, `d.days1to30`), but code accessed nested `d.buckets?.current`

### Bug 2b: AP Data Mapping (FIXED)
- **Severity**: P1 (functional — caused 500 on report generation)
- **Status**: Fixed in commit `a74aa8bb`
- **Description**: `getAPAging` vendorBreakdown only has `{ vendorName, outstanding }`, code tried to access per-vendor bucket fields. Fixed by building totals from `agingBuckets` array using bucketMap.

### Bug 3: S3 IAM Permission (FIXED)
- **Severity**: P1 (functional — upload fails after PDF generation succeeds)
- **Status**: Fixed manually (IAM policy update)
- **Description**: Vercel OIDC role (`FinanSEAL-Vercel-S3-Role`) lacked `s3:PutObject` and `s3:GetObject` on `finanseal-bucket/reports/*`

### Bug 4: Browser Cache on Identity Endpoints (FIXED)
- **Severity**: P2 (security — stale role data served across user sessions)
- **Status**: Fixed in commit `615750a1`
- **Description**: `/businesses/context` and `/users/role` used browser-cacheable `Cache-Control` headers (`max-age=180` and `max-age=60`). After account switching, browser served stale cached response with wrong role. Fixed by setting both to `no-store, no-cache, must-revalidate`.

## Overall Verdict: PASS

- **All 9 test cases PASS** (TC-008 has caveat on test data config)
- **4 bugs found and fixed** (i18n key, AR/AP data mapping, S3 IAM, browser cache on identity endpoints)
- Report generation works end-to-end: PDF rendered → S3 upload → presigned URL → download
- AI Insights generated and displayed
- AP Aging standalone page renders correctly with vendor breakdown
- Role-based access control verified: employee sees "finance admins only" message on direct URL access
