# Feature Specification: Email Forwarding for Documents (Receipts & AP Invoices)

**Feature Branch**: `001-doc-email-forward`
**Created**: 2026-03-16
**Status**: Draft
**Input**: User description: "P1: Email forwarding for expense receipts and AP invoices — users forward documents to dedicated email address, AI auto-classifies and routes to appropriate workflow"

## Clarifications

### Session 2026-03-16

- Q: Should high-confidence documents go straight to their destination (expense claims/AP invoices) or stop in an inbox for approval first? → A: Auto-route if confidence ≥85%, inbox only for low-confidence exceptions (hybrid - fast path for good AI, safety net for errors)
- Q: When should documents be deleted from the system? → A: Retention policy - Financial documents 7 years, "Needs Review" inbox auto-archives after 30 days of inactivity (compliance-focused)
- Q: When should users receive email notifications about forwarded documents? → A: Notify on exceptions only - Alert when documents need review or extraction fails, silent success for auto-routed docs (minimal noise)
- Q: Should the system support manual bulk drag-and-drop upload, or is it email forwarding only? → A: Email forwarding integrates with existing upload workflows - AP Invoices already has document upload, Expense Claims has batch submission system. No new upload UI needed
- Q: How should the system match forwarded bank statements to the correct bank account in Groot? → A: Remove bank statements from email forwarding scope entirely - password-protected PDFs and login-required downloads make email forwarding impractical. Keep existing manual CSV upload workflow for bank reconciliation

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Email Forwarding for Expense Receipts (Priority: P1)

An employee returns from a business trip with 15 receipt photos on their phone. Instead of manually uploading each receipt through the expense claims UI, they forward all 15 photos in a single email to `docs@mycompany.hellogroot.com`. AI automatically classifies each attachment as an expense receipt, extracts vendor names, amounts, dates, and categories, and creates draft expense claims within their existing expense submission batch. The employee logs into Groot 10 minutes later and finds all 15 receipts already processed and waiting for review, reducing submission time from 30 minutes to 3 minutes.

**Why this priority**: Highest immediate business value - expense claims are the most frequent document workflow, and email forwarding eliminates the "download from phone → upload to web" friction. Integrates with existing batch submission system without new UI development.

**Independent Test**: Can be fully tested by forwarding receipt images to the inbox email and verifying that draft expense claims are auto-created in the user's existing expense submission. Delivers immediate value by eliminating manual upload steps.

**Acceptance Scenarios**:

1. **Given** an employee forwards an email with 10 receipt attachments to `docs@mycompany.hellogroot.com`, **When** the system processes the email, **Then** AI classifies each attachment as "expense receipt", extracts data from each receipt, and creates 10 draft expense claims in the user's active submission batch (or creates a new batch if none exists)
2. **Given** a receipt is successfully processed with high confidence (≥85%), **When** the employee views the auto-created draft claim in their submission, **Then** they see a confidence badge indicating AI accuracy, extracted fields pre-filled (vendor, amount, date, category), and can approve/edit the data
3. **Given** a receipt image is blurry or damaged (confidence <85%), **When** the system processes it, **Then** the document is routed to the "Needs Review" inbox with low-confidence flag, and the employee receives an email notification to manually classify it

---

### User Story 2 - Email Forwarding for AP Invoices (Priority: P2)

An AP accountant receives vendor invoices via email throughout the day. Instead of downloading attachments and manually uploading them to Groot, they forward invoice emails to `docs@mycompany.hellogroot.com`. AI automatically extracts vendor name, invoice number, amounts, line items, and payment terms. If a PO number is detected in the invoice, the system auto-matches it to the existing purchase order. This reduces invoice processing time from 10 minutes per invoice to 1 minute.

**Why this priority**: Competitive parity with MindHive PAGE's inbox feature - this is explicitly mentioned as a P1 gap. Email forwarding is a key differentiator for AP automation tools. Depends on P1's AI classification foundation but adds critical email integration layer.

**Independent Test**: Can be fully tested by forwarding a vendor invoice email to the business's dedicated inbox address and verifying that the invoice appears in the AP Invoices tab with extracted data and PO matching (if applicable). Delivers value by eliminating manual upload steps.

**Acceptance Scenarios**:

1. **Given** an AP accountant receives a vendor invoice email, **When** they forward the email to `docs@mycompany.hellogroot.com`, **Then** the system parses all PDF/image attachments, classifies them as AP invoices, extracts vendor and invoice details, and routes them to the AP Invoices inbox tab
2. **Given** a forwarded invoice contains a PO number, **When** the AI extracts the PO number from the document, **Then** the system automatically matches the invoice to the existing purchase order and pre-populates 3-way matching fields
3. **Given** a forwarded email contains multiple attachments (invoice + supporting docs), **When** the system processes the email, **Then** it correctly identifies which attachment is the primary invoice and which are supporting documents, grouping them together

