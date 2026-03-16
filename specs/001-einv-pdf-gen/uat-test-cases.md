# UAT Test Cases: LHDN E-Invoice PDF Generation & Delivery

**Feature:** GitHub #311 - LHDN e-invoice PDF generation with QR code and buyer delivery
**Test Environment:** Production (`https://finance.hellogroot.com`)
**Test Account:** `yeefei+test2@hellogroot.com` (Admin role)
**Test Date:** 2026-03-16

---

## Test Case Summary

| ID | Title | Priority | Category |
|----|-------|----------|----------|
| TC-001 | Create invoice, submit to LHDN, wait for validation | P1 Critical | Happy Path |
| TC-002 | Verify auto-delivery sends email to buyer | P1 Critical | Auto-Delivery |
| TC-003 | Delivery status displays correctly on detail page | P1 Critical | UI Display |
| TC-004 | Manual "Send to Buyer" button works | P1 Critical | Manual Delivery |
| TC-005 | Delivery status column appears in invoice list | P2 High | UI Display |
| TC-006 | Failure notification for invalid buyer email | P2 High | Error Handling |
| TC-007 | Toggle auto-delivery OFF → no auto-send | P2 High | Settings |
| TC-008 | Toggle auto-delivery ON → auto-send resumes | P2 High | Settings |
| TC-009 | Download LHDN PDF serves stored S3 file | P1 Critical | PDF Storage |
| TC-010 | Second download serves same file (no regeneration) | P2 High | PDF Storage |

---

## Test Cases

### TC-001: Create Invoice, Submit to LHDN, Wait for Validation
**Priority:** P1 Critical
**Type:** Happy Path

**Preconditions:**
- Logged in as admin test account
- Business has LHDN credentials configured
- At least one customer exists with valid buyer details

**Steps:**
1. Navigate to `/en/sales-invoices`
2. Click "Create Invoice" button
3. Fill in invoice details:
   - Customer: Select existing customer with email
   - Line items: Add at least one item
   - Amount: ≥ RM 1.00
4. Click "Save" to create draft
5. Navigate to invoice detail page
6. Find "LHDN E-Invoice" section
7. Click "Submit to LHDN" button
8. Wait for submission confirmation
9. Refresh page and check status changes to "Validated"

**Expected Result:**
- Invoice is created successfully
- LHDN submission shows "pending" status initially
- After LHDN validation (may take 30-60 seconds), status updates to "Validated"
- QR code appears in LHDN section

**Actual Result:** _[To be filled during execution]_

---

### TC-002: Verify Auto-Delivery Sends Email to Buyer
**Priority:** P1 Critical
**Type:** Auto-Delivery

**Preconditions:**
- TC-001 passed (invoice is validated)
- Business settings have `einvoiceAutoDelivery: true`
- Customer has valid email address

**Steps:**
1. Wait for LHDN polling cron to trigger (runs every 5 minutes)
2. Check invoice detail page for delivery status
3. Verify delivery status shows "delivered"
4. Check `lhdnPdfDeliveredTo` field matches customer email
5. Verify `lhdnPdfDeliveredAt` timestamp is set

**Expected Result:**
- Delivery status badge shows "Delivered" (green checkmark)
- Delivered to: [customer email]
- Delivered at: [timestamp within 5 min of validation]

**Actual Result:** _[To be filled during execution]_

**Note:** If auto-delivery is disabled by default, this test may need manual trigger via TC-004.

---

### TC-003: Delivery Status Displays Correctly on Detail Page
**Priority:** P1 Critical
**Type:** UI Display

**Preconditions:**
- TC-002 passed (delivery completed)

**Steps:**
1. Navigate to invoice detail page
2. Locate "LHDN PDF Delivery Status" component
3. Verify badge color and text
4. Check recipient email is displayed
5. Check timestamp is displayed in readable format

**Expected Result:**
- Badge: Green with checkmark icon + "Delivered" text
- Recipient: Customer email address
- Timestamp: Human-readable format (e.g., "Mar 16, 2026 6:15 PM")

**Actual Result:** _[To be filled during execution]_

---

### TC-004: Manual "Send to Buyer" Button Works
**Priority:** P1 Critical
**Type:** Manual Delivery

**Preconditions:**
- Invoice is LHDN-validated (TC-001 passed)
- Delivery status is either "pending" or "failed" (can test on a new invoice)

**Steps:**
1. Navigate to invoice detail page
2. Locate "Send to Buyer" button in LHDN section
3. Click the button
4. Wait for loading state (button should show spinner)
5. Check for success toast notification
6. Verify delivery status updates to "delivered"

**Expected Result:**
- Button shows loading spinner during send
- Success toast: "E-Invoice PDF sent to [email]"
- Delivery status updates immediately to "Delivered"
- Badge changes color to green

**Actual Result:** _[To be filled during execution]_

---

### TC-005: Delivery Status Column Appears in Invoice List
**Priority:** P2 High
**Type:** UI Display

**Preconditions:**
- At least one LHDN-validated invoice exists

