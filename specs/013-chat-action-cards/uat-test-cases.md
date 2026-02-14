# UAT Test Cases: Chat Action Cards Expansion

**Feature**: 013-chat-action-cards
**Branch**: `013-chat-action-cards`
**Date**: 2026-02-14
**Tester**: Test engineer agent
**Environment**: Local (`npm run dev` + `npx convex dev`)

## Prerequisites

1. **Start local dev server**:
   ```bash
   npm run dev
   ```
2. **Start Convex dev sync** (separate terminal):
   ```bash
   npx convex dev
   ```
3. **Ensure `.env.local`** has all required keys (Clerk, Convex, API keys)
4. **Log in** to the application via Clerk auth
5. **Select a business** that has transaction history (needed for cash flow, budget alerts)
6. **Open the chat widget** (floating button in bottom-right corner)

## Test Timeout

Each chat interaction may take up to **180 seconds** due to SSE streaming and Modal/Lambda cold starts. Wait for the full response before evaluating.

---

## TC-001: Invoice Posting Card

**User Story**: US1 — Post OCR Invoice to Accounting (P1)
**Priority**: Critical

### TC-001.1: Card renders with OCR data

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type: "Show my recently processed invoices" or "Any invoices ready to post?" | Agent calls search tools and responds with text |
| 2 | Observe the action card(s) below the text | An `invoice_posting` card renders with: vendor name, amount with currency symbol, invoice date, optional invoice number in header, OCR confidence percentage |
| 3 | If line items exist, verify they display | Up to 3 line items shown with description + amount; "+N more items" if >3 |
| 4 | Check confidence badge | If confidence < 70%: yellow warning banner reads "Low OCR confidence (XX%) — review before posting" |
| 5 | Check confidence display | If confidence >= 70%: small text shows "OCR confidence: XX%" |

**Pass criteria**: Card renders with correct data from the invoices table.

### TC-001.2: Post to Accounting flow

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Post to Accounting" button | Inline confirmation appears: "Post [currency] [amount] from [vendor] to accounting?" with Confirm/Cancel buttons |
| 2 | Click "Cancel" | Returns to idle state with "Post to Accounting" button visible again |
| 3 | Click "Post to Accounting" again, then "Confirm" | Loading spinner appears: "Posting to accounting..." |
| 4 | Wait for completion | Card shows green "Posted" badge in header, action buttons disappear |
| 5 | Verify in Convex dashboard | A new `accounting_entries` document exists with `sourceDocumentType: "invoice"`, `createdByMethod: "ocr"`, correct amount/vendor/date |

**Pass criteria**: Accounting entry created successfully with correct fields.

### TC-001.3: Error handling

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt to post an invoice that was already posted (duplicate `sourceRecordId`) | Error message appears in red box with "Try again" link |
| 2 | Click "Try again" | Returns to idle state for re-attempt |

### TC-001.4: Historical view

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Reload the page | Chat loads historical messages from Convex |
| 2 | Scroll to the message that contained the invoice_posting card | Card renders with "Posted" badge, NO action buttons |

---

## TC-002: Cash Flow Dashboard Card

**User Story**: US2 — Cash Flow Dashboard in Chat (P1)
**Priority**: Critical

### TC-002.1: Dashboard renders with metrics

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type: "What's my cash flow situation?" or "How many days of runway do I have?" | Agent calls `analyze_cash_flow` tool and responds |
| 2 | Observe the action card | A `cash_flow_dashboard` card renders with 2x2 metric grid |
| 3 | Verify metrics | Grid shows: Runway (X days), Monthly Burn (currency formatted), Est. Balance (currency formatted), Net Cash Flow (with +/- prefix) |
| 4 | Check expense-to-income ratio bar | Progress bar shows ratio, colored: green (<80%), yellow (80-100%), red (>100%) |
| 5 | Check forecast period | Label like "30-day forecast" appears in header |
| 6 | Check alerts (if any) | Alert badges with severity colors: red (critical), yellow (high), blue (medium) |

**Pass criteria**: All metrics display with correct formatting and color coding.

### TC-002.2: View Details panel

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "View Details" link at bottom of card | A slide-out panel appears to the left of the chat widget |
| 2 | Verify panel content | Panel header shows "Cash Flow [period]", body shows a dashboard layout with 6 metrics (Runway Days, Monthly Burn Rate, etc.) |
| 3 | Click close button (X) on panel | Panel slides closed, chat widget remains functional |
| 4 | Click "View Details" again | Panel re-opens with same data |