---

### User Story 3 - Needs Review Inbox (Priority: P2)

A finance manager receives an email notification that 5 documents failed auto-classification. They open the "Needs Review" inbox and see only the documents that require manual intervention (blurry receipts, unknown document types, low-confidence classifications). Each document shows its source, AI's best-guess type (if any), confidence score, and extracted preview. They manually classify the 5 documents in under 2 minutes by selecting the correct document type, which immediately routes them to the appropriate workflow (expense claims or AP invoices).

**Why this priority**: Provides exception handling for the auto-routing system. Most documents (70%+) never reach this inbox because they auto-route successfully. This inbox is only for the "long tail" that AI can't confidently classify. Depends on P1 (email forwarding for receipts) and P2 (email forwarding for AP invoices) establishing the auto-routing foundation.

**Independent Test**: Can be fully tested by forwarding ambiguous documents (blurry images, non-standard formats) and verifying they appear in the "Needs Review" inbox with manual classification options. Delivers value by providing a recovery path for AI failures without blocking the happy path.

**Acceptance Scenarios**:

1. **Given** a document has been processed with low confidence (<85%), **When** a user opens the "Needs Review" inbox, **Then** they see only documents requiring manual intervention, with columns: date received, source, AI's suggested type (if any), confidence %, thumbnail preview, and "Classify" action button
2. **Given** a document in the "Needs Review" inbox shows AI's suggested type with 60% confidence, **When** the user clicks "Classify", **Then** they see a dropdown with document types (Expense Receipt, AP Invoice, E-Invoice) and can select the correct type to route the document
3. **Given** a user manually classifies a document as "Expense Receipt", **When** they confirm the classification, **Then** the document is immediately removed from the "Needs Review" inbox, a draft expense claim is auto-created with extracted data in their active expense submission, and the user receives a confirmation notification

---

### Edge Cases

