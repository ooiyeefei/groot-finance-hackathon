# Feature Specification: LHDN e-Invoice Flow 2 — Expense Claim E-Invoice Retrieval

**Feature Branch**: `019-lhdn-einv-flow-2`
**Created**: 2026-02-25
**Status**: Draft
**Input**: GitHub Issue #228 — LHDN e-Invoice Flow 2: Expense Claim E-Invoice Retrieval (AI Browser Agent)
**Related Issues**: #75 (LHDN MyInvois integration — parent), #227 (Flow 1: Sales Invoice Submission), #198 (e-invoice schema — completed)

## Clarifications

### Session 2026-02-25

- Q: Should self-billed e-invoices be included in this feature's scope? → A: No — self-billing is already fully specified in Flow 1 (`001-lhdn-einvoice-submission`, User Story 4, FR-018–FR-021). Flow 2 handles retrieval only; self-billing is a submission concern.
- Q: Does the user wait for the AI agent to complete the merchant form, or is it asynchronous? → A: Asynchronous, consistent with Flow 1's pattern. Request is queued immediately, user can navigate away, status updates in real-time on the expense claim, notification on completion or failure.
- Q: Should the system match only requested e-invoices or all received LHDN e-invoices? How should matching work? → A: Both channels — dual-channel retrieval. (1) **System email channel**: AI agent fills a trackable system email (`einvoice+{claimRef}@hellogroot.com`) on the merchant form. When merchant emails the e-invoice to that address, deterministic matching via the `+` suffix. Faster — arrives immediately. (2) **LHDN polling channel**: Poll received documents, match via buyer email in the raw UBL document (deterministic) or fall back to amount + date + vendor TIN (fuzzy). Authoritative compliance record. Three matching tiers: Tier 1 (deterministic) — parse buyer email `+` suffix from LHDN raw doc or system email inbox; Tier 2 (high confidence) — supplierTin + total + dateTimeIssued within ±1 day; Tier 3 (fuzzy) — supplierName + total + dateTimeIssued — flag for manual review.
- Q: Who resolves ambiguous e-invoice matches (Tier 3 or multi-candidate)? → A: The employee who submitted the expense claim. They review and confirm matches before submitting claims to their manager — this fits naturally into the existing pre-submission review flow. No finance admin involvement needed for routine matching.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — QR Code Detection from Receipt (Priority: P1)

An employee purchases goods or services from a merchant (petrol station, restaurant, ride-hailing, etc.) and uploads the receipt photo to an expense claim. The system automatically detects QR codes on the receipt image — specifically the merchant's buyer-info QR code that links to the merchant's form for collecting the buyer's company details. The detected URL is stored on the expense claim so the employee can later request an e-invoice.

**Why this priority**: This is the foundational capability. Without QR detection, the entire automated e-invoice request flow is impossible — the system has no way to know where to send the buyer's company information. It also unlocks the highest-value user story (Story 2) by providing the merchant form URL.

**Independent Test**: Can be tested by uploading receipt images that contain QR codes and verifying the system correctly extracts the URL. Delivers immediate value by surfacing the merchant's e-invoice request link that employees would otherwise need to scan manually.

**Acceptance Scenarios**:

1. **Given** an employee uploads a receipt photo containing a merchant buyer-info QR code, **When** the receipt is processed, **Then** the QR code URL is detected and stored on the expense claim.
2. **Given** a receipt photo contains multiple QR codes (merchant form QR + payment QR), **When** the receipt is processed, **Then** the system identifies and stores the URL-type QR code(s), prioritizing those that appear to link to buyer information forms.
3. **Given** a receipt photo has no QR code, **When** the receipt is processed, **Then** the expense claim is created normally without a merchant form URL (existing OCR flow continues as-is).
4. **Given** a receipt photo is blurry or partially obscured, **When** QR detection fails, **Then** the expense claim is created normally, and no error is shown to the user (graceful degradation).
5. **Given** a receipt photo contains an LHDN validation QR code (`myinvois.hasil.gov.my/...`), **When** the receipt is processed, **Then** the system distinguishes it from a merchant buyer-info QR and does not use it as the merchant form URL.

