# Quickstart Guide: Email Forwarding for Documents

**Feature**: Email Forwarding for Documents (Receipts & AP Invoices)
**Branch**: `001-doc-email-forward`
**Date**: 2026-03-16

## Overview

This guide helps developers test email forwarding functionality locally during development. It covers:
1. Local environment setup
2. Simulating email ingestion without AWS SES
3. Testing classification and routing logic
4. Verifying "Needs Review" inbox UI

---

## Prerequisites

- Node.js 20.x installed
- Convex CLI installed (`npm install -g convex`)
- Trigger.dev CLI installed (`npm install -g @trigger.dev/cli`)
- AWS CLI configured (for S3 access)
- Access to Groot Finance repository (`grootdev-ai/groot-finance`)

---

## Part 1: Local Environment Setup

### 1.1 Install Dependencies

```bash
cd /path/to/groot-finance
npm install

# Install new email parsing dependency
npm install mailparser
npm install @types/mailparser --save-dev
```

### 1.2 Start Convex Dev Server

```bash
npx convex dev
```

This command:
- Starts Convex backend in development mode
- Auto-deploys schema changes to dev environment
- Enables real-time sync for local testing

**Verify**: Open Convex dashboard (`https://dashboard.convex.dev`) → Check that `document_inbox_entries` table exists

### 1.3 Start Trigger.dev Dev Mode

```bash
npx @trigger.dev/cli dev
```

This command:
- Starts local Trigger.dev server for background job testing
- Listens for task invocations from your local machine
- Logs classification results to terminal

**Verify**: Terminal shows `✓ Connected to Trigger.dev dev server`

### 1.4 Start Next.js Dev Server

```bash
npm run dev
```

**Verify**: Open `http://localhost:3000` → App loads successfully

---

## Part 2: Simulating Email Ingestion (Without AWS SES)

Since AWS SES requires production domain configuration, we'll simulate email ingestion locally using a test script.

### 2.1 Create Test Email Simulator

Create a file `scripts/test-email-forward.ts`:

```typescript
// scripts/test-email-forward.ts
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';
import fs from 'fs';
import crypto from 'crypto';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

async function simulateEmailForward(options: {
  businessId: string;
  userId: string;
  receiptFilePath: string;
  senderEmail: string;
}) {
  console.log('📧 Simulating email forward...');

  // Read test receipt file
  const fileBuffer = fs.readFileSync(options.receiptFilePath);
  const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
  const filename = options.receiptFilePath.split('/').pop()!;

  // Upload to Convex storage
  console.log('📤 Uploading file to Convex storage...');
  const storageId = await convex.mutation(api.files.generateUploadUrl, {});
  // Upload file using fetch...
  // (In real implementation, use Convex file upload API)

  // Create inbox entry
  console.log('📝 Creating inbox entry...');
  const result = await convex.mutation(api.functions.documentInbox.createInboxEntry, {
    businessId: options.businessId as any,
    userId: options.userId as any,
    fileStorageId: storageId as any,
    originalFilename: filename,
    fileHash,
    fileSizeBytes: fileBuffer.length,
    mimeType: 'image/jpeg',
    sourceType: 'email_forward',
    emailMetadata: {
      from: options.senderEmail,
      subject: 'Fwd: Test Receipt',
      body: 'Testing email forwarding feature',
      receivedAt: Date.now(),
      messageId: `<test-${Date.now()}@simulator>`
    }
  });

  console.log('✅ Inbox entry created:', result);

  if (result.isDuplicate) {
    console.log('⚠️  Duplicate detected:', result.duplicateOriginalId);
    return;
  }

  // Trigger classification (manually call Trigger.dev task)
  console.log('🤖 Triggering classification...');
  // In dev mode, this calls local Trigger.dev server
  await fetch('http://localhost:3040/api/tasks/classify-document/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentId: result.inboxEntryId,
      businessId: options.businessId,
      targetDomain: 'auto'
    })
  });

  console.log('✅ Classification triggered. Check Trigger.dev terminal for results.');
}

// Run simulation
simulateEmailForward({
  businessId: 'j971wy2v9h2dcx0p3r0m6zqy9s76t9r8', // Your test business ID
  userId: 'j971wy2v9h2dcx0p3r0m6zqy9s76t9r8', // Your test user ID
  receiptFilePath: './test-data/sample-receipt.jpg',
  senderEmail: 'test@mycompany.com'
});
```

