# UAT Test Cases: AR/AP Two-Level Tab Restructure

**Feature**: 015-ar-ap-tab-restructure
**Branch**: `015-ar-ap-tab-restructure`
**Date**: 2026-02-15
**Tester**: Claude Code (automated via Playwright MCP)
**Environment**: Local (`npm run dev` on port 3000 + `npx convex dev`)

## Prerequisites

1. **Start local dev server**: `npm run dev --port 3000`
2. **Start Convex dev server**: `npx convex dev`
3. **Ensure environment variables**: `.env.local` has all required keys
4. **Authenticate**: Log in via Clerk using test account `yeefei+test2@hellogroot.com`
5. **Test data**: Existing business with vendors, invoices, and debtors

---

## TC-001: Two-Level Tab Navigation (US1) — Critical

**User Story**: US1 — Two-Level Tab Navigation
**Priority**: Critical

### TC-001.1: Top-level AR/AP tabs render

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/en/invoices` | Page loads with two top-level tabs: "Account Receivables" and "Account Payables" |
| 2 | Verify AR tab is active by default | AR tab has active styling, AR sub-tabs are visible |

**Pass criteria**: Two top-level tabs visible, AR selected by default

### TC-001.2: AR sub-tabs render

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | With AR tab active, verify sub-tabs | Four sub-tabs visible: Dashboard, Sales Invoices, Debtors, Product Catalog |
| 2 | Default sub-tab is Dashboard | Dashboard sub-tab is active |

**Pass criteria**: All 4 AR sub-tabs visible with Dashboard active

### TC-001.3: AP sub-tabs render

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Account Payables" top-level tab | AP tab becomes active, AP sub-tabs appear |
| 2 | Verify AP sub-tabs | Four sub-tabs: Dashboard, Incoming Invoices, Vendors, Price Intelligence |

**Pass criteria**: All 4 AP sub-tabs visible after clicking AP tab

### TC-001.4: Hash routing updates on tab change

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click AR > Sales Invoices | URL hash changes to `#ar-sales` |
| 2 | Click AP top-level tab | URL hash changes to `#ap-dashboard` |
| 3 | Click AP > Vendors | URL hash changes to `#ap-vendors` |

**Pass criteria**: URL hash updates correctly on every tab change

### TC-001.5: Hash deep link navigation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate directly to `/en/invoices#ap-vendors` | Page loads with AP tab active, Vendors sub-tab selected |
| 2 | Navigate directly to `/en/invoices#ar-debtors` | Page loads with AR tab active, Debtors sub-tab selected |

**Pass criteria**: Direct hash navigation pre-selects correct tabs

### TC-001.6: Invalid hash fallback

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/en/invoices#invalid-hash` | Falls back to AR > Dashboard (default) |
| 2 | Navigate to `/en/invoices` (no hash) | Defaults to AR > Dashboard |

**Pass criteria**: Invalid or missing hash defaults to `ar-dashboard`

---

## TC-002: AR Sub-tab Content (US2) — Critical

**User Story**: US2 — AR Section with Sub-tabs
**Priority**: Critical

### TC-002.1: Sales Invoices loads

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click AR > Sales Invoices | Sales invoice list component renders |
| 2 | Verify content | Invoice list or empty state visible |

**Pass criteria**: Sales invoice component renders without errors

### TC-002.2: Debtors loads

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click AR > Debtors | Debtor list component renders |
| 2 | Verify content | Debtor list or empty state visible |

**Pass criteria**: Debtor list component renders without errors

### TC-002.3: Product Catalog loads

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click AR > Product Catalog | Catalog item manager component renders |
| 2 | Verify content | Catalog items or empty state visible |

**Pass criteria**: Catalog component renders without errors

---

## TC-003: AP Sub-tab Content (US3) — Critical

**User Story**: US3 — AP Section with Sub-tabs
**Priority**: Critical

### TC-003.1: AP Dashboard loads

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click AP > Dashboard | AP analytics dashboard renders |
| 2 | Verify content | Summary cards or analytics visible |

**Pass criteria**: AP Dashboard component renders with data or empty state

### TC-003.2: Incoming Invoices loads

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click AP > Incoming Invoices | Document processing container renders |
| 2 | Verify content | Document upload area or invoice list visible |

**Pass criteria**: Documents container renders without errors

### TC-003.3: Vendors loads

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click AP > Vendors | Vendor manager component renders |
| 2 | Verify content | Vendor list or empty state visible |

**Pass criteria**: Vendor manager renders without errors

---

## TC-004: AR Dashboard Analytics (US4) — High

**User Story**: US4 — AR Dashboard Analytics
**Priority**: High

### TC-004.1: Summary cards render

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/en/invoices#ar-dashboard` | AR Dashboard loads |
| 2 | Verify summary cards | Cards for Total Receivables, Overdue, Current, Active Debtors visible |

**Pass criteria**: 4 summary cards render with data or zero values

### TC-004.2: Aging breakdown table

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scroll to aging breakdown section | Aging table visible |
| 2 | Verify buckets | Columns: Current, 1-30, 31-60, 61-90, 90+ days |

**Pass criteria**: Aging breakdown table renders with correct bucket labels

---

## TC-005: Price Intelligence (US5) — High

**User Story**: US5 — Price Intelligence Tab
**Priority**: High

### TC-005.1: Empty state renders

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/en/invoices#ap-prices` | Price Intelligence tab loads |
| 2 | Verify initial state | Either vendor selector or empty state message visible |

**Pass criteria**: Price Intelligence renders without errors

### TC-005.2: Vendor selector works

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | If vendors exist, click vendor dropdown | Vendor list appears in dropdown |
| 2 | Select a vendor | Items list loads for selected vendor |

**Pass criteria**: Vendor selection triggers item list load

---

## TC-006: Payables Redirect & Sidebar (US6) — Critical

**User Story**: US6 — Remove Standalone Payables
**Priority**: Critical

### TC-006.1: Sidebar has no Payables link

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check sidebar navigation | No "Payables" link visible |
| 2 | Verify finance section | Only Dashboard, Invoices, Transactions visible |

**Pass criteria**: Payables link is absent from sidebar

### TC-006.2: Payables URL redirects

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/en/payables` | Redirects to `/en/invoices#ap-dashboard` |
| 2 | Verify final URL | URL is `/en/invoices#ap-dashboard` |
| 3 | Verify content | AP Dashboard is active and visible |

**Pass criteria**: `/en/payables` redirects to invoices page with AP dashboard

---

## TC-007: Tab Switching Persistence — Medium

**User Story**: Cross-cutting
**Priority**: Medium

### TC-007.1: Rapid tab switching

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click AR > Sales Invoices | Content loads |
| 2 | Click AP > Vendors | AP Vendors content loads |
| 3 | Click back to AR tab | AR Sales Invoices still selected (preserved) |

**Pass criteria**: Sub-tab selection preserved when switching top-level tabs
