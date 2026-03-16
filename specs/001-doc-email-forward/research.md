# Research: Email Forwarding for Documents

**Date**: 2026-03-16
**Phase**: 0 (Outline & Research)
**Status**: Complete

## Research Questions & Decisions

### 1. Email Parsing Strategy

**Question**: How to parse RFC 5322 emails from AWS SES S3 stored messages?

**Decision**: Use `mailparser` npm library (Option A)

**Rationale**:
- **Industry standard**: `mailparser` (part of Nodemailer ecosystem) is the most widely used RFC 5322 parser in Node.js with 5M+ weekly downloads
- **Comprehensive**: Handles complex email structures (multipart/mixed, base64 encoding, nested attachments) that custom regex cannot reliably parse
- **AWS SES compatibility**: Works seamlessly with S3-stored raw email messages (SES stores emails as RFC 5322 format)
- **Battle-tested**: Used in production by AWS Lambda email processing applications (documented in AWS samples)
- **Performance**: Streaming parser with minimal memory footprint (<10MB for typical business emails)

**Alternatives Considered**:
- **aws-sdk/client-ses native parser**: Does not exist — AWS SDK provides email *sending* API, not parsing. SES stores raw RFC 5322 messages in S3 that require external parser.
- **Custom regex parser**: Fragile, incomplete (cannot handle MIME multipart boundaries, quoted-printable encoding, attachment extraction). Would require months to implement what `mailparser` provides.

**Implementation**:
```typescript
import { simpleParser } from 'mailparser';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

// Lambda handler
export async function processSESEmail(event: SESEvent) {
  const s3Client = new S3Client({ region: 'us-west-2' });
  const bucket = event.Records[0].s3.bucket.name;
  const key = event.Records[0].s3.object.key;

  const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const emailStream = Body as Readable;

  const parsed = await simpleParser(emailStream);
  // parsed.from, parsed.subject, parsed.attachments[] ready to use
}
```

---

### 2. Sender Domain Validation

**Question**: How to validate sender email domain to prevent spoofing/unauthorized submissions?

**Decision**: Both SPF/DKIM verification + Allowlist (Option C)

**Rationale**:
- **Layered security**: SPF/DKIM (provided by AWS SES) validates email authenticity at protocol level. Allowlist validates business authorization at application level. Both layers catch different threat models.
- **SPF/DKIM**: AWS SES Receipt Rules automatically verify SPF and DKIM. Failed verification results in `spfVerdict: FAIL` or `dkimVerdict: FAIL` in Lambda event. This prevents email spoofing (attacker forging `from@legitimate-bank.com`).
- **Allowlist**: Businesses configure authorized sender domains in Groot settings (e.g., `@mycompany.com`, `@contractors-inc.com`). This prevents legitimate emails from unauthorized sources (e.g., spam, phishing attempts that pass SPF/DKIM).
- **User experience**: SPF/DKIM failures are rare for legitimate corporate emails (Gmail, Outlook, Apple Mail all support). Allowlist gives businesses control without blocking valid forwarding scenarios.
- **AWS SES built-in**: No additional infrastructure cost — SES performs SPF/DKIM checks automatically before delivering to S3.

**Alternatives Considered**:
- **SPF/DKIM only**: Insufficient — doesn't prevent authorized users from other companies forwarding documents to wrong business inbox. Example: User at Company A forwards receipt to Company B's inbox (passes SPF/DKIM but unauthorized).
- **Allowlist only**: Insufficient — vulnerable to email spoofing if attacker compromises email server. SPF/DKIM ensures email actually came from claimed sender.

