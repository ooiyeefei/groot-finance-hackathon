# Research: Database Revamp - Migration to Convex

**Branch**: `001-db-revamp` | **Date**: 2024-12-29 | **Spec**: [spec.md](./spec.md)

## Executive Summary

This document captures research findings for migrating FinanSEAL from Supabase PostgreSQL to Convex. All four research topics have been investigated with clear recommendations.

| Topic | Decision | Confidence |
|-------|----------|------------|
| Convex + Clerk Integration | Official integration, well-documented | High |
| Data Migration Strategy | Big-bang via `npx convex import` | High |
| File Storage | Migrate to Convex Files (simplicity) | Medium |
| Rollback Strategy | Keep Supabase running 1 week post-migration | High |

---

## Topic 1: Convex + Clerk Integration

### Research Question
How does Convex integrate with Clerk for authentication? What's the setup process?

### Findings

**Official Integration**: Convex has first-class Clerk support via `convex/react-clerk` package.

**Setup Steps**:

1. **Create Clerk JWT Template for Convex**
   - In Clerk Dashboard → JWT Templates → Create "convex" template
   - This template generates tokens Convex can validate

2. **Configure Convex Auth** (`convex/auth.config.ts`)
   ```typescript
   import { AuthConfig } from "convex/server";

   export default {
     providers: [
       {
         domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
         applicationID: "convex",
       },
     ]
   } satisfies AuthConfig;
   ```

3. **Client-Side Provider Setup** (Next.js App Router)
   ```typescript
   import { ClerkProvider, useAuth } from "@clerk/nextjs";
   import { ConvexProviderWithClerk } from "convex/react-clerk";
   import { ConvexReactClient } from "convex/react";

   const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

   // In layout.tsx or providers.tsx
   <ClerkProvider>
     <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
       {children}
     </ConvexProviderWithClerk>
   </ClerkProvider>
   ```

4. **Middleware Configuration** (`middleware.ts`)
   ```typescript
   import { clerkMiddleware } from '@clerk/nextjs/server';
   export default clerkMiddleware();
   ```

5. **Server-Side User Identity**
   ```typescript
   // In Convex queries/mutations
   const identity = await ctx.auth.getUserIdentity();
   if (!identity) throw new Error("Unauthenticated");
   const userId = identity.subject; // Clerk user ID
   ```

**Dev/Prod Configuration**:
- Separate Clerk instances for dev/prod
- Environment variables: `CLERK_JWT_ISSUER_DOMAIN`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- Convex Dashboard: Set environment variables per deployment

### Recommendation

**Use official Convex + Clerk integration**. It's well-documented and matches our existing Clerk setup. Key changes from current Supabase implementation:
- Remove JWT token caching layer (`business-context-cache.ts`) - Convex handles this
- Remove `createAuthenticatedSupabaseClient()` - replaced by `ctx.auth.getUserIdentity()`
- Replace `getUserData()` with Convex query that reads from `users` table

---

## Topic 2: Data Migration Strategy

### Research Question
How do we migrate ~1000 rows across 14 tables from Supabase to Convex?

### Findings

**Convex Import Options**:

1. **CLI Import** (Recommended for our scale)
   ```bash
   # Full backup import
   npx convex import backup.zip

   # Single table import
   npx convex import --table users users.jsonl
   ```

2. **Supported Formats**:
   - ZIP archive (full backup)
   - JSON (8MB limit)
   - JSONLines (recommended for larger data)
   - CSV

3. **ID Preservation**:
   - `_id` and `_creationTime` preserved from backup
   - Critical for maintaining foreign key relationships

4. **Production Import**:
   ```bash
   npx convex import --prod --replace backup.zip
   ```

**Migration Workflow**:

```
Phase 1: Export from Supabase
├── pg_dump for full backup (safety)
├── Export each table to JSONLines format
└── Transform UUIDs → Convex ID format

Phase 2: Schema Preparation
├── Define convex/schema.ts
├── Deploy schema to dev Convex
└── Validate schema matches export structure

Phase 3: Data Import
├── Import to dev Convex first
├── Verify row counts match
├── Test critical queries
└── Import to prod Convex

Phase 4: Cutover
├── Point application to Convex
├── Verify all features work
└── Keep Supabase running for rollback
```

**Trigger.dev Integration**:
For the actual migration, we'll create a Trigger.dev task that:
1. Connects to Supabase via service role
2. Exports each table to JSONLines
3. Transforms data (UUID → Convex ID mapping)
4. Calls Convex import via CLI or streaming API

### Recommendation

**Big-bang migration** via `npx convex import`:
- Our scale (~1000 rows) is small enough for direct import
- Use JSONLines format for each table
- Create ID mapping file for foreign key translation
- Execute during low-traffic window (evening SGT)

**Data Transformation Required**:
| Supabase Type | Convex Type | Notes |
|---------------|-------------|-------|
| UUID | `v.id("tableName")` | Generate new Convex IDs, maintain mapping |
| TIMESTAMPTZ | `v.number()` | Unix timestamp in milliseconds |
| JSONB | `v.object()` or `v.any()` | Depends on structure |
| TEXT[] | `v.array(v.string())` | Direct mapping |
| NUMERIC | `v.float64()` | Direct mapping |

