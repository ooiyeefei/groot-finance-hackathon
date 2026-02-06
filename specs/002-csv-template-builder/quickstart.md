# Quickstart: CSV Template Builder

**Feature**: 002-csv-template-builder
**Date**: 2026-02-04

---

## Prerequisites

1. **Development environment** running:
   - `npx convex dev` (Convex backend)
   - `npm run dev` (Next.js frontend)

2. **Test data**: Business with expense claims and leave requests

---

## Development Setup

### 1. Create Domain Structure

```bash
# Create directories
mkdir -p src/domains/exports/components
mkdir -p src/domains/exports/hooks
mkdir -p src/domains/exports/lib
mkdir -p src/domains/exports/types
```

### 2. Update Convex Schema

Add new tables to `convex/schema.ts` (see data-model.md for full schema):

```typescript
// Add to schema.ts imports
import {
  exportModuleValidator,
  exportHistoryStatusValidator,
  // ... other validators
} from "./lib/validators";

// Add tables (see data-model.md for full definitions)
export_templates: defineTable({ /* ... */ }),
export_schedules: defineTable({ /* ... */ }),
export_history: defineTable({ /* ... */ }),
```

### 3. Add Validators

Add to `convex/lib/validators.ts`:

```typescript
export const exportModuleValidator = v.union(
  v.literal("expense"),
  v.literal("leave")
);

// ... other validators from data-model.md
```

### 4. Create Convex Functions

Create function files:

```bash
touch convex/functions/exportTemplates.ts
touch convex/functions/exportSchedules.ts
touch convex/functions/exportHistory.ts
touch convex/functions/exportJobs.ts
```

### 5. Update Crons

Add to `convex/crons.ts`:

```typescript
// Scheduled export runner - every hour
crons.interval(
  "export-scheduler",
  { hours: 1 },
  internal.functions.exportJobs.runScheduledExports
);

// Export file cleanup - daily at 3 AM UTC
crons.daily(
  "cleanup-export-files",
  { hourUTC: 3, minuteUTC: 0 },
  internal.functions.exportHistory.archiveExpired
);
```

### 6. Create Page Route

Create `src/app/[locale]/reporting/page.tsx`:

```typescript
import { ExportsPageContent } from '@/domains/exports/components';

export default function ReportingPage() {
  return <ExportsPageContent />;
}
```

### 7. Add Sidebar Navigation

Update sidebar to include "Reporting & Exports" link between "Team Calendar" and "AI Assistant".

---

## Testing Checklist

### Phase 1: Pre-built Templates (P1)

- [ ] Navigate to /reporting page
- [ ] See list of pre-built templates (SQL Payroll, Xero, etc.)
- [ ] Select expense module, choose SQL Payroll template
- [ ] Apply date range filter
- [ ] Preview shows sample data with correct columns
- [ ] Export generates downloadable CSV
- [ ] CSV imports successfully into SQL Payroll (manual test)

### Phase 2: Custom Templates (P2)

- [ ] Click "Create Template"
- [ ] Select module (expense/leave)
- [ ] Drag fields to column list
- [ ] Set custom column names
- [ ] Configure date format
- [ ] Preview shows correct formatting
- [ ] Save template
- [ ] Template appears in list
- [ ] Edit template, changes persist
- [ ] Clone pre-built template
- [ ] Delete custom template

### Phase 3: Scheduled Exports (P3)

- [ ] Create daily schedule
- [ ] Create weekly schedule (specific day)
- [ ] Create monthly schedule (specific date)
- [ ] View schedule list with next run time
- [ ] Enable/disable schedule
- [ ] Schedule executes at configured time
- [ ] Notification received on completion
- [ ] Failed export sends error notification

### Phase 4: Export History (P3)

- [ ] View export history list
- [ ] Filter by date range
- [ ] Filter by template
- [ ] Re-download completed export
- [ ] Archived exports show "Request Re-generation"
- [ ] Re-generation creates new export

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/domains/exports/components/exports-page-content.tsx` | Main page |
| `src/domains/exports/components/template-list.tsx` | Template browser |
| `src/domains/exports/components/template-builder.tsx` | Custom template editor |
| `src/domains/exports/lib/prebuilt-templates.ts` | Pre-built template definitions |
| `src/domains/exports/lib/field-definitions.ts` | Available fields per module |
| `src/domains/exports/lib/csv-generator.ts` | CSV generation logic |
| `convex/functions/exportTemplates.ts` | Template CRUD |
| `convex/functions/exportJobs.ts` | Export execution |
| `convex/functions/exportSchedules.ts` | Schedule management |
| `convex/functions/exportHistory.ts` | History tracking |

---

## Common Issues

### "Template not found"
- Verify template ID is valid (custom) or prebuilt ID exists in PREBUILT_TEMPLATES

### "No records to export"
- Check date range filters
- Verify data exists in selected module
- Check role-based access (employees only see own records)

### "Export timeout"
- Reduce date range to export fewer records
- Check 10,000 record limit

### "Scheduled export not running"
- Verify schedule is enabled
- Check nextRunAt is in the past
- Verify cron job is running (`export-scheduler`)

### "Download link expired"
- Signed URLs valid for 1 hour
- Re-download from history page