### 2.2 Run Test Email Simulation

```bash
# Create test data directory
mkdir -p test-data

# Add sample receipt image
# (Download a sample receipt from Google Images or use a test invoice)
# Save as test-data/sample-receipt.jpg

# Run simulator
npx tsx scripts/test-email-forward.ts
```

**Expected Output**:
```
📧 Simulating email forward...
📤 Uploading file to Convex storage...
📝 Creating inbox entry...
✅ Inbox entry created: { inboxEntryId: 'j98...', triggerClassification: true, isDuplicate: false }
🤖 Triggering classification...
✅ Classification triggered. Check Trigger.dev terminal for results.
```

**Verify Classification**:
- Check Trigger.dev terminal → See classification logs
- Check Convex dashboard → `document_inbox_entries` table → See new record
- If confidence ≥85%, document should be routed to `expense_claims` or `invoices` table
- If confidence <85%, document should have `status: 'needs_review'`

---

## Part 3: Testing Classification & Routing Logic

### 3.1 Test High-Confidence Receipt (Auto-Route)

**Test Case**: Clear receipt image with good lighting

```bash
# Use a high-quality receipt image
npx tsx scripts/test-email-forward.ts \
  --file=test-data/clear-receipt.jpg
```

**Expected Behavior**:
1. Classification returns: `{ type: 'receipt', confidence: 0.92 }`
2. Document auto-routes to `expense_claims` table
3. Inbox entry deleted (status: 'routed')
4. User sees new draft expense claim in their submission batch

**Verification**:
```bash
# Query expense_claims table
curl -X POST https://your-convex-url.convex.cloud/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "path": "functions/expenseClaims:getByBusiness",
    "args": { "businessId": "j971wy2..." },
    "format": "json"
  }'

# Should see new claim with sourceType: 'email_forward'
```

### 3.2 Test Low-Confidence Invoice (Needs Review)

**Test Case**: Blurry invoice or unknown document

```bash
# Use a blurry or ambiguous image
npx tsx scripts/test-email-forward.ts \
  --file=test-data/blurry-invoice.jpg
```

**Expected Behavior**:
1. Classification returns: `{ type: 'invoice', confidence: 0.68 }`
2. Document routed to "Needs Review" inbox (status: 'needs_review')
3. User receives email notification: "Document needs your review"
4. Document appears in `/documents-inbox` page

**Verification**:
```bash
# Query document_inbox_entries table
curl -X POST https://your-convex-url.convex.cloud/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "path": "functions/documentInbox:getInboxDocuments",
    "args": { "businessId": "j971wy2...", "status": "needs_review" },
    "format": "json"
  }'

# Should see document with aiConfidence: 0.68
```

### 3.3 Test Duplicate Detection

**Test Case**: Forward same receipt twice

```bash
# First forward
npx tsx scripts/test-email-forward.ts \
  --file=test-data/same-receipt.jpg

# Second forward (same file)
npx tsx scripts/test-email-forward.ts \
  --file=test-data/same-receipt.jpg
```

**Expected Behavior**:
1. First forward: Processed normally
2. Second forward: Duplicate detected (file hash match)
3. Auto-reply email sent: "Duplicate document detected"
4. No classification triggered (saves API costs)

**Verification**:
```bash
# Check logs
tail -f logs/email-processor.log
# Should see: "Duplicate detected: fileHash=abc123, originalId=j98..."
```

---

## Part 4: Testing "Needs Review" Inbox UI

### 4.1 Open "Needs Review" Inbox Page

