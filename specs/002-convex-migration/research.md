# Research: Convex Migration

**Branch**: `002-convex-migration` | **Date**: 2025-12-29

## Research Questions Resolved

### 1. Migration Approach

**Decision**: Batch Import via JSONL

**Rationale**:
- Current dataset is small (~60 total rows across 12 tables)
- Batch import is simpler and sufficient for this scale
- Streaming (Airbyte) is overkill for < few gigabytes

**Process**:
```bash
# Export from Supabase
\copy ( SELECT row_to_json(users) FROM users ) TO '/path/to/users.jsonl';

# Import to Convex
npx convex import --format jsonLines --replace --table users /path/to/users.jsonl
```

**Alternatives Rejected**:
- Streaming (Airbyte): Too complex for small dataset
- Manual recreation: Error-prone, loses data

---

### 2. Schema Mapping Strategy

**Decision**: TypeScript-native schema with relationship indexes

**Rationale**:
- Convex uses `v.id("tableName")` for foreign key references
- Indexes required for efficient queries on relationships
- Schema validation ensures data integrity

**Key Patterns**:
```typescript
// Relationships with indexes
users: defineTable({
  clerkUserId: v.string(),  // External ID from Clerk
  businessId: v.optional(v.id("businesses")),
  // ... other fields
}).index("by_clerkUserId", ["clerkUserId"])
  .index("by_businessId", ["businessId"]),

// Many-to-many via join table
business_memberships: defineTable({
  userId: v.id("users"),
  businessId: v.id("businesses"),
  role: v.string(),
}).index("by_userId", ["userId"])
  .index("by_businessId", ["businessId"])
  .index("by_userId_businessId", ["userId", "businessId"]),
```

**Alternatives Rejected**:
- Embedded documents: Loses flexibility for accounting audit trails
- Denormalized: Creates update anomalies

---

### 3. ID Handling During Migration

**Decision**: Dual-index approach with flexible resolver

**Rationale**:
- Existing Supabase UUIDs need to be preserved for data integrity
- Convex generates its own IDs (`_id`)
- Need both for gradual migration of relationships

**Pattern**:
```typescript
// Schema with legacy ID index
users: defineTable({
  legacyId: v.string(),  // Supabase UUID
  // ... other fields
}).index("by_legacyId", ["legacyId"]),

// Flexible resolver function
async function getUserById(ctx, id) {
  const convexId = ctx.db.normalizeId("users", id);
  if (convexId !== null) {
    return ctx.db.get(convexId);
  }
  return ctx.db
    .query("users")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", id))
    .unique();
}
```

**Migration Steps**:
1. Import with `legacyId` field preserved
2. Update relationships to use Convex IDs
3. Keep `legacyId` index for backward compatibility
4. Eventually deprecate legacy IDs

---

### 4. Clerk Authentication Integration

**Decision**: Use `@convex-dev/auth` with externalId pattern

**Rationale**:
- Convex has native Clerk integration
- Store Clerk user ID as `externalId` with index
- JWT subject field contains Clerk ID

**Implementation**:
```typescript
// schema.ts
users: defineTable({
  externalId: v.string(),  // Clerk user ID
  name: v.string(),
  email: v.string(),
  // ...
}).index("by_externalId", ["externalId"]),

// Query pattern
const user = await ctx.db
  .query("users")
  .withIndex("by_externalId", q => q.eq("externalId", clerkUserId))
  .unique();
```

**Environment Setup**:
- Configure Clerk domain in Convex dashboard
- JWT validation handled by Convex runtime

---

### 5. File Storage Migration

**Decision**: Migrate Supabase Storage to AWS S3 (NOT Convex Files)

**Rationale**:
- **Convex Files is flat** - no folder hierarchy support, just storage IDs
- **S3 preserves folder structure** - critical for our path patterns
- **Existing path pattern** must be maintained:
  ```
  {business_id}/{user_id}/{document_type}/{document_id}/{stage}/{filename}
  ```
  Where `stage` = `raw` | `converted` | `processed`

