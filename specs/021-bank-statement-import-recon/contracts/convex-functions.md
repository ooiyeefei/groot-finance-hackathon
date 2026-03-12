# Convex Function Contracts

## bankAccounts

| Function | Type | Input | Output |
|----------|------|-------|--------|
| `list` | query | `{ businessId }` | `BankAccount[]` |
| `getById` | query | `{ id }` | `BankAccount \| null` |
| `create` | mutation | `{ businessId, bankName, accountNumber, currency, nickname? }` | `Id<"bank_accounts">` |
| `update` | mutation | `{ id, bankName?, accountNumber?, currency?, nickname? }` | `void` |
| `deactivate` | mutation | `{ id }` | `void` |
| `reactivate` | mutation | `{ id }` | `void` |

## bankTransactions

| Function | Type | Input | Output |
|----------|------|-------|--------|
| `importBatch` | mutation | `{ businessId, bankAccountId, importSessionId, transactions: ParsedRow[] }` | `{ imported: number, duplicatesSkipped: number }` |
| `list` | query | `{ businessId, bankAccountId?, status?, dateFrom?, dateTo?, limit?, cursor? }` | `{ transactions: BankTransaction[], nextCursor, totalCount }` |
| `getById` | query | `{ id }` | `BankTransaction & { match?: ReconciliationMatch }` |
| `updateStatus` | mutation | `{ id, status, category? }` | `void` |
| `getSummary` | query | `{ businessId, bankAccountId, dateFrom?, dateTo? }` | `{ total, reconciled, suggested, unmatched, categorized, progressPercent }` |

## bankImportSessions

| Function | Type | Input | Output |
|----------|------|-------|--------|
| `create` | mutation | `{ businessId, bankAccountId, fileName, rowCount, duplicatesSkipped, dateRange }` | `Id<"bank_import_sessions">` |
| `list` | query | `{ businessId, bankAccountId? }` | `ImportSession[]` |

## reconciliationMatches

| Function | Type | Input | Output |
|----------|------|-------|--------|
| `runMatching` | action | `{ businessId, bankAccountId }` | `{ matched: number, unmatched: number }` |
| `getCandidates` | query | `{ bankTransactionId }` | `MatchCandidate[]` (includes accounting entry + source record context) |
| `confirmMatch` | mutation | `{ matchId }` | `void` |
| `rejectMatch` | mutation | `{ matchId }` | `void` |
| `createManualMatch` | mutation | `{ bankTransactionId, accountingEntryId }` | `Id<"reconciliation_matches">` |
| `unmatch` | mutation | `{ bankTransactionId }` | `void` |
| `getReconciliationSummary` | query | `{ businessId, bankAccountId, dateFrom, dateTo }` | `ReconciliationSummary` |
