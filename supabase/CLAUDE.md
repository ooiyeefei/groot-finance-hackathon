# Supabase Database Documentation

Complete documentation of FinanSEAL's Supabase database architecture, including RPC functions, RLS policies, automated schema sync strategies, and CI/CD workflows.

**Project ID**: `ohxwghdgsuyabgsndfzc`
**Region**: AWS ap-southeast-1 (Singapore)
**Last Updated**: 2025-01-23

---

## Table of Contents

1. [RPC Functions](#rpc-functions)
2. [Row Level Security (RLS) Policies](#row-level-security-rls-policies)
3. [Multi-Tenant Architecture](#multi-tenant-architecture)
4. [Automated Schema Sync Strategies](#automated-schema-sync-strategies)
5. [GitHub CI/CD Integration](#github-cicd-integration)
6. [Type Generation Workflow](#type-generation-workflow)
7. [Migration Management](#migration-management)
8. [Monitoring & Debugging](#monitoring--debugging)
9. [Best Practices](#best-practices)

---

## RPC Functions

### Overview

RPC (Remote Procedure Call) functions are PostgreSQL stored procedures callable from Supabase client via `.rpc()`. They serve two critical purposes:

1. **Security Functions**: Used by RLS policies for multi-tenant data isolation
2. **Complex Operations**: Atomic database operations that span multiple tables

---

### Security Functions (RLS-Required)

#### `get_jwt_claim(claim_name text) → text`

**Purpose**: Extract claims from JWT token for authentication

**Usage**: Called by RLS policies and `get_user_business_id()`

**Definition**:
```sql
CREATE OR REPLACE FUNCTION public.get_jwt_claim(claim_name text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT COALESCE(
    (auth.jwt() ->> claim_name),
    ((current_setting('request.jwt.claims', true))::json ->> claim_name)
  );
$function$
```

**Critical Notes**:
- `SECURITY DEFINER`: Runs with elevated privileges
- `STABLE`: Result constant for same input during single query
- Extracts `sub` claim (Clerk user ID) for user identification

**DO NOT DELETE**: This function is foundational for all RLS policies.

---

#### `get_user_business_id() → uuid`

**Purpose**: Get user's active business_id from JWT token for RLS filtering

**Usage**: Used by **14 RLS policies** across core tables

**Definition**:
```sql
CREATE OR REPLACE FUNCTION public.get_user_business_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
DECLARE
  business_uuid uuid;
BEGIN
  SELECT u.business_id INTO business_uuid
  FROM users u
  WHERE u.clerk_user_id = get_jwt_claim('sub')
  LIMIT 1;
  RETURN business_uuid;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$function$
```

**RLS Policies Using This Function**:
1. `users` - business_id = get_user_business_id()
2. `business_memberships` - business_id = get_user_business_id()
3. `conversations` - business_id = get_user_business_id()
4. `messages` - Via conversations JOIN
5. `expense_claims` - business_id = get_user_business_id()
6. `audit_events` - business_id = get_user_business_id()
7. `accounting_entries` - business_id = get_user_business_id()
8. `invoices` - business_id = get_user_business_id()
9. `vendors` - business_id = get_user_business_id()
10. `applications` - business_id = get_user_business_id()
11. `line_items` - Via accounting_entries JOIN
12. `businesses` - id = get_user_business_id()
13. `application_documents` - business_id = get_user_business_id()
14. `expense_categories` - business_id = get_user_business_id()

**Security Impact**: Deleting this function would:
- ❌ Break all RLS policies
- ❌ Users would see data from ALL businesses (major security breach)
- ❌ Multi-tenant isolation completely broken

**DO NOT DELETE**: This function is critical for data security.

---

#### `get_active_business_context(p_clerk_user_id text) → TABLE`

**Purpose**: Returns full business context with role and permissions

**Usage**: **NOT CURRENTLY USED** - TypeScript code uses direct queries instead

**Definition**:
```sql
CREATE OR REPLACE FUNCTION public.get_active_business_context(p_clerk_user_id text)
RETURNS TABLE(
  business_id uuid,
  business_name text,
  role text,
  is_owner boolean,
  user_id uuid
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    b.id as business_id,
    b.name as business_name,
    bm.role as role,
    (b.owner_id = u.id) as is_owner,
    u.id as user_id
  FROM users u
  LEFT JOIN businesses b ON b.id = u.business_id
  LEFT JOIN business_memberships bm ON bm.user_id = u.id
    AND bm.business_id = u.business_id
    AND bm.status = 'active'
  WHERE u.clerk_user_id = p_clerk_user_id
  LIMIT 1;
END;
$function$
```

**Status**: ⚠️ **Potentially Removable** - Not referenced in RLS policies or TypeScript code

**Replacement**: TypeScript code uses `getCurrentBusinessContext()` with direct queries (faster)

---

### Business Logic Functions (TypeScript-Called)

#### `create_accounting_entry_from_approved_claim(p_claim_id uuid, p_approver_id uuid) → uuid`

**Purpose**: Atomically creates accounting entries when expense claims are approved

**Called From**: `src/domains/expense-claims/lib/data-access.ts:963`

**Parameters**:
- `p_claim_id` - Expense claim UUID
- `p_approver_id` - User who approved the claim

**Returns**: UUID of created `accounting_entries` record

**Business Logic**:
1. Reads `expense_claims.processing_metadata.financial_data`
2. Creates `accounting_entries` record from extracted data
3. Creates `line_items` records if present
4. Updates `expense_claims.accounting_entry_id` with new ID
5. All operations in atomic transaction

**Why RPC vs TypeScript**:
- ✅ **Atomicity**: All operations succeed or all fail
- ✅ **Performance**: Single round-trip to database
- ✅ **Consistency**: Category mapping handled server-side
- ✅ **Audit Trail**: Database-level logging

**Example Call**:
```typescript
const { data: transactionId, error: rpcError } = await supabase
  .rpc('create_accounting_entry_from_approved_claim', {
    p_claim_id: claimId,
    p_approver_id: userProfile.user_id
  })
```

**Location in Schema**: `supabase/migrations/20250106100000_create_accounting_entry_on_approval.sql`

---

#### `get_invoices_with_linked_transactions(p_business_id uuid) → TABLE`

**Purpose**: Fetches invoices with linked transaction data in single query

**Called From**: `src/domains/invoices/lib/data-access.ts:103`

**Parameters**:
- `p_business_id` - Business UUID for filtering

**Returns**: TABLE with invoice and transaction data

**Why RPC vs JOIN**:
- ✅ **Performance**: Optimized JOIN with indexing
- ✅ **Complex Logic**: Custom aggregations and transformations
- ✅ **Consistency**: Server-side business rules

**Example Call**:
```typescript
const { data: rpcResult, error: rpcError } = await supabase.rpc(
  'get_invoices_with_linked_transactions',
  { p_business_id: businessId }
)
```

---

#### `get_manager_team_employees(p_manager_id uuid, p_business_id uuid) → TABLE`

**Purpose**: Gets all employees reporting to a manager via hierarchy

**Called From**: `src/domains/users/lib/user.service.ts:152`

**Parameters**:
- `p_manager_id` - Manager user UUID
- `p_business_id` - Business UUID for filtering

**Returns**: TABLE of employee records with membership details

**Business Logic**:
- Traverses `business_memberships.manager_id` hierarchy
- Filters by active status
- Includes direct reports and indirect reports

**Example Call**:
```typescript
const { data, error } = await supabase.rpc('get_manager_team_employees', {
  p_manager_id: managerId,
  p_business_id: businessId
})
```

---

#### `get_dashboard_analytics(p_business_id uuid, p_user_id uuid, p_scope text) → json`

**Purpose**: Returns aggregated analytics for dashboard displays

**Called From**: `src/domains/analytics/lib/engine.ts:130`

**Parameters**:
- `p_business_id` - Business UUID
- `p_user_id` - User UUID for scoping
- `p_scope` - 'personal' | 'team' | 'company'

**Returns**: JSON object with aggregated metrics

**Why RPC**:
- ✅ **Performance**: Complex aggregations run server-side
- ✅ **Consistency**: Single source of truth for calculations
- ✅ **Optimization**: Can use database-specific optimizations

**Example Call**:
```typescript
const { data, error } = await supabase.rpc('get_dashboard_analytics', {
  p_business_id: businessId,
  p_user_id: userId,
  p_scope: 'company'
})
```

---

## Row Level Security (RLS) Policies

### Overview

RLS policies automatically filter database queries based on the authenticated user's context. All policies use `get_user_business_id()` to enforce multi-tenant data isolation.

### RLS Policy Pattern

```sql
CREATE POLICY "Users can only see their business data"
ON table_name
FOR ALL
USING (business_id = get_user_business_id());
```

### Critical Understanding

**Flow**: Client Request → Clerk JWT → `get_jwt_claim('sub')` → `get_user_business_id()` → Filter by business_id

**Security Model**:
1. User authenticates with Clerk
2. JWT contains Clerk user ID in `sub` claim
3. `get_user_business_id()` looks up `users.business_id` from Clerk ID
4. RLS policies filter all queries by this business_id
5. User CANNOT see data from other businesses

---

## Multi-Tenant Architecture

### Database Design

```
Clerk Authentication (JWT)
  ↓
users.clerk_user_id (unique)
  ↓
users.business_id (active business)
  ↓
business_memberships (role, permissions)
  ↓
All data tables filtered by business_id
```

### Key Tables

**users**:
- `clerk_user_id` - Links to Clerk authentication
- `business_id` - Current active business
- Single source of truth for user context

**business_memberships**:
- `user_id` - User UUID
- `business_id` - Business UUID
- `role` - 'employee' | 'manager' | 'admin'
- `manager_id` - Manager hierarchy
- `status` - 'active' | 'inactive' | 'suspended'

**businesses**:
- `id` - Business UUID
- `owner_id` - User who owns the business
- `name`, `tax_id`, `home_currency`, etc.

### Data Isolation

**All data tables** must have:
- `business_id uuid NOT NULL` column
- RLS policy: `business_id = get_user_business_id()`
- Foreign key: `REFERENCES businesses(id)`

**Exception**: System tables (audit_events, system_config) may use different RLS

---

## Automated Schema Sync Strategies

### Problem Statement

**Challenge**: Supabase schema (tables, RPC functions, RLS policies) lives externally in cloud, making it:
- ❌ **Invisible** to developers and LLM coding agents
- ❌ **Out of sync** with local TypeScript types
- ❌ **Difficult to track** schema changes
- ❌ **Prone to errors** when schema evolves

**Solution**: Automated CI/CD workflows to sync schema, types, and migrations

---

## GitHub CI/CD Integration

### Strategy 1: Daily Type Generation

**Purpose**: Automatically generate TypeScript types from live database schema

**Workflow File**: `.github/workflows/update-database-types.yml`

```yaml
name: Update Database Types

on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight UTC
  workflow_dispatch:      # Manual trigger

jobs:
  update:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      PROJECT_REF: ohxwghdgsuyabgsndfzc
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install Supabase CLI
        run: npm install -g supabase

      - name: Generate Types
        run: |
          supabase gen types typescript \
            --project-id "$PROJECT_REF" \
            --schema public \
            > src/lib/database.types.ts

      - name: Check for changes
        id: git_status
        run: |
          echo "status=$(git status -s)" >> $GITHUB_OUTPUT

      - name: Commit files
        if: ${{contains(steps.git_status.outputs.status, ' ')}}
        run: |
          git add src/lib/database.types.ts
          git config --local user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git config --local user.name "github-actions[bot]"
          git commit -m "chore: update database types from Supabase schema" -a

      - name: Push changes
        if: ${{contains(steps.git_status.outputs.status, ' ')}}
        uses: ad-m/github-push-action@master
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          branch: ${{ github.ref }}
```

**Setup Instructions**:
1. Create GitHub secret: `SUPABASE_ACCESS_TOKEN` (from Supabase Dashboard → Settings → API)
2. Verify project ref: `ohxwghdgsuyabgsndfzc`
3. Enable workflow in `.github/workflows/` directory
4. Test with manual trigger: Actions → Update Database Types → Run workflow

**Benefits**:
- ✅ Types always match production schema
- ✅ Automatic PR or commit when schema changes
- ✅ No manual `supabase gen types` needed
- ✅ Visible to developers and LLM agents

---

### Strategy 2: Migration Deployment

**Purpose**: Automatically apply database migrations on branch merges

**Workflow File**: `.github/workflows/deploy-migrations.yml`

```yaml
name: Deploy Migrations

on:
  push:
    branches:
      - main
      - develop
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
      SUPABASE_PROJECT_ID: ${{ secrets.SUPABASE_PROJECT_ID }}

    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Link to Supabase project
        run: supabase link --project-ref $SUPABASE_PROJECT_ID

      - name: Push migrations
        run: supabase db push
        env:
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
```

**Setup Instructions**:
1. Create GitHub secrets:
   - `SUPABASE_ACCESS_TOKEN` - API token from Supabase
   - `SUPABASE_DB_PASSWORD` - Database password
   - `SUPABASE_PROJECT_ID` - `ohxwghdgsuyabgsndfzc`
2. Store migrations in `supabase/migrations/` directory
3. Merge to `main` or `develop` triggers deployment

**Benefits**:
- ✅ Migrations automatically applied on deployment
- ✅ No manual `supabase db push` needed
- ✅ Consistent deployment across environments
- ✅ Rollback capability via git history

---

### Strategy 3: CI Verification

**Purpose**: Ensure types are committed before PR merge

**Workflow File**: `.github/workflows/verify-types.yml`

```yaml
name: Verify Database Types

on:
  pull_request:
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Start local Supabase
        run: supabase db start

      - name: Generate types
        run: |
          supabase gen types typescript --local > types.gen.ts

      - name: Verify types are committed
        run: |
          if ! git diff --ignore-space-at-eol --exit-code --quiet types.gen.ts; then
            echo "❌ Generated types differ from committed types"
            echo "Run 'supabase gen types typescript --local > types.gen.ts' and commit"
            git diff types.gen.ts
            exit 1
          fi
          echo "✅ Types are up to date"
```

**Benefits**:
- ✅ PR cannot merge with outdated types
- ✅ Forces developers to keep types in sync
- ✅ Catches schema drift early

---

### Strategy 4: Schema Pull from Production

**Purpose**: Capture production schema changes into migration files

**Manual Command**:
```bash
# Pull entire schema from production
supabase db pull --db-url "postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"

# Pull specific schema
supabase db pull --schema auth --db-url "..."
```

**Automated Workflow**: `.github/workflows/sync-schema.yml`

```yaml
name: Sync Schema from Production

on:
  workflow_dispatch:  # Manual trigger only
    inputs:
      schema:
        description: 'Schema to pull (public, auth, storage)'
        required: true
        default: 'public'

jobs:
  sync:
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      PROJECT_REF: ohxwghdgsuyabgsndfzc

    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Pull schema from production
        run: |
          supabase db pull \
            --schema ${{ github.event.inputs.schema }} \
            --db-url "postgresql://postgres.$PROJECT_REF:${{ secrets.SUPABASE_DB_PASSWORD }}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v5
        with:
          commit-message: "chore: sync ${{ github.event.inputs.schema }} schema from production"
          title: "Schema Sync: ${{ github.event.inputs.schema }}"
          body: |
            Automated schema sync from production database.

            **Schema**: ${{ github.event.inputs.schema }}
            **Source**: Production (ohxwghdgsuyabgsndfzc)

            Review carefully before merging.
          branch: schema-sync-${{ github.event.inputs.schema }}
```

**Benefits**:
- ✅ Captures dashboard changes to git
- ✅ Creates PR for review
- ✅ Prevents schema drift

---

## Type Generation Workflow

### Local Development

```bash
# Generate types from local database
supabase start
supabase gen types typescript --local > src/lib/database.types.ts

# Generate types from remote project
supabase gen types typescript \
  --project-id ohxwghdgsuyabgsndfzc \
  --schema public \
  > src/lib/database.types.ts
```

### NPM Script

Add to `package.json`:
```json
{
  "scripts": {
    "update-types": "supabase gen types typescript --project-id ohxwghdgsuyabgsndfzc --schema public > src/lib/database.types.ts",
    "update-types:local": "supabase gen types typescript --local > src/lib/database.types.ts"
  }
}
```

### Type Structure

**Generated File**: `src/lib/database.types.ts`

```typescript
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      expense_claims: {
        Row: {               // SELECT queries return this
          id: string
          user_id: string
          business_id: string
          status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'reimbursed'
          total_amount: number
          currency: string
          // ... all columns
        }
        Insert: {            // INSERT requires these fields
          id?: string        // Optional if has default
          user_id: string
          business_id: string
          status?: 'draft'   // Optional if has default
          total_amount: number
          currency: string
          // ... required fields
        }
        Update: {            // UPDATE can update any field
          id?: never         // Cannot update PK
          user_id?: string
          business_id?: string
          status?: 'draft' | 'submitted' | 'approved' | 'rejected' | 'reimbursed'
          total_amount?: number
          // ... updatable fields
        }
      }
      // ... other tables
    }
    Functions: {
      create_accounting_entry_from_approved_claim: {
        Args: { p_claim_id: string; p_approver_id: string }
        Returns: string
      }
      // ... other functions
    }
  }
}
```

### Usage in TypeScript

```typescript
import { Database } from '@/lib/database.types'

type ExpenseClaim = Database['public']['Tables']['expense_claims']['Row']
type ExpenseClaimInsert = Database['public']['Tables']['expense_claims']['Insert']
type ExpenseClaimUpdate = Database['public']['Tables']['expense_claims']['Update']

// Typed Supabase client
import { createClient } from '@supabase/supabase-js'
const supabase = createClient<Database>(url, key)

// Type-safe queries
const { data, error } = await supabase
  .from('expense_claims')  // ✅ Autocomplete
  .select('*')             // ✅ Autocomplete columns
  .eq('status', 'draft')   // ✅ Type-checked value

// Type-safe RPC
const { data: transactionId } = await supabase
  .rpc('create_accounting_entry_from_approved_claim', {
    p_claim_id: claimId,        // ✅ Type-checked
    p_approver_id: approverId   // ✅ Type-checked
  })
```

---

## Migration Management

### Creating Migrations

```bash
# Create new migration file
supabase migration new create_rpc_function

# Generate migration from schema diff
supabase db diff -f capture_schema_changes
```

### Migration File Structure

**Location**: `supabase/migrations/`

**Naming Convention**: `<timestamp>_<description>.sql`

**Example**: `20250106100000_create_accounting_entry_on_approval.sql`

```sql
-- Migration: create_accounting_entry_from_approved_claim RPC function
-- Created: 2025-01-06
-- Purpose: Atomic accounting entry creation from approved expense claims

CREATE OR REPLACE FUNCTION public.create_accounting_entry_from_approved_claim(
  p_claim_id uuid,
  p_approver_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_transaction_id uuid;
  v_claim expense_claims%ROWTYPE;
BEGIN
  -- Fetch expense claim
  SELECT * INTO v_claim
  FROM expense_claims
  WHERE id = p_claim_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found: %', p_claim_id;
  END IF;

  -- Create accounting entry
  INSERT INTO accounting_entries (...)
  VALUES (...)
  RETURNING id INTO v_transaction_id;

  -- Create line items (if present)
  -- ...

  -- Update expense claim with transaction link
  UPDATE expense_claims
  SET accounting_entry_id = v_transaction_id
  WHERE id = p_claim_id;

  RETURN v_transaction_id;
END;
$function$;
```

### Applying Migrations

```bash
# Local development
supabase db reset              # Reapply all migrations
supabase migration up          # Apply pending migrations

# Remote deployment
supabase link --project-ref ohxwghdgsuyabgsndfzc
supabase db push               # Push all migrations to remote
```

### Rolling Back

```bash
# Reset to specific migration version
supabase db reset --version 20250106100000
```

**⚠️ WARNING**: Do NOT rollback migrations already deployed to production. Use new migrations to reverse changes.

---

## Monitoring & Debugging

### RPC Function Debugging

**Check Function Exists**:
```sql
SELECT
  proname as function_name,
  pg_get_function_arguments(oid) as arguments,
  pg_get_functiondef(oid) as definition
FROM pg_proc
WHERE proname LIKE '%accounting%';
```

**Check RLS Policies**:
```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'expense_claims';
```

**Test RPC Function**:
```typescript
const { data, error } = await supabase
  .rpc('create_accounting_entry_from_approved_claim', {
    p_claim_id: 'test-uuid',
    p_approver_id: 'approver-uuid'
  })

if (error) {
  console.error('RPC Error:', error.message)
  console.error('Error Code:', error.code)
  console.error('Error Details:', error.details)
}
```

### Common Issues

**Issue 1: RPC function not found**
```
ERROR: function create_accounting_entry_from_approved_claim(uuid, uuid) does not exist
```

**Solution**:
- Verify function exists in database
- Check migration was applied: `supabase migration list`
- Re-run migrations: `supabase db push`

**Issue 2: Permission denied on RLS policy**
```
ERROR: permission denied for table expense_claims
```

**Solution**:
- Check RLS policy exists
- Verify `get_user_business_id()` returns correct value
- Test with service role client to bypass RLS

**Issue 3: Type mismatch in RPC call**
```
ERROR: function create_accounting_entry_from_approved_claim(text, text) does not exist
HINT: No function matches the given name and argument types.
```

**Solution**:
- Check parameter types match function signature
- Use TypeScript types from `database.types.ts`
- Cast parameters if needed: `p_claim_id::uuid`

---

## Best Practices

### RPC Function Design

1. **Use for Complex Operations**
   - Multi-table atomic transactions
   - Complex business logic
   - Performance-critical aggregations

2. **Avoid for Simple Queries**
   - Single table SELECT - use direct query
   - Simple filtering - use RLS + query
   - Basic CRUD - use Supabase client methods

3. **Security**
   - Always use `SECURITY DEFINER` for RLS functions
   - Mark as `STABLE` if read-only
   - Validate all input parameters
   - Use proper error handling

4. **Performance**
   - Add indexes for frequently queried columns
   - Use EXPLAIN ANALYZE to optimize queries
   - Avoid N+1 queries in loops

### Migration Best Practices

1. **Naming Convention**
   - Use descriptive names: `create_rpc_accounting_entry_approval`
   - Include purpose in comments
   - Add version/date in header

2. **Reversibility**
   - Always create reversible migrations when possible
   - Document rollback strategy
   - Test rollback locally before production

3. **Testing**
   - Test migrations on local database first
   - Verify data integrity after migration
   - Check performance impact with production-like data

4. **Documentation**
   - Document purpose and business logic
   - Include usage examples
   - Note any dependencies or prerequisites

### Type Safety

1. **Always Use Generated Types**
   ```typescript
   // ✅ Good
   import { Database } from '@/lib/database.types'
   type ExpenseClaim = Database['public']['Tables']['expense_claims']['Row']

   // ❌ Bad
   type ExpenseClaim = {
     id: string
     // ... manual type definition
   }
   ```

2. **Keep Types in Sync**
   - Run `npm run update-types` after schema changes
   - Enable CI verification for type sync
   - Commit type files with schema changes

3. **Use Type Guards**
   ```typescript
   function isExpenseClaim(data: unknown): data is ExpenseClaim {
     return typeof data === 'object' &&
            data !== null &&
            'id' in data &&
            'status' in data
   }
   ```

---

## Maintenance Checklist

### Weekly

- [ ] Review pending migrations
- [ ] Check for schema drift (manual dashboard changes)
- [ ] Verify type generation workflow ran successfully

### Monthly

- [ ] Review RPC function performance metrics
- [ ] Check RLS policy effectiveness
- [ ] Update documentation for schema changes
- [ ] Review and optimize slow queries

### Quarterly

- [ ] Audit RPC functions for unused functions
- [ ] Review RLS policies for security gaps
- [ ] Performance tuning for high-traffic tables
- [ ] Database backup verification

---

## Resources

- **Supabase Documentation**: https://supabase.com/docs
- **Supabase CLI**: https://supabase.com/docs/guides/cli
- **Migration Guide**: https://supabase.com/docs/guides/deployment/database-migrations
- **RLS Guide**: https://supabase.com/docs/guides/auth/row-level-security
- **Type Generation**: https://supabase.com/docs/guides/api/rest/generating-types
- **GitHub Actions**: https://github.com/supabase/setup-cli

---

**Last Updated**: 2025-01-23
**Maintained By**: FinanSEAL Development Team
**Related Documentation**:
- Main project: `/CLAUDE.md`
- Security domain: `/src/domains/security/CLAUDE.md`
- API contracts: `/src/app/api/v1/CLAUDE.md`
