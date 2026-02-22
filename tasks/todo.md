# Plan: Fix Timesheet Settings UI Bugs + UAT Testing

## Context

UAT testing revealed several bugs in the Timesheet Settings page.

## Changes

### 1. Add toast notifications to all settings actions
**File**: `src/domains/timesheet-attendance/components/timesheet-settings.tsx`
- [x] Import `useToast` and use `addToast` for success/error feedback
- [x] Success toasts: schedule create, schedule update, schedule delete, OT rule create, OT rule update, pay period save, tracking toggle
- [x] Error toasts in catch blocks (replacing silent failures)
- [x] Schedule delete error ("Cannot remove the only active work schedule") shown via toast

### 2. Add edit/delete buttons for OT rules
**File**: `src/domains/timesheet-attendance/components/timesheet-settings.tsx`
- [x] Add `editingOTRuleId` state
- [x] Add `openOTForm(rule?)` function to populate form for editing
- [x] Add Edit2 and Trash2 icon buttons to each OT rule row
- [x] Wire delete to `useUpdateOvertimeRule` with `isActive: false` (soft delete)
- [x] Update `handleSaveOTRule` to call `updateOvertimeRule` when editing

### 3. Import missing hooks
- [x] `useUpdateOvertimeRule` imported from `use-admin-config`

### 4. Bug fix found during UAT
**File**: `convex/functions/overtimeRules.ts`
- [x] `list` query was returning ALL OT rules (including soft-deleted). Added `.filter((r) => r.isActive !== false)` to exclude inactive rules.
- [x] Convex deployed to production

## Verification
- [x] `npm run build` passes
- [x] `npx convex deploy --yes` deployed

## UAT Results

### Summary

| # | Test Case | Role | Result | Evidence |
|---|-----------|------|--------|----------|
| TC-01 | Create work schedule → success toast | Admin | PASS | uat-tc01-create-schedule-toast.png |
| TC-02 | Edit work schedule → success toast | Admin | PASS | uat-tc02-edit-schedule-toast.png |
| TC-03 | Delete only schedule → error toast | Admin | PASS | uat-tc03-delete-only-schedule-error-toast.png |
| TC-04 | Create OT rule → success toast | Admin | PASS | uat-tc04-create-ot-rule-toast.png |
| TC-05 | Edit OT rule → success toast | Admin | PASS | uat-tc05-edit-ot-rule-toast.png |
| TC-06 | Delete OT rule → soft delete + toast | Admin | PASS | uat-tc06-delete-ot-rule-toast.png |
| TC-07 | Save pay period → success toast | Admin | PASS | uat-tc07-save-pay-period-toast.png |
| TC-08 | Toggle employee tracking → success toast | Admin | PASS | uat-tc08-toggle-tracking-toast.png |
| TC-09 | Manager limited settings view | Manager | PASS | Settings → Profile tab only, no Timesheet/Team/Business tabs |
| TC-10 | Employee no settings access | Employee | PASS | Settings → Profile tab only, no admin tabs, no Manager Approvals in sidebar |

**Verdict**: PASS (10/10 tests pass)

### Bug Found During UAT

**OT rules soft delete not reflected in list** (FIXED)
- **File**: `convex/functions/overtimeRules.ts:43-46`
- **Root cause**: `list` query returned all rules without filtering by `isActive`
- **Fix**: Added `.filter((r) => r.isActive !== false)` after `.collect()`
- **Deployed**: Convex production updated

### Minor Observation

**TC-03 error toast shows full Convex error path** — The error toast for "delete only schedule" shows the full internal Convex error string including file path. The key message "Cannot remove the only active work schedule" is present but buried in verbose output. Consider extracting just the user-friendly portion in a future cleanup.

### Role-Based Access Details

**Manager** (yeefei+manager1@hellogroot.com):
- Sidebar: Expense Claims, Leave & Timesheet, Manager Approvals, Reporting & Exports, Settings
- Leave & Timesheet tabs: Team Calendar, My Leave, Timesheet (no Settings tab)
- Timesheet tab: "Attendance tracking is not enabled for your account"
- Settings page: Profile tab only (no Team, Business, or Timesheet tabs)

**Employee** (yeefei+employee1@hellogroot.com):
- Sidebar: Expense Claims, Leave & Timesheet, Reporting & Exports, Settings (no Manager Approvals)
- Leave & Timesheet tabs: Team Calendar, My Leave, Timesheet (no Settings tab)
- Settings page: Profile tab only (no Team, Business, or Timesheet tabs)