```bash
# Navigate to inbox page
open http://localhost:3000/documents-inbox
```

**Expected UI**:
- Sidebar shows "Documents Inbox" nav item
- Page title: "Needs Review"
- Table with columns: Filename | Source | Type (AI Suggestion) | Confidence | Date | Actions
- Documents with confidence <85% appear in table
- Each row has "Classify" button

### 4.2 Test Manual Classification

**Steps**:
1. Click "Classify" button on a low-confidence document
2. Modal opens with dropdown: "Receipt", "AP Invoice", "E-Invoice"
3. Select "Receipt"
4. Click "Confirm"

**Expected Behavior**:
1. Document removed from inbox table
2. Toast notification: "Document classified as Receipt and routed successfully"
3. Document appears in expense claims (check `/expense-claims` page)
4. Inbox entry deleted from database

**Verification**:
```bash
# Check Convex logs
npx convex logs --tail

# Should see:
# manuallyClassifyDocument: inboxEntryId=j98..., classifiedType=receipt
# routeDocument: destinationDomain=expense_claims, destinationRecordId=j99...
```

### 4.3 Test Confidence Badge Display

**Test Cases**:

| Confidence | Badge Color | Icon |
|------------|-------------|------|
| 90-100%    | Green       | ✓    |
| 85-89%     | Yellow      | ⚠    |
| <85%       | Red         | ✗    |

**Verification**:
- Create documents with different confidence levels
- Check badge color matches expected values
- Hover over badge → Tooltip shows AI reasoning

---

## Part 5: Testing Email Notifications

### 5.1 Setup Local Email Testing (Optional)

For testing email notifications locally without AWS SES:

```bash
# Install MailHog (local SMTP server)
brew install mailhog  # macOS
# or
docker run -p 1025:1025 -p 8025:8025 mailhog/mailhog  # Docker

# Configure Convex to use MailHog
# In convex/_generated/env.d.ts:
SMTP_HOST=localhost
SMTP_PORT=1025
```

### 5.2 Test Exception Notification

**Trigger**: Document with low confidence enters "Needs Review"

**Expected Email**:
- Subject: "Document needs your review"
- Body: "The document 'receipt.jpg' requires manual classification."
- Link to inbox: `https://finance.hellogroot.com/documents-inbox`

**Verification**:
```bash
# Open MailHog UI
open http://localhost:8025

# Should see email in inbox
```

---

## Part 6: Integration Testing

### 6.1 End-to-End Test Script

Create `tests/integration/email-forwarding.test.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('Email forwarding: Receipt auto-routes to expense claims', async ({ page }) => {
  // 1. Simulate email forward (using test API endpoint)
  await page.request.post('/api/test/simulate-email', {
    data: {
      businessId: 'test-business',
      userId: 'test-user',
      filename: 'receipt.jpg',
      fileType: 'receipt',
      confidence: 0.92
    }
  });

  // 2. Wait for classification to complete
  await page.waitForTimeout(5000);

  // 3. Navigate to expense claims page
  await page.goto('/expense-claims');

  // 4. Verify new draft claim appears
  await expect(page.locator('[data-testid="expense-claim-row"]').first()).toContainText('receipt.jpg');
  await expect(page.locator('[data-testid="source-badge"]').first()).toHaveText('Email Forward');
});

test('Email forwarding: Low-confidence invoice goes to Needs Review', async ({ page }) => {
  // 1. Simulate email forward with low confidence
  await page.request.post('/api/test/simulate-email', {
    data: {
      businessId: 'test-business',
      userId: 'test-user',
      filename: 'blurry-invoice.pdf',
      fileType: 'invoice',
      confidence: 0.72
    }
  });

  // 2. Wait for classification
  await page.waitForTimeout(5000);

  // 3. Navigate to Documents Inbox
  await page.goto('/documents-inbox');

  // 4. Verify document in Needs Review table
  await expect(page.locator('table tbody tr')).toHaveCount(1);
  await expect(page.locator('[data-testid="confidence-badge"]').first()).toContainText('72%');

  // 5. Manually classify document
  await page.locator('[data-testid="classify-button"]').first().click();
  await page.locator('select[name="documentType"]').selectOption('invoice');
  await page.locator('[data-testid="confirm-classify"]').click();

  // 6. Verify document removed from inbox
  await expect(page.locator('table tbody tr')).toHaveCount(0);

  // 7. Verify document in AP Invoices
  await page.goto('/ap-invoices');
  await expect(page.locator('[data-testid="invoice-row"]').first()).toContainText('blurry-invoice.pdf');
});
```

