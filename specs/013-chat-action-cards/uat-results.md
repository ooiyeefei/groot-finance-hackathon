# UAT Results: Chat Action Cards (013)

**Date**: 2026-02-14
**Tester**: Claude Code (automated via Playwright MCP)
**Branch**: `013-chat-action-cards`
**Environment**: Local (`npm run dev` on port 3001 + `npx convex dev`)
**Build**: `npm run build` passed with zero errors

---

## Summary

| Result | Count |
|--------|-------|
| PASS   | 0     |
| FAIL   | 4     |
| BLOCKED| 6     |

**Overall Result**: FAIL

---

## Test Data Seeded

- 16 accounting entries (5 income + 11 expenses, Oct 2025 - Feb 2026)
- 3 invoices with OCR data (confidence: 92%, 95%, 55%)
- 4 expense submissions (status: submitted)
- Business: "Groot Test account" (SGD home currency)
- Dashboard confirmed showing: S$35K income, S$22.1K expenses, 9 transactions

---

## Results

| Test Case | Status | Details |
|-----------|--------|---------|
| **TC-001.1** Card renders with OCR data | FAIL | Agent used `get_transactions` tool (searches accounting_entries). No `get_invoices` tool exists to query the invoices table. Text-only response: "no matching transactions". No `invoice_posting` card rendered. |
| **TC-001.2** Post to Accounting flow | BLOCKED | Depends on TC-001.1 |
| **TC-001.3** Error handling | BLOCKED | Depends on TC-001.1 |
| **TC-001.4** Historical view | BLOCKED | Depends on TC-001.1 |
| **TC-002.1** Dashboard metrics | FAIL | `analyze_cash_flow` tool executed successfully (SGD 16,300 balance, 47 days runway, 0.65 expense ratio). However, LLM rendered results as plain text instead of emitting a `cash_flow_dashboard` action card via ```actions``` JSON block. |
| **TC-002.2** View Details panel | BLOCKED | Depends on TC-002.1 card rendering |
| **TC-002.3** Historical view | BLOCKED | Depends on TC-002.1 |
| **TC-003.1** Compliance card | FAIL | `searchRegulatoryKnowledgeBase` tool failed: "Embedding API request failed: 500 Internal Server Error". Infrastructure issue with embedding service. |
| **TC-003.2** Citation links | BLOCKED | Depends on TC-003.1 |
| **TC-003.3** No results scenario | NOT TESTED | |
| **TC-004.1** Budget categories | FAIL | `get_transactions` returned 0 results for February 2026 despite 16 seeded entries visible on dashboard. Agent responded with clarification questions. No `budget_alert` card emitted. |
| **TC-004.2** CSV export | BLOCKED | Depends on TC-004.1 |
| **TC-004.3** View Details | BLOCKED | Depends on TC-004.1 |
| **TC-004.4** Insufficient data | NOT TESTED | |
| **TC-005** Rich Content Panel | BLOCKED | No cards with "View Details" rendered |
| **TC-006** Time-Series Chart | NOT TESTED | |
| **TC-007** Bulk Actions | NOT TESTED | |
| **TC-008** CSV Export | NOT TESTED | |
| **TC-009** Cross-Cutting | BLOCKED | No action cards rendered to verify |
| **TC-010.1** Card type triggers | FAIL (implicit) | None of the 4 tested trigger phrases produced the expected card type |
| **TC-010.2** No false emissions | PASS (trivially) | No cards were emitted at all |

---

## Root Cause Analysis

### Issue 1: LLM Does Not Emit Action Cards (CRITICAL)
**Affects**: ALL card types (TC-001 through TC-010)

The system prompt in `prompts.ts` contains an ACTION CARD GENERATION PROTOCOL that instructs the LLM to emit action cards via ```actions``` JSON blocks. However, the Gemini model is **not following this protocol**. When tool results return structured data, the LLM formats it as plain text markdown instead of emitting it as an action card.

**Evidence**: TC-002 — `analyze_cash_flow` returned correct structured data (runway, burn rate, balance, ratio), but the LLM rendered it as bold text instead of a ```actions``` block.

