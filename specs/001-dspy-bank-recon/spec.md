# Feature Specification: DSPy-Powered Bank Reconciliation with GL Integration

**Feature Branch**: `001-dspy-bank-recon`
**Created**: 2026-03-16
**Status**: Draft
**Input**: User description: "5 DSPy features (MIPROv2, Assert+Suggest, BootstrapFewShot, ChainOfThought, Evaluate) + GL integration + batch UX for bank reconciliation"
**Related Issues**: [#302](https://github.com/grootdev-ai/groot-finance/issues/302) (Split matching), [#303](https://github.com/grootdev-ai/groot-finance/issues/303) (Cross-business training), [#304](https://github.com/grootdev-ai/groot-finance/issues/304) (PDF OCR import)

## User Scenarios & Testing *(mandatory)*

### User Story 1 — AI-Classified GL Posting for Unmatched Transactions (Priority: P1)

As a finance team member, I want unmatched bank transactions to be automatically classified into the correct GL accounts so that I can post them as journal entries without manually looking up account codes every time.

**Why this priority**: This is the core value gap — currently, categorizing a bank transaction is just a label ("bank charges") with no GL impact. With AI classification, every bank transaction can become a proper journal entry, which is the entire point of bank reconciliation.

**Independent Test**: Import a bank statement with unmatched transactions (bank fees, interest, ATM withdrawals). The system should suggest specific GL accounts for each with confidence scores. User confirms or corrects. A draft journal entry is created with proper double-entry (debit + credit).

**Acceptance Scenarios**:

1. **Given** an unmatched bank debit transaction "MAYBANK SERV CHG RM12.00", **When** the classification engine runs, **Then** the system suggests Debit: "6100 Bank Charges" / Credit: "1010 Cash at Bank (Maybank)" with a confidence score and reasoning explanation.
2. **Given** an unmatched bank credit transaction "INTEREST CREDIT RM2.50", **When** the classification engine runs, **Then** the system suggests Debit: "1010 Cash at Bank" / Credit: "4200 Interest Income" following double-entry principles.
3. **Given** the user accepts an AI-suggested classification, **When** they click "Post to GL", **Then** a draft journal entry is created with `sourceType: "bank_reconciliation"`, the correct debit/credit lines, and the bank transaction is linked to the journal entry.
4. **Given** the user disagrees with the AI suggestion, **When** they change the debit account from "6100 Bank Charges" to "6200 Admin Expenses", **Then** the correction is stored and the system uses it to improve future suggestions for similar transactions.
5. **Given** a bank account has no linked GL account, **When** the user tries to post a classification, **Then** the system prompts them to link the bank account to a Chart of Accounts entry first.

---

### User Story 2 — Tiered Intelligence: Rules First, AI Second (Priority: P1)

As a finance team member, I want the system to handle common bank transactions instantly using rules, and only invoke AI for unusual or new transactions, so that reconciliation is fast and cost-effective.

**Why this priority**: Running AI on every transaction is expensive and slow. Tier 1 rules handle 60-80% of transactions for free in milliseconds. AI (Tier 2) only runs on the remaining "long tail" — keeping costs low while maintaining accuracy.

**Independent Test**: Import a bank statement with a mix of common transactions (bank fees, interest) and unusual ones (new vendor names, ambiguous descriptions). Common ones should classify instantly via rules. Unusual ones should trigger AI classification with confidence scores.

**Acceptance Scenarios**:

1. **Given** a bank transaction matches a known keyword rule (e.g., "SERVICE CHARGE" → Bank Charges), **When** the classification engine runs, **Then** the system classifies it immediately with high confidence (≥0.90) using Tier 1 rules — no AI call made.
2. **Given** a bank transaction has no matching rule (e.g., "GRABPAY SETTLEMENT ADJ"), **When** Tier 1 returns unclassified, **Then** the system invokes the AI classifier (Tier 2) to suggest GL accounts with reasoning.
3. **Given** a business has accumulated 20+ corrections, **When** the AI classifier runs, **Then** it uses BootstrapFewShot to include the best correction examples in its prompt, improving accuracy over the base model.
4. **Given** a business has a pre-trained optimized model in storage, **When** the AI classifier runs, **Then** it loads the optimized model instead of compiling inline, reducing latency.

---

### User Story 3 — Batch Operations for Hundreds of Transactions (Priority: P1)

As a finance team member importing a monthly bank statement with 200+ transactions, I want to review and process transactions in bulk based on confidence levels, so that I can complete reconciliation in 15 minutes instead of 2-4 hours.

**Why this priority**: Without batch operations, users must click through each of 200 transactions one-by-one. This kills the product experience and makes bank reconciliation feel like manual labor rather than AI assistance.

**Independent Test**: Import a 200-row bank statement. Dashboard should show transactions grouped by confidence level. User should be able to batch-confirm all high-confidence items in one click, then focus attention on low-confidence items.

**Acceptance Scenarios**:

1. **Given** 200 transactions have been imported and classified, **When** the reconciliation dashboard loads, **Then** it shows summary cards: "120 Auto-Matched (green)", "45 Review Suggested (amber)", "25 Needs Attention (red)", "10 Unmatched (gray)".
2. **Given** the user clicks "Confirm All High-Confidence", **When** the batch action runs, **Then** all transactions with confidence ≥0.90 are confirmed in one operation and their status updates to "reconciled".
3. **Given** the user clicks "Post All Confirmed to GL", **When** the batch action runs, **Then** draft journal entries are created for all confirmed classifications that don't already have a journal entry.
4. **Given** a low-confidence transaction (red badge), **When** the user views it, **Then** the AI reasoning is displayed explaining why the confidence is low (e.g., "Amount matches but description is ambiguous — could be marketing or service fee").
5. **Given** the user wants to filter, **When** they click on a status card (e.g., "Needs Attention"), **Then** the transaction list filters to show only that status category.

---

### User Story 4 — Self-Improving System via Weekly Optimization (Priority: P2)

As a business owner, I want the system to automatically improve its classification accuracy each week based on my team's corrections, so that over time it requires less and less manual intervention.

**Why this priority**: This is the "Groot moat" — the system gets smarter with use. Without this, accuracy stays flat and users don't see value improvement over time. But it's P2 because the correction storage (P1) must exist first.

**Independent Test**: Accumulate 20+ corrections for a business. Trigger weekly optimization. Compare accuracy before and after. The optimized model should correctly classify previously-wrong transactions.

**Acceptance Scenarios**:

1. **Given** a business has 20+ corrections with at least 10 unique transaction descriptions, **When** the weekly optimization cron triggers, **Then** the system runs prompt optimization, compares before/after accuracy, and deploys the new model only if accuracy improved.
2. **Given** a business has no new corrections since the last optimization, **When** the weekly cron triggers, **Then** the system skips optimization for that business (saving compute cost), tracked via "last optimized correction ID" pattern.
3. **Given** optimization is running during development, **When** a developer passes `force: true`, **Then** the optimization runs regardless of safeguards (skip-if-recent, minimum-unique).
4. **Given** a business has 100 corrections but only 3 unique descriptions, **When** the cron triggers, **Then** the system skips optimization (minimum 10 unique patterns required to prevent overfitting).
5. **Given** optimization completes successfully with improved accuracy, **Then** the new model is saved with version numbering, and the next classification call loads the improved model.

---

### User Story 5 — Bank Account to GL Account Linkage (Priority: P1)

As a finance team member, I want each registered bank account to be linked to a specific Chart of Accounts entry, so that the system knows which GL account represents "Cash at Bank" for that bank when creating journal entries.

**Why this priority**: Without this linkage, the system cannot determine the credit side of a journal entry (which Cash account to use). This is a prerequisite for any GL posting.

**Independent Test**: Register a bank account "Maybank Operating", link it to COA account "1010 Cash at Bank — Maybank". Import a transaction. When classification creates a journal entry, the credit line should automatically use account 1010.

**Acceptance Scenarios**:

1. **Given** a user is registering a new bank account, **When** they fill in the form, **Then** there is a mandatory field to select a Chart of Accounts entry (filtered to asset accounts) to link as the GL account.
2. **Given** an existing bank account without a GL link, **When** the user opens "Manage Accounts", **Then** the system highlights the missing link and prompts them to set it before imports can generate journal entries.
3. **Given** a bank account is linked to COA "1010 Cash at Bank", **When** a bank debit (e.g., bank charges) is classified, **Then** the draft journal entry credits "1010 Cash at Bank" (money leaving the bank) and debits the expense account.
4. **Given** a bank account is linked to COA "1010 Cash at Bank", **When** a bank credit (e.g., interest income) is classified, **Then** the draft journal entry debits "1010 Cash at Bank" (money entering the bank) and credits the revenue account.

---

### User Story 6 — Reconciliation Summary Statement (Priority: P2)

As a finance team member, I want to generate a reconciliation statement showing the bank balance versus GL balance with outstanding items, so that I can verify the books are in order and share the summary with auditors.

**Why this priority**: This is the standard accounting deliverable for bank reconciliation. Without it, the feature doesn't meet IFRS expectations. But it's P2 because the matching and posting (P1) must work first.

**Independent Test**: Complete reconciliation for a month. Generate the summary. It should show bank closing balance, adjusted GL balance, and the difference (target: zero).

**Acceptance Scenarios**:

1. **Given** a user has completed reconciliation for a period, **When** they view the reconciliation summary, **Then** it shows: bank statement closing balance, total reconciled, total unmatched, total classified and posted to GL, and the remaining difference.
2. **Given** the reconciliation summary is complete, **When** the user views it, **Then** outstanding items (unreconciled deposits, unpresented payments) are listed with amounts.
3. **Given** a user wants to share the summary, **When** they click "Export", **Then** a downloadable CSV report is generated with all reconciliation details.

---

### User Story 7 — Double-Entry Validation with Self-Healing (Priority: P2)

As a finance team member, I want the system to guarantee that every AI-generated journal entry follows double-entry principles (debits = credits, valid account codes), so that I can trust the AI output without manually checking every entry.

**Why this priority**: This is the accounting integrity safeguard. Without it, AI could produce unbalanced entries that corrupt the GL. It's P2 because the classification (P1) must produce entries first, then this validates them.

**Independent Test**: Feed the AI a transaction that could produce an unbalanced entry. The system should detect the imbalance and retry automatically (backtracking), producing a balanced entry.

**Acceptance Scenarios**:

1. **Given** the AI classifies a transaction, **When** the suggested debit account code doesn't exist in the business's Chart of Accounts, **Then** the system detects the invalid code and retries automatically with a valid suggestion.
2. **Given** the AI classifies a batch of transactions, **When** any journal entry has total debits ≠ total credits, **Then** the system flags it as invalid and retries classification for that transaction.
3. **Given** the AI suggests the same account for both debit and credit, **When** validation runs, **Then** the system flags this as likely incorrect and suggests an alternative.

---

### Edge Cases

- What happens when a bank transaction has no description (blank field)? → The system uses amount, date, and direction as classification inputs. Confidence will be lower. The transaction is flagged for manual review.
- What happens when the Chart of Accounts has no suitable account for a transaction? → The system suggests a "Suspense" account (9999) and flags the transaction for manual review.
- What happens when two bank transactions have identical amounts on the same date? → Each is treated as distinct. The matching engine uses description and reference as additional differentiators.
- What happens when the AI classifier is unavailable (timeout/error)? → Tier 1 rules still classify known patterns. Tier 2 failures are logged and the transaction is marked as "unclassified" for manual review. No data is lost.
- What happens when a business has zero corrections and no optimized model? → The base model runs with the generic prompt. Confidence is capped at 0.80 to indicate the system hasn't been personalized yet.
- What happens when the weekly optimization DECREASES accuracy? → The new model is NOT deployed. The existing model is kept. The optimization result is logged for debugging.
- What happens when a user imports the same bank statement twice? → Existing deduplication (hash-based) prevents duplicate transactions. The system shows a warning with the count of duplicates skipped.

## Requirements *(mandatory)*

### Functional Requirements

**Bank Account — GL Linkage**
- **FR-001**: System MUST require each bank account to be linked to a Chart of Accounts entry (asset account) representing "Cash at Bank" for that bank.
- **FR-002**: System MUST display a warning on bank accounts without a GL link and prevent GL posting until the link is established.

**Tiered Classification Engine**
- **FR-003**: System MUST run Tier 1 (rule-based keyword matching) first for all unmatched/uncategorized bank transactions. Rules MUST be stored per-business and editable by admins.
- **FR-004**: System MUST run Tier 2 (AI classification) only for transactions that Tier 1 could not classify (confidence = 0 or unclassified).
- **FR-005**: The AI classifier MUST use chain-of-thought reasoning, providing a human-readable explanation for each classification decision.
- **FR-006**: The AI classifier MUST validate that suggested account codes exist in the business's Chart of Accounts. If an invalid code is suggested, the system MUST retry with backtracking.
- **FR-007**: The AI classifier MUST validate that every journal entry suggestion has total debits equal to total credits. If unbalanced, the system MUST retry with backtracking.
- **FR-008**: The AI classifier MUST suggest both debit and credit account codes, not just a category label.

**GL Posting**
- **FR-009**: System MUST create a draft journal entry when a user confirms an AI classification for an unmatched bank transaction. The journal entry MUST have `sourceType: "bank_reconciliation"` and link back to the bank transaction.
- **FR-010**: Draft journal entries MUST follow double-entry bookkeeping: one debit line and one credit line (or more for split transactions), with debits equal to credits.
- **FR-011**: The credit account for bank debits (money leaving) MUST default to the bank account's linked GL account. The debit account for bank credits (money arriving) MUST default to the bank account's linked GL account.
- **FR-012**: Users MUST be able to edit the suggested GL accounts on a draft journal entry before posting.

**Correction Feedback Loop**
- **FR-013**: System MUST store every user correction (rejected match, changed GL account, overridden classification) as a training record linked to the business.
- **FR-014**: Corrections MUST include: original AI suggestion, user's correction, bank transaction description, bank name, timestamp, and the user who made the correction.
- **FR-015**: System MUST pass all accumulated corrections to the AI classifier on each invocation, where they are used as few-shot training examples.

**Weekly Optimization (MIPROv2)**
- **FR-016**: System MUST run a weekly optimization job per business that has accumulated corrections.
- **FR-017**: Optimization MUST only trigger if the business has at least 10 unique transaction descriptions in its corrections (minimum diversity check).
- **FR-018**: Optimization MUST skip if no new corrections have been added since the last optimization run (tracked via "last optimized correction ID" pattern).
- **FR-019**: Optimization MUST compare before/after accuracy on a holdout test set and only deploy the new model if accuracy improved.
- **FR-020**: Optimization MUST support a `force: true` parameter to override safeguards during development.
- **FR-021**: Optimized models MUST be versioned and stored persistently per-business with version numbers.

**Accuracy Evaluation**
- **FR-022**: System MUST evaluate AI classification accuracy using an 80/20 train/test split on accumulated corrections.
- **FR-023**: System MUST track per-business metrics: total corrections, accuracy trend, last optimization date, current model version.

**Batch Operations**
- **FR-024**: System MUST allow users to "Confirm All High-Confidence" matches/classifications in one action (transactions with confidence ≥0.90).
- **FR-025**: System MUST allow users to "Post All Confirmed to GL" in one action, creating draft journal entries for all confirmed classifications.
- **FR-026**: System MUST display transactions grouped by confidence level with visual indicators: green (≥0.90), amber (0.70-0.89), red (<0.70), gray (unmatched).
- **FR-027**: Low-confidence transactions (red) MUST NOT be included in batch confirm actions — they require individual review.

**Reconciliation Summary**
- **FR-028**: System MUST generate a reconciliation summary per bank account per period showing: bank statement closing balance, total reconciled amount, total unmatched amount, total classified and posted to GL, and remaining difference.
- **FR-029**: System MUST allow exporting the reconciliation summary as a downloadable report.

### Key Entities

- **Bank Account** (existing, extended): A registered business bank account. Extended with a mandatory link to a Chart of Accounts entry (GL account) representing "Cash at Bank" for this bank.
- **Bank Transaction** (existing, extended): A single row from an imported bank statement. Extended with AI classification fields: suggested debit/credit accounts, confidence score, classification tier (1 or 2), reasoning text.
- **Bank Recon Correction**: A record of a user correcting an AI classification. Stores: bank transaction description, bank name, original suggestion, corrected account codes, user, timestamp. Used as training data for few-shot learning and prompt optimization.
- **Optimized Model Version**: A versioned snapshot of the optimized AI prompt (instructions + best few-shot examples). Stored per-business, per-domain. Includes: version number, accuracy metrics, correction count used, creation date, last optimized correction ID.
- **Journal Entry** (existing, extended): A double-entry accounting record. Extended to support `sourceType: "bank_reconciliation"` linking back to the bank transaction that triggered it.
- **Reconciliation Summary**: A per-period, per-bank-account report showing bank balance vs GL balance with outstanding items. Generated on demand from reconciliation data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete reconciliation of a 200-transaction monthly bank statement in under 15 minutes (compared to 2-4 hours manually), including GL posting.
- **SC-002**: The system automatically classifies at least 60% of bank transactions correctly on first import (Tier 1 rules + base AI model), increasing to 90%+ after one month of user corrections.
- **SC-003**: Every AI-generated journal entry passes double-entry validation (debits = credits, valid account codes) — zero unbalanced entries reach draft status.
- **SC-004**: Users can batch-confirm high-confidence transactions (≥0.90) in one click, processing 100+ transactions in under 5 seconds.
- **SC-005**: Weekly optimization improves classification accuracy by at least 5 percentage points after the first 20 corrections (measurable via before/after accuracy comparison).
- **SC-006**: The system supports multiple bank accounts per business, each linked to a specific GL account, with proper journal entries posted to the correct Cash at Bank account.
- **SC-007**: The reconciliation summary accurately reflects the difference between bank statement balance and GL balance, with all outstanding items listed.
- **SC-008**: AI classification failures (timeouts, errors) do not block the reconciliation workflow — Tier 1 rules continue to function and unclassified transactions are flagged for manual review.

## Clarifications

### Session 2026-03-16

- Q: Should GL posting be automatic or draft? → A: Draft journal entries. User reviews and posts manually. This gives control while automating the classification work.
- Q: Should the AI classifier be a separate service or extend the existing fee classifier? → A: Extend the existing fee classifier (renamed to `groot-finance-ai-classifier`). Same patterns, same dependencies, new handler endpoint. Group by runtime profile, not by business feature.
- Q: How many fixed categories for bank transactions? → A: No fixed categories. The full Chart of Accounts is the target space. The AI suggests specific GL account codes, not category labels. Seed training data uses common patterns (bank charges, interest, non-business) but the system learns any account mapping.
- Q: How are corrections collected? → A: Implicitly from user actions — confirm (positive signal), reject (negative signal), edit GL account on draft JE (correction signal). No extra "rate this" button needed.
- Q: What safeguards prevent overfitting? → A: Minimum 10 unique patterns, skip-if-recently-optimized (last optimized correction ID), accuracy gating (only deploy if improved), force flag for development.

## Assumptions

- The existing bank reconciliation feature (CSV import, matching engine, reconciliation dashboard) is functional and deployed.
- The Chart of Accounts feature is deployed and businesses have COA entries for common bank-related accounts (Cash at Bank, Bank Charges, Interest Income).
- The existing `fee-classifier-python` Lambda is deployed and can be extended with new handlers.
- Gemini 3.1 Flash-Lite API is available and cost-effective for classification tasks.
- The Convex cron system supports scheduling weekly optimization jobs per business.
- Users understand basic double-entry bookkeeping (debit/credit) and can review draft journal entries.
- Bank transactions imported via CSV have at minimum: date, description, and amount (debit or credit).
