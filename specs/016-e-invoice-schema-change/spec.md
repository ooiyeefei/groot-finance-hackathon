# Feature Specification: e-Invoice Schema Changes (LHDN + Peppol Fields)

**Feature Branch**: `016-e-invoice-schema-change`
**Created**: 2026-02-19
**Status**: Draft
**Input**: GitHub Issue #198 — Add e-invoice specific fields to support LHDN MyInvois (Malaysia) and Peppol InvoiceNow (Singapore) submissions
**Related Issues**: #75 (LHDN MyInvois), #196 (SG InvoiceNow/Peppol), #195 (einvoice_usage)

## Clarifications

### Session 2026-02-19

- Q: Should `customerSnapshot` include structured address fields (addressLine1, city, stateCode, postalCode, countryCode) in addition to TIN and BRN? → A: Yes — extend snapshot with all structured address fields alongside TIN and BRN, so LHDN submissions are fully self-contained from the frozen snapshot.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Submit Sales Invoice to LHDN MyInvois (Priority: P1)

A Malaysian SME owner generates a sales invoice in FinanSEAL and submits it to LHDN's MyInvois portal for government validation. The system tracks the submission lifecycle from pending through validation, storing the government-assigned document ID, QR code long ID, and validation status. If LHDN rejects the invoice, the business owner can see the specific validation errors and correct the invoice.

**Why this priority**: LHDN e-invoicing is becoming mandatory for Malaysian businesses. Without submission tracking fields, there is no way to know whether an invoice has been submitted, validated, or rejected by LHDN.

**Independent Test**: Can be fully tested by creating a sales invoice with LHDN tracking fields populated and verifying the status transitions (pending → submitted → valid/invalid) are persisted correctly. Delivers core compliance tracking for Malaysian e-invoicing.

**Acceptance Scenarios**:

1. **Given** a sales invoice exists for a Malaysian business, **When** it is submitted to LHDN, **Then** the submission ID, document UUID, status, and submission timestamp are recorded on the invoice.
2. **Given** LHDN validates the invoice, **When** the validation response is received, **Then** the long ID (for QR code), validation timestamp, and document hash are stored.
3. **Given** LHDN rejects the invoice, **When** the rejection response is received, **Then** the validation errors (code, message, target field) are stored and the status is set to "invalid".
4. **Given** a validated invoice needs cancellation, **When** the business cancels it, **Then** the status transitions to "cancelled".

---

### User Story 2 - Configure Business for LHDN Compliance (Priority: P1)

A business administrator sets up their company's LHDN compliance details — MSIC code, SST registration number, LHDN Tax Identification Number (TIN), and Business Registration Number (BRN). These fields are required by LHDN for all invoice submissions and must be stored at the business level.

**Why this priority**: Without these business-level fields, no invoice can be submitted to LHDN — they are mandatory in every LHDN document submission.

**Independent Test**: Can be tested by updating business settings with MSIC code, TIN, and BRN, then verifying these persist correctly and are available for invoice generation.

**Acceptance Scenarios**:

1. **Given** a business is based in Malaysia, **When** the admin configures LHDN fields (MSIC code, TIN, BRN), **Then** these fields are stored on the business record.
2. **Given** a business has SST registration, **When** the admin enters their SST registration number, **Then** it is stored alongside their other tax details.
3. **Given** the LHDN API requires OAuth credentials, **When** the admin configures the client ID, **Then** only the client ID is stored in the database (client secret is stored externally for security).

---

### User Story 3 - Manage Customer Tax Identifiers for e-Invoicing (Priority: P1)

A business owner adds customer tax identification details (TIN, BRN, SST registration) and structured address information to customer records. LHDN requires these fields on every buyer section of an e-invoice, and the address must be structured (separate line, city, state, postal code, country) rather than a free-text block.

**Why this priority**: LHDN validates buyer (customer) details on every invoice. Missing TIN or improperly structured addresses will cause rejection.

**Independent Test**: Can be tested by updating a customer record with TIN, BRN, and structured address fields, verifying they persist and display correctly in customer management.

**Acceptance Scenarios**:

1. **Given** a customer record exists, **When** the user adds TIN, BRN, and SST registration, **Then** these fields are stored on the customer record.
2. **Given** a customer's address is a free-text string, **When** the user enters structured address components (line 1, line 2, line 3, city, state code, postal code, country code), **Then** each component is stored separately for LHDN compliance.
3. **Given** a customer has a Peppol participant ID, **When** the user enters it, **Then** it is stored for future InvoiceNow transmission.

---

### User Story 4 - Transmit Invoice via Peppol InvoiceNow (Priority: P2)

A Singaporean SME submits invoices through the Peppol InvoiceNow network. The system tracks the transmission lifecycle — pending, transmitted, delivered, or failed — with timestamps and any error details.

**Why this priority**: InvoiceNow is Singapore's e-invoicing network. While not yet mandatory for all businesses, it is growing rapidly and supports cross-border trade. Lower priority than LHDN because LHDN mandates are more immediate.

**Independent Test**: Can be tested by populating Peppol tracking fields on a sales invoice and verifying status transitions (pending → transmitted → delivered/failed) and error recording.

**Acceptance Scenarios**:

1. **Given** a sales invoice for a Singapore business, **When** it is transmitted via Peppol, **Then** the Peppol document ID, status, and transmission timestamp are recorded.
2. **Given** a Peppol transmission succeeds, **When** the delivery confirmation is received, **Then** the delivery timestamp is recorded and status is "delivered".
3. **Given** a Peppol transmission fails, **When** error details are returned, **Then** the error codes and messages are stored and status is "failed".

---

### User Story 5 - Register Business Peppol Participant ID (Priority: P2)

A Singapore business administrator registers their Peppol participant ID (e.g., "0195:T08GA1234A") so invoices can be routed to them via the Peppol network.

**Why this priority**: Required for Peppol participation but only affects Singapore-based businesses.

**Independent Test**: Can be tested by entering a Peppol participant ID on a business record and verifying it persists correctly.

**Acceptance Scenarios**:

1. **Given** a Singapore-based business, **When** the admin enters their Peppol participant ID, **Then** it is stored on the business record.

---

### User Story 6 - Customer Snapshot Includes e-Invoice Fields (Priority: P1)

When a sales invoice is created, the customer's tax identifiers (TIN, BRN) and structured address components are captured in the invoice's customer snapshot alongside existing fields. This ensures the invoice retains a point-in-time record of the customer's compliance details at the moment of invoicing, even if the customer record is later updated. LHDN submissions use the snapshot data directly — no live customer record lookups needed.

**Why this priority**: LHDN validates the buyer details (TIN, BRN, structured address) on the submitted document. The snapshot must include all LHDN-required buyer fields to match what was submitted.

**Independent Test**: Can be tested by creating a sales invoice and verifying the customer snapshot includes TIN, BRN, and structured address fields from the customer record at creation time.

**Acceptance Scenarios**:

1. **Given** a customer has TIN, BRN, and structured address configured, **When** a new sales invoice is created for that customer, **Then** the customer snapshot on the invoice includes TIN, BRN, and structured address fields.
2. **Given** a customer updates their TIN or address after an invoice was created, **When** viewing the old invoice, **Then** the snapshot still shows the original values at time of creation.
3. **Given** a customer has only partial structured address (e.g., addressLine1 and city but no line2/line3), **When** a new sales invoice is created, **Then** the snapshot captures whatever structured fields are available (all are optional).

---

### Edge Cases