---

### User Story 2 — Request E-Invoice via AI Agent (Priority: P1)

After a merchant form URL has been detected from a receipt (Story 1), the employee clicks "Request E-Invoice" on their expense claim. The system's AI agent automatically visits the merchant's buyer-info form, fills in the company's details (TIN, BRN, company name, address) and a **trackable system email address** (with an encoded reference to this specific expense claim), then submits the form on behalf of the employee. This eliminates the manual process of scanning the QR code, opening the form, and typing in company details for every receipt. The trackable email also enables deterministic matching when the merchant sends the e-invoice (see Story 3).

**Why this priority**: This is the core value proposition — transforming a repetitive manual task (fill out merchant form for every receipt) into a one-click automated action. Businesses process dozens to hundreds of receipts monthly; automating this saves significant time and reduces errors.

**Independent Test**: Can be tested by triggering the "Request E-Invoice" action on an expense claim with a merchant form URL and verifying the AI agent successfully navigates to the form, fills in company details, and submits. Delivers the primary time-saving benefit.

**Acceptance Scenarios**:

1. **Given** an expense claim has a detected merchant form URL, **When** the employee views the expense claim detail, **Then** a "Request E-Invoice" button is visible.
2. **Given** the employee clicks "Request E-Invoice", **When** the request is initiated, **Then** the request is queued immediately, the expense claim status updates to "E-Invoice Requesting" in real-time, and the employee can navigate away without waiting.
3. **Given** the AI agent successfully submits the merchant form in the background, **When** the submission completes, **Then** the expense claim updates to "E-Invoice Requested" status and the employee receives an in-app notification of success.
4. **Given** the AI agent fails to complete the form (page not loading, form structure unrecognizable, CAPTCHA blocking), **When** the failure occurs, **Then** the employee receives an in-app notification with a clear message and is offered the option to manually open the merchant's form URL in their browser.
5. **Given** the business has not configured required LHDN settings (TIN, BRN, company address), **When** the employee clicks "Request E-Invoice", **Then** the system blocks the action and displays a message directing them to ask an admin to complete Business Settings.
6. **Given** an expense claim has no merchant form URL detected, **When** viewing the expense claim detail, **Then** the "Request E-Invoice" button is not shown.
7. **Given** an e-invoice has already been requested or attached for this claim, **When** viewing the expense claim detail, **Then** the "Request E-Invoice" button is replaced by the current e-invoice status.

---

### User Story 3 — Dual-Channel E-Invoice Retrieval and Matching (Priority: P1)

After the AI agent submits the buyer-info form (Story 2) with a trackable system email, the merchant processes the request and issues an e-invoice. The system retrieves the e-invoice through two complementary channels and matches it to the originating expense claim:

- **Email channel (fast)**: The merchant emails the e-invoice to the system email address provided on the form (e.g., `einvoice+{claimRef}@hellogroot.com`). The system parses the `+` suffix to deterministically identify the expense claim. This arrives immediately after the merchant processes the request.
- **LHDN polling channel (authoritative)**: The system periodically polls LHDN's received documents feed. When new documents appear, the system reads the full document to extract the buyer email (which contains the same `+` suffix), enabling deterministic matching. For documents without the system email (e.g., merchants that didn't email or proactively issued e-invoices), the system falls back to matching by amount, date, and vendor TIN/name.

The LHDN channel provides the authoritative compliance record (document UUID, long ID, validation status) that gets stored on the expense claim.

**Why this priority**: Without retrieval and matching, the e-invoice request (Story 2) has no completion — the employee would never see the result. The dual-channel approach provides both speed (email arrives immediately) and reliability (LHDN is the authoritative source). This closes the loop with a verified compliance document attached to the expense claim.

