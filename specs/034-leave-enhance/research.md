# Research: Leave Management P1 Enhancements

**Date**: 2026-03-23 | **Branch**: `034-leave-enhance`

## R1: Push Notification Infrastructure

**Decision**: Use a dedicated Lambda function for APNs + FCM push delivery, invoked from the existing notification API route.

**Rationale**:
- Lambda has IAM-native access to SSM for APNs P8 keys (already stored via `apns-stack.ts`)
- FCM server key will be stored in SSM alongside APNs keys
- Convex cannot use AWS SDK natively — Lambda is the correct execution environment for AWS service calls
- Follows the project's "AWS-first for AWS operations" principle

**Alternatives considered**:
- Convex action calling APNs/FCM HTTP APIs directly → Rejected: would require storing credentials in Convex env vars (violates least-privilege)
- Third-party push service (OneSignal, Firebase Admin SDK in Vercel) → Rejected: adds dependency, credentials still needed outside AWS

**Key finding**: `push_subscriptions` table and `register`/`unregister`/`getByUserId` functions already exist. No new table needed.

## R2: Overlap Detection for Approval Context

**Decision**: Extend the existing `teamCalendar.ts` conflict detection to support an approval-context query that returns structured overlap data (not just conflict date strings).

**Rationale**:
- `teamCalendar.getEvents()` already counts absences per date and returns conflict dates
- The approval warning needs richer data: who is absent, what leave type, which specific dates overlap
- A new query `checkOverlapsForApproval` will reuse the same date-range iteration logic but return per-person overlap details

**Alternatives considered**:
- Client-side overlap calculation (fetch team events, compute in browser) → Rejected: wastes bandwidth, duplicates server logic
- Add overlap check inside the `approve` mutation → Rejected: mutations shouldn't have presentation-layer concerns (warning vs. blocking)

**Key finding**: Current detection only includes "approved" status. Per clarification, must include "submitted" status too.

## R3: CSV Import for Leave Balances

**Decision**: Add a `leave_balance` schema type to the existing `src/lib/csv-parser/lib/schema-definitions.ts` and use the `CsvImportModal` shared component.

**Rationale**:
- The CSV import library is a mature shared capability with column mapping, alias matching, AI fallback, and validation
- Pattern is established: define `SchemaField[]` with aliases, register in `getSchemaFields()` switch, render `<CsvImportModal schemaType="leave_balance" />`
- Consuming domain (leave-management) handles persistence via `bulkUpsert` mutation

**Required fields**:
| Field | Label | Type | Required | Aliases |
|-------|-------|------|----------|---------|
| employeeEmail | Employee Email | string | yes | email, employee, staff email |
| leaveTypeCode | Leave Type Code | string | yes | leave type, type, code |
| year | Year | number | yes | year, period, fiscal year |
| entitled | Entitled Days | number | yes | entitled, allocation, total days |
| used | Used Days | number | no | used, taken, consumed |
| carryover | Carry Over Days | number | no | carryover, carry over, brought forward |
| adjustments | Adjustments | number | no | adjustment, adj, manual adjustment |

## R4: Report Generation Pattern

**Decision**: Use Convex `action` + `internalQuery` for report data aggregation. Reports are on-demand, not reactive.

**Rationale**:
- CLAUDE.md Rule 1: "Never use reactive `query` for heavy aggregations" — reports scan leave_balances and leave_requests across all employees
- Pattern: `internalQuery` does DB reads → public `action` calls it → client uses `useAction` + `useEffect`
- Three report types, each a separate internal query to keep logic focused

**Alternatives considered**:
- Reactive `useQuery` → Rejected: would re-run on every table change, burning bandwidth
- Pre-computed aggregate table → Rejected: over-engineering for <200 employees, adds cron/sync complexity

## R5: Leave Year Boundary Logic

**Decision**: Add `leaveYearStartMonth` (number 1-12) to the `businesses` table. Create a utility module for date boundary calculations.

**Rationale**:
- Per-business setting (not per-employee or per-leave-type) — simplest model
- Utility functions: `getLeaveYearBoundaries(startMonth, referenceDate)` → `{ yearStart: string, yearEnd: string, yearLabel: string }`
- All existing queries that use `year` parameter will call `getCurrentLeaveYear(startMonth)` instead of `new Date().getFullYear()`
- Default to January (backward compatible)

**Key impact areas**:
- `leaveBalances.getMyBalances()` — year default calculation
- `leaveBalances.carryover()` — carryover timing
- Reports — date range defaults
- Leave request form — year display in balance widget

## R6: PDF Export Pattern

**Decision**: Follow the `use-invoice-pdf.ts` pattern — dynamic import of `@react-pdf/renderer`, dedicated document component, blob generation + download.

**Rationale**:
- Pattern is proven in the codebase (invoice PDF generation)
- Dynamic import avoids loading the PDF library on pages that don't use it
- Client-side generation is acceptable for <500 rows

**Components needed**:
- `leave-report-pdf-document.tsx` — `<Document>` with header (business name, report title, date range) + data table
- `use-leave-report-pdf.ts` — hook wrapping dynamic import + blob generation
