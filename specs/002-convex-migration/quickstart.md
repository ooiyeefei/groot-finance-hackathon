# Quickstart: Convex Migration

**Branch**: `002-convex-migration` | **Date**: 2025-12-29

## Prerequisites

- Node.js 18+
- npm or pnpm
- Convex account (https://dashboard.convex.dev)
- Existing FinanSEAL codebase on `002-convex-migration` branch

---

## Phase 1: Convex Project Setup

### 1.1 Install Convex Dependencies

```bash
cd /home/fei/fei/code/finanseal-cc/db-revamp

# Install Convex
npm install convex

# Install Convex dev dependencies
npm install -D @convex-dev/auth
```

### 1.2 Initialize Convex Project

```bash
# Login to Convex
npx convex login

# Initialize project (creates convex/ directory)
npx convex init
```

This creates:
- `convex/` directory
- `convex.json` configuration

### 1.3 Link to Convex Dashboard

```bash
# Create new project or link existing
npx convex dev
```

Follow prompts to:
1. Create new project: "finanseal-production"
2. Select team/organization
3. Configure environment

---

## Phase 2: Schema Definition

### 2.1 Create Schema File

Copy the schema from `specs/002-convex-migration/data-model.md` to:

```bash
# Create schema file
touch convex/schema.ts
```

### 2.2 Deploy Schema

```bash
# Push schema to Convex
npx convex dev

# In another terminal, verify schema in dashboard
open https://dashboard.convex.dev
```

---

## Phase 3: Configure Clerk Authentication

### 3.1 Add Clerk Provider to Convex

In Convex Dashboard:
1. Go to Settings → Authentication
2. Add Clerk as auth provider
3. Enter Clerk domain: `your-clerk-domain.clerk.accounts.dev`
4. Copy JWT template settings

### 3.2 Update Next.js Provider

```typescript
// src/app/providers.tsx
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
```

### 3.3 Add Environment Variables

```bash
# .env.local
NEXT_PUBLIC_CONVEX_URL=https://your-project.convex.cloud
CONVEX_DEPLOYMENT=your-deployment-name
```

---

## Phase 4: Data Migration

### 4.1 Export from Supabase

```bash
# Connect to Supabase and export each table
psql $SUPABASE_DB_URL

# Users
\copy ( SELECT row_to_json(t) FROM (SELECT * FROM users) t ) TO '/tmp/users.jsonl';

# Businesses
\copy ( SELECT row_to_json(t) FROM (SELECT * FROM businesses) t ) TO '/tmp/businesses.jsonl';

# Business Memberships
\copy ( SELECT row_to_json(t) FROM (SELECT * FROM business_memberships) t ) TO '/tmp/business_memberships.jsonl';

# Accounting Entries
\copy ( SELECT row_to_json(t) FROM (SELECT * FROM accounting_entries) t ) TO '/tmp/accounting_entries.jsonl';

# Line Items
\copy ( SELECT row_to_json(t) FROM (SELECT * FROM line_items) t ) TO '/tmp/line_items.jsonl';

# Expense Claims
\copy ( SELECT row_to_json(t) FROM (SELECT * FROM expense_claims) t ) TO '/tmp/expense_claims.jsonl';

# Invoices
\copy ( SELECT row_to_json(t) FROM (SELECT * FROM invoices) t ) TO '/tmp/invoices.jsonl';

# Conversations
\copy ( SELECT row_to_json(t) FROM (SELECT * FROM conversations) t ) TO '/tmp/conversations.jsonl';

# Messages
\copy ( SELECT row_to_json(t) FROM (SELECT * FROM messages) t ) TO '/tmp/messages.jsonl';

# Vendors
\copy ( SELECT row_to_json(t) FROM (SELECT * FROM vendors) t ) TO '/tmp/vendors.jsonl';

# Stripe Events
\copy ( SELECT row_to_json(t) FROM (SELECT * FROM stripe_events) t ) TO '/tmp/stripe_events.jsonl';

# OCR Usage
\copy ( SELECT row_to_json(t) FROM (SELECT * FROM ocr_usage) t ) TO '/tmp/ocr_usage.jsonl';
```

### 4.2 Transform Data for Convex

Create migration script to transform field names:

```typescript
// scripts/transform-migration-data.ts
import * as fs from 'fs';

function transformUser(row: any) {
  return {
    legacyId: row.id,
    clerkUserId: row.clerk_user_id,
    email: row.email,
    fullName: row.full_name,
    businessId: row.business_id, // Will be updated after business import
    homeCurrency: row.home_currency || "MYR",
    department: row.department,
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function transformBusiness(row: any) {
  return {
    legacyId: row.id,
    name: row.name,
    taxId: row.tax_id,
    address: row.address,
    contactEmail: row.contact_email,
    homeCurrency: row.home_currency || "MYR",
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    subscriptionStatus: row.subscription_status,
    subscriptionPlan: row.subscription_plan,
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

// ... similar functions for other tables

// Main execution
const inputFile = process.argv[2];
const outputFile = process.argv[3];
const tableName = process.argv[4];

const transformers: Record<string, Function> = {
  users: transformUser,
  businesses: transformBusiness,
  // ... add others
};

const input = fs.readFileSync(inputFile, 'utf-8');
const lines = input.trim().split('\n');
const transformed = lines.map(line => {
  const row = JSON.parse(line);
  return JSON.stringify(transformers[tableName](row));
}).join('\n');

fs.writeFileSync(outputFile, transformed);
console.log(`Transformed ${lines.length} rows for ${tableName}`);
```

### 4.3 Import to Convex

```bash
# Import order matters due to relationships

# 1. Businesses first (no dependencies)
npx convex import --format jsonLines --table businesses /tmp/businesses_transformed.jsonl

# 2. Users (depends on businesses)
npx convex import --format jsonLines --table users /tmp/users_transformed.jsonl

# 3. Business Memberships (depends on users, businesses)
npx convex import --format jsonLines --table business_memberships /tmp/business_memberships_transformed.jsonl

# 4. Accounting Entries
npx convex import --format jsonLines --table accounting_entries /tmp/accounting_entries_transformed.jsonl

# 5. Line Items (depends on accounting_entries)
npx convex import --format jsonLines --table line_items /tmp/line_items_transformed.jsonl

# 6. Expense Claims
npx convex import --format jsonLines --table expense_claims /tmp/expense_claims_transformed.jsonl

# 7. Invoices
npx convex import --format jsonLines --table invoices /tmp/invoices_transformed.jsonl

# 8. Conversations
npx convex import --format jsonLines --table conversations /tmp/conversations_transformed.jsonl

# 9. Messages (depends on conversations)
npx convex import --format jsonLines --table messages /tmp/messages_transformed.jsonl

# 10. Vendors
npx convex import --format jsonLines --table vendors /tmp/vendors_transformed.jsonl

# 11. Stripe Events
npx convex import --format jsonLines --table stripe_events /tmp/stripe_events_transformed.jsonl

# 12. OCR Usage
npx convex import --format jsonLines --table ocr_usage /tmp/ocr_usage_transformed.jsonl
```

---

## Phase 5: Update ID References

After import, run a migration to update legacy ID references to Convex IDs:

```typescript
// convex/migrations/updateIdReferences.ts
import { internalMutation } from "../_generated/server";

export const updateUserBusinessIds = internalMutation({
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();

    for (const user of users) {
      if (user.businessId && typeof user.businessId === "string") {
        // Find business by legacy ID
        const business = await ctx.db
          .query("businesses")
          .withIndex("by_legacyId", q => q.eq("legacyId", user.businessId as string))
          .unique();

        if (business) {
          await ctx.db.patch(user._id, { businessId: business._id });
        }
      }
    }

    return { updated: users.length };
  },
});
```

---

## Phase 6: File Storage Migration (Supabase → S3)

### 6.1 Create S3 Bucket

```bash
# AWS CLI - Create bucket in Singapore region
aws s3api create-bucket \
  --bucket finanseal-documents \
  --region ap-southeast-1 \
  --create-bucket-configuration LocationConstraint=ap-southeast-1

# Enable versioning for audit trails
aws s3api put-bucket-versioning \
  --bucket finanseal-documents \
  --versioning-configuration Status=Enabled
```

### 6.2 Set Up S3 Client

```typescript
// src/lib/s3-client.ts
import { S3Client, PutObjectCommand, GetObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-southeast-1",
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
    Key: path,
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

### 6.3 Migrate Files from Supabase to S3

```typescript
// scripts/migrate-storage-to-s3.ts
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME!;

async function migrateSupabaseBucket(supabaseBucket: string, s3Prefix: string) {
  const { data: files, error } = await supabase.storage.from(supabaseBucket).list('', {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' }
  });

  if (error) {
    console.error(`Error listing ${supabaseBucket}:`, error);
    return;
  }

  for (const file of files || []) {
    // Download from Supabase
    const { data: fileData } = await supabase.storage
      .from(supabaseBucket)
      .download(file.name);

    if (fileData) {
      // Upload to S3 with same path structure
      const s3Key = `${s3Prefix}/${file.name}`;
      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: Buffer.from(await fileData.arrayBuffer()),
        ContentType: file.metadata?.mimetype || 'application/octet-stream',
      }));
      console.log(`Migrated: ${supabaseBucket}/${file.name} → s3://${BUCKET_NAME}/${s3Key}`);
    }
  }
}

