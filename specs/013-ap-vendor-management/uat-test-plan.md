# UAT Test Plan: Smart AP Vendor Management

**Feature Branch**: `013-ap-vendor-management`
**Date**: 2026-02-14
**Spec Reference**: `specs/013-ap-vendor-management/spec.md`
**Tasks Reference**: `specs/013-ap-vendor-management/tasks.md`

---

## Overview

This document defines end-to-end UAT test scenarios for the Smart AP Vendor Management feature. The feature spans 10 user stories across backend (Convex functions, cron), frontend (dashboard, components, hooks), and cross-domain integration (invoice review enhancement).

**Test Environment**: Production Convex deployment (`kindhearted-lynx-129.convex.cloud`) + Next.js app
**Access Level Required**: `finance_admin` role (Payables page is admin-only)
**Home Currency**: Use the business's configured home currency (typically SGD for test business)

---

## Prerequisites & Test Data Setup

### P1: Login & Role Verification

1. Sign in as a user with `finance_admin` role
2. Verify the sidebar shows "Payables" nav item (Wallet icon) in the Finance group, after "Transactions"
3. Non-admin users should NOT see the Payables nav item

### P2: Create Test Vendors

Create at least 4 vendors in the system with the following profiles:

| Vendor | Payment Terms | Custom Days | Currency | Notes |
|--------|--------------|-------------|----------|-------|
| Alpha Supplies Pte Ltd | Net 30 | — | SGD | Main office supplier |
| Beta Logistics Sdn Bhd | Net 60 | — | MYR | Logistics partner |
| Gamma Materials | Custom | 45 | SGD | Raw materials |
| Delta Services | Due on Receipt | — | USD | Consulting |

### P3: Create Test Accounting Entries (Payables)

Create Expense/COGS accounting entries to cover various test scenarios:

| # | Vendor | Type | Amount | Currency | Transaction Date | Due Date | Status |
|---|--------|------|--------|----------|-----------------|----------|--------|
| 1 | Alpha Supplies | Expense | 1,200.00 | SGD | 2026-01-15 | 2026-02-14 | pending |
| 2 | Alpha Supplies | COGS | 3,500.00 | SGD | 2025-12-01 | 2025-12-31 | overdue |
| 3 | Alpha Supplies | Expense | 800.00 | SGD | 2026-02-10 | 2026-03-12 | pending |
| 4 | Beta Logistics | Expense | 5,200.00 | MYR | 2025-11-15 | 2026-01-14 | overdue |
| 5 | Beta Logistics | COGS | 2,800.00 | MYR | 2026-01-20 | 2026-03-21 | pending |
| 6 | Gamma Materials | COGS | 15,000.00 | SGD | 2026-01-05 | 2026-02-19 | pending |
| 7 | Gamma Materials | COGS | 8,750.00 | SGD | 2025-10-01 | 2025-11-15 | overdue |
| 8 | Delta Services | Expense | 4,000.00 | USD | 2026-02-14 | 2026-02-14 | pending |
| 9 | (No vendor) | Expense | 650.00 | SGD | 2026-01-25 | 2026-02-24 | pending |
| 10 | Alpha Supplies | Expense | 2,000.00 | SGD | 2025-09-01 | 2025-10-01 | paid |

### P4: Prepare Price History Data (for US7/US8)

If the vendor_price_history table supports manual entries, create:

| Vendor | Item Description | Unit Price | Currency | Date |
|--------|-----------------|------------|----------|------|
| Alpha Supplies | A4 Paper 500 sheets | 10.00 | SGD | 2025-11-01 |
| Alpha Supplies | A4 Paper 500 sheets | 10.00 | SGD | 2025-12-01 |
| Alpha Supplies | A4 Paper 500 sheets | 10.50 | SGD | 2026-01-01 |
| Beta Logistics | A4 Paper 500 sheets | 9.00 | SGD | 2025-12-15 |
| Gamma Materials | Steel Rod 6mm | 25.00 | SGD | 2025-11-01 |
| Gamma Materials | Steel Rod 6mm | 25.00 | SGD | 2025-12-01 |

---

## Test Suite 1: Navigation & Access Control

### TC-1.1: Sidebar Navigation Visibility (Admin)

**Precondition**: Logged in as `finance_admin`
**Steps**:
1. Observe the sidebar navigation
2. Look for "Payables" item with Wallet icon in the Finance group

**Expected**: "Payables" appears after "Transactions" in the Finance section
**Pass Criteria**: Nav item visible, correct icon, correct position

### TC-1.2: Sidebar Navigation Hidden (Non-Admin)

**Precondition**: Logged in as employee-only user (not manager, not finance_admin)
**Steps**:
1. Observe the sidebar navigation

**Expected**: "Payables" does NOT appear in the sidebar
**Pass Criteria**: Nav item is not rendered for non-admin users

### TC-1.3: Payables Page Access (Admin)