**Pass criteria**: Rich content panel opens/closes correctly alongside chat.

### TC-002.3: Historical view

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Reload page, scroll to old cash flow message | Dashboard card renders identically (read-only, same metrics + alerts) |

---

## TC-003: Compliance Alert Card

**User Story**: US3 — Tax & Compliance Alert Card (P2)
**Priority**: High

### TC-003.1: Card renders with regulatory data

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type: "What are the GST registration requirements in Singapore?" | Agent calls RAG knowledge base tool, responds with text + citations |
| 2 | Observe the action card | A `compliance_alert` card renders with: country flag + name + authority (e.g., "SG — IRAS"), severity badge, topic title |
| 3 | Verify requirements list | Bullet-pointed list of key requirements |
| 4 | Check severity badge | Color matches severity: red (action_required), yellow (warning), blue (for_information) |
| 5 | Check effective date | If provided, displays "Effective: [date]" |

**Pass criteria**: Card renders with correct country, authority, and requirements from RAG.

### TC-003.2: Citation links open overlay

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Observe citation links at bottom of card | "Sources: [1] [2] ..." links displayed |
| 2 | Click a citation link (e.g., [1]) | Citation overlay opens showing source document details (name, country, content snippet, official URL) |
| 3 | Close the citation overlay | Overlay dismisses, card remains in place |

**Pass criteria**: Citation links work identically to inline citation markers in text.

### TC-003.3: No results scenario

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ask about a country not in knowledge base (e.g., "Tax compliance for Antarctica") | Agent responds with text only, NO compliance_alert card rendered |

---

## TC-004: Budget Alert Card

**User Story**: US4 — Budget Alert Card (P2)
**Priority**: High

### TC-004.1: Card renders with category comparisons

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type: "Am I overspending this month?" or "Show my spending vs. average" | Agent fetches transactions and computes averages |
| 2 | Observe the action card | A `budget_alert` card renders with: period in header (e.g., "February 2026"), overall status badge |
| 3 | Verify category rows | Each category shows: name, current spend (formatted), progress bar, percentage badge, average amount |
| 4 | Check color coding | Green (<80%), Yellow (80-100%), Red (>100%) — both progress bars and percentage badges |
| 5 | Check totals row | Footer shows total current spend vs. total average |
| 6 | Check overall status badge | Matches worst category status or computed overall |

**Pass criteria**: Categories display with correct comparisons and color coding.

### TC-004.2: CSV export

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click the download icon (small arrow) in the card header | A file `budget-alert.csv` downloads |
| 2 | Open the CSV file | Contains columns: Category, Current Spend, Average Spend, % of Average, Status |
| 3 | Verify data matches card | Numbers are plain values (not locale-formatted), categories match card |

**Pass criteria**: CSV downloads with correct, spreadsheet-compatible data.

### TC-004.3: View Details panel

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "View Details" link | Rich content panel opens showing a table with all categories |
| 2 | Verify table columns | Category, Current, Average, % of Avg, Status |
| 3 | Close panel | Panel closes cleanly |

### TC-004.4: Insufficient data

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Use a business with <1 month of data | Agent responds with text explaining more data is needed, NO budget_alert card |

---

## TC-005: Rich Content Panel (Cross-cutting)

**User Story**: US5 — Rich Content Panel (P2)
**Priority**: Medium

### TC-005.1: Panel positioning

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger "View Details" from any card (cash_flow_dashboard or budget_alert) | Panel appears to the LEFT of the chat widget as a slide-out |
| 2 | Verify panel dimensions | ~480px wide, ~600px tall, does not overlap the chat widget |
| 3 | Verify panel has proper styling | bg-card background, border, shadow, rounded corners |

### TC-005.2: Content replacement

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open "View Details" from cash_flow_dashboard | Panel shows dashboard metrics |
| 2 | Without closing, click "View Details" from budget_alert (send new query first) | Panel replaces content with budget table |

### TC-005.3: Panel close

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click the X button on the panel | Panel closes |
| 2 | Continue chatting | Chat widget functions normally with no panel |

---

## TC-006: Time-Series Spending Chart

**User Story**: US6 — Time-Series Spending Charts (P3)
**Priority**: Medium

