# Research: Chat Action Cards Expansion

**Feature**: 013-chat-action-cards
**Date**: 2026-02-14

## Decision 1: Invoice Posting Card — Data Flow

**Decision**: Use existing `invoices.getByStatus("completed")` to fetch OCR-processed invoices, then call `accountingEntries.create()` with `createdByMethod: "ocr"` and `sourceDocumentType: "invoice"` to post to accounting.

**Rationale**: Both Convex queries/mutations already exist. No new schema or backend work needed. The `extractedData` field on invoices contains vendor, amount, currency, date, and line items from OCR — all fields needed for the card display and for creating the accounting entry.

**Alternatives considered**:
- Creating a new "post to accounting" mutation: Rejected — `accountingEntries.create()` already supports all required fields including `sourceRecordId` and `sourceDocumentType`.
- Using MCP proposals (create_proposal/confirm_proposal): Rejected — adds unnecessary indirection for a simple database write.

## Decision 2: Cash Flow Dashboard Card — Data Shape

**Decision**: Map directly from `CashFlowAnalysis` interface returned by `financialIntelligence.analyzeCashFlow`. Fields: `runwayDays`, `monthlyBurnRate`, `estimatedBalance`, `totalIncome`, `totalExpenses`, `expenseToIncomeRatio`, `alerts[]` (type + severity + message).

**Rationale**: The tool already returns a structured analysis object with all metrics needed for the dashboard card. No transformation layer needed — the LLM includes this data in the action card JSON block.

**Alternatives considered**:
- Calling MCP `forecast_cash_flow` instead: Rejected — the local `analyze_cash_flow` tool already calls the Convex query directly and is faster (no Lambda cold start).

## Decision 3: Compliance Alert Card — Citation Integration

**Decision**: The compliance_alert card will embed citation indices that reference the same `CitationData[]` array already flowing through SSE `citation` events. Clicking a citation in the card will call the same `setActiveCitation` / `setIsCitationOpen` handlers used by the MessageRenderer.

**Rationale**: The citation overlay and SSE citation pipeline are fully functional. Reusing them avoids building a separate document viewer and keeps the UX consistent.

**Alternatives considered**:
- Embedding full citation data in the card's action data: Rejected — would duplicate data already sent via SSE citation events. Instead, the card references citations by index.

## Decision 4: Budget Alert Card — Historical Average Calculation

**Decision**: The LLM will instruct the `get_transactions` tool to fetch 4 months of data (current + 3 prior). The tool result gives per-transaction data. The LLM aggregates by category in its response and emits the budget_alert card with `currentSpend`, `averageSpend`, and `percentOfAverage` per category.

**Rationale**: No new tool or Convex query needed. The existing `get_transactions` tool returns transaction data with `category` and `home_currency_amount` fields. The LLM can compute rolling averages from the tool result before emitting the action card.

**Alternatives considered**:
- Adding a new Convex query for category aggregation: Could be done later for performance, but not needed initially — transaction volumes per business are manageable for in-LLM computation.
- Using the MCP `detect_anomalies` tool: Rejected — anomalies detect individual outliers, not aggregate category trends.

## Decision 5: Rich Content Panel — Trigger Mechanism

**Decision**: Add an optional `richContent` field to the `ChatAction` interface. When present, the card renders a "View Details" button. Clicking it emits a custom event that the ChatWindow captures to open the `RichContentPanel` with the payload.

**Rationale**: The RichContentPanel component already exists with chart/table/dashboard renderers. It just needs a trigger mechanism. Using the action data keeps it self-contained — no separate SSE event type needed.

**Alternatives considered**:
- New SSE event type `rich_content`: Rejected — adds streaming protocol complexity. The data already comes with the action card.
- React Context: Rejected — would couple cards to a specific context provider. A simple callback prop (`onViewDetails`) is cleaner.

## Decision 6: Time-Series Chart — CSS vs. Library

**Decision**: Use CSS-based visualization (consistent with existing spending_chart) for the initial implementation. Vertical bars with period labels, no external charting library.

**Rationale**: The existing spending_chart uses pure CSS bars. Staying consistent avoids adding a charting library dependency. The chat widget's 400px width constrains what's useful anyway.

**Alternatives considered**:
- Adding recharts: Mentioned in rich-content-panel.tsx comments as future option. Better suited for the rich content panel (larger viewport) than inline cards.

## Decision 7: Bulk Actions — State Management

**Decision**: Bulk selection state managed via a `BulkActionProvider` wrapper component that the MessageRenderer conditionally renders around groups of 2+ cards of the same approval type. Each card gets a checkbox; the provider tracks selected IDs and renders a floating action bar.

**Rationale**: Keeps individual card components unchanged (they just gain an optional checkbox). The bulk state lives above the cards, not inside them.

**Alternatives considered**:
- Per-card state with shared context: Rejected — would require modifying the existing expense_approval card.
- Modifying the action card registry to support groups: Over-engineered for the current need.

## Decision 8: CSV Export — Implementation

**Decision**: Client-side CSV generation using a utility function that converts card data arrays to CSV strings and triggers a Blob download. No server-side endpoint needed.

**Rationale**: Card data is already in the browser. CSV generation is trivial. No privacy concern since the user already sees the data.

**Alternatives considered**:
- Server-side CSV generation endpoint: Rejected — unnecessary roundtrip for data already in the client.
