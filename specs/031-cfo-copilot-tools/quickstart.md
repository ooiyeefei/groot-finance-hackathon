# Quickstart: CFO Copilot Tools

## Prerequisites
- Node.js 20+, npm
- AWS CLI configured with `groot-finanseal` profile
- Convex CLI (`npx convex`)
- Access to `finanseal-bucket` S3 bucket
- Qdrant Cloud credentials (in `.env.local`)

## Development Setup

```bash
# 1. Switch to feature branch
git checkout 031-cfo-copilot-tools

# 2. Install dependencies (if pdfkit added)
npm install

# 3. Start dev (main working directory only!)
npm run dev
```

## Testing Each Feature

### P1: Cash Flow Forecast
```
Chat: "Forecast cash flow for the next 6 months"
Expected: forecast_card action card with 6 monthly buckets, runway estimate, risk alerts
```

### P2: PDF Board Report
```
Chat: "Generate Q1 2026 board report"
Expected: report_download action card with clickable download link
```

### P3: Tax Reference
```
Chat: "What is the corporate tax rate in Malaysia?"
Expected: compliance_alert card with factual answer + disclaimer
```

## Deployment

```bash
# 1. Deploy Convex (if schema changes — none expected)
npx convex deploy --yes

# 2. Deploy MCP Lambda
cd infra && npx cdk deploy FinanSEAL-MCP-Server --profile groot-finanseal --region us-west-2

# 3. Upload tax KB content
node scripts/upload-tax-kb.ts

# 4. Build verification
npm run build
```

## Key Files Modified

| File | Change |
|------|--------|
| `src/lambda/mcp-server/tools/forecast-cash-flow.ts` | Add monthly granularity, AR/AP awareness |
| `src/lambda/mcp-server/tools/generate-report-pdf.ts` | NEW — PDF generation tool |
| `src/lambda/mcp-server/tools/index.ts` | Register new tool |
| `src/lambda/mcp-server/handler.ts` | Add to TOOL_IMPLEMENTATIONS |
| `src/lambda/mcp-server/contracts/mcp-tools.ts` | Add schemas + types |
| `src/domains/chat/components/action-cards/forecast-card.tsx` | NEW — monthly forecast chart |
| `src/domains/chat/components/action-cards/report-download-card.tsx` | NEW — PDF download card |
| `src/domains/chat/components/action-cards/index.tsx` | Import new cards |
| `src/lib/ai/agent/config/prompts.ts` | Add forecast_card + report_download docs |
| `src/lib/ai/tools/tool-factory.ts` | Add new tool names to FINANCE_TOOLS or CFO_TOOLS |
| `scripts/upload-tax-kb.ts` | NEW — upload tax reference content to Qdrant |
