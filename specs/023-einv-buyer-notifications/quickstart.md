# Quickstart: E-Invoice Buyer Notifications

**Feature**: 023-einv-buyer-notifications
**Purpose**: Developer setup guide and testing workflow

---

## Prerequisites

- Node.js 20.x
- Access to AWS SES (via Vercel OIDC role or local credentials)
- Access to LHDN MyInvois sandbox environment
- Convex CLI installed (`npm i -g convex`)
- Test account credentials (see `.env.local`)

---

## Environment Variables

### Required Variables (Already Configured)

Add these to `.env.local` (or verify they exist):

```bash
# Convex
NEXT_PUBLIC_CONVEX_URL=https://kindhearted-lynx-129.convex.cloud
CONVEX_DEPLOYMENT=<your-deployment-name>

# AWS SES (email sending)
AWS_REGION=us-west-2
AWS_SES_FROM_EMAIL=notifications@notifications.hellogroot.com

# AWS IAM (Vercel OIDC role for production)
AWS_ROLE_ARN=arn:aws:iam::837224017779:role/FinanSEAL-Vercel-S3-Role

# Internal service key (Convex → API route authentication)
MCP_INTERNAL_SERVICE_KEY=<internal-service-key>

# Resend (fallback email provider)
RESEND_API_KEY=<resend-key>

# LHDN MyInvois (sandbox for testing)
LHDN_API_BASE_URL=https://api-sandbox.myinvois.hasil.gov.my
LHDN_CLIENT_ID=<your-lhdn-client-id>
LHDN_CLIENT_SECRET=<your-lhdn-client-secret>
```

### Local Development (AWS Credentials)

For local testing, you need AWS credentials to send emails via SES:

**Option 1: AWS CLI credentials** (recommended for local dev)
```bash
# ~/.aws/credentials
[default]
aws_access_key_id = YOUR_ACCESS_KEY
aws_secret_access_key = YOUR_SECRET_KEY
region = us-west-2
```

**Option 2: Environment variables**
```bash
# .env.local
AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_SECRET_KEY
```

**Production**: Vercel uses OIDC role assumption (no hardcoded credentials needed).

---

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Convex Dev Mode

```bash
npx convex dev
```

**What this does**:
- Auto-syncs schema changes to Convex cloud
- Applies new fields: `sales_invoices.buyerNotificationLog`, `businesses.einvoiceNotifyBuyerOn*`
- Enables hot-reload for Convex functions

**Verify**:
1. Open Convex dashboard: https://dashboard.convex.dev
2. Navigate to Schema tab
3. Confirm `sales_invoices` has `buyerNotificationLog` field
4. Confirm `businesses` has `einvoiceNotifyBuyerOnValidation` and `einvoiceNotifyBuyerOnCancellation` fields

### 3. Start Next.js Dev Server

```bash
npm run dev
```

Access at: http://localhost:3000

---

## Testing Workflow

### Test Credentials (from `.env.local`)

```bash
# Admin account (full access)
TEST_USER_ADMIN=admin@example.com
TEST_USER_ADMIN_PW=<password>

# Manager account (approval rights)
TEST_USER_MANAGER=manager@example.com
TEST_USER_MANAGER_PW=<password>

# Employee account (submitter)
TEST_USER_EMPLOYEE=employee@example.com
TEST_USER_EMPLOYEE_PW=<password>
```

---

### End-to-End Test: Validation Notification

**Goal**: Verify buyer receives email when LHDN validates e-invoice.

#### Step 1: Create Test Sales Invoice

1. Login as `TEST_USER_ADMIN`
2. Navigate to **Sales Invoices** → **Create New**
3. Fill invoice details:
   - **Customer Name**: Test Customer
   - **Customer Email**: `your-test-email@example.com` (use a real email you control)
   - **Amount**: MYR 100.00
   - **Line Item**: Test Product (Qty: 1, Price: 100)
4. Save invoice

#### Step 2: Submit to LHDN

1. On invoice detail page, click **Submit to LHDN**
2. Wait for submission confirmation (modal shows "Submitting...")
3. **Backend**: Convex job created (`lhdn_submission_jobs` table)
4. **Backend**: LHDN API called via Lambda → submission UID returned
5. Invoice status changes to `lhdnStatus: "pending"`