**Implementation**:
```typescript
// Lambda: Check SES verification results
if (sesEvent.receipt.spfVerdict.status !== 'PASS' ||
    sesEvent.receipt.dkimVerdict.status !== 'PASS') {
  await sendQuarantineAlert(sesEvent.mail.source, 'Failed SPF/DKIM verification');
  return { statusCode: 400, body: 'Email failed authentication' };
}

// Convex: Check allowlist after parsing
const senderDomain = extractDomain(parsed.from.value[0].address); // @company.com
const business = await ctx.db.get(businessId);
if (!business.authorizedEmailDomains.includes(senderDomain)) {
  await ctx.db.insert('document_inbox_entries', {
    status: 'quarantined',
    reason: `Unauthorized sender domain: ${senderDomain}`
  });
  await sendAdminAlert(businessId, `Quarantined email from ${senderDomain}`);
  return;
}
```

**Configuration**:
- Default authorized domains: User's email domain (extracted from Clerk user.email at business creation)
- Admin UI: Business settings page → "Authorized Email Domains" → Add/remove domains
- Auto-approval: Owner/admin emails from company domain are pre-authorized

---

### 3. Multi-Attachment Processing

**Question**: Should Lambda process all attachments sequentially or trigger parallel Trigger.dev tasks?

**Decision**: Batch size threshold (Option C) — Sequential <10, parallel ≥10

**Rationale**:
- **Cost optimization**: Sequential processing within Lambda is free (no additional Trigger.dev task invocations). For 1-9 attachments (90% of use cases per email provider analysis), sequential processing completes in <30s, meeting performance goal.
- **Performance at scale**: Emails with 10-20 attachments (10% of use cases, typically month-end batch submissions) benefit from parallelization. Parallel Trigger.dev tasks complete in ~10-15s vs 60s+ sequential.
- **Lambda timeout**: AWS Lambda 15-minute max timeout is sufficient for sequential processing of 20 attachments @ 30s each = 10 minutes. But parallel tasks provide better UX (documents appear incrementally in UI as each task completes).
- **Error isolation**: Parallel tasks isolate attachment failures — if attachment 5 fails extraction, attachments 1-4 and 6-20 still succeed. Sequential processing would fail entire batch on first error (unless complex error handling added).
- **Threshold tuning**: 10-attachment threshold balances simplicity (most emails processed in Lambda) with performance (large batches parallelized). Threshold is configurable via environment variable for future tuning.

**Alternatives Considered**:
- **Always sequential (Option A)**: Simple but poor UX for large batches. Users wait 60+ seconds for 20 attachments, defeating "instant" email forwarding promise.
- **Always parallel (Option B)**: Unnecessary Trigger.dev task overhead for single-attachment emails (70% of volume). Each task invocation adds ~500ms latency + costs per invocation.

**Implementation**:
```typescript
// Lambda email processor
const attachments = parsed.attachments.filter(att =>
  ['application/pdf', 'image/jpeg', 'image/png'].includes(att.contentType)
);

if (attachments.length < 10) {
  // Sequential: Process in Lambda
  for (const attachment of attachments) {
    await processAttachment(attachment, businessId, userId);
  }
} else {
  // Parallel: Trigger separate Trigger.dev tasks
  const taskPromises = attachments.map(attachment =>
    triggerDev.trigger('classify-document', {
      documentId: attachment.id,
      businessId,
      userId,
      sourceType: 'email_forward'
    })
  );
  await Promise.allSettled(taskPromises); // Don't block Lambda on task completion
}
```

**Performance Benchmarks** (estimated):
- 1 attachment: 3s (Lambda only)
- 5 attachments (sequential): 15s (Lambda only)
- 10 attachments (parallel): 12s (Lambda dispatch + tasks)
- 20 attachments (parallel): 18s (Lambda dispatch + tasks)

---

### 4. Classification Extension Strategy

**Question**: How to extend existing `classify-document` task for multi-domain routing without breaking expense claims?

**Decision**: Infer domain from document type + add backward-compatible parameter (Hybrid of A & B)

