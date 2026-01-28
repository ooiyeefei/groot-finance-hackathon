# Expense Claims Module

Employee expense submission and manager approval workflows with AI-powered receipt processing.

## Core Workflow

```
1. User uploads receipt → Stored in S3
2. Lambda extraction runs → Stores metadata in Convex
3. User reviews/edits → Submits for approval
4. Manager approves → Creates accounting entry
5. Finance reimburses → Updates entry status to 'paid'
```

## State Machine

```
draft → submitted → approved → reimbursed
                  ↓
             rejected
```

**Key Principle**: Only **approved** expense claims create accounting entries.

## Features

- **AI Receipt Extraction**: Automatic data extraction from receipts/invoices
- **Multi-Currency Support**: 9 currencies with real-time conversion
- **Manager Approval Routing**: Intelligent routing based on org hierarchy
- **Duplicate Detection**: Prevents fraudulent double-submissions
- **Two-Phase Extraction**: Progressive UI for faster perceived performance

## Key Files

### Components
- `src/domains/expense-claims/components/personal-expense-dashboard.tsx` - User dashboard
- `src/domains/expense-claims/components/expense-approval-dashboard.tsx` - Manager dashboard
- `src/domains/expense-claims/components/edit-expense-modal-new.tsx` - Edit/view modal

### Hooks
- `src/domains/expense-claims/hooks/use-expense-claims-realtime.ts` - Real-time data
- `src/domains/expense-claims/hooks/use-expense-form.ts` - Form logic

### API Routes
- `src/app/api/v1/expense-claims/` - CRUD operations
- `src/app/api/v1/expense-claims/[id]/` - Single claim operations

### Convex
- `convex/functions/expenseClaims.ts` - Database queries/mutations
- `convex/schema.ts` - Schema definitions

## Related Documentation

- [Duplicate Detection](./duplicate-detection.md)
- [Approval Workflow](./approval-workflow.md)
- [Two-Phase Extraction](../../architecture/two-phase-extraction.md)
- [Domain CLAUDE.md](../../../src/domains/expense-claims/CLAUDE.md) - Detailed module docs