**Precondition**: Logged in as `finance_admin`
**Steps**:
1. Click "Payables" in the sidebar
2. Observe page loads

**Expected**: Page loads with header "Payables" / subtitle "Accounts Payable & Vendor Management". AP Dashboard renders with summary cards, aging table, upcoming payments, and analytics widgets.
**Pass Criteria**: Page loads without errors, all sections visible

### TC-1.4: Payables Page Access Redirect (Non-Admin)

**Precondition**: Logged in as employee-only user
**Steps**:
1. Navigate directly to `/en/payables` via URL bar

**Expected**: User is redirected to `/en/expense-claims` (access denied redirect)
**Pass Criteria**: Redirect occurs, no error page

---

## Test Suite 2: AP Dashboard — Summary Cards (US9)

### TC-2.1: Summary Card Values

**Precondition**: Test data from P3 exists
**Steps**:
1. Navigate to Payables dashboard
2. Observe the 4 summary cards at the top

**Expected**:
- **Total Outstanding**: Sum of all pending + overdue entries (in home currency). Should include entries #1-9 (excluding #10 which is paid).
- **Amount Overdue**: Sum of all overdue entries (#2, #4, #7) in home currency
- **Due This Week**: Sum of entries with dueDate within next 7 days from today, in home currency
- **Due This Month**: Sum of entries with dueDate within next 30 days from today, in home currency

**Pass Criteria**: All 4 cards display correct amounts in home currency format (e.g., "SGD 12,345.00"). Loading skeleton shown while data loads.

### TC-2.2: Summary Cards Loading State

**Steps**:
1. Hard-refresh the Payables page
2. Observe the brief loading state

**Expected**: Summary cards show loading skeleton/pulse animation before data appears
**Pass Criteria**: No layout shift, smooth transition from loading to data

---

## Test Suite 3: Vendor-Level Creditor Aging (US2)

### TC-3.1: Aging Table Renders with Correct Vendors

**Precondition**: Test data from P3 exists
**Steps**:
1. Navigate to Payables dashboard
2. Scroll to the Vendor Aging Table section

**Expected**: Table shows rows for:
- Alpha Supplies Pte Ltd
- Beta Logistics Sdn Bhd
- Gamma Materials
- Delta Services
- Unassigned Vendor (for entry #9)
- Totals row at bottom

Each row has columns: Vendor Name, Current, 1-30, 31-60, 61-90, 90+, Total Outstanding

**Pass Criteria**: All vendors with outstanding entries are listed. "Unassigned Vendor" row present for vendorless entries. Totals row sums all vendors.

### TC-3.2: Aging Bucket Classification

**Steps**:
1. Examine each vendor row's bucket allocations

**Expected**: Entries are classified based on their dueDate relative to today:
- Current = not yet overdue (dueDate >= today)
- 1-30 = overdue by 1-30 days
- 31-60 = overdue by 31-60 days
- etc.

Specifically for the test data (relative to 2026-02-14):
- Entry #1 (Alpha, due 2026-02-14) → Current (due today)
- Entry #2 (Alpha, due 2025-12-31) → 31-60 bucket (45 days overdue)
- Entry #3 (Alpha, due 2026-03-12) → Current (not yet due)
- Entry #4 (Beta, due 2026-01-14) → 31-60 bucket (31 days overdue)
- Entry #7 (Gamma, due 2025-11-15) → 90+ bucket (91 days overdue)

**Pass Criteria**: Buckets match expected classification. Overdue buckets use risk-based coloring (green for current, amber/orange/red for increasing overdue)

### TC-3.3: Aging Table Color Coding

**Steps**:
1. Observe the color of amounts in each aging bucket

**Expected**:
- Current bucket: neutral/green styling
- 1-30 days: amber/yellow styling
- 31-60 days: orange styling
- 61-90 days: dark orange styling
- 90+ days: red/destructive styling

**Pass Criteria**: Visual distinction between buckets. Overdue amounts clearly stand out.

### TC-3.4: Vendor Drilldown

**Steps**:
1. Click on the "Alpha Supplies Pte Ltd" row in the aging table
2. Observe the drilldown modal/panel that opens

**Expected**: Modal shows individual unpaid bills for Alpha Supplies:
- Entry #1: SGD 1,200.00, due 2026-02-14
- Entry #2: SGD 3,500.00, due 2025-12-31 (overdue)
- Entry #3: SGD 800.00, due 2026-03-12

Columns: Reference, Amount, Transaction Date, Due Date, Days Overdue/Remaining, Status
Sorted by due date ascending.
Each row has a "Record Payment" button.

**Pass Criteria**: Correct entries shown, sorted correctly, payment action available

### TC-3.5: Unassigned Vendor Drilldown

**Steps**:
1. Click on the "Unassigned Vendor" row
2. Observe the drilldown

**Expected**: Shows entry #9 (SGD 650.00, no vendor assigned)
**Pass Criteria**: Entry without vendorId appears here. Totals reconcile.

### TC-3.6: Close Drilldown

**Steps**:
1. Open a vendor drilldown
2. Click the close/X button

**Expected**: Drilldown modal closes, returns to aging table view
**Pass Criteria**: Clean close with no state leakage

### TC-3.7: Empty State

**Precondition**: All entries are paid (no outstanding payables)
**Steps**:
1. Navigate to Payables dashboard (with no outstanding entries)

**Expected**: Aging table shows an empty state message (e.g., "No outstanding payables")
**Pass Criteria**: Graceful empty state, no broken table rendering

---

## Test Suite 4: Upcoming Payments (US3)

### TC-4.1: Default Period Filter (7 Days)

**Steps**:
1. Navigate to Payables dashboard
2. Scroll to the Upcoming Payments section
3. Verify the default filter is 7 days

**Expected**: Only entries with dueDate within 7 days from today are shown. Overdue entries appear at the top with visual overdue indicator.

**Pass Criteria**: Correct entries displayed for 7-day window

### TC-4.2: Period Filter — 14 Days

**Steps**:
1. Click the "14 days" filter button

**Expected**: Entries with dueDate within 14 days from today shown. More entries than 7-day filter. Still sorted with overdue first, then by due date soonest.

**Pass Criteria**: Filter updates correctly. Entry count increases.

### TC-4.3: Period Filter — 30 Days

**Steps**:
1. Click the "30 days" filter button

**Expected**: All entries due within 30 days shown, plus all overdue entries. Maximum coverage.

**Pass Criteria**: Broadest set of entries displayed

### TC-4.4: Overdue Entry Styling

**Steps**:
1. Observe any overdue entry in the upcoming payments table

**Expected**: Overdue entries have:
- Destructive/red text for days overdue
- "Overdue" badge or indicator
- Appear at the top of the list (before upcoming entries)

**Pass Criteria**: Clear visual distinction between overdue and upcoming

### TC-4.5: Multi-Currency Display

**Steps**:
1. Find entry #4 (Beta Logistics, MYR 5,200.00) or entry #8 (Delta Services, USD 4,000.00)

**Expected**: Entry shows both original currency amount AND home currency equivalent
**Pass Criteria**: Both amounts displayed correctly with proper currency formatting

### TC-4.6: Record Payment from Upcoming Payments

**Steps**:
1. Click "Pay" or "Record Payment" button on an entry in the upcoming payments table
2. Observe the payment dialog opens

**Expected**: Payment recorder dialog opens with the entry context (see Test Suite 6)
**Pass Criteria**: Dialog opens with correct entry pre-filled

### TC-4.7: Empty State

**Precondition**: No bills due in the selected period
**Steps**:
1. Select a period with no upcoming payments

**Expected**: Empty state message: "No payments due in the next X days"
**Pass Criteria**: Graceful empty state

---

## Test Suite 5: Vendor Profile & Payment Terms (US1)

### TC-5.1: View Vendor Profile Panel

**Precondition**: Vendor profile panel component is accessible (from AP dashboard drilldown or standalone)
**Steps**:
1. Open a vendor profile (e.g., Alpha Supplies)
2. Observe the profile fields

**Expected**: Profile shows:
- Vendor name
- Payment terms dropdown (Net 30 for Alpha)
- Default currency
- Contact person
- Website
- Notes
- Bank details section (masked)
- Outstanding summary (count + amount)

**Pass Criteria**: All fields render with saved values

### TC-5.2: Edit Payment Terms

**Steps**:
1. Open Alpha Supplies vendor profile
2. Change payment terms from "Net 30" to "Net 60"
3. Click Save

**Expected**: Payment terms update is saved. Profile refreshes showing "Net 60". Toast/confirmation shown.

**Pass Criteria**: Data persists across page refreshes

### TC-5.3: Custom Payment Terms Validation

**Steps**:
1. Open a vendor profile
2. Select "Custom" from payment terms dropdown
3. Observe that a "Custom Days" input field appears
4. Enter 45 days
5. Save

**Expected**: Custom days field appears when "Custom" is selected. Value saves correctly.

**Pass Criteria**: Custom days field visibility toggles correctly. Validation: custom days must be > 0.

### TC-5.4: Bank Details Masking

**Steps**:
1. Open a vendor profile that has bank details set
2. Observe the bank details section

**Expected**: Account number shows as "****1234" (last 4 digits). Routing code shows as "****5678" (last 4 digits). Bank name and account holder name are visible.

**Pass Criteria**: Sensitive fields masked by default

### TC-5.5: Bank Details Reveal

**Steps**:
1. Click on the masked bank details (or "Show" button)

**Expected**: Full account number and routing code are revealed
**Pass Criteria**: Click-to-reveal works. Full values displayed after click.

### TC-5.6: Vendor Context — Outstanding Summary

**Steps**:
1. Open Alpha Supplies vendor profile

**Expected**: Outstanding summary shows:
- Number of unpaid entries (3 entries from test data: #1, #2, #3)
- Total outstanding amount (SGD 5,500.00)
- Suggested due date based on payment terms

**Pass Criteria**: Counts and amounts are correct

---

## Test Suite 6: Quick Payment Recording (US4)

### TC-6.1: Open Payment Dialog from Drilldown

**Steps**:
1. Open vendor aging drilldown for Alpha Supplies
2. Click "Record Payment" on entry #1 (SGD 1,200.00 pending)
3. Observe the payment dialog

**Expected**: Dialog opens with:
- Amount field pre-filled with SGD 1,200.00 (full outstanding balance)
- Payment date defaulting to today (2026-02-14)
- Payment method dropdown (bank_transfer, cash, cheque, card, other)
- Optional notes field
- Entry context shown: vendor name, reference, original amount, outstanding balance

**Pass Criteria**: All fields pre-filled correctly

### TC-6.2: Full Payment Recording

**Steps**:
1. Keep amount at SGD 1,200.00 (full balance)
2. Select payment method "bank_transfer"
3. Click "Record Payment"

**Expected**:
- Entry #1 status changes from "pending" to "paid"
- Entry disappears from vendor aging table (outstanding view)
- Entry disappears from upcoming payments
- Summary card "Total Outstanding" decreases by SGD 1,200.00
- Toast confirmation shown

**Pass Criteria**: Status changed, removed from all outstanding views, totals updated

### TC-6.3: Partial Payment Recording

**Steps**:
1. Open payment dialog for entry #2 (SGD 3,500.00 overdue)
2. Change amount to SGD 1,500.00
3. Select payment method "cash"
4. Click "Record Payment"

**Expected**:
- Entry #2 status remains "overdue"
- Outstanding balance reduces from SGD 3,500.00 to SGD 2,000.00
- Payment recorded in payment history
- Entry remains visible in aging table / drilldown with updated amount
- Summary card "Total Outstanding" decreases by SGD 1,500.00

**Pass Criteria**: Partial payment correctly reduces balance. Status unchanged. Entry still visible.

### TC-6.4: Payment Amount Validation — Zero

**Steps**:
1. Open payment dialog
2. Enter amount as 0
3. Attempt to submit

**Expected**: Validation error — amount must be greater than 0
**Pass Criteria**: Form does not submit. Error message displayed.

### TC-6.5: Payment Amount Validation — Exceeds Outstanding

**Steps**:
1. Open payment dialog for an entry with SGD 2,000.00 outstanding
2. Enter amount as SGD 2,500.00
3. Attempt to submit

**Expected**: Validation error — amount cannot exceed outstanding balance
**Pass Criteria**: Form does not submit. Error message displayed.

### TC-6.6: Payment Date Default

**Steps**:
1. Open payment dialog
2. Do NOT change the payment date

**Expected**: Payment date defaults to today's date
**Pass Criteria**: Today's date pre-filled

### TC-6.7: Cancel Payment Dialog

**Steps**:
1. Open payment dialog
2. Click "Cancel" or close button

**Expected**: Dialog closes. No payment recorded. No data changes.
**Pass Criteria**: Clean cancellation

---

## Test Suite 7: Overdue Auto-Detection (US5)

### TC-7.1: Cron Job Registration

**Steps**:
1. Open the Convex dashboard
2. Navigate to the Crons section
3. Find "mark-overdue-payables"

**Expected**: Cron is registered with schedule: daily at { hourUTC: 0, minuteUTC: 5 }
**Pass Criteria**: Cron exists and is active

### TC-7.2: Overdue Detection Logic

**Precondition**: Create a pending Expense entry with dueDate = yesterday
**Steps**:
1. Trigger the `markOverduePayables` internal mutation manually from Convex dashboard (or wait for cron)
2. Check the entry's status

**Expected**: Entry status changes from "pending" to "overdue"
**Pass Criteria**: Status updated correctly

### TC-7.3: Pending Entry NOT Marked Overdue (Future Due Date)

**Precondition**: Entry with dueDate = tomorrow, status = pending
**Steps**:
1. Run the overdue detection

**Expected**: Entry status remains "pending" (not yet due)
**Pass Criteria**: Entry unaffected

### TC-7.4: Paid Entry NOT Affected

**Precondition**: Entry #10 (paid, due date in the past)
**Steps**:
1. Run the overdue detection

**Expected**: Entry #10 remains "paid" — detection only targets "pending" entries
**Pass Criteria**: Paid entries are not modified

### TC-7.5: Action Center Insight Generated

**Steps**:
1. After overdue detection marks entries, check Action Center / insights

**Expected**: An insight is generated summarizing newly overdue count and total amount (e.g., "3 bills totaling SGD X are now overdue")
**Pass Criteria**: Insight created with correct category ("deadline") and priority ("high")

---

## Test Suite 8: Vendor Spend Analytics (US6)

### TC-8.1: Top Vendors Chart Renders

**Steps**:
1. Navigate to Payables dashboard
2. Scroll to the Top Vendors section

**Expected**: Horizontal bar chart showing vendors ranked by total spend. Each bar shows vendor name, spend amount, transaction count, and % of total.

**Pass Criteria**: Chart renders. Data matches sum of Expense/COGS entries per vendor (paid + pending + overdue, excludes cancelled/disputed).

### TC-8.2: Spend Trend Chart Renders

**Steps**:
1. Scroll to the Spend Trend section

**Expected**: Monthly bar chart showing spend aggregation for the last 12 months. X-axis: months (e.g., "Mar 25", "Apr 25" ... "Feb 26"). Y-axis: spend amount in home currency.

**Pass Criteria**: Chart renders with correct monthly data points. Hover shows tooltip with month and amount.

### TC-8.3: Category Breakdown Renders

**Steps**:
1. Scroll to the Category Breakdown section

**Expected**: Chart/table showing spend by expense category. Each category shows total spend and percentage of total.

**Pass Criteria**: Categories match actual entry categories. Percentages sum to ~100%.

### TC-8.4: Period Filter Changes Analytics

**Steps**:
1. Note the current data displayed (default period)
2. Change the period filter (e.g., from 90 days to 30 days)

**Expected**: All analytics charts update to reflect only the selected period. Rankings may change. Totals decrease (shorter window = fewer entries).

**Pass Criteria**: Data refreshes correctly for each period option (30/90/365 days).

### TC-8.5: Cancelled/Disputed Entries Excluded

**Precondition**: Create a cancelled Expense entry for Alpha Supplies
**Steps**:
1. View spend analytics

**Expected**: The cancelled entry does NOT appear in top vendors, category breakdown, or spend trend
**Pass Criteria**: Only paid + pending + overdue entries counted

---

## Test Suite 9: Price Intelligence & Cross-Vendor Comparison (US7 + US8)

> Note: These tests require pre-existing vendor_price_history data (see P4 setup). Price intelligence alerts appear during invoice review and in dedicated price intelligence components.

### TC-9.1: Price Alert Badge — Warning Level

**Precondition**: Price history exists for "A4 Paper 500 sheets" from Alpha Supplies at SGD 10.00 (2+ observations). New invoice has this item at SGD 11.50 (15% increase).
**Steps**:
1. Process an invoice from Alpha Supplies with "A4 Paper 500 sheets" at SGD 11.50
2. View the price alert badge next to the line item

**Expected**: Warning-level badge showing "+15% vs last order" in amber/warning color
**Pass Criteria**: Badge appears with correct percentage and color coding

### TC-9.2: Price Alert Badge — Info Level

**Precondition**: Price increased by 6% (above 5% info threshold, below 10% warning for SGD)
**Steps**:
1. Process invoice with item at SGD 10.60 (6% increase from SGD 10.00 baseline)

**Expected**: Info-level badge in blue color
**Pass Criteria**: Correct threshold tier applied

### TC-9.3: Insufficient Data — No Alert

**Precondition**: Item with fewer than 2 historical price observations
**Steps**:
1. Process invoice with a new item that has 0-1 historical prices

**Expected**: No price alert badge shown for that line item
**Pass Criteria**: Component gracefully hides when insufficient data

### TC-9.4: Cross-Vendor Comparison Note

**Precondition**: "A4 Paper 500 sheets" — Alpha Supplies at SGD 10.50, Beta Logistics at SGD 9.00
**Steps**:
1. View an invoice from Alpha Supplies with this item

**Expected**: Comparison note appears: "Beta Logistics Sdn Bhd offers this for ~14% less" (or similar)
**Pass Criteria**: Cheaper vendor identified correctly. Percentage accurate.

### TC-9.5: No Comparison When Cheapest

**Precondition**: Vendor is already the cheapest for an item
**Steps**:
1. View an invoice from the cheapest vendor

**Expected**: No "cheaper alternative" note shown
**Pass Criteria**: Comparison note hidden

### TC-9.6: Currency-Specific Thresholds (IDR)

**Precondition**: Create price history in IDR with 12% increase
**Steps**:
1. Process IDR invoice with 12% price increase

**Expected**: Info-level alert (IDR uses elevated thresholds: 8%/15%/25%). 12% is above info (8%) but below warning (15%).
**Pass Criteria**: IDR thresholds applied correctly, not SGD thresholds

---

## Test Suite 10: Enhanced Invoice Review (US10)

### TC-10.1: Vendor Context Note in Documents List

**Precondition**: OCR-processed invoice from Alpha Supplies (vendor_name extracted)
**Steps**:
1. Navigate to the Invoices page
2. Find a completed document from Alpha Supplies
3. Look at the "Extracted Information" section

**Expected**: Below the extracted info tags, a vendor context bar appears showing:
- Vendor name (matched from OCR): "Alpha Supplies Pte Ltd"
- Payment terms (if set): "Net 30"
- Outstanding info: "X unpaid — SGD Y outstanding"

**Pass Criteria**: Vendor matched by name. Context data is accurate. Bar only appears when vendor is matched.

### TC-10.2: Vendor Context Note — No Match

**Precondition**: Document with vendor_name that doesn't match any vendor in the system
**Steps**:
1. Find a document whose extracted vendor name doesn't match any existing vendor

**Expected**: No vendor context note appears (graceful fallback)
**Pass Criteria**: No errors, no broken UI

### TC-10.3: "Create Payable" Button Label

**Precondition**: Completed document not yet linked to an accounting entry
**Steps**:
1. Click "Create Record" on a completed invoice document
2. Observe the accounting entry form modal

**Expected**: The primary action button reads **"Create Payable"** (not "Create Record")
**Pass Criteria**: Label is "Create Payable" when source_document_type is "invoice"

### TC-10.4: Due Date Pre-Populated from OCR

**Precondition**: Invoice with a due date extracted by OCR
**Steps**:
1. Open the "Create Payable" form from an OCR'd invoice
2. Check the Due Date field

**Expected**: Due Date field is visible (not hidden) and pre-populated with the OCR-extracted due date. The field is editable.
**Pass Criteria**: Due date field shown for pending payables. Value from OCR takes precedence.

### TC-10.5: Due Date Default — 30 Days Fallback

**Precondition**: Invoice with NO due date extracted by OCR and vendor has no payment terms set
**Steps**:
1. Open "Create Payable" from an invoice where OCR did not extract due_date
2. Check the Due Date field

**Expected**: Due Date is set to transaction_date + 30 days (default fallback)
**Pass Criteria**: 30-day default applied when no other source provides due date

### TC-10.6: Due Date Field Visibility for Payable Creation

**Steps**:
1. Open "Create Payable" form from an invoice
2. Observe that transaction_type is "Cost of Goods Sold" or "Expense"
3. Observe that status is "pending"

**Expected**: Due Date field is VISIBLE (previously it was only shown for "overdue" status). This is a new behavior for invoice-sourced payables.
**Pass Criteria**: Due Date field rendered for pending + overdue + invoice-sourced Expense/COGS entries

### TC-10.7: Invoice Review Does NOT Break Existing Flows

**Steps**:
1. Upload a new invoice document
2. Wait for OCR processing to complete
3. Click "Create Payable"
4. Fill out form and submit
5. Verify accounting entry is created
6. Verify document shows "Record Created" badge
7. Navigate to Accounting page and find the entry

**Expected**: Full end-to-end invoice → payable flow works as before, with the new enhancements (vendor context, due date, relabeled button) layered on top. No regressions in existing functionality.
**Pass Criteria**: Entry created successfully. Document linked. No errors.

---

## Test Suite 11: Dashboard Layout & Responsiveness (US9)

### TC-11.1: Dashboard Widget Layout

**Steps**:
1. Navigate to Payables dashboard on a desktop browser (>= 1024px width)

**Expected Layout**:
- Row 1: 4 Summary Cards (horizontal row)
- Row 2: Vendor Aging Table (full width)
- Row 3: Two-column grid — Upcoming Payments (left) + Top Vendors Chart (right)
- Row 4: Spend Trend (full width)
- Row 5: Category Breakdown

**Pass Criteria**: All widgets render. Layout matches spec.

### TC-11.2: Dashboard Mobile Layout

**Steps**:
1. Resize browser to mobile width (< 768px) or use mobile device

**Expected**: All widgets stack vertically. Tables are horizontally scrollable. No horizontal overflow on the page. Touch-friendly button sizes.
**Pass Criteria**: Readable and usable on mobile

### TC-11.3: Dashboard Loading State

**Steps**:
1. Hard-refresh the Payables page
2. Observe loading states

**Expected**: Each widget shows loading skeletons/placeholders while data loads. No layout shift when data arrives.
**Pass Criteria**: Smooth loading experience

### TC-11.4: Dashboard with No Data

**Precondition**: Business with no Expense/COGS accounting entries
**Steps**:
1. Navigate to Payables dashboard

**Expected**: All widgets show appropriate empty states. Summary cards show SGD 0.00. Aging table shows "No outstanding payables." Upcoming payments shows "No payments due." Analytics show "No spend data."
**Pass Criteria**: Graceful empty state throughout. No errors.

---

## Test Suite 12: Edge Cases & Regression

### TC-12.1: Legacy Entry Without Due Date

**Precondition**: Accounting entry with no dueDate set (legacy data)
**Steps**:
1. View the aging table

**Expected**: Entry defaults to transaction_date + 30 days for aging bucket calculation. Appears in the appropriate bucket.
**Pass Criteria**: No crash. Entry classified by fallback logic.

### TC-12.2: Entry Without Vendor

**Steps**:
1. View the aging table with entry #9 (no vendorId)

**Expected**: Entry appears under "Unassigned Vendor" row. Total of unassigned vendor = SGD 650.00.
**Pass Criteria**: Unassigned row present. Totals reconcile (sum of all vendor rows = grand total).

### TC-12.3: Multi-Currency Entries in Aging

**Steps**:
1. View the aging table with entries in SGD, MYR, and USD

**Expected**: All amounts displayed in home currency (SGD) using the exchange rate recorded at entry creation time. No live rate conversion.
**Pass Criteria**: Amounts are in home currency. No mixed currencies in the table.

### TC-12.4: Rapid Period Filter Switching

**Steps**:
1. On upcoming payments, quickly click 7 → 14 → 30 → 7 days

**Expected**: Data updates correctly for each click. No stale data displayed. No race conditions.
**Pass Criteria**: Final state matches the last selected filter

### TC-12.5: Payment on Already-Paid Entry

**Precondition**: Entry #10 is already paid
**Steps**:
1. Attempt to call recordPayment on entry #10 (if possible through API)

**Expected**: Mutation rejects with error — can only record payments on pending/overdue entries
**Pass Criteria**: Validation prevents double-payment

### TC-12.6: Concurrent Payments

**Steps**:
1. Open payment dialog for the same entry in two browser tabs
2. Record full payment in tab 1
3. Attempt to record full payment in tab 2

**Expected**: Tab 2 should fail gracefully — the entry is now paid, amount exceeds outstanding (which is 0).
**Pass Criteria**: No double-payment. Error message in tab 2.

### TC-12.7: Existing Invoice Flow Not Broken

**Steps**:
1. Upload a new invoice (any format: PDF, JPG, PNG)
2. Wait for classification + OCR
3. View extracted data (Analyze button)
4. Create accounting entry (Create Payable button)
5. Verify entry appears in Accounting page
6. Verify document shows "Record Created"

**Expected**: The entire existing invoice pipeline works without regression. New AP features enhance but do not break the flow.
**Pass Criteria**: End-to-end flow succeeds

### TC-12.8: Dark Mode Compatibility

**Steps**:
1. Switch to dark mode
2. Navigate through all AP features: dashboard, aging table, drilldown, payment dialog, analytics

**Expected**: All components use semantic tokens (bg-card, text-foreground, etc.) and render correctly in dark mode. No hardcoded colors, no unreadable text.
**Pass Criteria**: Full dark mode support

---

## Test Result Summary Template

| Suite | Test Case | Status | Notes |
|-------|-----------|--------|-------|
| 1 - Nav | TC-1.1 Sidebar visible (admin) | | |
| 1 - Nav | TC-1.2 Sidebar hidden (non-admin) | | |
| 1 - Nav | TC-1.3 Page access (admin) | | |
| 1 - Nav | TC-1.4 Page redirect (non-admin) | | |
| 2 - Summary | TC-2.1 Card values | | |
| 2 - Summary | TC-2.2 Loading state | | |
| 3 - Aging | TC-3.1 Vendors listed | | |
| 3 - Aging | TC-3.2 Bucket classification | | |
| 3 - Aging | TC-3.3 Color coding | | |
| 3 - Aging | TC-3.4 Vendor drilldown | | |
| 3 - Aging | TC-3.5 Unassigned vendor | | |
| 3 - Aging | TC-3.6 Close drilldown | | |
| 3 - Aging | TC-3.7 Empty state | | |
| 4 - Upcoming | TC-4.1 Default 7 days | | |
| 4 - Upcoming | TC-4.2 Filter 14 days | | |
| 4 - Upcoming | TC-4.3 Filter 30 days | | |
| 4 - Upcoming | TC-4.4 Overdue styling | | |
| 4 - Upcoming | TC-4.5 Multi-currency | | |
| 4 - Upcoming | TC-4.6 Record payment | | |
| 4 - Upcoming | TC-4.7 Empty state | | |
| 5 - Profile | TC-5.1 View profile | | |
| 5 - Profile | TC-5.2 Edit terms | | |
| 5 - Profile | TC-5.3 Custom terms | | |
| 5 - Profile | TC-5.4 Bank masking | | |
| 5 - Profile | TC-5.5 Bank reveal | | |
| 5 - Profile | TC-5.6 Outstanding summary | | |
| 6 - Payment | TC-6.1 Open dialog | | |
| 6 - Payment | TC-6.2 Full payment | | |
| 6 - Payment | TC-6.3 Partial payment | | |
| 6 - Payment | TC-6.4 Zero validation | | |
| 6 - Payment | TC-6.5 Exceeds validation | | |
| 6 - Payment | TC-6.6 Default date | | |
| 6 - Payment | TC-6.7 Cancel dialog | | |
| 7 - Overdue | TC-7.1 Cron registered | | |
| 7 - Overdue | TC-7.2 Detection logic | | |
| 7 - Overdue | TC-7.3 Future not marked | | |
| 7 - Overdue | TC-7.4 Paid not affected | | |
| 7 - Overdue | TC-7.5 Action Center insight | | |
| 8 - Analytics | TC-8.1 Top vendors | | |
| 8 - Analytics | TC-8.2 Spend trend | | |
| 8 - Analytics | TC-8.3 Category breakdown | | |
| 8 - Analytics | TC-8.4 Period filter | | |
| 8 - Analytics | TC-8.5 Excluded statuses | | |
| 9 - Price | TC-9.1 Warning alert | | |
| 9 - Price | TC-9.2 Info alert | | |
| 9 - Price | TC-9.3 Insufficient data | | |
| 9 - Price | TC-9.4 Cross-vendor note | | |
| 9 - Price | TC-9.5 Cheapest vendor | | |
| 9 - Price | TC-9.6 IDR thresholds | | |
| 10 - Invoice | TC-10.1 Vendor context note | | |
| 10 - Invoice | TC-10.2 No vendor match | | |
| 10 - Invoice | TC-10.3 Create Payable label | | |
| 10 - Invoice | TC-10.4 Due date from OCR | | |
| 10 - Invoice | TC-10.5 Due date 30d default | | |
| 10 - Invoice | TC-10.6 Due date visibility | | |
| 10 - Invoice | TC-10.7 No regression | | |
| 11 - Layout | TC-11.1 Desktop layout | | |
| 11 - Layout | TC-11.2 Mobile layout | | |
| 11 - Layout | TC-11.3 Loading state | | |
| 11 - Layout | TC-11.4 Empty dashboard | | |
| 12 - Edge | TC-12.1 No due date | | |
| 12 - Edge | TC-12.2 No vendor | | |
| 12 - Edge | TC-12.3 Multi-currency | | |
| 12 - Edge | TC-12.4 Rapid filter switch | | |
| 12 - Edge | TC-12.5 Pay already-paid | | |
| 12 - Edge | TC-12.6 Concurrent payments | | |
| 12 - Edge | TC-12.7 Invoice flow regression | | |
| 12 - Edge | TC-12.8 Dark mode | | |

---

## Key Files Under Test

| Area | File Path |
|------|-----------|
| Page route | `src/app/[locale]/payables/page.tsx` |
| Dashboard | `src/domains/payables/components/ap-dashboard.tsx` |
| Summary cards | `src/domains/payables/components/summary-cards.tsx` |
| Vendor aging table | `src/domains/payables/components/vendor-aging-table.tsx` |
| Vendor aging drilldown | `src/domains/payables/components/vendor-aging-drilldown.tsx` |
| Upcoming payments | `src/domains/payables/components/upcoming-payments-table.tsx` |
| Payment recorder | `src/domains/payables/components/payment-recorder-dialog.tsx` |
| Vendor profile panel | `src/domains/payables/components/vendor-profile-panel.tsx` |
| Bank details | `src/domains/payables/components/vendor-bank-details.tsx` |
| Top vendors chart | `src/domains/payables/components/spend-analytics/top-vendors-chart.tsx` |
| Category breakdown | `src/domains/payables/components/spend-analytics/category-breakdown.tsx` |
| Spend trend | `src/domains/payables/components/spend-analytics/spend-trend.tsx` |
| Price alert badge | `src/domains/payables/components/price-intelligence/price-alert-badge.tsx` |
| Vendor comparison | `src/domains/payables/components/price-intelligence/vendor-comparison-note.tsx` |
| Vendor context note | `src/domains/payables/components/vendor-context-note.tsx` |
| Sidebar nav | `src/components/ui/sidebar.tsx` |
| Invoice documents list | `src/domains/invoices/components/documents-list.tsx` |
| Accounting entry modal | `src/domains/accounting-entries/components/accounting-entry-edit-modal.tsx` |
| Document-to-entry mapper | `src/domains/invoices/lib/document-to-accounting-entry-mapper.ts` |
| Aging hook | `src/domains/payables/hooks/use-vendor-aging.ts` |
| Upcoming payments hook | `src/domains/payables/hooks/use-upcoming-payments.ts` |
| Payment recorder hook | `src/domains/payables/hooks/use-payment-recorder.ts` |
| Spend analytics hook | `src/domains/payables/hooks/use-spend-analytics.ts` |
| Price intelligence hook | `src/domains/payables/hooks/use-price-intelligence.ts` |
| Price thresholds config | `src/domains/payables/lib/price-thresholds.ts` |
| Schema | `convex/schema.ts` |
| Vendor functions | `convex/functions/vendors.ts` |
| Accounting entry functions | `convex/functions/accountingEntries.ts` |
| Analytics queries | `convex/functions/analytics.ts` |
| Price history queries | `convex/functions/vendorPriceHistory.ts` |
| Cron jobs | `convex/crons.ts` |