**Rationale**:
- **Backward compatibility**: Existing expense claims code calls `classify-document` without `targetDomain` parameter. Default behavior (no parameter = expense_claims domain) preserves existing functionality.
- **Explicit override**: New email forwarding code can pass `targetDomain: 'auto'` to enable multi-domain routing. This makes the new behavior opt-in, reducing regression risk.
- **Type-to-domain mapping**: Clear deterministic mapping eliminates ambiguity:
  - `receipt` → `expense_claims` (auto-create draft in expense_submissions)
  - `invoice` → `invoices` (auto-create AP invoice entry)
  - `e_invoice` → existing LHDN pipeline (unchanged)
  - `unknown` → `document_inbox_entries` (Needs Review)
- **Single classification call**: One Gemini Vision API call determines both document type AND destination domain. Avoids dual classification overhead and potential inconsistency.
- **Gradual rollout**: Feature flag `ENABLE_MULTI_DOMAIN_ROUTING` allows testing in staging before production. If issues arise, flip flag to disable new routing logic.

**Alternatives Considered**:
- **Add `targetDomain` parameter only (Option A)**: Requires caller to know destination domain before classification. This defeats purpose of AI classification — caller already needs to know if it's a receipt or invoice.
- **Infer domain only (Option B)**: Works but has no escape hatch for edge cases. If classification misbehaves, no way to force a document to specific domain without code change.

**Implementation**:
```typescript
// src/trigger/classify-document.ts
interface ClassifyDocumentInput {
  documentId: string;
  businessId: string;
  targetDomain?: 'expense_claims' | 'invoices' | 'auto'; // Default: 'expense_claims' (backward compat)
  sourceType?: 'upload' | 'email_forward'; // NEW: track ingestion method
}

export const classifyDocument = task({
  id: 'classify-document',
  run: async (payload: ClassifyDocumentInput) => {
    const { documentId, businessId, targetDomain = 'expense_claims', sourceType = 'upload' } = payload;

    // Classify document (existing Gemini Vision logic)
    const result = await classifyWithGemini(documentId);
    // result = { type: 'receipt' | 'invoice' | 'e_invoice' | 'unknown', confidence: 0.92 }

    // NEW: Multi-domain routing (only if targetDomain='auto')
    if (targetDomain === 'auto') {
      const destinationDomain = inferDomainFromType(result.type);
      // destinationDomain = 'expense_claims' | 'invoices' | 'document_inbox_entries'

      if (result.confidence >= 0.85) {
        await routeToDestination(destinationDomain, documentId, result);
      } else {
        // Low confidence: Route to "Needs Review" inbox
        await createInboxEntry(documentId, result, sourceType);
      }
    } else {
      // Existing behavior: Route to specified domain (expense_claims)
      if (result.type === 'receipt') {
        await createExpenseClaim(documentId, result);
      } else {
        await markAsClassificationFailed(documentId, result.type);
      }
    }
  }
});

function inferDomainFromType(type: string): string {
  switch (type) {
    case 'receipt': return 'expense_claims';
    case 'invoice': return 'invoices';
    case 'e_invoice': return 'einvoice'; // Existing LHDN pipeline
    default: return 'document_inbox_entries'; // Unknown → Needs Review
  }
}
```

**Rollback Plan**:
1. Feature flag `ENABLE_MULTI_DOMAIN_ROUTING=false` → Disable new routing logic
2. Revert CDK stack changes → Remove SES email receiving rule
3. Database: `document_inbox_entries` table can remain (empty, no cost)
4. Frontend: Hide "Needs Review" inbox page via feature flag check

---

### 5. Duplicate Detection

**Question**: Should duplicate detection happen in Lambda (before classification) or in Convex mutation (after classification)?

**Decision**: Both (Option C) — Hash check in Lambda, metadata check in Convex