#### Step 3: Wait for Validation (Polling)

**Automatic** (no user action needed):
- Convex cron (`lhdnJobs.pollForResults`) runs every 5-30s
- Polls LHDN API: `GET /api/v1/documents/{submissionUid}/details`
- LHDN sandbox auto-validates after ~30 seconds

**Monitor**:
```bash
# In Convex dashboard → Logs
# Look for: "[lhdnJobs] Polling job <jobId> - Status: valid"
```

#### Step 4: Verify Buyer Notification

**Check your email inbox** (`your-test-email@example.com`):
- **Subject**: "E-Invoice INV-001 Validated by LHDN"
- **Body**: Contains invoice number, validation date, amount, MyInvois link
- **From**: notifications@notifications.hellogroot.com

**Verify in Convex**:
1. Open Convex dashboard → Data → `sales_invoices`
2. Find your test invoice
3. Check `buyerNotificationLog` array:
   ```json
   [
     {
       "eventType": "validation",
       "recipientEmail": "your-test-email@example.com",
       "timestamp": 1710597600000,
       "sendStatus": "sent",
       "sesMessageId": "0000014a3e4e-..."
     }
   ]
   ```

#### Step 5: Test Idempotency

**Manually trigger notification again**:
1. In Convex dashboard → Functions
2. Run `lhdnJobs.updateSourceRecord` with same `jobId`
3. Check logs: Should see "Skipped: already_sent"
4. Verify `buyerNotificationLog` has new entry:
   ```json
   {
     "eventType": "validation",
     "sendStatus": "skipped",
     "skipReason": "already_sent",
     "timestamp": <new-timestamp>
   }
   ```

---

### End-to-End Test: Cancellation Notification

**Goal**: Verify buyer receives email when issuer cancels e-invoice.

#### Step 1: Cancel Validated Invoice

1. Navigate to invoice detail page (from previous test)
2. Click **Cancel E-Invoice**
3. Enter reason: "Incorrect invoice amount"
4. Click **Confirm Cancellation**

#### Step 2: Backend Flow

**API Route**: `POST /api/v1/sales-invoices/[invoiceId]/lhdn/cancel`
1. Calls LHDN API: `PUT /api/v1/documents/state/{uuid}/state`
2. LHDN confirms cancellation
3. Triggers buyer notification (new code insertion point)

#### Step 3: Verify Email

**Check buyer's email inbox**:
- **Subject**: "E-Invoice INV-001 Cancelled"
- **Body**: Includes cancellation reason ("Incorrect invoice amount")

**Verify in Convex**:
```json
{
  "eventType": "cancellation",
  "recipientEmail": "your-test-email@example.com",
  "sendStatus": "sent",
  "timestamp": <timestamp>
}
```

---

### End-to-End Test: Settings Toggles

**Goal**: Verify business admin can disable notifications.

#### Step 1: Disable Validation Notifications

1. Login as `TEST_USER_ADMIN`
2. Navigate to **Settings** → **Business Settings** → **E-Invoice**
3. Find **"Buyer Notifications"** section
4. Toggle **OFF**: "Notify buyer when e-invoice is validated by LHDN"
5. Save settings

#### Step 2: Submit New Invoice

1. Create another test invoice (different invoice number)
2. Submit to LHDN
3. Wait for validation

#### Step 3: Verify No Email Sent

**Check inbox**: No validation email received

**Verify in Convex**:
```json
{
  "eventType": "validation",
  "sendStatus": "skipped",
  "skipReason": "business_settings_disabled",
  "timestamp": <timestamp>
}
```

---

### Unit Test: Email Validation

**Test invalid email format**:

```typescript
// Test file: tests/unit/buyer-notification-service.test.ts

import { validateBuyerEmail } from '@/lib/email/buyer-notification-service';

describe('validateBuyerEmail', () => {
  it('should accept valid emails', () => {
    expect(validateBuyerEmail('buyer@example.com')).toBe(true);
    expect(validateBuyerEmail('test.user+tag@company.co.uk')).toBe(true);
  });

  it('should reject invalid emails', () => {
    expect(validateBuyerEmail('not-an-email')).toBe(false);
    expect(validateBuyerEmail('@example.com')).toBe(false);
    expect(validateBuyerEmail('buyer@')).toBe(false);
  });

  it('should reject missing email', () => {
    expect(validateBuyerEmail('')).toBe(false);
    expect(validateBuyerEmail(null)).toBe(false);
    expect(validateBuyerEmail(undefined)).toBe(false);
  });
});
```

