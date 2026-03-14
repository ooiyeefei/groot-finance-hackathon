# Feature Specification: Improve AI Action Center Insights Quality

**Feature Branch**: `001-improve-action-center`
**Created**: 2026-03-14
**Status**: Draft
**Input**: Improve AI Action Center insights quality — fix category name resolution, vendor/merchant terminology, insight deduplication, materiality filtering, domain-aware analysis, and Ask AI UX.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - CFO-Grade Insight Quality (Priority: P1)

As a business owner or finance admin viewing the Action Center, I want insights that are material, non-redundant, and use correct terminology so I can trust the AI's analysis and act on it without wading through noise.

**Why this priority**: The current insights are unusable — they surface trivial anomalies (RM52 flagged as "high"), use raw category IDs (`other_9gsnmr`), confuse expense-claim merchants with AP suppliers/vendors, and produce many near-duplicate cards. Fixing insight quality is the foundation — without it, no other improvement matters.

**Independent Test**: Can be tested by triggering the analysis pipeline on a test business and verifying that: (a) all category names display human-readable labels, (b) no vendor concentration/risk insights reference expense-claim merchants, (c) no trivial-amount anomalies appear as "high" priority, (d) semantically duplicate insights are consolidated.

**Acceptance Scenarios**:

1. **Given** a business with expense claims from merchants like "FamilyMart" and "Starbucks", **When** the detection pipeline runs, **Then** no "vendor concentration risk" or "vendor risk" insights reference these merchants — only AP suppliers from the `vendors` table are analyzed for concentration/risk.