**Independent Test**: Can be tested by: (1) simulating an email to the system inbox with a valid `+` suffix and verifying deterministic matching, (2) simulating received LHDN documents and verifying the 3-tier matching algorithm pairs them with the correct expense claims.

**Acceptance Scenarios**:

1. **Given** a merchant emails an e-invoice to the system email address with a `+{claimRef}` suffix, **When** the system receives the email, **Then** it parses the suffix, identifies the expense claim, and stores the e-invoice document — updating the claim's status to "E-Invoice Received (Pending LHDN Confirmation)".
2. **Given** the system polls LHDN received documents, **When** a new document's raw UBL contains a buyer email with the system's `+{claimRef}` suffix, **Then** the e-invoice reference (UUID, long ID, status) is deterministically attached to the matching expense claim (Tier 1 match).
3. **Given** a received LHDN document has no recognizable system email in the buyer field, **When** the document's `supplierTin` + `total` + `dateTimeIssued` (±1 day) match a single expense claim, **Then** the system auto-attaches with high confidence (Tier 2 match).
4. **Given** a received LHDN document matches only by supplier name (fuzzy) + total + date, **When** the system encounters it, **Then** the match is flagged for manual review rather than auto-attached (Tier 3 match).
5. **Given** multiple expense claims could potentially match a received e-invoice (same vendor, same amount, similar date), **When** the match is ambiguous, **Then** the system notifies the employee (claim owner) and presents the candidate matches for manual selection within their expense claim review flow.
6. **Given** the merchant has not yet issued the e-invoice (async delay — may take hours or days), **When** polling finds no match, **Then** the expense claim remains in "E-Invoice Requested" status with no error shown to the user.
7. **Given** a received e-invoice is subsequently cancelled by the merchant on LHDN, **When** the system detects the cancellation during polling, **Then** the expense claim's e-invoice status is updated to "Cancelled" and the employee is notified.
8. **Given** a merchant proactively issues an e-invoice (without a prior request from the employee), **When** the system discovers it during LHDN polling, **Then** the system attempts Tier 2/3 matching against all unmatched expense claims in the business.

---

### User Story 4 — Manual E-Invoice Upload (Priority: P2)

An employee receives an e-invoice directly from a merchant (via email or download) and wants to attach it to their expense claim manually. The system allows uploading an e-invoice document and associating it with the claim without going through the automated QR detection and AI agent flow.

**Why this priority**: Not all merchants have QR codes on receipts. Some merchants email e-invoices directly. This provides a fallback path ensuring all expense claims can have e-invoices attached regardless of the merchant's process.

**Independent Test**: Can be tested by uploading an e-invoice document to an expense claim and verifying it is stored and displayed correctly.

**Acceptance Scenarios**:

1. **Given** an employee views an expense claim without an attached e-invoice, **When** they click "Upload E-Invoice", **Then** they can upload a document (PDF or image) as the e-invoice for this claim.
2. **Given** the employee uploads an e-invoice document, **When** the upload completes, **Then** the document is stored and the expense claim shows "E-Invoice Attached (Manual)" status.
3. **Given** an expense claim already has an e-invoice attached (from any source), **When** the employee views the claim, **Then** the upload option is replaced by the current e-invoice details.

---

### User Story 5 — View E-Invoice Status on Expense Claims (Priority: P2)

A business owner, manager, or employee can see the e-invoice status of expense claims at a glance — whether an e-invoice has been requested, is pending, has been attached, or is not applicable. The expense claim detail page shows the full e-invoice information including the source (auto-detected from merchant, manually uploaded), the LHDN verification QR code (when available), and any relevant timestamps.

**Why this priority**: Visibility is essential for compliance tracking. Managers approving expense claims need to know if supporting e-invoices exist. Important but secondary to the core automation (Stories 1-3).