- What happens when a business has not configured LHDN fields but attempts to submit an invoice to LHDN? System should prevent submission and display a clear message about missing required fields.
- What happens when a customer has no TIN? LHDN allows "EI00000000000" as a general TIN for non-registered buyers — the system should support this fallback.
- What happens when an invoice is submitted to both LHDN and Peppol? The fields are independent — both sets of tracking data can coexist on the same invoice.
- How does the system handle LHDN validation errors with no error code? The target field is optional, but code and message are required in the error structure.
- What happens if the e-invoice type (invoice, credit note, debit note, refund note) is not specified? It defaults to "invoice" for standard sales invoices.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST store LHDN submission tracking fields on sales invoices (submission ID, document UUID, long ID, status, timestamps, validation errors, document hash).
- **FR-002**: System MUST support LHDN status lifecycle: pending → submitted → valid/invalid → cancelled.
- **FR-003**: System MUST store Peppol transmission tracking fields on sales invoices (document ID, status, timestamps, errors).
- **FR-004**: System MUST support Peppol status lifecycle: pending → transmitted → delivered/failed.
- **FR-005**: System MUST store LHDN compliance fields on business records (MSIC code, MSIC description, SST registration number, LHDN TIN, BRN).
- **FR-006**: System MUST store Peppol participant ID on business records.
- **FR-007**: System MUST store LHDN OAuth client ID on business records (client secret stored externally in secrets manager).
- **FR-008**: System MUST store customer tax identifiers (TIN, BRN, SST registration) on customer records.
- **FR-009**: System MUST store structured address components on customer records (address lines 1-3, city, state code, postal code, country code) for LHDN compliance.
- **FR-010**: System MUST store Peppol participant ID on customer records.
- **FR-011**: System MUST support e-invoice document types: invoice, credit note, debit note, refund note.
- **FR-012**: System MUST capture customer TIN, BRN, and structured address fields (addressLine1, addressLine2, addressLine3, city, stateCode, postalCode, countryCode) in the sales invoice customer snapshot at creation time.
- **FR-013**: All new fields MUST be optional to maintain backward compatibility with existing data. No migration required.
- **FR-014**: System MUST support efficient querying of invoices by LHDN status and Peppol status per business (via indexes).
- **FR-015**: System MUST support lookup of customers by TIN within a business (via index).

### Key Entities

- **Sales Invoice (extended)**: Core invoicing entity, extended with LHDN submission tracking (submission ID, document UUID, long ID, status, timestamps, validation errors, hash), Peppol transmission tracking (document ID, status, timestamps, errors), and e-invoice document type classification.
- **Business (extended)**: Organization entity, extended with LHDN compliance fields (MSIC code, MSIC description, SST registration, TIN, BRN, OAuth client ID) and Peppol participant ID.
- **Customer (extended)**: Buyer entity, extended with tax identifiers (TIN, BRN, SST registration), Peppol participant ID, and structured address components (lines, city, state, postal, country).
- **Customer Snapshot (extended)**: Point-in-time buyer data on each invoice, extended with TIN, BRN, and structured address components (addressLine1-3, city, stateCode, postalCode, countryCode) for LHDN compliance. LHDN submissions source all buyer data from this snapshot.

## Data Model Analysis

### Design Principles Applied

1. **Extend, don't create**: All changes are column additions to existing tables (`sales_invoices`, `businesses`, `customers`). No new tables needed.
2. **All fields optional**: Using `v.optional()` for every new field ensures zero-downtime deployment with full backward compatibility.
3. **Namespace prefixing**: LHDN fields prefixed with `lhdn*`, Peppol fields prefixed with `peppol*` to avoid ambiguity and clearly indicate which e-invoicing framework each field serves.
4. **Structured over freeform**: Customer addresses decomposed into components (line1, line2, line3, city, stateCode, postalCode, countryCode) rather than a single string — required by LHDN structured document format.
5. **Security boundary**: LHDN OAuth `clientId` stored in database; `clientSecret` explicitly excluded (must use external secrets manager like AWS Secrets Manager).
6. **Snapshot enrichment**: `customerSnapshot` on `sales_invoices` extended with `tin`, `brn`, and all structured address fields to ensure LHDN-submitted documents retain complete point-in-time buyer compliance data without needing live customer record lookups.

### Table Changes Summary

| Table | Fields Added | Indexes Added |
|-------|-------------|---------------|
| `sales_invoices` | 15 fields (LHDN tracking, Peppol tracking, e-invoice type) | `by_businessId_lhdnStatus`, `by_businessId_peppolStatus` |
| `businesses` | 7 fields (MSIC, SST, TIN, BRN, Peppol ID, LHDN client ID) | None |
| `customers` | 10 fields (TIN, BRN, SST, Peppol ID, structured address) | `by_businessId_tin` |
| `customerSnapshot` (embedded) | 9 fields (TIN, BRN, addressLine1-3, city, stateCode, postalCode, countryCode) | N/A (embedded object) |

### Fields Detail

