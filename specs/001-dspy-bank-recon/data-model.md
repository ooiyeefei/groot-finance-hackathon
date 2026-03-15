# Data Model: DSPy-Powered Bank Reconciliation

## Schema Changes

### Extended: `bank_accounts` table

Add GL account linkage field:

```
glAccountId: optional ID → chart_of_accounts   // Which COA entry this bank maps to (e.g., "1010 Cash at Bank — Maybank")
```

### Extended: `bank_transactions` table

Add AI classification fields:

```
suggestedDebitAccountId: optional ID → chart_of_accounts   // AI-suggested debit account
suggestedCreditAccountId: optional ID → chart_of_accounts  // AI-suggested credit account
classificationConfidence: optional number                   // 0.0-1.0
classificationTier: optional number                        // 1 = rules, 2 = AI, 0 = unclassified
classificationReasoning: optional string                   // Chain-of-thought explanation
journalEntryId: optional ID → journal_entries              // Link to created draft JE (null until posted)
classifiedAt: optional number                              // Timestamp of classification
classifiedBy: optional string                              // "tier1_rules" | "tier2_dspy" | "manual"
```

Remove (deprecated):
```
category: REMOVED (was: bank_charges | interest | non_business | other)
```

Update `reconciliationStatus` values:
```
"unmatched"    → No match and not classified
"suggested"    → AI suggested a match to existing JE
"reconciled"   → User confirmed match to existing JE
"classified"   → AI classified with GL accounts (replaces old "categorized")
"posted"       → Draft JE created and linked (NEW status)
```

### New: `bank_recon_corrections` table

```
businessId: ID → businesses
bankTransactionDescription: string      // Original bank description (e.g., "CIMB MTHLY FEE")
bankName: string                        // Bank name for context
originalDebitAccountCode: string        // What AI suggested (e.g., "6100")
originalCreditAccountCode: string       // What AI suggested (e.g., "1010")
correctedDebitAccountCode: string       // What user changed to (e.g., "6200")
correctedCreditAccountCode: string      // What user changed to (e.g., "1010")
correctionType: string                  // "gl_override" | "match_rejection" | "match_confirmation"
createdBy: string                       // User ID
createdAt: number                       // Timestamp

Indexes:
- by_businessId: [businessId]
- by_businessId_createdAt: [businessId, createdAt]
```

### Extended: `dspy_model_versions` table (existing)

Add bank recon domain support:

```
domain: string  // "fee_classification" | "bank_recon"  (NEW field, existing rows default to "fee_classification")
```

Existing fields already support per-business, per-domain model versioning.

### New: `bank_recon_classification_rules` table

```
businessId: ID → businesses
keyword: string                // Case-insensitive substring match (e.g., "service charge")
debitAccountId: ID → chart_of_accounts
creditAccountId: ID → chart_of_accounts   // Usually the bank's GL account
platform: string               // "all" or specific bank name
priority: optional number       // Higher = preferred match
isActive: boolean
createdBy: string
createdAt: number
deletedAt: optional number

Indexes:
- by_businessId: [businessId]
```

## Entity Relationships

```
bank_accounts ──→ chart_of_accounts (glAccountId)
bank_transactions ──→ chart_of_accounts (suggestedDebitAccountId, suggestedCreditAccountId)
bank_transactions ──→ journal_entries (journalEntryId)
bank_recon_corrections ──→ businesses (businessId)
bank_recon_classification_rules ──→ businesses (businessId)
bank_recon_classification_rules ──→ chart_of_accounts (debitAccountId, creditAccountId)
dspy_model_versions ──→ businesses (businessId) [existing]
```

## State Transitions

```
bank_transactions.reconciliationStatus:

unmatched
├─→ suggested (Tier 1/2 matching found candidate JE)
│   ├─→ reconciled (user confirms match — NO new JE)
│   └─→ unmatched (user rejects)
├─→ classified (Tier 1/2 classification suggested GL accounts — NO existing JE)
│   ├─→ posted (user confirms → draft JE created, linked)
│   │   └─→ reconciled (draft JE is posted by user in Journal Entries tab)
│   └─→ unmatched (user rejects classification)
└─→ reconciled (user manual match to existing JE)
    └─→ unmatched (user unmatches)
```
