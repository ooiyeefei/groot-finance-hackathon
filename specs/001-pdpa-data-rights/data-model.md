# Data Model: PDPA Data Subject Rights & Clerk/Convex Name Sync

**Date**: 2026-03-03

## Existing Entities (no schema changes needed)

### users table
Identity and business context. **No schema changes** — Clerk `updateUser` is called server-side, webhook syncs back to existing `fullName` field.

| Field | Type | Notes |
|-------|------|-------|
| clerkUserId | string | Indexed — used to look up Clerk profile for `updateUser` call |
| email | string | Synced from Clerk via webhook |
| fullName | optional string | Synced from Clerk via webhook — the field fixed by P1 |
| businessId | optional Id\<businesses\> | Active business |
| preferences | optional object | User editable (timezone, language, notifications) |

### business_memberships table
Links users to businesses with roles. Used by "Download My Data" to enumerate all businesses a user belongs to.

| Field | Type | Notes |
|-------|------|-------|
| userId | Id\<users\> | Indexed — query all memberships for a user |
| businessId | Id\<businesses\> | Business reference |
| role_permissions | object | Contains role booleans (employee, manager, finance_admin) |
| status | string | "active" / "inactive" — only export from active memberships |

### export_history table
Tracks export metadata. "Download My Data" creates a history record of type `"pdpa_export"`.

| Field | Type | Notes for PDPA |
|-------|------|----------------|
| module | string | Use `"pdpa_all"` for Download My Data (new module value) |
| triggeredBy | string | Use `"manual"` |
| initiatedBy | optional Id\<users\> | The user who requested the export |
| status | string | `"processing"` → `"completed"` / `"failed"` |

**Note**: No new tables needed. The existing `export_history` table can track PDPA exports by using a new module value `"pdpa_all"`. The `ExportModule` type union will be extended to include this value.

## Data Flow Diagrams

### P1: Name Sync Flow (Fixed)

```
Admin/User edits name in UI
  → PATCH /api/v1/users/update-clerk-profile
    → clerkClient.users.updateUser(clerkUserId, { firstName, lastName })
      → Clerk stores new name
      → Clerk fires user.updated webhook
        → POST /api/v1/system/webhooks/clerk
          → handleUserUpdated action
            → updateUserInternal mutation (Convex)
              → users.fullName updated
                → Real-time subscription updates UI
```

### P3: Download My Data Flow

```
User clicks "Download My Data" in profile settings
  → Client fetches user's business memberships (Convex query)
  → For each active membership:
      → Client fetches records per module (expense, invoice, leave, accounting)
         using existing getRecordsForExport query with forced userId scope
      → Client generates CSV per module using export-engine.ts
  → Client fetches profile data (Convex query)
  → Client generates profile.csv
  → Client bundles all CSVs into ZIP using JSZip
  → ZIP organized as:
      my-data-export-YYYY-MM-DD/
      ├── profile.csv
      ├── business-1-name/
      │   ├── expense_claims.csv
      │   ├── invoices.csv
      │   ├── leave_requests.csv
      │   └── accounting_entries.csv
      └── business-2-name/
          ├── expense_claims.csv
          └── ... (only non-empty modules)
  → Browser triggers ZIP download
```

## Key Relationships

```
users ──1:N──> business_memberships ──N:1──> businesses
  │                    │
  │                    ├── expense_claims (by businessId + userId)
  │                    ├── leave_requests (by businessId + userId)
  │                    ├── accounting_entries (by businessId + userId)
  │                    ├── invoices (by businessId + userId)
  │                    └── sales_invoices (by businessId + userId)
  │
  └── export_history (by initiatedBy)
```

## Validation Rules

| Rule | Applies To | Enforcement |
|------|-----------|-------------|
| Name must be ≥ 2 chars | P1 name sync | Existing validation in `user.service.ts` |
| Name split into firstName/lastName | P1 Clerk update | Split on first space; single-word name → firstName only |
| Export scoped to own records only | P3 Download My Data | Force `userId` filter regardless of role |
| Only active memberships | P3 Download My Data | Filter `status === "active"` on business_memberships |
| No concurrent exports | P3 Download My Data | Client-side flag (disable button while generating) |
