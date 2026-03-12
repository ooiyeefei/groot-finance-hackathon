# Data Model: Bank Statement Import & Auto-Reconciliation

## New Tables

### bank_accounts

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | id("businesses") | Yes | Owning business |
| bankName | string | Yes | e.g., "Maybank", "CIMB" |
| accountNumber | string | Yes | Full account number (stored encrypted-at-rest by Convex) |
| accountNumberLast4 | string | Yes | Last 4 digits for display |
| currency | string | Yes | ISO 4217 code (e.g., "MYR", "USD") |
| nickname | string | No | User-friendly label |
| status | "active" \| "inactive" | Yes | Soft-delete via inactive |
| lastImportDate | string | No | ISO date of most recent import |
| transactionCount | number | Yes | Running count of imported transactions |
| createdBy | id("users") | Yes | Who registered the account |
| deletedAt | number | No | Soft-delete timestamp |

**Indexes**: `by_businessId`, `by_businessId_status`

### bank_transactions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | id("businesses") | Yes | Owning business |
| bankAccountId | id("bank_accounts") | Yes | Source bank account |
| importSessionId | id("bank_import_sessions") | Yes | Which import batch |
| transactionDate | string | Yes | ISO date |
| description | string | Yes | Bank description text |
| debitAmount | number | No | Outgoing amount (null if credit) |
| creditAmount | number | No | Incoming amount (null if debit) |
| balance | number | No | Running balance (if provided) |
| reference | string | No | Payment reference / check number |
| transactionType | string | No | TRF, ATM, POS, etc. |
| amount | number | Yes | Absolute amount (for matching) |
| direction | "credit" \| "debit" | Yes | Derived from credit/debit fields |
| deduplicationHash | string | Yes | SHA-256(bankAccountId + date + amount + description) |
| reconciliationStatus | "unmatched" \| "suggested" \| "reconciled" \| "categorized" | Yes | Current status |
| category | string | No | For categorized transactions: "bank_charges", "interest", "non_business", "other" |
| deletedAt | number | No | Soft-delete timestamp |

**Indexes**: `by_businessId`, `by_bankAccountId`, `by_importSessionId`, `by_bankAccountId_status`, `by_deduplicationHash`, `by_bankAccountId_date`

### bank_import_sessions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | id("businesses") | Yes | Owning business |
| bankAccountId | id("bank_accounts") | Yes | Target bank account |
| fileName | string | Yes | Original file name |
| rowCount | number | Yes | Total rows imported |
| duplicatesSkipped | number | Yes | Rows skipped as duplicates |
| dateRange | object { from: string, to: string } | Yes | Date range of transactions in file |
| importedBy | id("users") | Yes | Who uploaded |
| importedAt | number | Yes | Timestamp |

**Indexes**: `by_businessId`, `by_bankAccountId`

### reconciliation_matches

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | id("businesses") | Yes | Owning business |
| bankTransactionId | id("bank_transactions") | Yes | The bank transaction |
| accountingEntryId | id("accounting_entries") | Yes | The matched accounting entry |
| matchType | "auto" \| "manual" | Yes | How the match was created |
| confidenceScore | number | Yes | 0.0 to 1.0 |
| confidenceLevel | "high" \| "medium" \| "low" | Yes | Derived tier |
| matchReason | string | Yes | Human-readable: "Reference match", "Amount + date proximity", etc. |
| status | "suggested" \| "confirmed" \| "rejected" | Yes | User action status |
| confirmedBy | id("users") | No | Who confirmed/rejected |
| confirmedAt | number | No | When confirmed/rejected |
| deletedAt | number | No | Soft-delete timestamp |

**Indexes**: `by_businessId`, `by_bankTransactionId`, `by_accountingEntryId`, `by_bankTransactionId_status`

## Modified Tables

### accounting_entries (existing)

No schema changes. The `reconciliation_matches` table creates a foreign key relationship via `accountingEntryId`. The existing `referenceNumber`, `originalAmount`, `transactionDate`, and `sourceDocumentType` fields are used for matching.

## State Transitions

### Bank Transaction Reconciliation Status

```
unmatched → suggested    (auto-matching engine finds a candidate)
suggested → reconciled   (user confirms match)
suggested → unmatched    (user rejects match)
unmatched → reconciled   (user manually matches)
unmatched → categorized  (user categorizes as bank charge/interest/etc.)
reconciled → unmatched   (user unmatches)
categorized → unmatched  (user uncategorizes)
```