### TC-006.1: Chart renders with periods

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type: "Show spending trends for the last 6 months" | Agent fetches multi-month transaction data |
| 2 | Observe the action card | A `spending_time_series` card renders with: title in header, vertical bars for each period |
| 3 | Verify bars | Each period shows a proportional bar, period label below, amount label above |
| 4 | Check trend indicator | If present: arrow icon + percentage in header (e.g., up arrow + "12%") |
| 5 | Check category stacking (if multi-category) | Bars show stacked colors; legend appears below |

**Pass criteria**: Bars are proportional to amounts, labels are readable.

### TC-006.2: Historical view

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Reload, scroll to old time-series message | Chart renders identically |

---

## TC-007: Bulk Actions

**User Story**: US7 — Bulk Expense Approval / Invoice Posting (P3)
**Priority**: Medium

### TC-007.1: Bulk bar appears for 2+ cards

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ensure 3+ pending expense submissions exist in the system | Pre-condition |
| 2 | Type: "Show all pending expenses" | Agent responds with multiple expense_approval cards |
| 3 | Observe the bulk action bar | Above the cards: "Select All (N)" checkbox toggle; each card has an individual checkbox |

### TC-007.2: Selection and approval

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Select All" | All checkboxes fill; "Approve Selected (N)" button appears |
| 2 | Deselect one card | Button updates count: "Approve Selected (N-1)" |
| 3 | Click "Approve Selected" | Inline confirmation: "Approve N items?" with Confirm/Cancel |
| 4 | Click "Confirm" | Processing indicator appears; each card shows individual status (spinner → checkmark or X) |
| 5 | Wait for completion | Summary: "All N items approved" (if all succeed) |

### TC-007.3: Partial failure

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | If any item fails (e.g., already approved by another user) | Summary: "X approved, Y failed" with "Retry Failed" button |
| 2 | Click "Retry Failed" | Only failed items are re-selected for retry |

### TC-007.4: Historical bulk cards

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Reload, scroll to old bulk approval message | Cards render WITHOUT checkboxes, no bulk action bar (historical mode) |

---

## TC-008: CSV Export (Cross-cutting)

**User Story**: US8 — Export Data from Cards (P3)
**Priority**: Low

### TC-008.1: Spending chart export

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Get a `spending_chart` card (ask "Show spending by category") | Card renders with download icon in header |
| 2 | Click the download icon | `spending-breakdown.csv` downloads |
| 3 | Open CSV | Columns: Category, Amount, Percentage. Data matches card display. |

### TC-008.2: Vendor comparison export

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Get a `vendor_comparison` card (ask "Compare my vendors") | Card renders with download icon in header |
| 2 | Click the download icon | `vendor-comparison.csv` downloads |
| 3 | Open CSV | Columns: Vendor, Avg Price, On-Time %, Rating, Transactions, Total Spend |

### TC-008.3: Budget alert export

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Get a `budget_alert` card (ask "Am I overspending?") | Card renders with download icon in header |
| 2 | Click the download icon | `budget-alert.csv` downloads |
| 3 | Open CSV | Columns: Category, Current Spend, Average Spend, % of Average, Status |

### TC-008.4: CSV format validation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open any exported CSV in a spreadsheet (Excel, Google Sheets) | Opens without errors |
| 2 | Check number formatting | Numbers are plain (e.g., `1234.56`, not `$1,234.56`) |
| 3 | Check string escaping | Strings with commas are properly quoted |

---

## TC-009: Cross-Cutting Concerns

### TC-009.1: Design consistency

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Compare all new cards visually with existing cards (anomaly_card, expense_approval, spending_chart, vendor_comparison) | Consistent styling: same border radius, padding, header bg, font sizes, icon sizes |
| 2 | Toggle dark mode | All cards adapt correctly — no hardcoded colors visible, proper semantic token usage |
| 3 | Check button styling | Action buttons: blue bg (bg-primary), Cancel buttons: gray bg (bg-secondary), Destructive buttons: red bg (bg-destructive) |

### TC-009.2: Fallback for unknown card types

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | (Developer test) Simulate an action with `type: "unknown_type"` | FallbackCard renders with JSON preview |

### TC-009.3: Multiple card types in one response

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ask a question that triggers multiple card types (e.g., spending analysis that includes both spending_chart and budget comparison) | Cards render in order below the text content, each properly styled |

### TC-009.4: Mobile responsiveness

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Resize browser to mobile width (~375px) | Cards compress to fit within the chat widget without horizontal overflow |
| 2 | Check progress bars, metric grids | Remain readable at narrow widths |

