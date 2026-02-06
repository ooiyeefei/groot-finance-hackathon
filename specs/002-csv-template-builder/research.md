# Research: CSV Template Builder

**Feature**: 002-csv-template-builder
**Date**: 2026-02-04

---

## 1. File Storage Strategy

### Decision: Convex File Storage

**Rationale**: FinanSEAL already uses Convex File Storage for expense claim receipts and invoice documents. Using the same pattern ensures consistency and simplifies implementation.

**Alternatives Considered**:
| Option | Pros | Cons |
|--------|------|------|
| Convex File Storage | Consistent with existing patterns, built-in signed URLs, automatic cleanup | 90-day retention requires manual cleanup cron |
| AWS S3 Direct | More control over retention policies | Additional AWS configuration, different access patterns |
| Client-side blob | No server storage needed | Cannot support scheduled exports, no re-download |

**Implementation**:
- Store CSV files via Convex `storage.store()` action
- Generate signed URLs for download via `storage.getUrl()`
- Add cleanup cron for files older than 90 days

---

## 2. CSV Generation Approach

### Decision: Server-side generation in Convex action

**Rationale**: CSV generation must work for both manual exports (user-triggered) and scheduled exports (background job). Server-side generation in Convex actions supports both use cases.

**Alternatives Considered**:
| Option | Pros | Cons |
|--------|------|------|
| Convex action | Supports both manual and scheduled, consistent | Large exports may timeout (addressed by 10k limit) |
| Next.js API route | Existing pattern for reports | Cannot be triggered by Convex crons |
| Client-side streaming | Progressive download | Cannot support scheduled exports |

**Implementation**:
- `exportJobs.generateCsv` action: queries data, generates CSV, stores file
- Returns storage ID for download URL generation
- 10,000 record limit prevents timeout issues

---

## 3. Scheduling Mechanism

### Decision: Convex crons with interval/daily patterns

**Rationale**: Convex crons already handle proactive analysis and deadline tracking. Same pattern works for scheduled exports.

**Schedule Types**:
- **Daily**: `crons.daily()` at user-configured hour
- **Weekly**: `crons.daily()` with day-of-week check in handler
- **Monthly**: `crons.daily()` with day-of-month check in handler

**Alternative**: Single cron that runs every hour and checks for due schedules. This is more flexible and recommended.

**Implementation**:
```typescript
// Single "export-scheduler" cron runs hourly
crons.interval(
  "export-scheduler",
  { hours: 1 },
  internal.functions.exportJobs.runScheduledExports
);
```

**Handler Logic**:
1. Query all enabled schedules with `nextRunAt <= now`
2. For each due schedule, execute export
3. Update `lastRunAt` and calculate `nextRunAt`
4. Send notification on completion/failure

---

## 4. Pre-built Template Strategy

### Decision: Code constants with version tracking

**Rationale**: Pre-built templates are defined by FinanSEAL (not users), should be versioned with the application, and need to be consistent across all businesses.

**Template Structure**:
```typescript
// src/domains/exports/lib/prebuilt-templates.ts
export const PREBUILT_TEMPLATES: PrebuiltTemplate[] = [
  {
    id: 'sql-payroll-expense',
    name: 'SQL Payroll',
    module: 'expense',
    version: '1.0.0',
    description: 'Export expense claims for SQL Payroll import',
    fieldMappings: [
      { sourceField: 'employee.name', targetColumn: 'EMP_NAME', order: 1 },
      { sourceField: 'transactionDate', targetColumn: 'TXN_DATE', order: 2, dateFormat: 'DD/MM/YYYY' },
      // ... more fields
    ]
  },
  // ... more templates
];
```

**Update Strategy**:
- When pre-built template is updated, users see "Update available" badge
- Users can "Update to latest" or keep their cloned version
- Version number stored with cloned templates for comparison

---

## 5. Custom Template Storage

### Decision: Convex `export_templates` table

**Rationale**: Custom templates are user-created data that must persist across sessions and be shared within a business.

**Schema Design**:
- Templates stored per-business (shared among members)
- Field mappings embedded as array (Convex optimization)
- Clone creates new record with `clonedFromId` reference

---

## 6. Role-Based Data Access

### Decision: Query-time filtering based on user role

**Rationale**: Matches existing patterns in expense claims and leave management.