**Recommended Fix**:
1. Strengthen the prompt with explicit examples showing when to emit ```actions``` blocks
2. Add few-shot examples of correct card emission after tool results
3. Consider post-processing: detect tool results that match card schemas and auto-generate cards server-side
4. Test with different model temperatures or model versions

### Issue 2: Missing `get_invoices` Tool (HIGH)
**Affects**: TC-001 (Invoice Posting Card)

The agent has no tool to query the `invoices` table (OCR-processed documents). Available tools (`get_transactions`, `search_documents`, etc.) search accounting_entries or RAG. The invoice_posting card requires data from the invoices table with `extractedData`.

**Recommended Fix**:
1. Create a new `get_invoices` tool in `src/lib/ai/tools/` that queries the invoices table
2. Filter by status "completed" and `extractedData` presence
3. Register in `tool-factory.ts`
4. Add tool schema to model config

### Issue 3: Embedding API 500 Error (MEDIUM)
**Affects**: TC-003 (Compliance Alert Card)

The `searchRegulatoryKnowledgeBase` tool calls an embedding API that returned HTTP 500. This is an infrastructure/service availability issue.

**Recommended Fix**:
1. Check embedding service health (Qdrant Cloud / embedding endpoint)
2. Verify API keys and endpoint URLs in `.env.local`
3. Add retry logic or fallback for transient 500 errors

### Issue 4: `get_transactions` Query Mismatch (MEDIUM)
**Affects**: TC-001, TC-004

The `get_transactions` tool returned 0 results for queries that should match seeded data visible on the dashboard. The dashboard shows the data correctly (S$35K income, S$22.1K expenses), but the LLM's tool calls use filters that exclude the data.

**Recommended Fix**:
1. Investigate how the LLM constructs `get_transactions` parameters (date range, category, query filters)
2. The LLM may be adding document type or category filters that don't match
3. Consider loosening default filters or adding a "show all" fallback

---

## Frontend Card Components: Status

The card components themselves could NOT be visually verified because no action cards were emitted by the LLM. However, based on code review:

| Component | Build Status | Code Review |
|-----------|-------------|-------------|
| `invoice-posting-card.tsx` | Compiles | Mutation flow, state machine, confidence warning implemented |
| `cash-flow-dashboard.tsx` | Compiles | 2x2 metric grid, ratio bar, alerts, View Details |
| `compliance-alert-card.tsx` | Compiles | Country flags, severity badges, citation links |
| `budget-alert-card.tsx` | Compiles | Progress bars, color thresholds, CSV export, View Details |
| `spending-time-series.tsx` | Compiles | Bar groups, stacking, trend indicator |
| `bulk-action-bar.tsx` | Compiles | Selection, bulk processing, retry logic |
| `csv-export.ts` | Compiles | CSV escaping, blob download |
| `message-renderer.tsx` | Compiles | Bulk grouping, citation delegation, onViewDetails |
| `chat-window.tsx` | Compiles | Rich content panel state management |

---

## Screenshots

| Screenshot | Test Case | Description |
|-----------|-----------|-------------|
| `uat-dashboard-with-data.png` | Setup | Dashboard with seeded data showing S$35K income |
| `uat-tc001-invoice-response.png` | TC-001 | "Generating response" state |
| `uat-tc001-fail-no-invoice-card.png` | TC-001 | Text-only response, no card |
| `uat-tc002-cashflow-response.png` | TC-002 | Cash flow as plain text |
| `uat-tc003-compliance-fail.png` | TC-003 | Embedding API error response |
| `uat-tc004-budget-fail.png` | TC-004 | "No matching transactions" response |

---

## Next Steps (Priority Order)

1. **Fix LLM card emission** — This is the blocker for ALL card testing. Either strengthen prompts or add server-side card generation.
2. **Create `get_invoices` tool** — Required for invoice posting card to work.
3. **Fix embedding service** — Required for compliance card testing.
4. **Debug `get_transactions` filtering** — Investigate why tool returns 0 when dashboard shows data.
5. **Re-run UAT** after fixes.