**Steps:**
1. Navigate to `/en/sales-invoices`
2. Locate the invoices table
3. Find the "LHDN Status" or "Delivery Status" column
4. Verify invoices show delivery badges (delivered/failed/pending)

**Expected Result:**
- Column header visible in table
- Each validated invoice shows a delivery status badge
- Badge colors: Green (delivered), Red (failed), Yellow/Gray (pending)

**Actual Result:** _[To be filled during execution]_

---

### TC-006: Failure Notification for Invalid Buyer Email
**Priority:** P2 High
**Type:** Error Handling

**Preconditions:**
- Admin has access to create/edit customers
- Can create a test invoice

**Steps:**
1. Create a new customer with invalid email: `invalid@nonexistent-domain-12345.com`
2. Create and submit invoice for this customer to LHDN
3. Wait for validation
4. Trigger delivery (auto or manual)
5. Check invoice detail page for failure status
6. Navigate to notifications panel (bell icon)
7. Verify failure notification appears with link to invoice

**Expected Result:**
- Delivery status: "Failed" (red badge)
- Error message displayed: "SES bounce" or "Invalid recipient"
- In-app notification created with deep-link to invoice detail page

**Actual Result:** _[To be filled during execution]_

**Note:** This test may require temporary SES sandbox exit or test email setup.

---

### TC-007: Toggle Auto-Delivery OFF → No Auto-Send
**Priority:** P2 High
**Type:** Settings

**Preconditions:**
- Admin access to business settings
- LHDN integration is active

**Steps:**
1. Navigate to business settings page
2. Find "LHDN E-Invoice" or "Auto-Delivery" settings section
3. Toggle `einvoiceAutoDelivery` to OFF
4. Save settings
5. Create a new invoice, submit to LHDN, wait for validation
6. Wait 10 minutes (2 cron cycles)
7. Check invoice delivery status

**Expected Result:**
- Settings toggle saves successfully
- Invoice validates but delivery status remains "pending"
- No email is sent to buyer
- No delivery notification created

**Actual Result:** _[To be filled during execution]_

---

### TC-008: Toggle Auto-Delivery ON → Auto-Send Resumes
**Priority:** P2 High
**Type:** Settings

**Preconditions:**
- TC-007 passed (auto-delivery was OFF)
- At least one validated invoice with "pending" delivery status

**Steps:**
1. Navigate to business settings
2. Toggle `einvoiceAutoDelivery` to ON
3. Save settings
4. Wait for next LHDN polling cron (up to 5 minutes)
5. Check previously pending invoice delivery status

**Expected Result:**
- Settings toggle saves successfully
- Cron picks up pending validated invoices
- Delivery status updates to "delivered"
- Buyer receives email

**Actual Result:** _[To be filled during execution]_

---

### TC-009: Download LHDN PDF Serves Stored S3 File
**Priority:** P1 Critical
**Type:** PDF Storage

**Preconditions:**
- TC-002 passed (PDF was generated and stored during delivery)

**Steps:**
1. Navigate to invoice detail page
2. Locate "Download E-Invoice (LHDN)" button
3. Open browser DevTools → Network tab
4. Click the download button
5. Check network request for CloudFront signed URL pattern
6. Verify PDF downloads successfully
7. Open PDF and verify:
   - QR code present
   - UUID displayed
   - "Validated by LHDN" timestamp
   - Business and customer details correct

**Expected Result:**
- Network request URL contains `d2ix0jr4phb70v.cloudfront.net` (CloudFront domain)
- URL contains `?Expires=` query param (signed URL)
- PDF downloads without errors
- PDF contains all required LHDN elements

**Actual Result:** _[To be filled during execution]_

---

### TC-010: Second Download Serves Same File (No Regeneration)
**Priority:** P2 High
**Type:** PDF Storage

**Preconditions:**
- TC-009 passed (first download successful)
- Same invoice still validated

**Steps:**
1. Stay on invoice detail page (or refresh)
2. Open DevTools → Network tab → Clear requests
3. Click "Download E-Invoice (LHDN)" button again
4. Check network request URL
5. Compare S3 key (path after `/einvoices/`) with previous download
6. Verify no API call to `/lhdn/deliver` (only CloudFront signed URL generation)

**Expected Result:**
- CloudFront URL points to same S3 object key
- No re-generation API call (no POST to `/lhdn/deliver`)
- PDF downloads instantly (served from S3/CloudFront cache)
- File content matches previous download

**Actual Result:** _[To be filled during execution]_

---

## Notes

**Test Data Considerations:**
- Test invoices should use real-looking amounts (avoid RM 0.01)
- Customer emails should be accessible or use test email service
- LHDN sandbox environment may have rate limits

**Known Limitations:**
- LHDN validation timing varies (30s - 5min)
- Auto-delivery depends on cron timing (5min intervals)
- SES delivery may be delayed in sandbox mode

**Pre-Test Checklist:**
- [ ] Convex schema deployed to production
- [ ] CloudFront signed URL configuration verified
- [ ] SES sender identity verified for `notifications.hellogroot.com`
- [ ] LHDN API credentials active
- [ ] Test account has admin role in a business with LHDN enabled