---

## Topic 3: File Storage Strategy

### Research Question
Should we migrate files to Convex Files or keep Supabase Storage?

### Findings

**Convex File Storage Features**:
- All file types supported
- Direct integration with Convex database via `Id<"_storage">`
- Files managed through Convex dashboard
- Upload via mutation-generated URLs

**Upload Pattern**:
```typescript
// 1. Generate upload URL (mutation)
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// 2. Client uploads to URL
const postUrl = await generateUploadUrl();
const result = await fetch(postUrl, {
  method: "POST",
  headers: { "Content-Type": file.type },
  body: file,
});
const { storageId } = await result.json();

// 3. Save storageId to database
await saveDocument({ storageId, filename: file.name });
```

**Serving Files**:
```typescript
// Get URL for file
const url = await ctx.storage.getUrl(storageId);
```

**Comparison**:

| Aspect | Convex Files | Supabase Storage |
|--------|--------------|------------------|
| Integration | Native with Convex DB | Separate service |
| Region | US (same as Convex) | Singapore available |
| Pricing | Included in Convex plan | Separate billing |
| CDN | Built-in | Supabase CDN |
| Complexity | Single system | Two systems to manage |

**Current Supabase Storage Usage**:
- Invoice PDFs and images
- Receipt images (expense claims)
- Annotated document images
- Total: Likely < 1GB based on user count

### Recommendation

**Migrate to Convex Files** for simplicity:
- Single system to manage
- Native integration with Convex queries
- Our file volume is small
- Latency acceptable for document storage (not real-time)

**Migration Approach**:
1. Export file URLs from Supabase `documents` table
2. Download files via Supabase Storage API
3. Re-upload to Convex Files
4. Update `storageId` references in Convex documents table

**Alternative (if latency critical)**:
Keep Supabase Storage and store URLs in Convex. More complex but lower latency for Singapore users.

---

## Topic 4: Rollback Strategy

### Research Question
What's our rollback plan if Convex migration fails?

### Findings

**Risk Categories**:

1. **Pre-Cutover Issues** (Low Risk)
   - Schema problems discovered during dev testing
   - Data import failures
   - Query performance issues
   - **Mitigation**: Fix and retry, Supabase still primary

2. **Cutover Issues** (Medium Risk)
   - Application errors after pointing to Convex
   - Missing data discovered post-migration
   - Performance degradation
   - **Mitigation**: Revert environment variables to Supabase

3. **Post-Cutover Issues** (Higher Risk)
   - Data corruption discovered days later
   - Subtle bugs in query logic
   - User-reported issues
   - **Mitigation**: Sync new Convex data back to Supabase

**Rollback Plan**:

```
Tier 1: Immediate Rollback (0-24 hours post-cutover)
├── Revert Vercel env vars to Supabase
├── Redeploy application
└── Total downtime: ~5 minutes

Tier 2: Data Sync Rollback (1-7 days post-cutover)
├── Export changed data from Convex
├── Apply delta to Supabase
├── Revert env vars
└── Total downtime: ~30-60 minutes

Tier 3: Full Restoration (7+ days, emergency only)
├── Restore from pre-migration Supabase backup
├── Lose all post-migration data
└── Last resort option
```

**Supabase Retention**:
- Keep Supabase project running for 1 week post-cutover
- Maintain read-only access for data verification
- Set reminder to delete after successful migration confirmed

### Recommendation

**Three-Phase Rollback Strategy**:

1. **Before Cutover**
   - Full `pg_dump` backup stored securely
   - Document exact row counts per table
   - Test rollback procedure on dev

2. **During Cutover**
   - Announce 30-minute maintenance window
   - Keep Supabase credentials in secure location
   - Have rollback script ready

3. **After Cutover**
   - Monitor error rates for 24 hours
   - Check critical paths: auth, document upload, expense claims
   - Keep Supabase running (read-only) for 1 week
   - Daily row count verification for first 3 days

---

## Open Questions Resolved

| Question | Resolution |
|----------|------------|
| Can Convex handle our query patterns? | Yes - verified `q.or()`, `q.and()`, full-text search |
| Is Clerk integration straightforward? | Yes - official integration with clear docs |
| How to preserve foreign keys? | Import preserves `_id`, need mapping for cross-table refs |
| File storage recommendation? | Migrate to Convex Files for simplicity |
| Rollback complexity? | Low - keep Supabase running 1 week |

## Next Steps

1. **Phase 1: Design** → Generate `data-model.md` with Convex schema
2. **Phase 1: Contracts** → Define query/mutation signatures
3. **Phase 2: Implementation** → Execute migration per `tasks.md`

---

## References

- [Convex + Clerk Integration](https://docs.convex.dev/auth/clerk)
- [Convex Data Import/Export](https://docs.convex.dev/database/import-export)
- [Convex File Storage](https://docs.convex.dev/file-storage)
- [Convex Migrations Component](https://www.convex.dev/components/migrations)