- **What happens when a user uploads a document type that doesn't match any known category?** System classifies it as "Unknown" type with 0% confidence, routes to manual review queue, and prompts user to select document type from dropdown
- **How does the system handle duplicate documents?** AI compares file hash and extracted metadata (vendor + amount + date) against existing documents in the past 90 days. If duplicate detected, system flags it with "Possible Duplicate" badge and shows link to original document
- **What if an email forwarded to the inbox contains no attachments or only non-document files (e.g., .txt, .html)?** System sends auto-reply email to sender explaining that no supported document attachments were found, lists supported formats (PDF, JPG, PNG for receipts and invoices), and provides link to existing expense claims and AP invoices upload workflows
- **How does the system handle very large files (>10MB) or emails with many attachments?** For attachments >10MB, system rejects the file and sends auto-reply email explaining the size limit and suggesting compression or splitting. For emails with 20+ attachments, system processes all attachments but may queue some for sequential processing to avoid overwhelming the extraction pipeline
- **What if AI extraction fails or times out?** Document status changes to "Extraction Failed", user receives email notification with error details and direct link to "Needs Review" inbox, document remains in inbox with "Retry" action button that re-triggers extraction pipeline
- **How does the system handle documents in non-English languages or non-standard formats?** AI uses multi-language OCR (Gemini Vision supports 100+ languages). If language detection fails or format is unsupported, document is flagged for manual review with language/format indicator
- **What if a user accidentally forwards personal/non-business documents to the inbox email?** System processes all documents but provides "Delete" action in inbox. Users can mark documents as "Personal/Not Business" which excludes them from reporting and analytics
- **How does the system prevent email spoofing or unauthorized document submissions?** Email processor validates sender domain against business's authorized domains list (set in business settings). Emails from unauthorized domains are quarantined and business admin receives security alert

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a "Needs Review" inbox accessible from the main sidebar navigation for documents requiring manual classification (confidence <85% or extraction failures). Successfully auto-routed documents (≥85% confidence) do NOT appear in any inbox - they go directly to their destination workflow
- **FR-002**: System MUST integrate with existing upload workflows: Expense Claims batch submission system (existing) and AP Invoices document upload API (existing). No new upload UI required - email forwarding is the primary ingestion method
- **FR-003**: System MUST accept the following file formats from email attachments: PDF, JPG, PNG (receipt and invoice document formats). CSV/XLSX not required as bank statements are out of scope
- **FR-004**: System MUST enforce a maximum file size limit of 10MB per individual file
- **FR-005**: System MUST provide a dedicated email address per business in the format `docs@{business-slug}.hellogroot.com` for email forwarding
- **FR-006**: System MUST parse email attachments from forwarded emails and extract all supported document formats
- **FR-007**: System MUST use AI to auto-classify each document into one of the following types: Expense Receipt, AP Invoice, E-Invoice, Unknown. Bank statements are explicitly OUT OF SCOPE due to password-protected PDFs and login-required downloads
- **FR-008**: System MUST calculate and display a confidence score (0-100%) for each AI classification
- **FR-009**: System MUST automatically route documents to the appropriate processing pipeline based on detected type AND confidence score. High-confidence documents (≥85%) MUST be immediately routed to their destination (Expense Receipt → auto-create draft expense claim in user's active expense submission, AP Invoice → auto-create AP invoice entry via existing document upload API, E-Invoice → existing LHDN pipeline). Low-confidence documents (<85%) MUST be held in the inbox "Needs Review" queue for manual classification before routing
- **FR-010**: System MUST display documents requiring manual intervention in the "Needs Review" inbox table with columns: Date Received, Source (Email), Document Type (AI suggestion), Confidence %, Thumbnail Preview, Actions (Classify/Delete)
- **FR-011**: System MUST provide a "Needs Review" inbox that displays only documents with confidence <85% or extraction failures. Supported document types in this inbox: Expense Receipt, AP Invoice, E-Invoice, Unknown. Optional: Finance managers MAY have access to an "All Documents" audit view showing all processed documents (both auto-routed and manually classified) with filtering by type and date range
- **FR-012**: System MUST track document processing status through the following states: Received → Processing → Extracted → To Review → Approved/Filed
- **FR-013**: System MUST route documents with confidence <85% to the "Needs Review" inbox instead of auto-creating drafts. These documents MUST display confidence score, detected type (if any), and allow manual classification override before routing to destination
- **FR-014**: System MUST detect and flag potential duplicate documents based on file hash and extracted metadata (vendor + amount + date within 90-day window)
- **FR-015**: System MUST provide action buttons on each inbox document: Review (opens detail view), Approve (confirms AI classification and triggers downstream processing), Reject (marks for manual reclassification), Delete
- **FR-016**: System MUST send email auto-reply to forwarded emails with no valid attachments, explaining supported formats
- **FR-017**: System MUST validate sender email domain against business's authorized domains list and quarantine unauthorized submissions
- **FR-018**: System MUST extend the existing `finanseal-einvoice-email-processor` Lambda to handle all document types (not just LHDN e-invoices)
- **FR-019**: System MUST preserve email metadata (sender, subject, body, timestamp) alongside document metadata for audit trail
- **FR-020**: System MUST provide real-time upload progress indicators showing: files uploaded, files processing, files completed, files failed
- **FR-021**: Users MUST be able to manually override AI classification by selecting a different document type from a dropdown
- **FR-022**: System MUST persist all documents to secure storage (S3 via CloudFront signed URLs) with appropriate business-level access controls
- **FR-023**: System MUST log all document ingestion events (upload, email receipt, classification, approval, rejection) for compliance audit trail
- **FR-024**: System MUST handle multi-language documents using Gemini Vision's multilingual OCR capabilities
- **FR-025**: System MUST implement a document retention policy: successfully processed financial documents (receipts, invoices, statements) MUST be retained for 7 years from processing date for audit compliance. Documents in "Needs Review" inbox with no user action for 30 days MUST be auto-archived (moved to long-term storage but still accessible via search)
- **FR-026**: System MUST add retention metadata to each document: processing date (when routed to destination), archive date (when eligible for archiving), deletion date (7 years after processing). Documents MUST NOT be permanently deleted before the retention period expires
- **FR-027**: System MUST send email notifications only for exception cases: (1) documents routed to "Needs Review" inbox due to low confidence (<85%), (2) extraction failures or timeouts, (3) unauthorized email submissions (domain validation failures). System MUST NOT send notifications for successfully auto-routed high-confidence documents
- **FR-028**: Exception notification emails MUST include: document filename, detected type (if any), confidence score, reason for requiring attention (low confidence/extraction failed/unauthorized), and direct link to "Needs Review" inbox or error details

### Key Entities

- **Document Inbox Entry**: Represents a document received through any ingestion channel (upload/email/API). Attributes: unique ID, business ID, date received, source type (email/upload/API), original filename, file storage reference (S3 key), document type (expense/invoice/statement/e-invoice/unknown), AI confidence score (0-100%), processing status (received/processing/extracted/to_review/approved/filed/rejected/archived), extracted metadata JSON (varies by document type), email metadata (if source is email: sender, subject, body, timestamp), duplicate flag, retention metadata (processing date, archive eligibility date [processing date + 30 days for "Needs Review", N/A for auto-routed], deletion eligibility date [processing date + 7 years]), created timestamp, last updated timestamp
- **Email Forwarding Configuration**: Per-business settings for email-based document ingestion. Attributes: business ID, inbox email address (`docs@{business-slug}.hellogroot.com`), authorized sender domains list (for security), notification preferences (send confirmations/errors to business admin), enabled status (on/off toggle)
- **Processing Pipeline**: Defines the auto-routing logic for each document type. Attributes: document type, extraction service (Gemini Vision for receipts/invoices, CSV parser for statements), downstream action (create draft expense claim, create AP invoice, create bank import session), confidence threshold for auto-processing (default 85%), retry policy (attempts, backoff)
- **Document Classification Rule**: AI model configuration for document type detection. Attributes: document type, training data reference (S3 path to DSPy model state), classification prompt template, confidence calibration settings, last optimization timestamp

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can forward an email with 15 receipt attachments and have all documents processed (classified + extracted + draft claims created) within 5 minutes (10x faster than manual one-by-one submission)
- **SC-002**: AI classification achieves ≥90% accuracy across supported document types (expense receipts, AP invoices) as measured against human review
- **SC-003**: Email forwarding reduces document submission time by 80% compared to manual download-then-upload workflow (from average 2 minutes per document to 24 seconds)
- **SC-004**: 70% of documents are auto-classified with ≥85% confidence and require no manual review (straight-through processing rate)
- **SC-005**: Zero unauthorized documents are processed (100% success rate for sender domain validation and security quarantine)
- **SC-006**: Duplicate detection prevents 95% of accidental re-submissions within the 90-day window
- **SC-007**: System handles peak load of 100 concurrent email forwarding events (each with 1-15 attachments) without degradation in processing time or email delivery delays
- **SC-008**: 85% of users adopt email forwarding within 30 days of feature launch (measured by at least one email-forwarded document per active user)
- **SC-009**: Average time-to-approval for auto-classified documents is under 30 seconds (from inbox arrival to user approval)
- **SC-010**: Document processing failure rate is <5% (excluding user-submitted corrupted/invalid files)

## Assumptions *(documented for clarity)*

1. **Confidence Threshold**: AI classification confidence of 85% is the industry-standard threshold for auto-processing vs. manual review. This threshold balances automation rate with accuracy risk.
2. **Email Parsing**: System will use standard RFC 5322 email parsing libraries to extract attachments, sender, subject, and body. No custom email protocol handling required.
3. **File Size Limits**: 10MB per file is sufficient for 99% of business documents (receipts, invoices, statements). Larger files are rare edge cases that can be handled via compression or splitting.
4. **Email Attachment Limit**: Typical email providers (Gmail, Outlook) limit attachments to 20-25 files per email or 25MB total. System design assumes users forward emails with 1-20 attachments. Emails exceeding limits will be rejected by email provider before reaching Groot's SES inbox.
5. **Duplicate Window**: 90-day duplicate detection window aligns with typical accounting periods and prevents most accidental re-submissions without excessive storage overhead for comparison.
6. **Language Support**: Gemini Vision's multilingual OCR is sufficient for SE Asian markets (English, Malay, Thai, Vietnamese, Mandarin, Tamil). No custom language models required at launch.
7. **Security Model**: Sender domain validation (not individual email authentication) is sufficient for email forwarding security. This balances security with usability (users can forward from any email address within their authorized domain).
8. **SES Infrastructure**: Existing `finanseal-einvoice-email-processor` Lambda architecture (SES → S3 → Lambda trigger) can be extended to handle all document types with routing logic changes. No new AWS infrastructure required.
9. **Storage Strategy**: All documents will use existing S3 bucket (`finanseal-bucket`) with CloudFront signed URLs for secure access. No separate storage layer for inbox documents.
10. **Processing Time**: Gemini Vision API processing time (2-5 seconds per document) is acceptable for user workflows. No need for specialized OCR services or batch processing optimization at launch.
11. **Document Retention**: 7-year retention period aligns with Malaysian Income Tax Act 1967 requirements for financial record keeping. "Needs Review" inbox 30-day auto-archive prevents indefinite accumulation of unclassified documents while giving users sufficient time to triage.
12. **Notification Strategy**: "Notify on exceptions only" follows the principle of minimal interruption - users trust that forwarded documents are handled successfully unless notified otherwise. This reduces notification fatigue while ensuring timely attention to documents requiring human intervention.
13. **Existing Upload Workflows**: AP Invoices already has document upload via API (`POST /api/v1/expense-claims` with file attachment). Expense Claims has batch submission system (`expense_submissions` table) where users create submissions and add multiple receipts. Email forwarding integrates with these existing systems rather than creating new upload UI, reducing scope and avoiding duplicate functionality.
14. **Bank Statements Excluded**: Malaysian banks (Maybank, CIMB, RHB, etc.) send statements as password-protected PDFs or login-required portal links, not as forwardable attachments. Email forwarding is impractical for bank statements. Existing manual CSV upload workflow remains the primary bank reconciliation data ingestion method.

## Out of Scope *(explicitly excluded from this feature)*

1. **Advanced workflow automation**: This feature focuses on document ingestion and classification only. Downstream approval workflows (expense claim approval, invoice posting, bank reconciliation matching) are handled by existing domain-specific modules.
2. **Document editing/annotation**: Users cannot edit or annotate documents within the "Needs Review" inbox. They can only review AI-extracted metadata, manually classify document type, and route to destination.
3. **Multi-document merging**: If a user accidentally forwards the same invoice split across multiple attachments (page 1, page 2, etc.), the system will not auto-merge them. This requires manual handling.
4. **OCR for handwritten documents**: AI extraction focuses on typed/printed text. Handwritten receipts or invoices may have lower accuracy and will be flagged for manual review in "Needs Review" inbox.
5. **Integration with third-party accounting software**: This feature does not include export to QuickBooks, Xero, or other external systems. Email forwarding is for internal Groot Finance workflow only.
6. **Mobile app optimization**: Email forwarding works from any device (users forward from phone email apps), but the "Needs Review" inbox web UI is not mobile-optimized. Mobile-specific features (camera capture, native app upload) are out of scope.
7. **Real-time collaboration**: Multiple users cannot simultaneously review/edit the same document in the "Needs Review" inbox. Standard Convex real-time updates apply, but no conflict resolution or locking mechanism.
8. **New upload UI**: This feature does NOT create new drag-and-drop upload interfaces. It integrates with existing upload workflows (Expense Claims batch submission, AP Invoices document API).
9. **Bank statements email forwarding**: Bank statements are explicitly excluded due to real-world constraints (password-protected PDFs from banks, login-required downloads, no actual PDF attachments). Bank reconciliation continues to use existing manual CSV upload workflow.

## Dependencies & Constraints

### Technical Dependencies
- **Existing SES Infrastructure**: Must extend `finanseal-einvoice-email-processor` Lambda without breaking existing LHDN e-invoice email pipeline
- **Gemini Vision API**: Document extraction relies on Gemini 3.1 Flash-Lite API availability and rate limits
- **S3 Storage**: Inbox documents stored in existing `finanseal-bucket` with CloudFront signed URL access
- **Convex Real-time Sync**: Inbox status updates must leverage Convex subscriptions for real-time UI updates

### Business Constraints
- **PDPA Compliance**: All document storage and email processing must comply with Malaysia's Personal Data Protection Act (encryption at rest, audit logging, data retention policies)
- **Multi-tenancy Security**: Business-level access controls must prevent cross-tenant document access (business A cannot see business B's inbox)
- **Email Domain Registration**: Each business slug must be unique to generate non-conflicting inbox email addresses (`docs@{business-slug}.hellogroot.com`)

### Integration Constraints
- **Expense Claims Module**: Auto-created draft expense claims must integrate with existing `expense_claims` and `expense_submissions` tables without schema changes
- **AP Invoices Module**: Auto-created AP invoices must integrate with existing `invoices` table and 3-way matching workflow
- **Existing Classification Pipeline**: Must extend the existing `classify-document` Trigger.dev task (currently validates receipts vs non-receipts for expense claims) to support multi-domain routing (expense receipts → expense_claims, AP invoices → invoices table)

## Related Issues & References

- **Competitor Analysis**: MindHive PAGE — Inbox (6) with Purchase Orders | Invoices | Matching tabs (competitive parity requirement)
- **Existing Infrastructure**: SES email processing (`finanseal-einvoice-email-processor` Lambda) — extend for all document types
- **Existing Features**:
  - Document classification (`classify-document` Trigger.dev task) — extend for multi-domain routing
  - Document processing Lambda (`finanseal-document-processor`) — reuse for receipt/invoice extraction
  - Batch expense submission (`expense_submissions` table) — integrate with email-forwarded receipts
  - AP invoice processing (`invoices` table) — integrate with email-forwarded invoices
- **GitHub Issue**: grootdev-ai/groot-finance#319
