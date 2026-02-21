# Storecove Client Contract

**Branch**: `001-peppol-integrate` | **Date**: 2026-02-20

## Client Module: `src/lib/peppol/storecove-client.ts`

### Configuration

```typescript
interface StorecoveConfig {
  apiKey: string           // STORECOVE_API_KEY env var
  legalEntityId: number    // STORECOVE_LEGAL_ENTITY_ID env var
  baseUrl: string          // STORECOVE_API_URL env var (sandbox vs prod)
}
```

### submitDocument

```typescript
async function submitDocument(
  payload: StorecoveDocumentSubmission
): Promise<StorecoveSubmissionResponse>
```

**Input** — `StorecoveDocumentSubmission`:
```typescript
interface StorecoveDocumentSubmission {
  legalEntityId: number
  routing: {
    eIdentifiers: Array<{
      scheme: string       // "sg:uen" for Singapore
      identifier: string   // UEN without scheme prefix
    }>
  }
  document: {
    documentType: "invoice" | "creditnote"
    invoiceNumber: string
    issueDate: string      // YYYY-MM-DD
    dueDate?: string       // YYYY-MM-DD
    currencyCode: string   // ISO 4217
    accountingSupplierParty: StorecoveParty
    accountingCustomerParty: StorecoveParty
    invoiceLines: StorecoveInvoiceLine[]
    taxTotal: number
    legalMonetaryTotal: {
      lineExtensionAmount: number
      taxExclusiveAmount: number
      taxInclusiveAmount: number
      payableAmount: number
    }
    billingReference?: {    // For credit notes
      invoiceNumber: string
    }
    note?: string
  }
}
```

**Output** — `StorecoveSubmissionResponse`:
```typescript
interface StorecoveSubmissionResponse {
  guid: string  // Storecove submission GUID — stored as peppolDocumentId
}
```

**Errors**:
- HTTP 422: Validation errors → throw `StorecoveValidationError` with array of `{ source, details }`
- HTTP 401/403: Auth errors → throw `StorecoveAuthError`
- HTTP 5xx: Server errors → throw `StorecoveServerError`

### discoverReceiver

```typescript
async function discoverReceiver(
  scheme: string,
  identifier: string
): Promise<{ active: boolean }>
```

Calls `POST /api/v2/discovery/receives` to verify a Peppol participant ID is reachable on the network.

### getEvidence

```typescript
async function getEvidence(
  submissionGuid: string
): Promise<StorecoveEvidence>
```

Calls `GET /api/v2/document_submissions/{guid}/evidence` to retrieve delivery proof.

## Data Mapper Module: `src/lib/peppol/invoice-mapper.ts`

### mapInvoiceToStorecove

```typescript
function mapInvoiceToStorecove(
  invoice: SalesInvoice,
  business: Business,
  customer: Customer
): StorecoveDocumentSubmission
```

Maps FinanSEAL's sales invoice data to Storecove's JSON submission format.

**Key mapping logic**:
- Split `peppolParticipantId` ("0195:T08GA1234A") into scheme + identifier for routing
- Map `einvoiceType` to Storecove `documentType` ("invoice" → "invoice", "credit_note" → "creditnote")
- Map structured address fields to Storecove address format
- Map tax rates to UNCL 5305 category codes (S/Z/E/O)
- For credit notes: include `billingReference` with original invoice number

### mapStorecoveErrorsToPeppolErrors

```typescript
function mapStorecoveErrorsToPeppolErrors(
  storecoveErrors: Array<{ source: string; details: string }>
): Array<{ code: string; message: string }>
```

Maps Storecove's validation error format to FinanSEAL's `peppolErrors` format.

## Webhook Parser Module: `src/lib/peppol/webhook-parser.ts`

### parseWebhookEvent

```typescript
function parseWebhookEvent(
  rawBody: string
): StorecoveWebhookEvent
```

**Output**:
```typescript
interface StorecoveWebhookEvent {
  submissionGuid: string      // Maps to peppolDocumentId
  eventType: "transmitted" | "delivered" | "failed"
  timestamp: number           // Unix ms
  errors?: Array<{ code: string; message: string }>
}
```
