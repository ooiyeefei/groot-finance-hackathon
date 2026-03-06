# UAT Test Cases: Batch Payment Processing

**Feature**: Batch Payment Processing (#260)
**Environment**: https://finance.hellogroot.com
**Date**: 2026-03-06

## Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin (Finance) | yeefei+test2@hellogroot.com | ud1oFZ1rVurUL |
| Manager | yeefei+manager1@hellogroot.com | v%^J^q3fo9N^tW |
| Employee | yeefei+employee1@hellogroot.com | 1F$ld4j5Tu&mF |

## Test Cases

### TC-001: Admin sees Reimburse tab (P1 - Critical)
**Steps**:
1. Login as Admin
2. Navigate to Manager Approvals page
3. Verify "Reimburse" tab is visible

**Expected**: Tab labeled "Reimburse" appears in the tab list (finance_admin only)

### TC-002: Reimburse tab loads Payment Processing (P1 - Critical)
**Steps**:
1. Click on "Reimburse" tab
2. Wait for content to load

**Expected**: Shows "Payment Processing" card with either approved claims or empty state ("No approved claims pending payment")

### TC-003: Claims grouped by submission (P1 - Critical)
**Steps**:
1. On the Reimburse tab, observe the claims list
2. Verify claims are grouped under submission headers

**Expected**: Each submission shows title, employee name, claim count badge, and total amount. Expandable via click.

### TC-004: Expand submission to see individual claims (P1 - Critical)
**Steps**:
1. Click on a submission row to expand
2. Observe individual claims listed

**Expected**: Individual claims appear with vendor/description, category badge, employee name, reference number, date, and amount. Each has a checkbox and send-back button.

### TC-005: Select all / deselect all (P2 - High)
**Steps**:
1. Click "Select All" checkbox in the bulk actions bar
2. Verify all claim counts update
3. Click again to deselect

**Expected**: All visible claims selected; count shows "X of Y selected"; running total per currency appears. Deselect clears all.

### TC-006: Submission-level checkbox selects all claims (P2 - High)
**Steps**:
1. Click checkbox on a submission row (without expanding)
2. Expand the submission

**Expected**: All individual claims within that submission are checked.

### TC-007: Running total per currency (P2 - High)
**Steps**:
1. Select claims with different currencies
2. Observe the running total in the bulk actions bar

**Expected**: Totals shown separately per currency (e.g., "MYR 5,000.00 + SGD 200.00"), never combined.

### TC-008: Mark as Paid - confirmation dialog (P1 - Critical)
**Steps**:
1. Select at least one claim
2. Click "Mark as Paid" button
3. Observe confirmation dialog

**Expected**: Dialog shows claim count, total per currency, optional payment method dropdown, optional payment reference input, Cancel and Confirm buttons.

### TC-009: Mark as Paid - process claims (P1 - Critical)
**Steps**:
1. Select claims, click Mark as Paid
2. Optionally fill payment method and reference
3. Click "Confirm Payment"

**Expected**: Claims disappear from pending list. Success message shows processed count and totals. Claims now have "reimbursed" status.

### TC-010: Send Back - dialog and flow (P2 - High)
**Steps**:
1. Expand a submission
2. Click the send-back (undo) icon on an individual claim
3. Observe send-back dialog
4. Enter a reason and click "Send Back"

**Expected**: Dialog asks for required reason. On submit, claim disappears from the pending list. Success message confirms send-back.

### TC-011: Filter by employee (P2 - High)
**Steps**:
1. Click the "All Employees" dropdown
2. Select a specific employee

**Expected**: Only that employee's submissions/claims are shown. Running total reflects filtered set.

### TC-012: Filter by category (P3 - Medium)
**Steps**:
1. Click the "All Categories" dropdown
2. Select a specific category

**Expected**: Only claims matching that category are shown.

### TC-013: Empty state (P3 - Medium)
**Steps**:
1. Process all approved claims (or if none exist)
2. Observe the Reimburse tab

**Expected**: Shows empty state with check icon: "No approved claims pending payment"

### TC-014: Non-admin cannot see Reimburse tab (P2 - High)
**Steps**:
1. Login as Manager account
2. Navigate to Manager Approvals

**Expected**: "Reimburse" tab is NOT visible (only finance_admin/owner see it)