// Migrate all buckets preserving path structure
await migrateSupabaseBucket('invoices', 'invoices');
await migrateSupabaseBucket('expense_claims', 'expense_claims');
await migrateSupabaseBucket('business-logos', 'business-logos');
```

### 6.4 Environment Variables

```bash
# .env.local
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET_NAME=finanseal-documents
```

---

## Phase 7: Verification

### 7.1 Count Verification

```typescript
// convex/admin/verify.ts
import { query } from "../_generated/server";

export const verifyCounts = query({
  handler: async (ctx) => {
    const expected = {
      users: 3,
      businesses: 1,
      business_memberships: 0,
      accounting_entries: 3,
      line_items: 24,
      expense_claims: 24,
      invoices: 2,
      conversations: 1,
      messages: 2,
      vendors: 0,
      stripe_events: 0,
      ocr_usage: 0,
    };

    const actual = {
      users: (await ctx.db.query("users").collect()).length,
      businesses: (await ctx.db.query("businesses").collect()).length,
      business_memberships: (await ctx.db.query("business_memberships").collect()).length,
      accounting_entries: (await ctx.db.query("accounting_entries").collect()).length,
      line_items: (await ctx.db.query("line_items").collect()).length,
      expense_claims: (await ctx.db.query("expense_claims").collect()).length,
      invoices: (await ctx.db.query("invoices").collect()).length,
      conversations: (await ctx.db.query("conversations").collect()).length,
      messages: (await ctx.db.query("messages").collect()).length,
      vendors: (await ctx.db.query("vendors").collect()).length,
      stripe_events: (await ctx.db.query("stripe_events").collect()).length,
      ocr_usage: (await ctx.db.query("ocr_usage").collect()).length,
    };

    return Object.entries(actual).map(([table, count]) => ({
      table,
      expected: expected[table as keyof typeof expected],
      actual: count,
      match: count === expected[table as keyof typeof expected],
    }));
  },
});
```

### 7.2 Run Build

```bash
npm run build
```

---

## Directory Structure After Setup

```
db-revamp/
├── convex/
│   ├── _generated/          # Auto-generated (don't edit)
│   │   ├── api.d.ts
│   │   ├── api.js
│   │   ├── dataModel.d.ts
│   │   └── server.d.ts
│   ├── schema.ts            # Schema definition
│   ├── types.ts             # Type exports
│   ├── functions/
│   │   ├── users.ts         # User queries/mutations
│   │   ├── businesses.ts    # Business management
│   │   ├── expenses.ts      # Expense claims
│   │   ├── accounting.ts    # Accounting entries
│   │   ├── invoices.ts      # Document processing
│   │   ├── chat.ts          # Conversations/messages
│   │   └── billing.ts       # Stripe integration
│   ├── http.ts              # HTTP actions (webhooks)
│   └── migrations/          # Data migration scripts
├── convex.json              # Convex configuration
└── .env.local               # Environment variables
```

---

## Common Commands

```bash
# Start development server (watches for changes)
npx convex dev

# Deploy to production
npx convex deploy

# View logs
npx convex logs

# Run a function manually
npx convex run admin/verify:verifyCounts

# Import data
npx convex import --format jsonLines --table tableName /path/to/data.jsonl

# Export data
npx convex export --path /path/to/export
```

---

## Troubleshooting

### Schema Push Fails
```bash
# Clear and retry
npx convex dev --clear
```

### Import Fails on Relationships
```bash
# Import with --replace flag
npx convex import --format jsonLines --replace --table tableName /path/to/data.jsonl
```

### Authentication Issues
1. Check Clerk domain in Convex dashboard
2. Verify JWT template configuration
3. Ensure `useAuth` is passed to ConvexProviderWithClerk

### Real-time Not Working
1. Verify `useQuery` is used (not `fetch`)
2. Check ConvexProvider is wrapping the component
3. Inspect network tab for WebSocket connection