**Independent Test**: Can be tested by viewing expense claims with various e-invoice statuses and verifying the correct status indicators and details are displayed.

**Acceptance Scenarios**:

1. **Given** an expense claim has an attached e-invoice with an LHDN long ID, **When** viewing the claim detail, **Then** an LHDN verification QR code is displayed that links to the official LHDN verification page.
2. **Given** an expense claim has no e-invoice and no merchant QR was detected, **When** viewing the claim detail, **Then** the e-invoice section shows "No E-Invoice" with the option to upload one manually.
3. **Given** an expense claim has an e-invoice requested but not yet received, **When** viewing the claim detail, **Then** the e-invoice section shows "Requested — Awaiting Merchant" status.
4. **Given** a manager is reviewing expense claims for approval, **When** viewing the claims list, **Then** each claim shows an e-invoice status indicator (badge or icon) alongside existing status information.

---

### Edge Cases

- What happens when the merchant's QR code URL expires or becomes invalid? The AI agent reports a failure, and the employee is offered the option to manually open the URL or upload an e-invoice later.
- What happens when the same merchant form URL appears on multiple receipts (e.g., same petrol station visited multiple times)? Each expense claim gets its own independent "Request E-Invoice" action — each receipt results in a separate merchant form submission.
- What happens when the AI agent encounters a CAPTCHA or anti-bot protection on the merchant form? The agent reports the form could not be completed, and the employee is provided the direct URL to fill the form manually in their browser.
- What happens when an employee submits an expense claim before the e-invoice is attached? The expense claim follows the normal approval workflow. The e-invoice can be attached asynchronously — before or after claim approval.
- What happens when a received LHDN e-invoice matches no expense claims? The system logs the unmatched document for periodic review but does not create expense claims automatically.
- What happens when a merchant issues multiple e-invoices for the same transaction (e.g., correction/replacement)? The system attaches the most recent valid e-invoice and updates the expense claim's reference.
- What happens to expense claims created before this feature exists? Existing claims have no e-invoice fields populated. The system treats them as "No E-Invoice" without any errors.
- What happens when the business's LHDN authentication token expires during polling? The system handles token refresh transparently. If refresh fails, polling pauses and an admin is notified.
- What happens when a merchant emails an e-invoice but the `+` suffix is malformed or missing? The system falls back to parsing the email content/attachment and attempts Tier 2/3 matching against expense claims. The email is logged for review.
- What happens when both channels deliver the same e-invoice (email arrives first, LHDN polling finds it later)? The LHDN record is treated as authoritative — the system merges the LHDN document reference (UUID, long ID) onto the expense claim that was already matched via email, upgrading the compliance record.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect QR codes in uploaded receipt images during the existing receipt processing pipeline.
- **FR-002**: System MUST extract URLs from detected QR codes and distinguish merchant buyer-info form URLs from LHDN validation QR codes.
- **FR-003**: System MUST store the detected merchant form URL on the expense claim record.
- **FR-004**: System MUST provide a "Request E-Invoice" action on expense claims that have a detected merchant form URL and no existing e-invoice attachment.
- **FR-005**: System MUST automatically fill the merchant's buyer-info form with the business's company details (TIN, BRN, company name, registered address) sourced from Business Settings, and a trackable system email address that encodes a reference to the specific expense claim (e.g., `einvoice+{claimRef}@hellogroot.com`).
- **FR-006**: System MUST validate that required Business Settings (TIN, BRN, company address) are configured before allowing an e-invoice request.
- **FR-007**: System MUST handle AI agent failures gracefully, providing users with a fallback option to manually open the merchant form URL.
- **FR-008**: System MUST monitor a dedicated system email inbox (Google Group with `+` addressing) for incoming merchant e-invoice emails, parse the `+{claimRef}` suffix, and associate the received document with the corresponding expense claim.
- **FR-009**: System MUST periodically poll LHDN's received documents feed to discover newly received e-invoices for the business.
- **FR-010**: System MUST match received e-invoices to expense claims using a 3-tier strategy: Tier 1 (deterministic) — parse buyer email `+` suffix from LHDN raw document or system email; Tier 2 (high confidence) — supplier TIN + total amount + issue date within ±1 day; Tier 3 (fuzzy) — supplier name + total + date — flag for manual review.
- **FR-011**: System MUST auto-attach Tier 1 and Tier 2 matches, recording the LHDN document UUID, long ID, and validation status. Tier 3 matches and ambiguous cases (multiple candidate claims) MUST be flagged for manual review by the employee (claim owner) — presented within their expense claim review flow before submission to manager.
- **FR-011a**: System MUST attempt matching against ALL expense claims in the business — not only those with a prior e-invoice request — to catch proactively issued merchant e-invoices.
- **FR-012**: System MUST allow employees to manually upload e-invoice documents to expense claims as a fallback when automated retrieval is not possible.
- **FR-013**: System MUST display e-invoice attachment status on expense claims in both list view (badge/indicator) and detail view (full information).
- **FR-014**: System MUST display an LHDN verification QR code on the expense claim detail page when a received e-invoice has an LHDN long ID.
- **FR-015**: System MUST track the e-invoice source for each expense claim: "merchant_issued" (via automated request), "manual_upload" (employee uploaded), or "not_applicable" (no e-invoice).
- **FR-016**: System MUST track the e-invoice request lifecycle on expense claims: no request → requested → received/failed.
- **FR-017**: System MUST update the expense claim's e-invoice status if a previously attached e-invoice is cancelled on LHDN.
- **FR-018**: System MUST NOT block the expense claim approval workflow based on e-invoice status — claims can be approved with or without an attached e-invoice.

