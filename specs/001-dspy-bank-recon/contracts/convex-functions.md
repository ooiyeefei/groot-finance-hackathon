# Convex Function Contracts: Bank Recon GL Integration

## bankAccounts (extended)

### `bankAccounts.update` (mutation)
```
Args: { id: Id<bank_accounts>, glAccountId?: Id<chart_of_accounts>, ...existing }
Returns: void
```
Adds GL account linkage to existing bank account update mutation.

## bankTransactions (extended)

### `bankTransactions.classifyBatch` (action)
```
Args: { businessId: Id<businesses>, bankAccountId: Id<bank_accounts> }
Returns: { classified: number, alreadyClassified: number, errors: number }
```
Runs Tier 1 → Tier 2 classification on all unclassified transactions for a bank account.
- Tier 1: Convex-side keyword rules (bankReconClassifier.ts)
- Tier 2: Lambda call for remaining unclassified items
- Updates bank_transactions with suggestedDebitAccountId, suggestedCreditAccountId, confidence, reasoning

### `bankTransactions.confirmClassification` (mutation)
```
Args: { id: Id<bank_transactions> }
Returns: { journalEntryId: Id<journal_entries> }
```
Creates draft JE from AI classification. Sets `reconciliationStatus: "posted"`. Links JE back to bank tx.

### `bankTransactions.rejectClassification` (mutation)
```
Args: { id: Id<bank_transactions> }
Returns: void
```
Resets classification fields. Sets `reconciliationStatus: "unmatched"`. Stores rejection as correction.

### `bankTransactions.overrideClassification` (mutation)
```
Args: { id: Id<bank_transactions>, debitAccountId: Id<chart_of_accounts>, creditAccountId: Id<chart_of_accounts> }
Returns: { journalEntryId: Id<journal_entries> }
```
User overrides AI suggestion. Creates draft JE with user-chosen accounts. Stores correction for DSPy training.

### `bankTransactions.batchConfirmHighConfidence` (mutation)
```
Args: { businessId: Id<businesses>, bankAccountId: Id<bank_accounts> }
Returns: { confirmed: number, journalEntriesCreated: number }
```
Confirms all transactions with confidence ≥0.90 and creates draft JEs for classified (unmatched) items.

### `bankTransactions.batchPostToGL` (mutation)
```
Args: { businessId: Id<businesses>, bankAccountId: Id<bank_accounts> }
Returns: { posted: number }
```
Creates draft JEs for all confirmed classifications that don't yet have a journal entry.

## bankReconCorrections (new)

### `bankReconCorrections.create` (internalMutation)
```
Args: { businessId, bankTransactionDescription, bankName, originalDebitAccountCode, originalCreditAccountCode, correctedDebitAccountCode, correctedCreditAccountCode, correctionType, createdBy }
Returns: Id<bank_recon_corrections>
```

### `bankReconCorrections.listForBusiness` (query)
```
Args: { businessId: Id<businesses> }
Returns: Array<BankReconCorrection>
```

### `bankReconCorrections.getTrainingData` (internalQuery)
```
Args: { businessId: Id<businesses>, afterCorrectionId?: Id<bank_recon_corrections> }
Returns: { corrections: Array<{description, bankName, correctedDebitCode, correctedCreditCode}>, totalCount: number, uniqueDescriptions: number }
```

## bankReconOptimization (new)

### `bankReconOptimization.triggerWeekly` (internalAction)
```
Args: {}
Returns: void
```
Called by cron. Iterates businesses with corrections, runs optimization for eligible ones.

### `bankReconOptimization.runForBusiness` (internalAction)
```
Args: { businessId: Id<businesses>, force?: boolean }
Returns: { success: boolean, beforeAccuracy?: number, afterAccuracy?: number, newModelVersion?: string }
```
Calls Lambda `/optimize_bank_recon_model`. Stores result in dspy_model_versions.

## Lambda Endpoints (groot-finance-ai-classifier)

### `classify_bank_transaction`
```
Input: { transactions: [{description, amount, direction, bankName}], availableAccounts: [{code, name, type}], corrections: [...], modelS3Key?: string }
Output: { classifications: [{description, debitAccountCode, creditAccountCode, confidence, reasoning, isNew}], usedDspy: boolean }
```

### `optimize_bank_recon_model`
```
Input: { businessId: string, corrections: [...], currentModelS3Key?: string }
Output: { success: boolean, newModelS3Key?: string, beforeAccuracy: number, afterAccuracy: number }
```
