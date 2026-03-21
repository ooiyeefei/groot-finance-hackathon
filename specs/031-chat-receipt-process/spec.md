# Feature Specification: Receipt Photo to Expense Claim via Chat

**Feature Branch**: `031-chat-receipt-process`
**Created**: 2026-03-21
**Status**: Draft
**Input**: GitHub Issue #347 — "Receipt photo → expense claim in one chat message"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Single Receipt Photo to Expense Claim (Priority: P1)

An employee takes a photo of a receipt (lunch, taxi, office supplies) and sends it in the chat. The AI agent processes the image, extracts the receipt details (merchant, amount, date, category, currency), and automatically creates an expense claim in "draft" status. The agent shows the extracted data for review. The employee can correct any details and then submit for approval — no explicit "confirm creation" step required.

**Why this priority**: This is the core value proposition of the feature — the "snap and claim" experience that eliminates manual data entry. It directly fulfills the Employee Personal Assistant persona ("snap receipt → auto-claim → track reimbursement"). Without this, the feature has no value.

**Independent Test**: Can be fully tested by sending a receipt photo in chat and verifying an expense claim is created with correct extracted data. Delivers immediate value — eliminates manual form-filling for expense claims.

**Acceptance Scenarios**:

1. **Given** an employee is in the chat interface, **When** they attach a receipt photo (JPEG/PNG) and send, **Then** the agent shows staged progress messages ("Uploading receipt...", "Reading receipt...", "Extracting details...") during processing and responds with extracted details (merchant name, amount, currency, date, category) within 30 seconds.

2. **Given** OCR extraction completes successfully, **When** the agent displays the extracted details, **Then** a draft expense claim is automatically created and linked to the employee's account with the receipt image attached. The agent presents an interactive card showing the extracted data with Submit, Edit, and Cancel buttons.

3. **Given** a draft expense claim exists from OCR extraction, **When** the employee taps "Submit" on the interactive card or says "submit for approval," **Then** the claim status changes to "submitted" and is routed to the employee's manager for approval.

4. **Given** the agent extracted incorrect details (e.g., wrong amount), **When** the employee corrects the details in chat (e.g., "The amount is RM25, not RM18"), **Then** the agent updates the claim with the corrected values and confirms the change.

5. **Given** the receipt image is blurry or unreadable, **When** the agent cannot extract key fields, **Then** it responds with a clear message explaining what it couldn't read and asks the employee to retake the photo or provide the missing details manually.

---

### User Story 2 - Chat Image Upload Capability (Priority: P1)

The chat input area supports attaching images (photos from camera or file picker). Users can attach an image alongside optional text, preview the image before sending, and remove it if needed.

**Why this priority**: This is a prerequisite for User Story 1. Without image upload capability in the chat, the receipt processing flow cannot begin. Co-equal priority with Story 1 since neither delivers value without the other.

**Independent Test**: Can be tested by attaching an image in chat and verifying it appears in the message thread. Even without OCR processing, the image upload capability is independently useful for sharing screenshots or documents with the agent.

**Acceptance Scenarios**:

1. **Given** an employee is in the chat interface, **When** they tap/click the attachment button, **Then** they can select an image from their device's file picker or camera (on mobile).

2. **Given** an employee has selected one or more images, **When** the images are being prepared, **Then** preview thumbnails appear in the chat input area, each with an option to remove individually.

3. **Given** an employee has attached an image, **When** they press send, **Then** the image is uploaded and the message (with image) appears in the conversation thread.

4. **Given** an employee attaches an image larger than 10 MB, **When** they try to send, **Then** the system shows a clear error message about the file size limit before upload begins.

5. **Given** an employee attaches a non-image file (e.g., .exe, .zip), **When** they try to send, **Then** the system rejects the file with a message specifying accepted formats (JPEG, PNG, HEIC, PDF).

---

### User Story 3 - Approval Routing After Submission (Priority: P2)

After the employee submits an expense claim created from a receipt photo, it is automatically routed to the appropriate manager based on existing business approval rules. The agent confirms who the claim was sent to.

**Why this priority**: Approval routing already exists in the expense claims module. This story ensures the chat-created claims integrate with the existing approval workflow rather than being orphaned. Lower priority because the value of P1 (creating the claim) stands alone — approval routing is an enhancement.

**Independent Test**: Can be tested by submitting a chat-created expense claim and verifying it appears in the manager's approval queue with correct details and the attached receipt.

**Acceptance Scenarios**:

1. **Given** an employee submits a chat-created expense claim, **When** the business has approval rules configured, **Then** the claim appears in the designated approver's queue with the receipt image, extracted details, and expense category.

2. **Given** an employee submits a claim, **When** the agent routes it to a manager, **Then** the agent responds with a confirmation: "Submitted to [Manager Name] for approval."

3. **Given** the business has no approval rules configured, **When** the employee submits a claim, **Then** the claim remains in "submitted" status and the agent informs the employee that no approver is assigned, suggesting they contact their admin.

---

### User Story 4 - Multi-Receipt Batch Submission (Priority: P3)

An employee sends multiple receipt photos — either attached to a single message or across consecutive messages (e.g., "Here are my receipts from the business trip"). The agent processes each one, creating individual expense claims. The employee can review all claims before batch-submitting for approval.

**Why this priority**: This is a convenience feature for power users who accumulate receipts. The core single-receipt flow (P1) must work first. This story extends it with batch review and submission.

**Independent Test**: Can be tested by sending 3 receipt photos (in one message or across messages) and verifying 3 distinct expense claims are created, each with correct extracted data from their respective receipt.

**Acceptance Scenarios**:

1. **Given** an employee attaches 3 receipt photos in a single message or consecutive messages, **When** all are processed, **Then** the agent creates 3 separate draft expense claims and presents a summary card listing all 3 with their amounts and merchants.