### Key Entities

- **Expense Claim (extended)**: Existing expense claim entity, extended with e-invoice tracking fields: merchant form URL (detected from receipt QR), e-invoice request status, LHDN received document reference (UUID, long ID, validation status), e-invoice source classification, and e-invoice attachment timestamps.
- **Merchant Form URL**: URL extracted from a QR code on a receipt image. Points to the merchant's buyer-information collection form (hosted by the merchant's POS vendor — e.g., SQL Accounting, AutoCount). Each merchant/POS system has a different form structure.
- **LHDN Received Document**: An e-invoice issued by a merchant and submitted to LHDN, which appears in the business's received documents feed. Key metadata from LHDN: `uuid`, `submissionUID`, `longId`, `internalId` (merchant's own reference), `supplierTin`, `supplierName`, `buyerTin`, `total`, `dateTimeIssued`, `status`. The raw UBL document also contains the buyer email field — critical for deterministic matching when the system email was used on the form.
- **System Email Inbox**: A dedicated Google Group email address (e.g., `einvoice@hellogroot.com`) that receives merchant e-invoice copies. Uses `+` addressing (sub-addressing) to encode expense claim references — e.g., `einvoice+{claimRef}@hellogroot.com`. Emails sent to any `+` variant are delivered to the same inbox, with the suffix preserved for parsing.
- **E-Invoice Match**: The association between a received document (via email or LHDN) and an expense claim. Three matching tiers: Tier 1 (deterministic) via buyer email `+` suffix, Tier 2 (high confidence) via supplier TIN + amount + date, Tier 3 (fuzzy) via supplier name + amount + date. Tier 1 and 2 are auto-attached; Tier 3 requires manual review.

## Dependencies

### Flow 1 — Sales Invoice Submission (#227)

Flow 1 must be built first as it establishes the shared LHDN authentication infrastructure. This feature (Flow 2) reuses the same authentication and LHDN connectivity for polling received documents.

### Business Settings — LHDN Configuration (#206)

The AI agent needs the business's TIN, BRN, company name, and registered address to fill merchant forms. These fields are being developed in #206. This feature reads those fields but does not provide forms to edit them.