**Implementation**:
```typescript
// In export execution
function getExportableRecords(userId, businessId, module, filters) {
  const membership = getMembership(userId, businessId);

  switch (membership.role) {
    case 'owner':
    case 'finance_admin':
      // Return all business records
      return queryAllBusinessRecords(businessId, module, filters);
    case 'manager':
      // Return direct reports' records
      const teamUserIds = getDirectReports(userId, businessId);
      return queryTeamRecords(businessId, teamUserIds, module, filters);
    case 'employee':
      // Return only own records
      return queryUserRecords(userId, businessId, module, filters);
  }
}
```

---

## 7. Notification Delivery

### Decision: In-app notification + email with download link

**Rationale**: Matches existing notification patterns. Email attachments have size limits; download links are more reliable.

**Implementation**:
- Use existing `agentNotifications` table pattern
- Create notification with `channel: 'email'` and `channel: 'web'`
- Email contains secure download link (valid for 7 days)
- In-app notification links to Export History page

---

## 8. Pre-built Template Field Mappings

### SQL Payroll (Malaysia)

| FinanSEAL Field | SQL Payroll Column | Format |
|-----------------|-------------------|--------|
| employee.name | EMP_NAME | Text |
| employee.employeeId | EMP_ID | Text |
| transactionDate | CLAIM_DATE | DD/MM/YYYY |
| totalAmount | AMOUNT | Number (2 decimals) |
| currency | CURRENCY | Text |
| expenseCategory | CATEGORY | Text |
| description | DESCRIPTION | Text |
| status | STATUS | Text |
| approvedAt | APPROVED_DATE | DD/MM/YYYY |

### Xero (Universal)

| FinanSEAL Field | Xero Column | Format |
|-----------------|-------------|--------|
| vendorName | *ContactName | Text |
| transactionDate | *Date | YYYY-MM-DD |
| totalAmount | *Total | Number |
| description | Description | Text |
| referenceNumber | InvoiceNumber | Text |
| expenseCategory | *AccountCode | Text (map to Xero codes) |

### QuickBooks (Universal)

| FinanSEAL Field | QuickBooks Column | Format |
|-----------------|-------------------|--------|
| vendorName | Vendor | Text |
| transactionDate | Date | MM/DD/YYYY |
| totalAmount | Amount | Number |
| description | Memo | Text |
| expenseCategory | Account | Text |

### BrioHR (Malaysia/Singapore)

| FinanSEAL Field | BrioHR Column | Format |
|-----------------|---------------|--------|
| employee.email | Email | Text |
| transactionDate | ClaimDate | YYYY-MM-DD |
| totalAmount | Amount | Number |
| currency | Currency | Text |
| expenseCategory | Category | Text |
| description | Description | Text |

### Kakitangan (Malaysia)

| FinanSEAL Field | Kakitangan Column | Format |
|-----------------|-------------------|--------|
| employee.employeeId | StaffID | Text |
| transactionDate | Date | DD-MM-YYYY |
| totalAmount | Amount | Number (2 decimals) |
| expenseCategory | Type | Text |
| description | Remarks | Text |

---

## 9. Leave Records Field Mappings

### Common Leave Export Fields

| FinanSEAL Field | Target Column | Description |
|-----------------|---------------|-------------|
| employee.name | Employee Name | Full name |
| employee.employeeId | Employee ID | Company employee ID |
| leaveType.name | Leave Type | e.g., "Annual Leave" |
| leaveType.code | Leave Code | e.g., "AL" |
| startDate | Start Date | Leave start |
| endDate | End Date | Leave end |
| totalDays | Days | Business days count |
| status | Status | approved/rejected/etc |
| notes | Reason | Employee notes |
| approvedAt | Approved Date | Approval timestamp |
| approverName | Approved By | Manager name |

---

## 10. UI Navigation Integration

### Decision: New sidebar item "Reporting & Exports"

**Location**: Between "Team Calendar" and "AI Assistant" in sidebar

**Page Structure**:
```
/[locale]/reporting/
├── ?tab=exports (default)     # CSV Template Builder
├── ?tab=templates             # Manage templates
├── ?tab=schedules             # Scheduled exports
├── ?tab=history               # Export history
└── ?tab=reports               # Management reports (moved from Manager Approvals)
```

**Migration**: Move "Reports" tab content from Manager Approvals to this new page.