**`sales_invoices` — LHDN MyInvois fields:**
- `lhdnSubmissionId` — LHDN 26-char submission UID
- `lhdnDocumentUuid` — LHDN 26-char document UUID
- `lhdnLongId` — For QR code generation (URL: `https://myinvois.hasil.gov.my/{longId}/share`)
- `lhdnStatus` — Enum: pending, submitted, valid, invalid, cancelled
- `lhdnSubmittedAt` — Timestamp of submission to LHDN
- `lhdnValidatedAt` — Timestamp of LHDN validation
- `lhdnValidationErrors` — Array of {code, message, target?} objects
- `lhdnDocumentHash` — SHA256 hash of the submitted document

**`sales_invoices` — Peppol InvoiceNow fields:**
- `peppolDocumentId` — Peppol document identifier
- `peppolStatus` — Enum: pending, transmitted, delivered, failed
- `peppolTransmittedAt` — Timestamp of Peppol transmission
- `peppolDeliveredAt` — Timestamp of Peppol delivery confirmation
- `peppolErrors` — Array of {code, message} objects

**`sales_invoices` — Shared e-invoice field:**
- `einvoiceType` — Enum: invoice, credit_note, debit_note, refund_note

**`businesses` — LHDN compliance fields:**
- `msicCode` — 5-digit MSIC activity code (mandatory for LHDN)
- `msicDescription` — Human-readable business activity description
- `sstRegistrationNumber` — SST registration (mandatory for SST registrants)
- `lhdnTin` — LHDN Tax Identification Number
- `businessRegistrationNumber` — BRN (ROB/ROC number)
- `lhdnClientId` — LHDN OAuth client ID (secret stored externally)

**`businesses` — Peppol field:**
- `peppolParticipantId` — e.g., "0195:T08GA1234A"

**`customers` — Tax identifiers:**
- `tin` — Tax Identification Number
- `brn` — Business Registration Number
- `sstRegistration` — SST registration number

**`customers` — Peppol field:**
- `peppolParticipantId` — Peppol endpoint ID

**`customers` — Structured address (LHDN requirement):**
- `addressLine1`, `addressLine2`, `addressLine3` — Address lines
- `city` — City/town
- `stateCode` — MY state code or SG region code
- `postalCode` — Postal/ZIP code
- `countryCode` — ISO 3166-1 alpha-2

**`customerSnapshot` (embedded in `sales_invoices`) — Extended:**
- `tin` — Customer TIN at time of invoice creation
- `brn` — Customer BRN at time of invoice creation
- `addressLine1`, `addressLine2`, `addressLine3` — Structured address lines
- `city` — City/town
- `stateCode` — MY state code or SG region code
- `postalCode` — Postal/ZIP code
- `countryCode` — ISO 3166-1 alpha-2

## Assumptions

- LHDN MyInvois API uses 26-character UIDs for both submission ID and document UUID (per LHDN API specification v1.0).
- The LHDN status lifecycle follows the documented flow: pending → submitted → valid/invalid, with valid invoices optionally transitioning to cancelled.
- Peppol status lifecycle follows standard AS4 messaging: pending → transmitted → delivered/failed.
- The `einvoiceType` field uses LHDN's document type classification which aligns with Peppol's document types.
- Existing `taxId` on `businesses` table remains as-is (may overlap with `lhdnTin` for Malaysian businesses, but they serve different purposes — `taxId` is generic, `lhdnTin` is LHDN-specific).
- Existing `taxId` on `customers` table remains as-is — the new `tin` field is the LHDN-specific Tax Identification Number.
- The `address` field on `customers` (free-text string) remains for backward compatibility; the new structured address fields are added alongside it.
- LHDN MSIC codes follow the Malaysian Standard Industrial Classification 2008 (5-digit format).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All existing sales invoices, businesses, and customers remain fully functional after schema deployment — zero breaking changes.
- **SC-002**: New LHDN tracking fields can be populated and queried on sales invoices without affecting existing invoice workflows.
- **SC-003**: New business compliance fields (MSIC, TIN, BRN, SST) can be stored and retrieved correctly.
- **SC-004**: Customer records support both legacy free-text address and new structured address components simultaneously.
- **SC-005**: Invoices can be queried by LHDN status and Peppol status per business using the new indexes.
- **SC-006**: Customer lookup by TIN within a business returns results using the new index.
- **SC-007**: The customer snapshot on new invoices correctly captures TIN, BRN, and structured address fields from the customer record at creation time.