**Current Storage Path Logic** (from `src/lib/storage-paths.ts`):
```typescript
// StoragePathBuilder usage
const pathBuilder = new StoragePathBuilder(businessId, userId, documentId);
pathBuilder.forDocument('invoice', docId).raw('invoice.pdf')
// → {businessId}/{userId}/invoice/{docId}/raw/invoice.pdf

pathBuilder.forDocument('receipt', docId).converted('page_1.png')
// → {businessId}/{userId}/receipt/{docId}/converted/page_1.png

pathBuilder.forDocument('invoice', docId).processed('annotated.png', 'ocr')
// → {businessId}/{userId}/invoice/{docId}/processed/ocr_annotated.png
```

**S3 Configuration**:
```typescript
// New: src/lib/s3-client.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-southeast-1",  // Singapore for SEA
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || "finanseal-documents";

export async function uploadFile(
  path: string,
  file: Buffer | Blob,
  contentType: string
): Promise<string> {
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: path,  // Preserves our folder structure!
    Body: file,
    ContentType: contentType,
  }));
  return path;
}

export async function getSignedDownloadUrl(path: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: path,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}
```

**Migration Process**:
1. Create S3 bucket with same region as current Supabase (ap-southeast-1)
2. Migrate files preserving exact paths from Supabase Storage
3. Update `storage_path` references in database (same paths, just different backend)
4. Replace Supabase storage calls with S3 client
5. Deprecate Supabase Storage buckets

**Bucket Mapping**:
| Supabase Bucket | S3 Path Prefix | Purpose |
|-----------------|----------------|---------|
| `invoices` | `invoices/` | COGS documents |
| `expense_claims` | `expense_claims/` | Receipts |
| `business-logos` | `business-logos/` | Branding |

**Integration with Convex**:
```typescript
// convex/functions/storage.ts - Convex action calls S3
import { action } from "../_generated/server";
import { v } from "convex/values";

export const getFileUrl = action({
  args: { storagePath: v.string() },
  handler: async (ctx, args) => {
    // Call S3 to get signed URL
    const response = await fetch(`${process.env.API_URL}/api/storage/signed-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: args.storagePath }),
    });
    const { url } = await response.json();
    return url;
  },
});
```

**Why NOT Convex Files**:
1. ❌ No folder hierarchy - files are flat with storage IDs
2. ❌ Would require schema changes (storageId instead of storagePath)
3. ❌ Loses our structured path convention for audit trails
4. ❌ Harder to debug/browse in dashboard

**Why S3**:
1. ✅ Preserves exact folder structure
2. ✅ Same path patterns work (`storage_path` field unchanged)
3. ✅ Signed URLs for secure access (like Supabase)
4. ✅ S3 console for easy browsing/debugging
5. ✅ Trigger.dev can access S3 directly for OCR tasks
6. ✅ Cost-effective for file storage

---

### 6. Real-time for Conversations Table

**Decision**: YES - Use Convex native real-time

**Rationale**:
- Conversations/messages benefit greatly from real-time updates
- Convex provides automatic real-time with `useQuery`
- No additional setup required (unlike Supabase Realtime)
- Better UX for chat features

**Implementation**:
```typescript
// Client-side real-time subscription
const messages = useQuery(api.chat.getMessages, {
  conversationId
});

// Automatically updates when new messages arrive
```

**Benefits Over Supabase Realtime**:
- Zero configuration for real-time
- TypeScript-native with full type safety
- No separate WebSocket connection management
- Automatic reconnection and state sync

---

### 7. Query Revamp Strategy

**Decision**: Domain-driven Convex functions replacing API routes

**Rationale**:
- Convex functions are TypeScript-native
- End-to-end type safety from schema to client
- Simplified architecture (no API routes needed)

**Architecture Mapping**:

| Supabase Pattern | Convex Pattern |
|------------------|----------------|
| `supabase.from('table').select()` | `ctx.db.query("table")` |
| API route `/api/v1/expenses` | `convex/functions/expenses.ts` |
| RLS policies | Function-level auth checks |
| Supabase RPC | Convex mutations/actions |

**Query Migration Examples**:

```typescript
// Before (Supabase in API route)
const { data, error } = await supabase
  .from('expense_claims')
  .select('*')
  .eq('business_id', businessId)
  .order('created_at', { ascending: false });

