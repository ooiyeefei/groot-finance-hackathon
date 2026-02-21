# Data Model: Singapore InvoiceNow (Peppol) Full Integration

**Branch**: `001-peppol-integrate` | **Date**: 2026-02-20

## Entity Changes

### 1. `sales_invoices` — Extend for Credit Notes

**Existing fields (already deployed, no changes needed):**
- `peppolDocumentId?: string` — Storecove submission GUID
- `peppolStatus?: "pending" | "transmitted" | "delivered" | "failed"`
- `peppolTransmittedAt?: number` — Unix ms timestamp
- `peppolDeliveredAt?: number` — Unix ms timestamp
- `peppolErrors?: Array<{ code: string; message: string }>`
- `einvoiceType?: "invoice" | "credit_note" | "debit_note" | "refund_note"`

**New fields to add:**

| Field | Type | Purpose |
|-------|------|---------|
| `originalInvoiceId` | `v.optional(v.id("sales_invoices"))` | Links credit note to its parent invoice. Null for regular invoices. |
| `creditNoteReason` | `v.optional(v.string())` | Reason for issuing the credit note (e.g., "Goods returned", "Pricing error"). |

**New index to add:**

| Index | Fields | Purpose |
|-------|--------|---------|
| `by_originalInvoiceId` | `["originalInvoiceId"]` | Query all credit notes linked to a specific invoice |

**State transitions — Credit Note lifecycle:**
```
draft → sent → paid/void
         ↓
    peppolStatus: pending → transmitted → delivered
                                ↓              ↓
                              failed         (done)
```

Credit notes follow the same invoice lifecycle (draft → sent → paid/void) and the same Peppol lifecycle (pending → transmitted → delivered/failed). The two lifecycles are independent.

**Validation rules:**
- `originalInvoiceId` MUST be set when `einvoiceType === "credit_note"`
- `originalInvoiceId` MUST be null/undefined when `einvoiceType === "invoice"` or undefined
- The original invoice MUST have status "sent", "paid", or "overdue" (not "draft" or "void")
- Sum of all credit notes' `totalAmount` against one invoice MUST NOT exceed the original invoice's `totalAmount`
- `creditNoteReason` is required when `einvoiceType === "credit_note"`

### 2. `businesses` — No Changes

All fields already deployed:
- `peppolParticipantId?: string` — Format: "0195:T08GA1234A" (scheme:UEN)

UI field already exists in business profile settings.

### 3. `customers` — No Changes

All fields already deployed:
- `peppolParticipantId?: string` — Format: "0195:T08GA1234A" (scheme:UEN)
- Structured address fields (addressLine1-3, city, stateCode, postalCode, countryCode)
- Tax identifiers (tin, brn, sstRegistration)

### 4. `einvoice_usage` — No Changes

Existing schema supports both Peppol and LHDN counting:
- `submissionsUsed: number` — Incremented for each Peppol/LHDN transmission
- `planLimit: number` — -1 for unlimited (Pro/Enterprise), 100 for Starter
- Monthly bucketing by `"YYYY-MM"` format

**Grace buffer logic (new, in application layer):**
- When `submissionsUsed >= planLimit`: show warning, allow up to 5 more
- When `submissionsUsed >= planLimit + 5`: hard block transmission

## Entity Relationship Diagram

```
businesses (1) ──────────────── (n) sales_invoices
    │                                    │
    │ peppolParticipantId                │ peppolStatus
    │                                    │ peppolDocumentId
    │                                    │ einvoiceType
    │                                    │ originalInvoiceId ──┐
    │                                    │                     │
    │                                    │  ┌──────────────────┘
    │                                    │  │ (self-reference)
    │                                    │  │
    │                                    │  └─── sales_invoices (credit notes)
    │                                    │
    └──── (n) customers (1) ────────────┘
              │
              │ peppolParticipantId
              │ structured address
              │ tax identifiers

einvoice_usage (1 per business per month)
    │
    │ submissionsUsed / planLimit
    │
    └──── tracks: Peppol + LHDN combined
```

## Storecove Data Mapping

### Sales Invoice → Storecove JSON

| FinanSEAL Field | Storecove JSON Path | Notes |
|-----------------|---------------------|-------|
| `invoiceNumber` | `document.invoiceNumber` | |
| `invoiceDate` | `document.issueDate` | YYYY-MM-DD format |
| `dueDate` | `document.dueDate` | YYYY-MM-DD format |
| `currency` | `document.currencyCode` | ISO 4217 (e.g., "SGD") |
| `einvoiceType` | `document.documentType` | "invoice" or "creditnote" |
| Business name | `document.accountingSupplierParty.party.partyName` | |
| Business address | `document.accountingSupplierParty.party.address` | Map structured fields |
| Business peppolParticipantId | Sender identity (via legalEntityId) | Pre-configured in Storecove |
| Customer name | `document.accountingCustomerParty.party.partyName` | |
| Customer address | `document.accountingCustomerParty.party.address` | Map structured fields |
| Customer peppolParticipantId | `routing.eIdentifiers[0]` | scheme: "sg:uen", identifier: UEN |
| Line items | `document.invoiceLines[]` | Map each line item |
| Line item description | `document.invoiceLines[].description` | |
| Line item quantity | `document.invoiceLines[].quantity` | |
| Line item unit price | `document.invoiceLines[].priceAmount` | |
| Line item amount | `document.invoiceLines[].lineExtensionAmount` | |
| Tax total | `document.taxTotal` | Sum of all tax |
| Total (tax exclusive) | `document.legalMonetaryTotal.taxExclusiveAmount` | |
| Total (tax inclusive) | `document.legalMonetaryTotal.taxInclusiveAmount` | |
| Amount due | `document.legalMonetaryTotal.payableAmount` | |
| `originalInvoiceId` (credit note) | `document.billingReference` | Reference to original invoice number |

### Storecove Response → FinanSEAL

| Storecove Response | FinanSEAL Field | When |
|--------------------|-----------------|------|
| Submission `guid` | `peppolDocumentId` | On successful POST (HTTP 200) |
| Webhook: transmitted | `peppolStatus = "transmitted"`, `peppolTransmittedAt` | Webhook event |
| Webhook: delivered | `peppolStatus = "delivered"`, `peppolDeliveredAt` | Webhook event |
| Webhook: failed | `peppolStatus = "failed"`, `peppolErrors` | Webhook event |
| HTTP 422 errors | `peppolStatus = "failed"`, `peppolErrors` | Synchronous validation failure |