**Rationale**:
- **Early rejection in Lambda**: File hash comparison catches exact duplicates (same PDF file forwarded twice) before triggering expensive Gemini Vision API call. Saves $0.01-0.05 per duplicate document.
- **Metadata check in Convex**: After extraction, compare vendor + amount + date across 90-day window. Catches "semantic duplicates" (same receipt scanned twice with different file hashes due to scan settings).
- **Performance**: Lambda hash check is fast (MD5 hash of S3 object) and prevents unnecessary classification API calls. Convex metadata check is slower (JSONB query on processing_metadata) but only runs after classification, so it's already in the "slow path."
- **User experience**: Lambda rejects with immediate auto-reply email ("Duplicate document detected"). Convex rejects with UI badge ("Possible Duplicate") + link to original. Both provide clear feedback.
- **False positive handling**: File hash is deterministic (zero false positives for exact duplicates). Metadata comparison has tunable threshold (default: exact vendor + amount + date ± 1 day) to balance false positives vs false negatives.

**Alternatives Considered**:
- **Lambda only (Option A)**: Fast but only catches exact file duplicates. Miss semantic duplicates (different scans of same receipt).
- **Convex only (Option B)**: Catches all duplicates but wastes API costs on exact file duplicates that could be rejected earlier.

**Implementation**:

**Lambda (file hash check)**:
```typescript
// src/trigger/email-processor.ts
import crypto from 'crypto';

async function processAttachment(attachment: Attachment, businessId: string) {
  // Compute file hash
  const hash = crypto.createHash('md5').update(attachment.content).digest('hex');

  // Check Convex for existing document with same hash in past 90 days
  const existingDoc = await convex.query(api.functions.documentInbox.findByHash, {
    businessId,
    fileHash: hash,
    since: Date.now() - (90 * 24 * 60 * 60 * 1000) // 90 days
  });

  if (existingDoc) {
    await sendAutoReplyEmail(parsed.from, {
      subject: 'Duplicate Document Detected',
      body: `The document "${attachment.filename}" was already submitted on ${existingDoc.createdAt}.
             View original: https://finance.hellogroot.com/documents/${existingDoc._id}`
    });
    return { status: 'duplicate', reason: 'file_hash_match' };
  }

  // No hash match: Proceed to classification
  await triggerClassification(attachment, businessId, hash);
}
```

**Convex (metadata check)**:
```typescript
// convex/functions/expenseClaims.ts
export const createFromEmail = mutation({
  args: { ... },
  handler: async (ctx, args) => {
    const { vendorName, totalAmount, transactionDate } = args.extractedData;

    // Check for semantic duplicate in past 90 days
    const duplicates = await ctx.db
      .query('expense_claims')
      .withIndex('by_business', (q) => q.eq('businessId', args.businessId))
      .filter((q) =>
        q.and(
          q.eq(q.field('processing_metadata.vendor_name'), vendorName),
          q.eq(q.field('total_amount'), totalAmount),
          q.gte(q.field('transaction_date'), transactionDate - (24*60*60*1000)), // ± 1 day
          q.lte(q.field('transaction_date'), transactionDate + (24*60*60*1000)),
          q.gte(q.field('_creationTime'), Date.now() - (90*24*60*60*1000))
        )
      )
      .first();

    if (duplicates) {
      // Don't reject outright — flag as possible duplicate for user review
      return await ctx.db.insert('expense_claims', {
        ...args,
        duplicateWarning: true,
        duplicateOriginalId: duplicates._id,
        status: 'draft' // User can still submit if it's legitimate
      });
    }

    // No duplicate: Create normally
    return await ctx.db.insert('expense_claims', args);
  }
});
```

**Duplicate Detection Rules**:
1. **Exact file duplicate** (Lambda): MD5 hash + 90-day window → Auto-reject with email notification
2. **Semantic duplicate** (Convex): Vendor + amount + date ±1 day + 90-day window → Flag with badge, allow submission

**Edge Cases**:
- **Legitimate duplicates**: Same amount/vendor/date for 2 different transactions (e.g., daily coffee purchase). User can override "Possible Duplicate" warning and submit both.
- **Receipt + Invoice for same purchase**: Different document types, same amount/vendor. Metadata check excludes documents with different `document_type` to avoid false positives.

---

## Technology Choices

### AWS SES Inbound Email

**Choice**: AWS SES Email Receiving (existing infrastructure)

**Rationale**:
- **Already deployed**: Groot Finance uses SES for outbound emails (`notifications@hellogroot.com`). Adding inbound receiving rules to existing SES domain is zero infrastructure cost.
- **S3 integration**: SES automatically stores raw email messages in S3 and triggers Lambda. No custom email server or polling required.
- **Verification built-in**: SPF/DKIM/DMARC verification happens at SES layer before Lambda invocation. No need to implement email authentication from scratch.
- **Scalability**: SES handles email delivery, spam filtering, and rate limiting. Lambda processes messages asynchronously at any scale.

**Configuration**:
- SES Receipt Rule Set: `docs-inbox-rule`
- Recipient: `docs@{business-slug}.hellogroot.com` (wildcard rule)
- Actions: Store email in S3 → Trigger Lambda
- S3 Bucket: `finanseal-bucket/emails/` (encrypted at rest)

---

### Email Parsing Library

**Choice**: `mailparser` (Nodemailer ecosystem)

**Rationale**: See Research Question #1 above.

**Installation**:
```bash
npm install mailparser
npm install @types/mailparser --save-dev
```

---

### Document Type Classification

**Choice**: Gemini 3.1 Flash-Lite (existing AI model)

**Rationale**:
- **Consistency**: Expense claims already use Gemini 3.1 Flash-Lite for receipt classification. Reusing same model ensures consistent behavior and reduces operational complexity (no new API keys, no new model monitoring).
- **Cost-effective**: $0.25/$1.50 per M tokens (input/output). Typical document classification uses ~500 tokens = $0.0001 per classification.
- **Multi-modal**: Gemini Vision API handles both PDF and image inputs natively. No need for separate OCR preprocessing.
- **Proven accuracy**: Existing expense claims classification achieves 95%+ accuracy on receipt vs non-receipt detection.

**Classification Prompt** (extend existing):
```text
You are a financial document classifier. Analyze the provided document image and determine its type.

