# Research: Singapore InvoiceNow (Peppol) Full Integration

**Branch**: `001-peppol-integrate` | **Date**: 2026-02-20

## Decision 1: Peppol Access Point Provider

**Decision**: Use Storecove as the Peppol Access Point provider.

**Rationale**:
- API-first, developer-friendly REST integration
- Accepts structured JSON (not raw UBL XML) — Storecove handles UBL 2.1 generation, Peppol BIS 3.0 compliance, and AS4 transport
- Supports both Invoice and Credit Note document types via the same endpoint
- Push webhooks for delivery/failure notifications with 5-day retry
- Sandbox environment available for testing
- Discovery API to verify receiver Peppol IDs before transmission
- Global Peppol AP with Singapore/APAC support

**Alternatives considered**:
- Pagero: Enterprise-grade but heavier integration burden, less developer-friendly docs
- InvoiceCloud: Singapore-focused but limited API documentation publicly available
- Avalara: Combined tax + e-invoicing but adds unnecessary tax complexity when we handle tax ourselves
- Becoming a Peppol AP: Requires IMDA certification, AS4 implementation, annual renewal — overkill for SaaS product

## Decision 2: Document Format — JSON (not UBL XML)

**Decision**: Submit documents to Storecove in their JSON format. Do NOT build a UBL XML generator.

**Rationale**:
- Storecove's primary integration path is JSON — they convert to UBL/Peppol BIS 3.0 internally
- Eliminates need for UBL XML generation, namespace management, and BIS 3.0 validation
- Storecove validates the payload against Peppol rules and returns specific errors
- Raw UBL XML submission is supported but poorly documented and not recommended
- Reduces implementation from building a full UBL generator to a data mapper

**Alternatives considered**:
- Build UBL XML generator in-house: Higher complexity, maintenance burden for spec updates, redundant if AP handles it
- Use a UBL library (e.g., ubl-builder npm): Still requires understanding full BIS 3.0 spec, error-prone

**Impact on spec**: FR-001 ("generate Peppol BIS Billing 3.0 compliant documents") now means generating a Storecove-compliant JSON payload. Storecove handles the actual BIS 3.0 document. Pre-submission validation shifts to ensuring the JSON has all required fields.

## Decision 3: Status Notification Method

**Decision**: Use Storecove push webhooks for status notifications, with pull-mode as fallback.

**Rationale**:
- Push webhooks provide near-real-time status updates (SC-005: within 5 minutes)
- Storecove retries failed webhook deliveries for up to 5 days
- Webhook security via HTTP Basic Auth or custom header
- Pull-mode (FIFO queue) available as fallback if webhook endpoint is unreachable
- Existing codebase has a webhook handler pattern (Stripe billing webhooks)

**Alternatives considered**:
- Polling only: Higher latency, unnecessary API calls, doesn't meet SC-005
- Pull-mode only: Requires a cron/scheduled job to poll the queue — adds operational complexity

## Decision 4: Credit Note Data Model

**Decision**: Store credit notes in the existing `sales_invoices` table using the `einvoiceType` field to distinguish document types, plus a new `originalInvoiceId` reference field.

**Rationale**:
- Credit notes share 90%+ of the same fields as invoices (line items, amounts, tax, customer, Peppol fields)
- The `einvoiceType` field already exists with `credit_note` as a valid value
- Avoids duplicating the entire sales invoice schema into a separate table
- Peppol transmission logic is identical for invoices and credit notes (same Storecove endpoint)
- The LHDN flow already uses the same table structure for different document types
- A `originalInvoiceId` reference field links credit notes to their parent invoice

**Alternatives considered**:
- Separate `credit_notes` table: More normalized but duplicates 90%+ of fields, doubles the mutation/query surface area, complicates shared UI components
- Credit note as a sub-document within the invoice: Too tightly coupled, credit notes need independent lifecycle

## Decision 5: Tax Category Mapping

**Decision**: Map FinanSEAL's internal tax rates to UNCL 5305 codes deterministically based on rate + country.

**Rationale**:
- Singapore GST has clear mappings: 9% → S (Standard), 0% → Z (Zero-rated), exempt → E, out-of-scope → O
- These are the only four codes relevant for Singapore InvoiceNow
- Mapping can be automated without user input
- Storecove accepts tax category as part of the JSON payload

**Mapping table**:

| FinanSEAL Tax | UNCL 5305 Code | Storecove Field |
|---------------|----------------|-----------------|
| GST 9% | S (Standard) | taxCategory: "S", taxRate: 9 |
| GST 0% (zero-rated) | Z (Zero rated) | taxCategory: "Z", taxRate: 0 |
| Exempt | E (Exempt) | taxCategory: "E", taxRate: 0 |
| No tax / out of scope | O (Outside scope) | taxCategory: "O" |

## Decision 6: Storecove Authentication & Configuration

**Decision**: Store Storecove API key and Legal Entity ID as environment variables. Use separate sandbox/production accounts.

**Rationale**:
- Storecove uses Bearer token (API key) authentication — simple, no OAuth flow
- Legal Entity ID is required for every document submission (identifies the sender in Storecove)
- Separate accounts for sandbox/production as recommended by Storecove
- Existing pattern: LHDN credentials stored similarly

**Environment variables needed**:
- `STORECOVE_API_KEY` — Bearer token for API authentication
- `STORECOVE_LEGAL_ENTITY_ID` — Sender's legal entity ID in Storecove
- `STORECOVE_API_URL` — Base URL (sandbox vs production)
- `STORECOVE_WEBHOOK_SECRET` — Secret for webhook verification

## Decision 7: Webhook Endpoint Security

**Decision**: Use a shared secret in a custom HTTP header for webhook verification.

**Rationale**:
- Storecove supports custom HTTP headers on webhook calls
- Simpler than HTTP Basic Auth for a single-purpose webhook endpoint
- Aligns with existing Stripe webhook pattern (signature verification)
- Prevents unauthorized status update submissions

## Key Reference: Storecove API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v2/document_submissions` | POST | Submit invoice/credit note |
| `/api/v2/document_submissions/{guid}/evidence` | GET | Retrieve delivery proof |
| `/api/v2/discovery/receives` | POST | Verify receiver can receive on Peppol |
| `/api/v2/legal_entities` | GET | Get sender legal entity details |
| `/api/v2/peppol_identifiers` | GET | List registered Peppol IDs |

## Key Reference: Peppol Constants

| Constant | Value |
|----------|-------|
| Singapore EAS scheme | `0195` (UEN) |
| Invoice type code | `380` |
| Credit note type code | `381` |
| Tax scheme ID | `VAT` (even for Singapore GST) |
| SG GST standard rate | 9% (as of Jan 2024) |
| Default unit code | `C62` (unit/one) |

## Key Reference: Storecove Document Submission Format

```json
{
  "legalEntityId": 12345,
  "routing": {
    "eIdentifiers": [{
      "scheme": "sg:uen",
      "identifier": "T08GA1234A"
    }]
  },
  "document": {
    "documentType": "invoice",
    "invoiceNumber": "INV-001",
    "issueDate": "2026-02-20",
    "dueDate": "2026-03-20",
    "currencyCode": "SGD",
    "accountingSupplierParty": { ... },
    "accountingCustomerParty": { ... },
    "invoiceLines": [ ... ],
    "taxTotal": 90.00,
    "legalMonetaryTotal": { ... }
  }
}
```

Credit notes use `"documentType": "creditnote"` with the same structure.
