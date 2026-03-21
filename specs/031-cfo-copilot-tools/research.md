# Research: CFO Copilot Tools

## Decision 1: Tool Architecture — MCP-first

**Decision**: All three new tools (forecast, PDF report, tax reference) will be MCP server endpoints in `src/lambda/mcp-server/tools/`, following CLAUDE.md's "MCP-first tool development" mandate.

**Rationale**: CLAUDE.md explicitly says "ALL new agent capabilities MUST be built as MCP server endpoints first." The existing MCP server already has `forecast_cash_flow` and the tool-factory has `analyze_cash_flow` and `searchRegulatoryKnowledgeBase`. The new tools follow the established pattern.

**Alternatives considered**:
- Tool-factory only (rejected — CLAUDE.md prohibits adding new tools to tool-factory)
- Dual registration (rejected — unnecessary duplication)

**Implementation note**: The existing `forecast_cash_flow` MCP tool generates daily forecasts. We'll extend it to support monthly aggregation via a `granularity: 'monthly'` param rather than creating a new tool.

## Decision 2: PDF Generation — Lambda-side, not client-side

**Decision**: PDF generation will happen server-side in the MCP Lambda, not client-side using `@react-pdf/renderer`.

**Rationale**:
- The existing sales invoice PDF uses `@react-pdf/renderer` client-side (React hook `use-invoice-pdf.ts`). This works for interactive pages where the user clicks "Download PDF".
- For the chat agent, PDFs must be generated server-side because: (1) the agent runs in an API route, not a browser; (2) `@react-pdf/renderer` requires React DOM and isn't available in Lambda.
- Instead, use **PDFKit** (lightweight, no DOM dependency, works in Node.js Lambda) or generate HTML and convert to PDF.
- The generated PDF is uploaded to S3 and a signed download URL is returned.

**Alternatives considered**:
- `@react-pdf/renderer` in Lambda (rejected — requires React DOM)
- Puppeteer/Chromium in Lambda (rejected — too heavy, 50MB+ layer)
- **PDFKit** (selected — lightweight, Node.js native, good for structured reports)

## Decision 3: Action Card for Forecast

**Decision**: Create a new `forecast_card` action card type that extends the existing `cash_flow_dashboard` pattern with monthly projection chart data.

**Rationale**: The existing `cash_flow_dashboard` card shows current metrics (runway, burn rate, balance). The forecast card needs to show a time-series of monthly projections — different data shape requiring a new card type.

**Pattern**:
- Register via `registerActionCard('forecast_card', ForecastCard)` in `src/domains/chat/components/action-cards/forecast-card.tsx`
- Import in `action-cards/index.tsx`
- Add to agent prompts (prompts.ts action card documentation)
- Data shape: `{ months: [{ month, income, expenses, balance }], runway, riskAlerts, currency }`

## Decision 4: Tax Reference KB — Extend existing regulatory KB

**Decision**: Use the existing `searchRegulatoryKnowledgeBase` tool and Qdrant collection rather than creating a new tool. Upload tax reference content to the same `regulatory_kb` collection with appropriate metadata filtering.

**Rationale**:
- `RegulatoryKnowledgeTool` already exists with embedding → Qdrant search → country disambiguation
- The tool already handles Malaysia/Singapore content
- Adding tax reference articles (rates, deadlines, thresholds) to the same collection with `category: 'tax_reference'` metadata avoids creating a parallel tool
- The existing `compliance_alert` action card can display tax reference results

**Alternatives considered**:
- New Qdrant collection + new tool (rejected — duplication of existing RAG pipeline)
- Hardcoded tax data without RAG (rejected — not extensible, can't benefit from embeddings)

## Decision 5: RBAC Integration

**Decision**:
- Forecast + PDF tools: Add to `FINANCE_TOOLS` set in tool-factory (requires finance_admin/owner) AND add Manager access via MCP permissions
- Tax reference: Already available to all roles via existing `searchRegulatoryKnowledgeBase`

**Rationale**: Spec clarification Q1 established Owner/Admin + Manager for forecasting and PDF. The tool-factory's `FINANCE_TOOLS` set restricts to finance_admin/owner. We need to:
1. Add forecast/PDF tool names to `FINANCE_TOOLS` or create a new `CFO_TOOLS` set that includes manager
2. In MCP permissions, add the new tools with `allowedRoles: ['owner', 'admin', 'manager']`

## Decision 6: PDF Storage & Delivery

**Decision**: Upload generated PDFs to `finanseal-bucket` under prefix `reports/{business_id}/{report_type}/{filename}` and return a CloudFront signed URL with 7-day expiry.

**Rationale**:
- Existing S3 patterns use `finanseal-bucket` with structured prefixes
- CloudFront signed URLs are already implemented (`src/lib/cloudfront-signer.ts`)
- 7-day expiry matches FR-007 requirement
- No Convex storage needed — the PDF is ephemeral

## Decision 7: Forecast Historical Basis

**Decision**: Use all available transaction history (up to 12 months) as the basis for monthly projections, with 90-day recent window for trend weighting.

**Rationale**: The existing `forecast_cash_flow` MCP tool already uses 90-day lookback for daily averages. For monthly projections, we need more data to capture seasonal patterns. Use all available data but weight recent 90 days more heavily.

## Decision 8: Risk Alert Threshold

**Decision**: Alert when projected runway drops below 2 months of average operating expenses (per spec clarification Q2).

**Rationale**: Simple, dynamic threshold that scales with business size. Calculate average monthly expenses from historical data, multiply by 2 = safety threshold.