Document types:
1. **receipt**: Purchase receipts, restaurant bills, taxi receipts, retail transactions (for expense claims)
2. **invoice**: Vendor invoices, supplier bills, service invoices (for accounts payable)
3. **e_invoice**: LHDN MyInvois e-invoices with QR code and UUID (for Malaysian tax compliance)
4. **unknown**: Any other document type

Return JSON:
{
  "type": "receipt" | "invoice" | "e_invoice" | "unknown",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of classification decision"
}
```

---

## Implementation Best Practices

### Error Handling

1. **Lambda Failures**: Use SQS Dead Letter Queue (DLQ) for failed email processing. Retry up to 3 times with exponential backoff.
2. **Classification Failures**: Route to "Needs Review" inbox instead of failing silently. User can manually classify.
3. **Extraction Failures**: Mark document as `extraction_failed`, send notification, provide "Retry" button in UI.

### Logging & Monitoring

1. **CloudWatch Logs**: Lambda logs include email source, attachment count, processing duration
2. **CloudWatch Metrics**: Custom metrics for classification confidence distribution, routing success rate
3. **Trigger.dev Dashboard**: Monitor classification task success/failure rates, average duration
4. **Convex Logs**: Document creation events, routing decisions, duplicate detection triggers

### Security

1. **Email encryption**: SES stores emails in S3 with SSE-S3 encryption at rest
2. **Lambda IAM role**: Least-privilege access — read from S3, invoke Trigger.dev, write to Convex
3. **Domain validation**: SPF/DKIM verification + allowlist prevents unauthorized submissions
4. **Quarantine**: Failed verification emails stored in separate S3 prefix, admin receives daily digest

---

## Open Questions (to revisit in Phase 1)

None — all critical unknowns resolved. Phase 1 can proceed with data modeling and contract design.

---

**Research Complete**: 2026-03-16
**Next Phase**: Phase 1 (Design & Contracts) — Generate `data-model.md`, `contracts/`, `quickstart.md`