### Existing Receipt OCR Pipeline

QR code detection will be added to the existing receipt image processing pipeline. The current pipeline handles OCR for vendor name, amount, and date extraction — QR detection extends this pipeline.

### Out of Scope

- **Self-billed e-invoices**: Handled by Flow 1 (`001-lhdn-einvoice-submission`, User Story 4). Self-billing is a submission concern (the buyer *issues* the e-invoice), not a retrieval concern. Flow 2 only handles receiving e-invoices from merchants.
- **Batch e-invoice requests**: Requesting e-invoices for multiple expense claims simultaneously is not included. Each claim is handled individually.
- **E-invoice rejection**: Rejecting a received e-invoice via LHDN's rejection mechanism (72-hour window) is not included in this feature.
- **Peppol received documents**: This feature is specific to LHDN MyInvois. Peppol received document handling is a separate concern.

## Assumptions

- Merchants print QR codes on receipts that link to their buyer-info collection forms. This is common practice for Malaysian e-invoice compliant merchants, though not universal.
- LHDN's received documents feed returns rich metadata per document: `uuid`, `submissionUID`, `longId`, `internalId`, `supplierTin`, `supplierName`, `buyerTin`, `total`, `dateTimeIssued`, `status`. The raw UBL document (via `GET /documents/{uuid}/raw`) additionally contains the buyer email field, which enables deterministic matching when the system email was used.
- Google Groups `+` addressing (sub-addressing) works reliably — emails to `einvoice+anything@hellogroot.com` are delivered to the `einvoice@hellogroot.com` group inbox with the `+` suffix preserved in the `To:` header.
- Most merchant POS systems include an email field on the buyer-info form and will send an e-invoice copy to the provided email. Not all merchants may send email copies, which is why LHDN polling serves as the authoritative backup channel.
- Merchant form submission is asynchronous — after the AI agent submits the buyer-info form, it may take the merchant hours or days to issue the actual e-invoice to LHDN. Users will not perceive this as a platform delay.
- The AI agent can handle most common merchant POS vendor forms. Some forms may be too complex (CAPTCHAs, multi-step verification) and will require manual fallback.
- The 3-tier matching strategy (deterministic email → high-confidence TIN+amount+date → fuzzy name+amount+date) covers the full confidence spectrum. The deterministic tier handles the majority of cases where the system email was used; fuzzy matching is a safety net for edge cases and proactive merchant issuances.
- Received documents are available via the LHDN feed for at least 31 days, providing a reasonable window for matching.
- An employee's expense claim approval workflow is independent of e-invoice attachment — managers can approve claims without waiting for the e-invoice.
- The "general TIN" fallback (EI00000000000) used in Flow 1 for buyers without TIN is not relevant here — in Flow 2, the business IS the buyer and should always have a configured TIN.
- Existing expense claims (created before this feature) will have no e-invoice fields populated. The system treats them as "No E-Invoice" without errors — full backward compatibility.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: QR codes on receipt images are detected with at least 90% accuracy for clear, well-lit receipt photos.
- **SC-002**: Employees can request an e-invoice from a detected merchant QR in 2 or fewer clicks from the expense claim detail page.
- **SC-003**: The AI agent successfully completes merchant buyer-info forms for at least 80% of supported merchant types on first attempt.
- **SC-004**: Received LHDN e-invoices are automatically matched to expense claims within 24 hours of appearing in the received documents feed.
- **SC-005**: Users can identify the e-invoice status of any expense claim at a glance in the claims list without opening the claim detail.
- **SC-006**: 100% of attached e-invoices with an LHDN long ID display a scannable verification QR code on the expense claim detail page.
- **SC-007**: When automated e-invoice request fails, 100% of users are provided with a clear fallback option (manual URL or manual upload) within the same screen.
- **SC-008**: The expense claim approval workflow is unaffected — no increase in approval processing time due to e-invoice features.
