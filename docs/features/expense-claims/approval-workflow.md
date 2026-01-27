# Expense Claims Approval Workflow

## Manager Hierarchy Routing

Uses `business_memberships.manager_id` with intelligent fallback logic.

```
Employee Submits → Has assigned manager?
                        │
        ┌───────────────┴───────────────┐
        Yes                             No
        │                               │
        ▼                               ▼
Check Manager Valid?            Is submitter manager/admin?
        │                               │
   ┌────┴────┐                    ┌─────┴─────┐
  Valid   Invalid                Yes         No
   │         │                    │           │
   ▼         └────────────────────┤           ▼
Route to                          │      Fallback to
Assigned Manager           Route to Self   Any Admin/Manager
```

## Routing Logic

Located in `src/domains/expense-claims/lib/data-access.ts`:

1. **Check assigned manager_id**: Route to assigned manager if active with approval permissions
2. **Self-approval for managers/admins**: Without assignment, route to self
3. **Fallback to any admin**: If no manager assignment
4. **Fallback to any manager**: Last resort

## Status Transitions

| From | To | Action | Required Role |
|------|-----|--------|---------------|
| `draft` | `submitted` | submit | employee |
| `submitted` | `approved` | approve | manager |
| `submitted` | `rejected` | reject | manager |
| `approved` | `reimbursed` | reimburse | admin |

## Accounting Integration

**IFRS Compliance**: Only approved expense claims create accounting entries.

```
expense_claims table = "Pending Requests" (workflow system)
accounting_entries table = "Posted Transactions" (general ledger)
```

**Approval Flow:**
1. **Submission**: `expense_claims` record created, `accounting_entry_id = NULL`
2. **Approval**: Creates `accounting_entries` record, links via `accounting_entry_id`
3. **Reimbursement**: Updates `accounting_entries.status = 'paid'`

## Team Management

### Manager Assignment UI

Location: `src/domains/users/components/teams-management-client.tsx`

**Role-Based Behavior:**
- **Employees**: Required manager assignment
- **Managers/Admins**: Optional manager assignment
- **Self-Assignment Prevention**: Users cannot assign themselves as their own manager

## Related Documentation

- [Overview](./overview.md)
- [Duplicate Detection](./duplicate-detection.md)
- [RBAC](../../rbac.md)