**Run tests**:
```bash
npm test
```

---

## Debugging

### Email Not Sent

**Check 1: SES Sandbox Mode**
- AWS SES starts in sandbox mode (can only send to verified emails)
- **Solution**: Verify your test email in SES console, or request production access

**Check 2: Convex Logs**
```bash
# In Convex dashboard → Logs
# Search for: "[buyer-notification]"
# Look for: sendStatus, skipReason, errorMessage
```

**Check 3: API Route Logs**
```bash
# In Next.js terminal
# Look for: "[LHDN Deliver]" or "[Buyer Notification]"
```

**Check 4: Business Settings**
- Verify `einvoiceNotifyBuyerOnValidation` is `undefined` or `true`
- Check Convex dashboard → Data → `businesses` → your test business

---

### Notification Log Not Updating

**Symptom**: `buyerNotificationLog` array is empty or missing expected entry.

**Check 1: Schema Migration**
```bash
npx convex dev --yes  # Force schema sync
```

**Check 2: Mutation Call**
- Verify `appendNotificationLog` mutation is called in code
- Check Convex dashboard → Functions → Recent Calls

**Check 3: Field Name**
- Confirm field is `buyerNotificationLog` (camelCase), not `buyer_notification_log`

---

### Duplicate Emails

**Symptom**: Buyer receives same notification multiple times.

**Check 1: Idempotency Logic**
- Verify `hasAlreadySent()` check runs before send
- Check notification log for multiple `sendStatus: "sent"` entries (should be impossible)

**Check 2: Polling Retries**
- LHDN polling runs every 5-30s. If notification trigger is inside polling loop (wrong placement), it will fire multiple times.
- **Fix**: Move notification trigger to `updateSourceRecord` (after status confirmed), not inside `pollForResults`

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] **Schema deployed to prod**: `npx convex deploy --yes`
- [ ] **Environment variables set in Vercel**: Verify `AWS_ROLE_ARN`, `MCP_INTERNAL_SERVICE_KEY`
- [ ] **SES production access enabled**: Request via AWS Support (if still in sandbox)
- [ ] **LHDN production credentials configured**: Update `LHDN_API_BASE_URL`, `LHDN_CLIENT_ID`, `LHDN_CLIENT_SECRET`
- [ ] **Build passes**: `npm run build`
- [ ] **All tests pass**: `npm test`

### Deployment Steps

1. **Deploy Convex schema**:
   ```bash
   npx convex deploy --yes
   ```

2. **Deploy Next.js to Vercel**:
   ```bash
   git push origin main
   # Vercel auto-deploys on push to main
   ```

3. **Verify deployment**:
   - Visit production URL: https://finance.hellogroot.com
   - Check Vercel logs for build success
   - Check Convex dashboard for schema changes applied

4. **Smoke test**:
   - Login with production account
   - Create test invoice (mark as "Test" in notes)
   - Submit to LHDN production
   - Verify buyer notification received

---

## Rollback Plan

**If buyer notifications fail in production**:

1. **Disable feature flag** (if implemented):
   ```bash
   # Set business-wide disable via Convex dashboard
   businesses.einvoiceNotifyBuyerOnValidation = false
   businesses.einvoiceNotifyBuyerOnCancellation = false
   ```

2. **Revert code**:
   ```bash
   git revert <commit-hash>
   git push origin main
   ```

3. **Schema rollback** (last resort):
   - Cannot remove Convex fields without data migration
   - Fields are `optional`, so existing code still works
   - New code can ignore the fields

---

## Support & Resources

- **Email service docs**: `src/lib/services/email-service.ts` (inline comments)
- **LHDN API docs**: https://sdk.myinvois.hasil.gov.my
- **SES troubleshooting**: AWS SES Console → Email Sending → Sending Statistics
- **Convex docs**: https://docs.convex.dev

---

**Quickstart Complete** — Developer setup and testing workflow fully documented. Ready for task breakdown (Phase 2).
