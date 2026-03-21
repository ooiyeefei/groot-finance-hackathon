# Implementation Tasks: CFO Copilot Tools

**Branch**: `031-cfo-copilot-tools` | **Generated**: 2026-03-21

## Task 1: Extend forecast_cash_flow MCP tool with monthly granularity + AR/AP
**Priority**: P1 | **Depends on**: None

### Files to modify:
- `src/lambda/mcp-server/contracts/mcp-tools.ts` — Add MonthlyForecastOutput types, update ForecastCashFlowInputSchema
- `src/lambda/mcp-server/tools/forecast-cash-flow.ts` — Add monthly aggregation logic, AR/AP queries

### Acceptance:
- [ ] `forecast_months` param (1-12) produces monthly buckets
- [ ] `granularity: 'monthly'` returns MonthlyForecastOutput
- [ ] Known AR (unpaid sales_invoices) factored into projections by due month
- [ ] Known AP (unpaid invoices) factored into projections by due month
- [ ] Risk alerts trigger when runway < 2 months of avg operating expenses
- [ ] Backward compatible — existing daily forecast still works

---

## Task 2: Create forecast_card action card
**Priority**: P1 | **Depends on**: Task 1

### Files to create/modify:
- `src/domains/chat/components/action-cards/forecast-card.tsx` — NEW: monthly bar chart with balance line
- `src/domains/chat/components/action-cards/index.tsx` — Import forecast-card

### Acceptance:
- [ ] Registered as 'forecast_card' in action card registry
- [ ] Shows monthly income/expense bars with net balance
- [ ] Shows runway months and risk level badge
- [ ] Shows known AR/AP totals
- [ ] Displays risk alerts if any
- [ ] Uses business home currency (not hardcoded)

---

## Task 3: Update agent prompts for forecast_card
**Priority**: P1 | **Depends on**: Task 2

### Files to modify:
- `src/lib/ai/agent/config/prompts.ts` — Add forecast_card documentation (type 11)

### Acceptance:
- [ ] Agent prompt includes forecast_card type with data schema
- [ ] Example triggers documented ("Forecast cash flow for next 6 months")
- [ ] Currency rule enforced (use tool result, not hardcode)

---

## Task 4: Add PDFKit dependency + create pdf-builder utility
**Priority**: P2 | **Depends on**: None

### Files to create/modify:
- `package.json` — Add `pdfkit` dependency
- `src/lambda/mcp-server/lib/pdf-builder.ts` — NEW: PDFKit report builder

### Acceptance:
- [ ] `pdfkit` installed and importable in Lambda
- [ ] `buildBoardReport(data)` returns PDF Buffer
- [ ] Sections: cover, P&L, cash flow, AR aging, AP aging, top vendors, trends
- [ ] All amounts formatted with business currency
- [ ] Empty sections show "No data available" message
- [ ] Descriptive filename generated (e.g., "Board-Report-Q1-2026.pdf")

---

## Task 5: Create generate_report_pdf MCP tool
**Priority**: P2 | **Depends on**: Task 4

### Files to create/modify:
- `src/lambda/mcp-server/tools/generate-report-pdf.ts` — NEW: PDF generation tool
- `src/lambda/mcp-server/tools/index.ts` — Export new tool
- `src/lambda/mcp-server/handler.ts` — Add to TOOL_IMPLEMENTATIONS
- `src/lambda/mcp-server/contracts/mcp-tools.ts` — Add GenerateReportPdf schemas/types

### Acceptance:
- [ ] Queries Convex for P&L, AR aging, AP aging, top vendors data
- [ ] Calls pdf-builder to generate PDF
- [ ] Uploads PDF to S3 `reports/{businessId}/board-report/...`
- [ ] Returns CloudFront signed URL with 7-day expiry
- [ ] Handles missing data gracefully (empty sections, not errors)
- [ ] INSUFFICIENT_DATA error when zero transactions in range

---

## Task 6: Create report_download action card
**Priority**: P2 | **Depends on**: Task 5

### Files to create/modify:
- `src/domains/chat/components/action-cards/report-download-card.tsx` — NEW
- `src/domains/chat/components/action-cards/index.tsx` — Import report-download-card

### Acceptance:
- [ ] Registered as 'report_download' in action card registry
- [ ] Shows download button with filename
- [ ] Shows report period and included sections
- [ ] Download button opens URL in new tab

---

## Task 7: Update agent prompts for report_download
**Priority**: P2 | **Depends on**: Task 6

### Files to modify:
- `src/lib/ai/agent/config/prompts.ts` — Add report_download documentation (type 12)

### Acceptance:
- [ ] Agent prompt includes report_download type with data schema
- [ ] Example triggers documented ("Generate Q1 board report")

---

## Task 8: RBAC — Add manager access for forecast + report tools
**Priority**: P1 | **Depends on**: Task 1, Task 5

### Files to modify:
- `src/lib/ai/tools/tool-factory.ts` — Add forecast/report tools to appropriate role set
- `src/lib/ai/mcp/mcp-permissions.ts` — Add new tools with owner/admin/manager access

### Acceptance:
- [ ] Owner/finance_admin can use forecast + report tools
- [ ] Manager can use forecast + report tools
- [ ] Employee gets permission-denied message
- [ ] Tax reference (searchRegulatoryKnowledgeBase) remains available to all roles

---

## Task 9: Upload tax reference content to Qdrant
**Priority**: P3 | **Depends on**: None

### Files to create:
- `scripts/upload-tax-kb.ts` — NEW: upload script with hardcoded tax reference entries

### Acceptance:
- [ ] Malaysia corporate tax rates (SME + standard) uploaded
- [ ] Malaysia filing deadlines uploaded
- [ ] Singapore GST rates and thresholds uploaded
- [ ] Singapore GST filing calendar uploaded
- [ ] All entries have `category: 'tax_reference'` metadata
- [ ] All entries have jurisdiction, topic, effective_date, source fields

---

## Task 10: Add tax disclaimer + advisory boundary
**Priority**: P3 | **Depends on**: Task 9

### Files to modify:
- `src/lib/ai/tools/regulatory-knowledge-tool.ts` — Add disclaimer footer, detect advisory questions
- `src/lib/ai/agent/config/prompts.ts` — Add tax reference vs. advisory guidance

### Acceptance:
- [ ] Every tax reference answer includes disclaimer footer
- [ ] Advisory questions ("How should I reduce tax?") get declined with professional referral
- [ ] Factual questions ("What is the tax rate?") get answered normally
- [ ] Agent prompt guides LLM on factual vs. advisory boundary

---

## Task 11: Build verification + deployment
**Priority**: ALL | **Depends on**: Tasks 1-10

### Steps:
- [ ] `npm run build` passes
- [ ] `npx cdk deploy FinanSEAL-MCP-Server` deploys updated Lambda
- [ ] `npx convex deploy --yes` (if any Convex changes)
- [ ] Run `scripts/upload-tax-kb.ts` to populate KB
- [ ] Chat UAT: "Forecast cash flow for 6 months" → forecast_card
- [ ] Chat UAT: "Generate Q1 board report" → report_download with working PDF link
- [ ] Chat UAT: "Corporate tax rate Malaysia" → answer + disclaimer
- [ ] Chat UAT: "How to reduce my tax?" → declined with referral
