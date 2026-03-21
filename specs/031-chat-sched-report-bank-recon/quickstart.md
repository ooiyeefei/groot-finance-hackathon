# Quickstart: 031-chat-sched-report-bank-recon

## Prerequisites
- Node.js 20+, Convex CLI, AWS CDK
- Access to `finanseal-mcp-server` Lambda
- Convex deployment: `kindhearted-lynx-129`

## Build Order

### Phase 1: Schema + MCP Endpoints (no UI changes)
1. Add `report_schedules`, `report_runs`, `bank_recon_runs` tables to `convex/schema.ts`
2. Create Convex mutations/queries for CRUD on report schedules
3. Add MCP endpoints to `finanseal-mcp-server`: `schedule_report`, `run_bank_reconciliation`, `accept_recon_match`, `show_recon_status`
4. Deploy: `npx convex deploy --yes` + `cd infra && npx cdk deploy McpServerStack`

### Phase 2: Report Generation Engine
1. Create report templates (P&L, Cash Flow, AR Aging, AP Aging, Expense Summary) using `@react-pdf/renderer`
2. Implement `scheduledReportJobs.ts` — query due schedules, generate PDF, send via SES
3. Update EventBridge `scheduled-reports` rule to daily (from monthly)
4. Deploy: `cd infra && npx cdk deploy ScheduledIntelligenceStack`

### Phase 3: Chat Agent Wiring
1. Register MCP tools in chat agent tool schemas (role-based: schedule_report requires admin/manager)
2. Add intent patterns for report scheduling and bank recon commands
3. Create `bank_recon_match` action card component with Accept/Reject/Bulk buttons
4. Wire action card callbacks to `accept_recon_match` MCP tool

### Phase 4: Testing + Polish
1. Test full flow: chat → schedule → EventBridge → Lambda → email delivery
2. Test bank recon: chat → ask account → trigger → results → accept/reject → journal entries
3. Verify RBAC: employee cannot schedule P&L
4. Verify edge cases: concurrent recon, bounce handling, empty reports

## Verify

```bash
npm run build          # Must pass
npx convex deploy --yes  # Deploy schema + functions
cd infra && npx cdk deploy --all --profile groot-finanseal --region us-west-2  # Deploy Lambda/EventBridge changes
```

## Key Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `convex/functions/reportSchedules.ts` | CRUD for report schedules |
| CREATE | `convex/functions/bankReconRuns.ts` | Bank recon run tracking |
| CREATE | `src/lib/reports/templates/` | PDF templates per report type |
| CREATE | `src/domains/chat/components/action-cards/bank-recon-match-card.tsx` | Match action card |
| MODIFY | `convex/schema.ts` | Add 3 new tables |
| MODIFY | `convex/functions/scheduledReportJobs.ts` | Implement from stub |
| MODIFY | `infra/lib/mcp-server-stack.ts` | Add MCP endpoints |
| MODIFY | `infra/lib/scheduled-intelligence-stack.ts` | Change schedule to daily |
| MODIFY | `src/domains/chat/components/action-cards/registry.ts` | Register bank_recon_match |
| MODIFY | `src/lib/ai/tools/tool-schemas.ts` | Add MCP tool schemas for agent |
