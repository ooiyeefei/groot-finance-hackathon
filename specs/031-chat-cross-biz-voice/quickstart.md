# Quickstart: Cross-Business Benchmarking, Email Integration & Voice Input

**Branch**: `031-chat-cross-biz-voice` | **Date**: 2026-03-21

## Prerequisites

- Node.js 20+, npm
- AWS CLI configured with `groot-finanseal` profile
- Convex CLI (`npx convex`)
- Access to `finanseal-mcp-server` Lambda
- iOS: Xcode (for Capacitor builds)

## Setup

```bash
# 1. Switch to feature branch
git checkout 031-chat-cross-biz-voice

# 2. Install dependencies (includes new Capacitor speech plugin)
npm install

# 3. Pull latest Convex schema (after schema changes)
npx convex dev  # Only from main working directory!

# 4. Deploy Convex schema changes (new tables)
npx convex deploy --yes

# 5. Deploy MCP server with new tools
cd infra && npx cdk deploy FinanSEAL-MCP-Server --profile groot-finanseal --region us-west-2

# 6. Deploy EventBridge rule for weekly benchmarking aggregation
cd infra && npx cdk deploy FinanSEAL-ScheduledIntelligence --profile groot-finanseal --region us-west-2
```

## Verification

### Email Integration
```bash
# 1. Start dev server
npm run dev

# 2. Log in as admin (yeefei+test2@hellogroot.com)
# 3. Open chat, type: "Email the AP aging report to yeefei+test2@hellogroot.com"
# 4. Verify: Groot shows confirmation prompt with recipient and report type
# 5. Confirm with "yes"
# 6. Verify: Email received in inbox with formatted report
# 7. Test RBAC: Log in as employee, attempt same command → should be denied
```

### Voice Input
```bash
# 1. Open chat on Chrome/Edge (Web Speech API supported)
# 2. Click the microphone button
# 3. Grant microphone permission if prompted
# 4. Speak: "What are my outstanding invoices?"
# 5. Verify: Text appears in input field (not auto-submitted)
# 6. Tap Send to submit
# 7. Test on mobile: Run `npx cap run ios` and repeat steps 2-6
```

### Benchmarking
```bash
# 1. Log in as admin
# 2. In chat, type: "Opt in to industry benchmarking"
# 3. Verify: Groot confirms opt-in with industry category
# 4. Type: "Compare our COGS ratio to industry"
# 5. Verify: If enough peers, shows percentile + average + recommendations
# 6. If insufficient peers, verify graceful message explaining minimum required
# 7. Type: "Opt out of benchmarking" → verify opt-out confirmation
```

## Key Files Modified/Created

### Email Integration
- `src/lambda/mcp-server/tools/send-email-report.ts` — MCP tool implementation
- `src/lambda/mcp-server/contracts/mcp-tools.ts` — Zod schemas
- `lambda/shared/templates/index.ts` — New `financial_report` template
- `convex/schema.ts` — `email_send_logs` table
- `convex/functions/emailSendLogs.ts` — CRUD + rate limit queries

### Voice Input
- `src/domains/chat/components/voice-input-button.tsx` — Mic button component
- `src/domains/chat/hooks/use-voice-input.ts` — Voice recording + transcription hook
- `src/domains/chat/components/chat-window.tsx` — Integration of mic button

### Benchmarking
- `src/lambda/mcp-server/tools/compare-to-industry.ts` — MCP tool
- `src/lambda/mcp-server/tools/toggle-benchmarking.ts` — MCP tool
- `convex/schema.ts` — `benchmarking_opt_ins`, `benchmarking_aggregates` tables
- `convex/functions/benchmarking.ts` — Opt-in CRUD, aggregate queries
- `src/lambda/scheduled-intelligence/modules/benchmarking-aggregation.ts` — Weekly aggregation
- `infra/lib/scheduled-intelligence-stack.ts` — EventBridge rule