Run integration tests:
```bash
npx playwright test tests/integration/email-forwarding.test.ts
```

---

## Part 7: Troubleshooting

### Common Issues

#### Issue 1: Classification Not Triggering

**Symptoms**: Document stuck in `status: 'classifying'` indefinitely

**Causes**:
- Trigger.dev dev server not running
- Network connection issues to Gemini API
- Invalid Gemini API key

**Fix**:
```bash
# Check Trigger.dev status
curl http://localhost:3040/health

# Check Gemini API key
echo $GEMINI_API_KEY

# Restart Trigger.dev
npx @trigger.dev/cli dev --verbose
```

#### Issue 2: Duplicate Detection Not Working

**Symptoms**: Same file forwarded twice, both processed

**Causes**:
- File hash computation mismatch
- 90-day window query incorrect

**Fix**:
```bash
# Debug hash computation
npx tsx scripts/debug-hash.ts test-data/receipt.jpg

# Check Convex query
npx convex run functions/documentInbox:findByHash \
  --arg businessId=j971wy... \
  --arg fileHash=abc123... \
  --arg sinceTimestamp=1710000000000
```

#### Issue 3: Documents Not Appearing in UI

**Symptoms**: Classification succeeds but document not visible in inbox/expense claims

**Causes**:
- Real-time subscription not connected
- Business ID mismatch (user logged into wrong business)
- Routing logic bug (document routed to wrong table)

**Fix**:
```bash
# Check Convex subscriptions
# In browser console:
convex.onUpdate((update) => console.log('Convex update:', update));

# Verify business ID
console.log('Current business:', useActiveBusiness());

# Check document location
npx convex run functions/documentInbox:getInboxDocument \
  --arg inboxEntryId=j98...
```

---

## Part 8: Production Testing Checklist

Before deploying to production:

- [ ] **Schema deployed**: Run `npx convex deploy --yes` to deploy `document_inbox_entries` table
- [ ] **SES configured**: Verify SES email receiving rule created in AWS console
- [ ] **Lambda deployed**: Deploy updated `finanseal-einvoice-email-processor` Lambda (CDK stack)
- [ ] **Feature flag enabled**: Set `emailForwardingEnabled: true` in production business
- [ ] **Test with real email**: Forward test receipt to `docs@test-business.hellogroot.com`
- [ ] **Verify auto-routing**: Check test receipt appears in expense claims within 30s
- [ ] **Verify "Needs Review"**: Forward blurry image, check it appears in inbox
- [ ] **Verify notifications**: Check email received for low-confidence document
- [ ] **Verify duplicate detection**: Forward same file twice, check auto-reply email
- [ ] **Rollback plan tested**: Disable feature flag, verify existing uploads still work

---

## Additional Resources

- **Convex Dashboard**: `https://dashboard.convex.dev`
- **Trigger.dev Dashboard**: `https://dashboard.trigger.dev`
- **AWS SES Console**: `https://console.aws.amazon.com/ses`
- **Gemini API Docs**: `https://ai.google.dev/gemini-api/docs`
- **CLAUDE.md**: Project-wide architecture and rules
- **Data Model**: `specs/001-doc-email-forward/data-model.md`
- **API Contracts**: `specs/001-doc-email-forward/contracts/`

---

**Questions?** Contact the feature owner or check Slack #groot-engineering channel.