// After (Convex function)
export const listExpenseClaims = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    return await ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", q => q.eq("businessId", args.businessId))
      .order("desc")
      .collect();
  },
});
```

**Client-Side Changes**:
```typescript
// Before
const response = await fetch('/api/v1/expense-claims');
const data = await response.json();

// After
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

const claims = useQuery(api.expenses.listExpenseClaims, { businessId });
```

---

### 8. Trigger.dev Integration

**Decision**: Use Convex HTTP actions for webhook-style triggers

**Rationale**:
- Trigger.dev needs HTTP endpoint to call Convex
- Convex actions can run external services
- Keep Trigger.dev for long-running Python tasks (OCR, annotations)

**Pattern**:
```typescript
// convex/http.ts - Webhook for Trigger.dev
http.route({
  path: "/trigger-callback",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    // Update document with OCR results
    await ctx.runMutation(internal.invoices.updateOCRResults, body);
    return new Response("OK");
  }),
});
```

---

### 9. Stripe Webhook Integration

**Decision**: Convex HTTP actions replace Next.js API routes

**Rationale**:
- Stripe webhooks need HTTP endpoint
- Convex HTTP actions support webhook verification
- Database updates via internal mutations

**Implementation**:
```typescript
// convex/http.ts
http.route({
  path: "/stripe-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("stripe-signature");
    const body = await request.text();

    // Verify and process
    const event = verifyStripeWebhook(body, signature);
    await ctx.runMutation(internal.billing.handleStripeEvent, { event });

    return new Response("OK");
  }),
});
```

---

### 10. Data Integrity Verification

**Decision**: Automated count verification + referential integrity checks

**Process**:
1. Export row counts from Supabase before migration
2. Import to Convex via JSONL
3. Verify counts match via Convex queries
4. Run referential integrity queries
5. Test key business flows

**Verification Script**:
```typescript
export const verifyMigration = internalQuery({
  handler: async (ctx) => {
    const counts = {
      users: await ctx.db.query("users").collect().length,
      businesses: await ctx.db.query("businesses").collect().length,
      // ... all tables
    };

    // Check expected counts
    const expected = { users: 3, businesses: 1, /* ... */ };

    return Object.entries(counts).map(([table, count]) => ({
      table,
      actual: count,
      expected: expected[table],
      match: count === expected[table]
    }));
  },
});
```

---

## Technology Stack Confirmed

| Component | Technology | Version |
|-----------|------------|---------|
| Database | Convex | Latest |
| Authentication | Clerk + @convex-dev/auth | Latest |
| File Storage | AWS S3 | SDK v3 |
| Real-time | Convex (native) | Native |
| Background Jobs | Trigger.dev v3 | 3.x |
| Payments | Stripe | SDK v20+ |
| Frontend | Next.js 15 | 15.4.6 |
| Language | TypeScript | 5.9+ |

---

## Risk Mitigations Confirmed

| Risk | Mitigation |
|------|------------|
| Data loss | JSONL exports preserve all data; count verification |
| Latency (SEA region) | Benchmark before full migration; Convex edge network |
| ID mismatches | Dual-index approach with flexible resolver |
| File storage gaps | Parallel storage during transition period |
| Real-time gaps | Convex native real-time is superior to Supabase |
| Query complexity | Convex indexes + efficient queries |

---

## Next Steps

1. **Phase 1**: Initialize Convex project, define schema.ts
2. **Phase 2**: Migrate core domain tables (users, businesses, memberships)
3. **Phase 3**: Migrate accounting tables (entries, line_items, expenses, invoices)
4. **Phase 4**: Migrate supporting tables (conversations, messages, vendors, stripe_events, ocr_usage)
5. **Phase 5**: Migrate file storage
6. **Phase 6**: Update all frontend queries to use Convex hooks
7. **Phase 7**: Update Trigger.dev and Stripe integrations
8. **Phase 8**: Verification and Supabase cleanup