2. **Given** an expense category stored as `other_9gsnmr` in accounting entries, **When** the pipeline creates an anomaly insight for that category, **Then** the insight title and description display the human-readable category name "Others" (or the business's custom name for that category), never the raw ID.

3. **Given** a category expense of RM52 that is >2σ from the mean, **When** the anomaly detection runs, **Then** the insight is either suppressed (below materiality threshold) or downgraded to "low" priority — never "high" for immaterial amounts.

4. **Given** the AI Discovery LLM produces an insight titled "High Concentration in Top Vendors" and an existing insight titled "Concentration in Top Vendors with High Expenses" already exists, **When** the pipeline attempts to create the new insight, **Then** the semantically duplicate insight is detected (keyword overlap >60%) and not created.

6. **Given** supplier concentration risk detected for Company A (60%) and Company B (55%), **When** the detection pipeline runs, **Then** a single "Supplier Concentration Risk" summary card is created listing both suppliers and their percentages — not two separate cards.

5. **Given** a business with both AP vendor invoices and employee expense claims, **When** the business summary is generated for LLM prompts, **Then** the summary clearly separates "Top Suppliers (AP)" from "Top Merchants (Expense Claims)" with distinct labels.

---

### User Story 2 - Domain-Aware Analysis Separation (Priority: P1)

As a CFO, I want the Action Center to analyze AP/vendor data separately from expense claim data, applying domain-appropriate insights to each — concentration risk for suppliers, policy compliance for expense claims.

**Why this priority**: This is architecturally coupled with P1. The system currently mixes all `accounting_entries` regardless of source domain, producing nonsensical advice like "diversify your vendor base" when the "vendors" are restaurants employees visited. The fix requires restructuring the data pipeline.

**Independent Test**: Can be tested by examining the output of vendor intelligence detection — verifying it only processes entries linked to `vendors` table records (AP domain), not expense-claim-sourced entries.

**Acceptance Scenarios**:

1. **Given** accounting entries with `transactionType === "Expense"` that originated from expense claims (no `vendorId` linking to `vendors` table), **When** vendor concentration detection runs, **Then** those entries are excluded from vendor concentration analysis.

2. **Given** accounting entries with `vendorId` linking to the `vendors` table (AP/COGS domain), **When** vendor concentration detection runs, **Then** only these entries are analyzed, and insights use the term "supplier" instead of "vendor" in titles and descriptions.

3. **Given** expense claims with merchant names like "Grab" or "KFC", **When** the expense analysis runs, **Then** any insights about expense claims use the term "merchant" and focus on policy-relevant patterns (e.g., "High frequency of same-merchant claims" or "Weekend expense claims pattern") rather than supply-chain analysis.

---

### User Story 3 - Ask AI Prepopulated Prompt (Priority: P2)

As a user viewing an insight card, I want the "Ask AI" button to show me a visible, editable prompt in the chat window so I can refine my question or simply send it, rather than having the context sent silently.

**Why this priority**: Users currently click "Ask AI" and the chat opens with no visible prompt — the message is dispatched behind the scenes. Users don't know what was sent or how to refine their question. Adding suggested prompts improves engagement and makes the AI interaction more transparent.

**Independent Test**: Can be tested by clicking "Ask AI" on any insight card and verifying the chat window opens with a prepopulated, editable message in the input field.

**Acceptance Scenarios**:

1. **Given** a user viewing an insight card detail modal, **When** they click "Ask AI", **Then** the chat window opens with the insight context prepopulated as an editable message in the input field (not auto-sent).

2. **Given** the prepopulated message in the chat input, **When** the user reviews it, **Then** the message is concise and human-readable (e.g., "Why was this flagged? What should I do about [insight title]?") rather than a raw technical dump.

3. **Given** the prepopulated prompt, **When** the user edits the text before sending, **Then** the edited message is sent instead of the original template.

4. **Given** the chat window opened from "Ask AI", **When** the user sees the input area, **Then** 2-3 suggested question chips appear below the input field, contextual to the insight type (e.g., anomaly insights show "Show me the transactions", cash flow insights show "What's my projected runway?").

5. **Given** a suggested question chip, **When** the user taps it, **Then** the chip text replaces the current input content and the user can send or further edit it.

---

### User Story 4 - Materiality-Based Priority Scoring (Priority: P2)

As a business owner, I want anomaly detection to consider the absolute financial impact (materiality) when assigning priority, so that high-priority alerts represent significant financial exposure rather than statistical outliers on trivial amounts.

**Why this priority**: Without materiality thresholds, a RM52 "Others" expense that's 4.1σ above average gets flagged as "high" priority alongside genuinely concerning findings. This erodes trust. At scale (2000+ businesses), the noise would be overwhelming.

**Independent Test**: Can be tested by creating expense entries of varying amounts with high σ-deviation and verifying priority assignment considers both statistical deviation AND absolute amount relative to business size.

**Acceptance Scenarios**:

1. **Given** an expense of RM52 that is 4.1σ above its category average, **When** anomaly detection runs, **Then** the priority is "low" (not "high") because the absolute amount is below the materiality threshold.

2. **Given** an expense of RM15,000 that is 3.5σ above its category average, **When** anomaly detection runs, **Then** the priority is "high" because both the statistical deviation and absolute amount are significant.

3. **Given** a business with total monthly expenses of RM500,000, **When** an anomaly of RM200 is detected at 3σ, **Then** the anomaly is suppressed entirely (below 0.1% of monthly expenses) or created as "low" priority with a note about its relative insignificance.

---

### User Story 5 - Smarter LLM Discovery Prompts (Priority: P3)

As a product owner, I want the AI Discovery pipeline to produce CFO-grade insights by using domain-separated data, existing insight awareness, and stricter quality criteria in LLM prompts.

**Why this priority**: Layer 2b (AI Discovery) currently produces generic, low-quality insights because the LLM prompt doesn't enforce domain separation or materiality. Improving the prompts is lower effort but meaningfully improves output quality.

**Independent Test**: Can be tested by running the AI Discovery pipeline on a test business and verifying the LLM output contains only novel, material findings that don't overlap with existing insights.

**Acceptance Scenarios**:

1. **Given** the AI Discovery LLM prompt, **When** the pipeline runs, **Then** the prompt explicitly instructs the LLM to: (a) distinguish AP suppliers from expense-claim merchants, (b) only flag findings above a materiality threshold relative to business size, (c) avoid generic advice about vendor diversification for expense merchants.

2. **Given** 10 existing insights for a business, **When** the AI Discovery runs, **Then** zero of the new discoveries are semantically equivalent to existing insights (enforced by both the prompt and a post-LLM semantic check).

---

### Edge Cases

- What happens when a business has no AP vendors (only expense claims)? The vendor intelligence detection should produce zero insights (no suppliers to analyze), while expense patterns may still generate relevant findings.
- What happens when a category ID cannot be resolved to a human-readable name? The system should fall back to a sanitized display name (e.g., strip the random suffix and capitalize: `other_9gsnmr` → "Others") rather than showing the raw ID.
- What happens when a business has fewer than 10 transactions? Detection algorithms already skip (existing `< 10` check), but the AI Discovery prompt should also note insufficient data.
- What happens when the LLM returns insights that violate the domain separation rules? A post-LLM validation step should check for forbidden terms (e.g., "vendor diversification" referencing expense-claim merchants) and reject those insights.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST resolve category IDs to human-readable names in all insight titles, descriptions, and metadata before display or LLM processing. Fallback: strip suffix and capitalize (e.g., `other_9gsnmr` → "Others").

- **FR-002**: System MUST separate accounting entries into two domains for analysis: (a) AP/COGS entries (linked to `vendors` table via `vendorId`) analyzed for supplier concentration, risk, and spending changes; (b) Expense-claim entries (no `vendorId` or sourced from `expense_claims`) analyzed for employee spending patterns and policy compliance.

- **FR-003**: System MUST use consistent terminology: "supplier" for AP/COGS vendors in the `vendors` table, "merchant" for payees in expense claims. The word "vendor" MUST NOT appear in user-facing insight text.

- **FR-004**: Anomaly detection MUST apply materiality thresholds that consider both statistical deviation (σ) AND absolute financial impact relative to business size (e.g., percentage of monthly expenses). Trivial amounts MUST NOT receive "high" or "critical" priority regardless of σ-deviation.

- **FR-005**: System MUST use hybrid insight consolidation: (a) **Transaction-level alerts** (anomaly on a specific transaction, pricing surge from a specific supplier) remain as individual cards. (b) **Pattern-level findings** (supplier concentration risk, spending changes across multiple suppliers) MUST consolidate into ONE summary card per pattern type, listing all affected entities inside the card (e.g., one "Supplier Concentration Risk" card listing "Company A: 60%, Company B: 55%"). (c) **Layer 2b LLM insights** MUST be deduplicated using keyword overlap scoring (Jaccard similarity >60% on tokenized titles) against existing insight titles to prevent semantically equivalent duplicates.

- **FR-006**: The "Ask AI" button MUST prepopulate the chat input with a visible, editable prompt rather than auto-sending a hidden message. The prompt should be conversational (e.g., "I'd like to understand more about: [insight title]. What data supports this finding and what should I do?"). Additionally, 2-3 context-aware suggested question chips MUST appear below the input (e.g., "What data supports this?", "Show me the transactions", "What's the financial impact?") that users can tap to auto-fill the input.

- **FR-007**: The AI Discovery LLM prompt MUST include domain-separation rules, materiality guidance, and a list of existing insight summaries to prevent semantic duplication.

- **FR-008**: The business summary provided to LLM prompts MUST clearly separate "Top Suppliers (AP)" from "Top Merchants (Expense Claims)" and include domain labels.

- **FR-009**: Upon deployment, system MUST delete all existing Action Center insights and re-run the improved detection pipeline once per active business to regenerate clean insights. A one-time migration script handles this.

### Key Entities

- **ActionCenterInsight**: Persisted insight with title, description, category, priority, status, metadata. Now includes `sourceDataDomain` (ap_vendor | expense_claim | cross_domain) to track which domain produced the insight.
- **Category Resolution**: A lookup mechanism mapping category IDs (e.g., `other_9gsnmr`) to human-readable names using the business's expense category configuration.
- **Materiality Context**: Business-size-relative thresholds computed from total monthly expenses, used to filter and prioritize anomalies.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero insight titles or descriptions display raw category IDs (like `other_9gsnmr`) — all show human-readable names.
- **SC-002**: Zero vendor concentration/risk insights reference expense-claim merchants — only AP suppliers appear in supply-chain analysis.
- **SC-003**: No anomaly with absolute amount below 1% of monthly business expenses receives "high" or "critical" priority.
- **SC-004**: Semantic duplicate rate among active insights drops to near-zero (tested by running dedup on existing insights and verifying <5% duplicates remain).
- **SC-005**: "Ask AI" click shows a visible, editable prompt in chat input rather than auto-sending — verified by user interaction testing.
- **SC-006**: User-facing insight text uses "supplier" for AP payees and "merchant" for expense-claim payees — zero instances of "vendor" in user-facing Action Center text.

## Clarifications

### Session 2026-03-14

- Q: What should happen to existing low-quality insights in production? → A: Clean up + re-run — delete all existing insights for affected businesses and re-run the improved pipeline once to regenerate fresh insights.
- Q: Should Ask AI show suggestion chips in addition to the editable prompt? → A: Yes — editable prompt plus 2-3 context-aware quick-tap question chips (e.g., "What data supports this?", "Show me the transactions", "What's the financial impact?").
- Q: How should dedup handle multiple findings of the same pattern for different entities? → A: Hybrid consolidation — transaction-level alerts (anomaly on txn X, pricing surge from supplier Y) stay as individual cards. Pattern-level findings (concentration risk, spending changes) consolidate into ONE summary card per pattern type listing all affected entities (e.g., "Supplier Concentration Risk" card lists "Company A: 60%, Company B: 55%"). Keyword overlap scoring (Jaccard similarity >60%) used for Layer 2b LLM insight dedup.

## Assumptions

- The `vendors` table reliably represents AP/COGS suppliers, and `vendorId` on `accounting_entries` correctly links to it. Entries without `vendorId` that originated from expense claims can be identified by cross-referencing the `expense_claims` table or by `transactionType` + absence of `vendorId`.
- The business expense category configuration (used to resolve category IDs to names) is accessible at detection time via Convex queries.
- Semantic deduplication uses keyword overlap scoring (Jaccard similarity on tokenized titles, threshold >60%) — no LLM calls or vector database needed. This is deterministic, free, and fast at scale.
- The materiality threshold (1% of monthly expenses) is a reasonable starting point and may be refined based on user feedback.