2. **Given** the agent has created multiple claims from a batch, **When** the employee says "submit all for approval," **Then** all claims are submitted and the agent confirms the batch submission with total amount.

---

### Edge Cases

- What happens when the receipt is in a foreign currency (e.g., THB receipt from a Malaysian business)? The system should extract the original currency and amount, flagging it for the employee to confirm the home currency equivalent.
- What happens when the same receipt is uploaded twice? The system should detect duplicate receipts (matching amount + merchant + date) and warn the employee before creating a second claim.
- What happens when the employee's business has no expense categories configured? The agent should use a default "General" category and inform the employee.
- What happens when the network drops during image upload? The upload should fail gracefully with a retry option, not create a partial or corrupt claim.
- What happens when a PDF receipt (not an image) is uploaded? The system should accept PDFs and process them through the same OCR pipeline.
- What happens when the receipt contains multiple items but the employee only wants to claim one? The agent should extract the total by default but allow the employee to specify a different amount.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The chat interface MUST support one or more image attachments (JPEG, PNG, HEIC, PDF) per message alongside text. Each attached image is processed independently, creating a separate draft expense claim per receipt.
- **FR-002**: Uploaded images MUST be stored securely and linked to the originating chat message and resulting expense claim.
- **FR-003**: The system MUST extract merchant name, transaction amount, currency, transaction date, and expense category from receipt images using OCR.
- **FR-004**: When OCR extraction confidence is low for any field, the system MUST flag the uncertain field and ask the employee to confirm or correct it.
- **FR-005**: The system MUST automatically create an expense claim in "draft" status immediately after successful OCR extraction, without requiring explicit user confirmation. The employee reviews and corrects before submitting.
- **FR-006**: Employees MUST be able to correct any extracted field via conversational text (e.g., "Change the amount to RM25") before submission.
- **FR-007**: The system MUST support submitting the created claim for approval directly from the chat conversation.
- **FR-008**: Submitted claims MUST route to the appropriate approver based on existing business approval rules.
- **FR-009**: The system MUST display the receipt image as a thumbnail in the chat conversation thread.
- **FR-010**: The system MUST enforce a maximum file size of 10 MB per image and reject unsupported file types with clear error messages.
- **FR-013**: The agent MUST present extracted receipt data as an interactive card with Submit, Edit, and Cancel action buttons. The employee can also use conversational text as an alternative to buttons.
- **FR-014**: During receipt processing, the system MUST show staged progress messages reflecting each phase (uploading, reading, extracting) so the employee knows processing is active.
- **FR-011**: The system MUST detect potential duplicate receipts (same merchant + amount + date within the same business) and warn the employee before creating a duplicate claim.
- **FR-012**: The receipt processing (upload → OCR → extraction → claim creation) MUST complete within 30 seconds for standard receipt images.

### Key Entities

- **Chat Attachment**: An image or document file attached to a chat message. Attributes: file type, file size, storage reference, upload status, originating message.
- **Receipt Extraction Result**: The structured data extracted from a receipt image. Attributes: merchant name, amount, currency, date, category, confidence scores per field, raw OCR text.
- **Expense Claim** (existing): Extended with a reference to the source chat message and receipt extraction metadata. Existing attributes: business ID, user ID, vendor name, total amount, currency, transaction date, category, status, storage ID.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Employees can go from snapping a receipt photo to having a submitted expense claim in under 60 seconds (including processing time and one confirmation message).
- **SC-002**: OCR extraction correctly identifies merchant name, amount, and date in at least 85% of standard printed receipts (thermal paper, POS-printed, or digital receipts).
- **SC-003**: 90% of employees who use the photo-to-claim feature complete the full flow (photo → claim → submit) without abandoning or switching to the manual form.
- **SC-004**: Zero expense claims are created with missing mandatory fields (amount, date) — the system asks for missing data rather than creating incomplete claims.
- **SC-005**: The feature works on both desktop (file picker) and mobile (camera + file picker) without requiring separate user instructions.
- **SC-006**: Duplicate receipt detection catches at least 95% of exact duplicate submissions (same receipt uploaded twice).

## Clarifications

### Session 2026-03-21

- Q: Should the system auto-create the draft claim after OCR, or wait for explicit employee confirmation? → A: Auto-create draft immediately after OCR — employee reviews, corrects if needed, then submits. No explicit "confirm creation" step.
- Q: What format should the confirmation take — interactive card with buttons, conversational text, or hybrid? → A: Interactive card with buttons (Submit / Edit / Cancel). Tap to act, reducing friction.
- Q: What should the user see during the 15-30 second OCR processing? → A: Staged progress messages showing each phase ("Uploading receipt...", "Reading receipt...", "Extracting details...").
- Q: Can an employee attach multiple receipt images in a single message? → A: Yes — multiple images per message allowed. Each image is processed independently, creating a separate draft claim per receipt.

## Assumptions

- The existing document processor Lambda (OCR + DSPy extraction) can handle receipt images with sufficient accuracy. No new OCR service is needed.
- The existing expense claims approval workflow will accept claims created programmatically (via agent) the same way it accepts manually created claims.
- Users will primarily upload photos of physical receipts (thermal paper, restaurant bills) or screenshots of digital receipts (e-wallet, grab, foodpanda).
- The HEIC format (common on iPhone) will be converted to a processable format before OCR.
- File storage uses the existing S3 infrastructure with the existing Vercel OIDC authentication pattern.
- The chat message persistence model can be extended to reference attachments without breaking existing message history.
- Malaysian Ringgit (MYR) is the most common currency, but the system must handle SGD, USD, THB, and other SE Asian currencies.
