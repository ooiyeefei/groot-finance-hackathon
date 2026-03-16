# UAT Test Cases: E-Invoice Buyer Notifications

**Feature**: E-Invoice Buyer Notifications
**Branch**: 023-einv-buyer-notifications
**Test Environment**: Local (http://localhost:3001)
**Test Account**: Admin (`yeefei+test2@hellogroot.com`)
**Generated**: 2026-03-16

## Test Execution Summary

| Test Case ID | Description | Priority | Status | Notes |
|--------------|-------------|----------|--------|-------|
| TC-001 | Business settings UI loads notification toggles | Critical (P1) | ⏳ Pending | |
| TC-002 | Validation toggle defaults to enabled | Critical (P1) | ⏳ Pending | |
| TC-003 | Cancellation toggle defaults to enabled | Critical (P1) | ⏳ Pending | |
| TC-004 | Toggle validation notification OFF and save | Critical (P1) | ⏳ Pending | |
| TC-005 | Toggle cancellation notification OFF and save | Critical (P1) | ⏳ Pending | |
| TC-006 | Rejection toggle shown as disabled (always enabled) | High (P2) | ⏳ Pending | |
| TC-007 | Settings persist after page reload | High (P2) | ⏳ Pending | |
| TC-008 | Non-owner user cannot access notification settings | High (P2) | ⏳ Pending | |
| TC-009 | Sales invoice detail page displays correctly | High (P2) | ⏳ Pending | |
| TC-010 | E-invoice section loads with LHDN status | High (P2) | ⏳ Pending | |

---

## Test Case Details

### User Story 4: Business Controls Notification Preferences

These test cases verify the notification settings UI (the only user-facing component we can test without actually triggering email sends).

---

#### TC-001: Business Settings UI Loads Notification Toggles

**Priority**: Critical (P1)
**Story**: US4
**Preconditions**:
- User logged in as admin (`yeefei+test2@hellogroot.com`)
- Business account exists

**Steps**:
1. Navigate to http://localhost:3001
2. Wait for page load
3. Click on "Settings" or navigate to business settings page
4. Look for "E-Invoice Notifications" tab or section
5. Click on "E-Invoice Notifications" if it's a tab
6. Verify the section loads without errors

**Expected**:
- Settings page loads successfully
- "E-Invoice Notifications" tab/section is visible
- Section contains notification toggle controls
- No JavaScript console errors

**Actual**: _[To be filled during test execution]_

**Screenshot**: `uat-tc001-settings-page.png`

---

#### TC-002: Validation Toggle Defaults to Enabled

**Priority**: Critical (P1)
**Story**: US4
**Preconditions**:
- TC-001 passed
- On E-Invoice Notifications settings section

**Steps**:
1. Locate the "Notify buyer when e-invoice is validated by LHDN" toggle
2. Check the initial state of the toggle

**Expected**:
- Toggle exists and is visible
- Toggle is in the ON/enabled state by default
- Label text is clear and descriptive

**Actual**: _[To be filled during test execution]_

**Screenshot**: `uat-tc002-validation-toggle.png`

---

#### TC-003: Cancellation Toggle Defaults to Enabled

**Priority**: Critical (P1)
**Story**: US4
**Preconditions**:
- TC-001 passed
- On E-Invoice Notifications settings section

**Steps**:
1. Locate the "Notify buyer when I cancel an e-invoice" toggle
2. Check the initial state of the toggle

**Expected**:
- Toggle exists and is visible
- Toggle is in the ON/enabled state by default
- Label text is clear and descriptive

**Actual**: _[To be filled during test execution]_

**Screenshot**: `uat-tc003-cancellation-toggle.png`

---

#### TC-004: Toggle Validation Notification OFF and Save

**Priority**: Critical (P1)
**Story**: US4
**Preconditions**:
- TC-002 passed
- Validation toggle is currently ON

**Steps**:
1. Click the validation notification toggle to turn it OFF
2. Verify the toggle visual state changes to OFF
3. Click the "Save" or "Update Settings" button
4. Wait for success confirmation message

**Expected**:
- Toggle switches to OFF state visually
- Save button is enabled and clickable
- Success toast/message appears (e.g., "Settings updated successfully")
- No errors in console

**Actual**: _[To be filled during test execution]_

**Screenshot**: `uat-tc004-toggle-off-save.png`

---

#### TC-005: Toggle Cancellation Notification OFF and Save

**Priority**: Critical (P1)
**Story**: US4
**Preconditions**:
- TC-003 passed
- Cancellation toggle is currently ON

**Steps**:
1. Click the cancellation notification toggle to turn it OFF
2. Verify the toggle visual state changes to OFF
3. Click the "Save" or "Update Settings" button
4. Wait for success confirmation message

**Expected**:
- Toggle switches to OFF state visually
- Save button is enabled and clickable
- Success toast/message appears
- No errors in console

**Actual**: _[To be filled during test execution]_

**Screenshot**: `uat-tc005-cancellation-toggle-off.png`

---

#### TC-006: Rejection Toggle Shown as Disabled (Always Enabled)

**Priority**: High (P2)
**Story**: US4
**Preconditions**:
- TC-001 passed
- On E-Invoice Notifications settings section

**Steps**:
1. Locate the rejection notification control (if displayed)
2. Check if it's shown as disabled or always-on
3. Attempt to click it (should not be interactive)

**Expected**:
- Rejection notification is shown as "always enabled" or grayed out
- Label indicates it cannot be disabled (e.g., "Rejection confirmation (always sent)")
- No toggle interaction possible
- OR: Rejection toggle not shown at all (only validation and cancellation)

**Actual**: _[To be filled during test execution]_

**Screenshot**: `uat-tc006-rejection-always-on.png`

---

#### TC-007: Settings Persist After Page Reload

**Priority**: High (P2)
**Story**: US4
**Preconditions**:
- TC-004 passed (validation toggle is OFF and saved)
- TC-005 passed (cancellation toggle is OFF and saved)

**Steps**:
1. Note the current state of both toggles (both OFF)
2. Refresh the browser page (F5 or reload button)
3. Navigate back to E-Invoice Notifications settings
4. Check the state of both toggles

**Expected**:
- After page reload, validation toggle is still OFF
- After page reload, cancellation toggle is still OFF
- Settings were persisted to the database and loaded correctly

**Actual**: _[To be filled during test execution]_

**Screenshot**: `uat-tc007-settings-persisted.png`

---

#### TC-008: Non-Owner User Cannot Access Notification Settings

**Priority**: High (P2)
**Story**: US4
**Preconditions**:
- Test account with non-owner role available (e.g., manager or employee)
- OR: Able to change current user's role to non-owner

**Steps**:
1. Log out from admin account
2. Log in as manager (`yeefei+manager1@hellogroot.com`)
3. Navigate to business settings
4. Look for "E-Invoice Notifications" tab

**Expected**:
- E-Invoice Notifications tab is NOT visible to non-owner users
- OR: Tab is visible but shows "Only business owners can configure notifications" message
- No ability to modify settings without owner role

**Actual**: _[To be filled during test execution]_

**Screenshot**: `uat-tc008-non-owner-access.png`

---

### Supplementary Tests: Sales Invoice UI

These test cases verify that the main sales invoice UI still works correctly after notification feature changes.

---

#### TC-009: Sales Invoice Detail Page Displays Correctly

**Priority**: High (P2)
**Story**: N/A (Regression test)
**Preconditions**:
- User logged in as admin
- At least one sales invoice exists in the system

**Steps**:
1. Navigate to Sales Invoices list page
2. Click on any invoice to view details
3. Verify the detail page loads
4. Check for presence of key sections (invoice details, line items, LHDN section if e-invoice)

**Expected**:
- Invoice detail page loads without errors
- All invoice data displays correctly
- LHDN e-invoice section visible if invoice is an e-invoice
- No console errors

**Actual**: _[To be filled during test execution]_

**Screenshot**: `uat-tc009-invoice-detail.png`

---

#### TC-010: E-Invoice Section Loads with LHDN Status

**Priority**: High (P2)
**Story**: N/A (Regression test)
**Preconditions**:
- TC-009 passed
- Viewing an e-invoice (invoice with LHDN submission)

**Steps**:
1. On an e-invoice detail page, locate the LHDN section
2. Check for LHDN status display (e.g., "Validated", "Pending", "Submitted")
3. Verify LHDN UUID and long ID are displayed (if available)

**Expected**:
- LHDN section is visible and loads without errors
- Status badge/label shows current LHDN status
- UUID and long ID displayed if invoice is validated
- "View on MyInvois" link present if validated

**Actual**: _[To be filled during test execution]_

**Screenshot**: `uat-tc010-lhdn-status.png`

---

## Edge Cases & Manual Verification

These scenarios require backend inspection or email service access and cannot be fully automated via browser testing.

### EC-001: Email Idempotency
**Description**: Verify that triggering the same notification twice (e.g., validation) results in only one email sent
**Manual Steps**:
1. Submit a test e-invoice
2. Wait for validation status
3. Manually trigger `sendValidationNotification` action twice via Convex dashboard
4. Check `sales_invoices` table → `buyerNotificationLog` field
5. Verify only one "sent" entry exists for validation event

**Expected**: Second trigger logs "skipped" with reason "already_sent"

---

### EC-002: Missing Buyer Email
**Description**: Verify that invoices without buyer email skip notification gracefully
**Manual Steps**:
1. Create a sales invoice with no customer email
2. Submit to LHDN and wait for validation
3. Check `buyerNotificationLog` on the invoice

**Expected**: Log entry shows "skipped" with reason "no_email"

---

### EC-003: Invalid Email Format
**Description**: Verify that invoices with malformed buyer email skip notification
**Manual Steps**:
1. Create a sales invoice with invalid email (e.g., "not-an-email")
2. Submit to LHDN and wait for validation
3. Check `buyerNotificationLog`

**Expected**: Log entry shows "skipped" with reason "invalid_format"

---

### EC-004: SES Send Failure
**Description**: Verify that SES failures are logged but don't block workflow
**Manual Steps**:
1. Temporarily break SES credentials or use a rate-limited account
2. Trigger a validation notification
3. Check `buyerNotificationLog`

**Expected**: Log entry shows "failed" with error message from SES

---

### EC-005: Validation Notification Email Content
**Description**: Verify validation email has correct content and formatting
**Manual Steps**:
1. Use a real test email address you can access
2. Submit test e-invoice and wait for validation
3. Check email inbox
4. Verify email contains:
   - Invoice number
   - Business name
   - Amount with currency
   - LHDN UUID
   - MyInvois link
   - Groot footer

**Expected**: Email renders correctly in Gmail/Outlook, all links work

---

### EC-006: Cancellation Notification Email with Reason
**Description**: Verify cancellation email includes the provided reason
**Manual Steps**:
1. Use a real test email address
2. Issue a validated e-invoice
3. Cancel it via Groot UI with reason "Incorrect amount"
4. Check email inbox

**Expected**: Email contains cancellation reason prominently

---

### EC-007: Settings Toggle Disables Validation Email
**Description**: Verify that disabling validation toggle prevents email send
**Manual Steps**:
1. Turn OFF "Notify buyer on validation" in settings
2. Submit a test e-invoice with real buyer email
3. Wait for validation
4. Check email inbox (should be empty)
5. Check `buyerNotificationLog`

**Expected**: No email sent, log shows "skipped" with reason "business_settings_disabled"

---

## Test Execution Notes

### Browser Testing Tool
- **Tool**: Playwright MCP browser tools
- **Browser**: Chromium (default)
- **Viewport**: 1280x720 (desktop)

### Test Data Requirements
- Admin test account with owner role
- Manager test account for role-based access testing
- At least one sales invoice in the system
- Ideally one e-invoice with LHDN submission

### Known Limitations
- Cannot test actual email delivery without access to test email inbox
- Cannot test LHDN polling triggers without LHDN sandbox access
- Backend validation requires Convex dashboard or DB inspection

### Success Criteria
- All Critical (P1) test cases must PASS
- At least 80% of High (P2) test cases must PASS
- Edge cases documented with expected behavior (manual verification deferred)

---

## Test Environment Details

**Application URL**: http://localhost:3001
**Test Account**: `yeefei+test2@hellogroot.com` / `ud1oFZ1rVurUL`
**Fallback Account**: `yeefei+manager1@hellogroot.com` / `v%^J^q3fo9N^tW`
**Database**: Convex (kindhearted-lynx-129.convex.cloud)
**Email Service**: AWS SES via notifications.hellogroot.com

---

## Change Log

- 2026-03-16: Initial test case generation covering US4 (settings UI) + regression tests