### TC-009.5: No regressions on existing cards

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ask "Any suspicious transactions?" | Anomaly card renders as before |
| 2 | Ask "Show pending expenses" (with 1 pending) | Single expense_approval card renders (no bulk bar for 1 card) |
| 3 | Ask "Compare my office supply vendors" | Vendor comparison card renders (now with export button) |
| 4 | Ask "Show spending by category" | Spending chart renders (now with export button) |
| 5 | Approve/reject via existing expense_approval card | Mutation works, card updates status |

---

## TC-010: System Prompt Validation

**Priority**: Critical — ensures LLM emits correct card types

### TC-010.1: Card type triggers

Test each trigger phrase and verify the correct card type is emitted:

| Trigger Phrase | Expected Card Type |
|---------------|-------------------|
| "Any invoices ready to post?" | `invoice_posting` |
| "What's my cash flow?" | `cash_flow_dashboard` |
| "GST registration requirements Singapore" | `compliance_alert` |
| "Am I overspending this month?" | `budget_alert` |
| "Show spending trends for last 6 months" | `spending_time_series` |
| "Show pending expenses" (with 2+) | `expense_approval` (with bulk bar) |
| "Show spending by category" | `spending_chart` |

### TC-010.2: No false card emissions

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ask a general question: "Hello, how are you?" | Text response only, NO action cards |
| 2 | Ask about something with insufficient data | Text response explaining limitation, NO empty cards |

---

## Result Template

| Test Case | Status | Notes |
|-----------|--------|-------|
| TC-001.1 Card renders | [ ] Pass / [ ] Fail | |
| TC-001.2 Post to accounting | [ ] Pass / [ ] Fail | |
| TC-001.3 Error handling | [ ] Pass / [ ] Fail | |
| TC-001.4 Historical view | [ ] Pass / [ ] Fail | |
| TC-002.1 Dashboard metrics | [ ] Pass / [ ] Fail | |
| TC-002.2 View Details panel | [ ] Pass / [ ] Fail | |
| TC-002.3 Historical view | [ ] Pass / [ ] Fail | |
| TC-003.1 Compliance card | [ ] Pass / [ ] Fail | |
| TC-003.2 Citation links | [ ] Pass / [ ] Fail | |
| TC-003.3 No results | [ ] Pass / [ ] Fail | |
| TC-004.1 Budget categories | [ ] Pass / [ ] Fail | |
| TC-004.2 CSV export | [ ] Pass / [ ] Fail | |
| TC-004.3 View Details | [ ] Pass / [ ] Fail | |
| TC-004.4 Insufficient data | [ ] Pass / [ ] Fail | |
| TC-005.1 Panel positioning | [ ] Pass / [ ] Fail | |
| TC-005.2 Content replacement | [ ] Pass / [ ] Fail | |
| TC-005.3 Panel close | [ ] Pass / [ ] Fail | |
| TC-006.1 Time-series chart | [ ] Pass / [ ] Fail | |
| TC-006.2 Historical view | [ ] Pass / [ ] Fail | |
| TC-007.1 Bulk bar appears | [ ] Pass / [ ] Fail | |
| TC-007.2 Selection + approval | [ ] Pass / [ ] Fail | |
| TC-007.3 Partial failure | [ ] Pass / [ ] Fail | |
| TC-007.4 Historical bulk | [ ] Pass / [ ] Fail | |
| TC-008.1 Spending export | [ ] Pass / [ ] Fail | |
| TC-008.2 Vendor export | [ ] Pass / [ ] Fail | |
| TC-008.3 Budget export | [ ] Pass / [ ] Fail | |
| TC-008.4 CSV format | [ ] Pass / [ ] Fail | |
| TC-009.1 Design consistency | [ ] Pass / [ ] Fail | |
| TC-009.2 Fallback card | [ ] Pass / [ ] Fail | |
| TC-009.3 Multiple types | [ ] Pass / [ ] Fail | |
| TC-009.4 Mobile responsive | [ ] Pass / [ ] Fail | |
| TC-009.5 No regressions | [ ] Pass / [ ] Fail | |
| TC-010.1 Card triggers | [ ] Pass / [ ] Fail | |
| TC-010.2 No false emissions | [ ] Pass / [ ] Fail | |

**Overall Result**: [ ] PASS / [ ] FAIL

**Tested By**: _______________
**Date**: _______________
**Build**: `npm run build` passed at _______________
