# Quickstart: Leave Management P1 Enhancements

**Branch**: `034-leave-enhance` | **Date**: 2026-03-23

## Prerequisites

1. Node.js 20+, npm
2. Convex CLI: `npx convex dev` (from main working directory only)
3. AWS CDK CLI: `npx cdk deploy --profile groot-finanseal --region us-west-2`
4. Test accounts configured in `.env.local`

## Development Setup

```bash
# 1. Switch to feature branch
git checkout 034-leave-enhance

# 2. Install dependencies (if any new packages added)
npm install

# 3. Start Convex dev (from main working dir only, NOT from worktrees)
npx convex dev

# 4. Start Next.js dev server
npm run dev
```

## Implementation Order

### Phase A: Foundation
1. Add `leaveYearStartMonth` to businesses schema
2. Create `src/domains/leave-management/lib/leave-year-utils.ts`
3. Add leave year config UI to settings page
4. `npx convex deploy --yes`

### Phase B: Overlap Warnings
5. Add `checkOverlapsForApproval` to `convex/functions/leaveRequests.ts`
6. Create `overlap-warning-dialog.tsx`
7. Wire into `leave-approvals-content.tsx`

### Phase C: Push Notifications
8. Create `src/lambda/push-notification/index.ts`
9. Create `infra/lib/push-notification-stack.ts`
10. Extend `src/app/api/v1/leave-management/notifications/route.ts`
11. `cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2`

### Phase D: Bulk Import
12. Add `LEAVE_BALANCE_FIELDS` to `src/lib/csv-parser/lib/schema-definitions.ts`
13. Add `bulkUpsert` + `importFromCsv` to `convex/functions/leaveBalances.ts`
14. Add import button to settings page

### Phase E: Reports
15. Create `convex/functions/leaveReports.ts`
16. Create `leave-reports-content.tsx` with three report views
17. Create `leave-report-pdf-document.tsx` + `use-leave-report-pdf.ts`
18. Add CSV export

### Phase F: Polish
19. Wire leave year config into all balance/report queries
20. `npx convex deploy --yes` (final)
21. `npm run build` — must pass

## Verification

```bash
# Build check
npm run build

# Convex deploy
npx convex deploy --yes

# CDK deploy (if push notification stack created)
cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2

# UAT on finance.hellogroot.com
# Test with admin, manager, and employee accounts from .env.local
```

## Key Files to Modify

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `leaveYearStartMonth` to businesses, `importSource`/`importedAt` to leave_balances |
| `convex/functions/leaveRequests.ts` | Add `checkOverlapsForApproval` query |
| `convex/functions/leaveBalances.ts` | Add `bulkUpsert`, `importFromCsv` |
| `src/lib/csv-parser/lib/schema-definitions.ts` | Add `LEAVE_BALANCE_FIELDS` |
| `src/domains/leave-management/components/leave-approvals-content.tsx` | Inject overlap warning |
| `src/domains/leave-management/components/leave-management-settings.tsx` | Add import button + leave year config |
| `src/app/api/v1/leave-management/notifications/route.ts` | Add push notification dispatch |

## Key Files to Create

| File | Purpose |
|------|---------|
| `src/domains/leave-management/lib/leave-year-utils.ts` | Leave year boundary calculations |
| `src/domains/leave-management/components/overlap-warning-dialog.tsx` | Approval overlap warning |
| `src/domains/leave-management/components/leave-reports-content.tsx` | Reports tab UI |
| `src/domains/leave-management/components/leave-report-pdf-document.tsx` | PDF template |
| `src/domains/leave-management/hooks/use-leave-reports.ts` | Report data fetching |
| `src/domains/leave-management/hooks/use-leave-report-pdf.ts` | PDF generation hook |
| `convex/functions/leaveReports.ts` | Report aggregation actions |
| `src/lambda/push-notification/index.ts` | APNs + FCM send logic |
| `infra/lib/push-notification-stack.ts` | CDK stack for push Lambda |
