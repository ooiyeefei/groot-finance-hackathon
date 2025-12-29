# Convex Query Contracts

**Branch**: `001-db-revamp` | **Date**: 2024-12-29

This document defines the Convex query function signatures that will replace Supabase RPC functions and direct queries.

---

## Authentication Pattern

All queries follow this authentication pattern:

```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";

// Helper to get authenticated user with business context
async function getAuthenticatedUser(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();

  if (!user) throw new Error("User not found");
  return user;
}
```

---

## User Queries

### `users.getByClerkId`
**Replaces**: `getUserData()` in `supabase-server.ts`

```typescript
export const getByClerkId = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    if (!user) return null;

    // Join with business for home_currency
    let homeCurrency = "SGD";
    if (user.businessId) {
      const business = await ctx.db.get(user.businessId);
      homeCurrency = business?.homeCurrency ?? "SGD";
    }

    return {
      id: user._id,
      businessId: user.businessId,
      homeCurrency,
      preferredCurrency: user.preferredCurrency,
      email: user.email,
      fullName: user.fullName,
    };
  },
});
```

### `users.getById`
```typescript
export const getById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});
```

---

## Business Queries

### `businesses.getCurrent`
**Replaces**: Business context resolution

```typescript
export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user.businessId) return null;
    return await ctx.db.get(user.businessId);
  },
});
```

### `businesses.getBySlug`
```typescript
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});
```

---

## Expense Claims Queries

### `expenseClaims.list`
**Replaces**: Supabase query with RLS

```typescript
export const list = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user.businessId) return [];

    let query = ctx.db
      .query("expenseClaims")
      .withIndex("by_business_id", (q) => q.eq("businessId", user.businessId));

    if (args.status) {
      query = query.filter((q) => q.eq(q.field("status"), args.status));
    }

    const claims = await query
      .order("desc")
      .take(args.limit ?? 50);

    return claims.filter((c) => !c.deletedAt);
  },
});
```

### `expenseClaims.getById`
```typescript
export const getById = query({
  args: { claimId: v.id("expenseClaims") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const claim = await ctx.db.get(args.claimId);

    if (!claim || claim.businessId !== user.businessId) {
      throw new Error("Expense claim not found");
    }

    return claim;
  },
});
```

### `expenseClaims.getSummary`
**Replaces**: `get_expense_claims_summary` RPC

```typescript
export const getSummary = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user.businessId) return null;

    const claims = await ctx.db
      .query("expenseClaims")
      .withIndex("by_business_id", (q) => q.eq("businessId", user.businessId))
      .collect();

    const activeClaims = claims.filter((c) => !c.deletedAt);

    return {
      total: activeClaims.length,
      draft: activeClaims.filter((c) => c.status === "draft").length,
      submitted: activeClaims.filter((c) => c.status === "submitted").length,
      approved: activeClaims.filter((c) => c.status === "approved").length,
      rejected: activeClaims.filter((c) => c.status === "rejected").length,
      reimbursed: activeClaims.filter((c) => c.status === "reimbursed").length,
      totalAmount: activeClaims
        .filter((c) => c.status === "approved" || c.status === "reimbursed")
        .reduce((sum, c) => sum + (c.homeCurrencyAmount ?? 0), 0),
    };
  },
});
```

---

## Invoice Queries

### `invoices.list`
```typescript
export const list = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user.businessId) return [];

    let query = ctx.db
      .query("invoices")
      .withIndex("by_business_id", (q) => q.eq("businessId", user.businessId));

    const invoices = await query
      .order("desc")
      .take(args.limit ?? 50);

    return invoices.filter((i) => !i.deletedAt);
  },
});
```

### `invoices.getWithLinkedTransactions`
**Replaces**: `get_invoices_with_linked_transactions` RPC

```typescript
export const getWithLinkedTransactions = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const invoice = await ctx.db.get(args.invoiceId);

    if (!invoice || invoice.businessId !== user.businessId) {
      throw new Error("Invoice not found");
    }

    // Find linked accounting entry
    const linkedEntry = await ctx.db
      .query("accountingEntries")
      .withIndex("by_source_record", (q) =>
        q.eq("sourceRecordId", args.invoiceId).eq("sourceDocumentType", "invoice")
      )
      .unique();

    // Get line items if entry exists
    let lineItems: Doc<"lineItems">[] = [];
    if (linkedEntry) {
      lineItems = await ctx.db
        .query("lineItems")
        .withIndex("by_accounting_entry_id", (q) =>
          q.eq("accountingEntryId", linkedEntry._id)
        )
        .collect();
    }

    return {
      invoice,
      accountingEntry: linkedEntry,
      lineItems,
    };
  },
});
```

---

## Accounting Entries Queries

### `accountingEntries.list`
```typescript
export const list = query({
  args: {
    transactionType: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user.businessId) return [];

    const entries = await ctx.db
      .query("accountingEntries")
      .withIndex("by_business_id", (q) => q.eq("businessId", user.businessId))
      .order("desc")
      .take(args.limit ?? 100);

    return entries
      .filter((e) => !e.deletedAt)
      .filter((e) => !args.transactionType || e.transactionType === args.transactionType)
      .filter((e) => !args.startDate || e.transactionDate >= args.startDate)
      .filter((e) => !args.endDate || e.transactionDate <= args.endDate);
  },
});
```

### `accountingEntries.getWithLineItems`
```typescript
export const getWithLineItems = query({
  args: { entryId: v.id("accountingEntries") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const entry = await ctx.db.get(args.entryId);

    if (!entry || entry.businessId !== user.businessId) {
      throw new Error("Accounting entry not found");
    }

    const lineItems = await ctx.db
      .query("lineItems")
      .withIndex("by_accounting_entry_id", (q) =>
        q.eq("accountingEntryId", args.entryId)
      )
      .collect();

    return { entry, lineItems: lineItems.filter((li) => !li.deletedAt) };
  },
});
```

---

## Analytics Queries

### `analytics.getDashboard`
**Replaces**: `get_dashboard_analytics` RPC

```typescript
export const getDashboard = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user.businessId) return null;

    const entries = await ctx.db
      .query("accountingEntries")
      .withIndex("by_business_id", (q) => q.eq("businessId", user.businessId))
      .collect();

    const filteredEntries = entries
      .filter((e) => !e.deletedAt)
      .filter((e) => e.transactionDate >= args.startDate)
      .filter((e) => e.transactionDate <= args.endDate);

    const income = filteredEntries
      .filter((e) => e.transactionType === "Income")
      .reduce((sum, e) => sum + (e.homeCurrencyAmount ?? 0), 0);

    const cogs = filteredEntries
      .filter((e) => e.transactionType === "Cost of Goods Sold")
      .reduce((sum, e) => sum + (e.homeCurrencyAmount ?? 0), 0);

    const expenses = filteredEntries
      .filter((e) => e.transactionType === "Expense")
      .reduce((sum, e) => sum + (e.homeCurrencyAmount ?? 0), 0);

    return {
      income,
      cogs,
      expenses,
      grossProfit: income - cogs,
      netProfit: income - cogs - expenses,
      transactionCount: filteredEntries.length,
    };
  },
});
```

---

## Conversation Queries

### `conversations.listOptimized`
**Replaces**: `list_conversations_optimized` RPC

```typescript
export const listOptimized = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_user_id", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .take(args.limit ?? 20);

    // Get last message for each conversation
    const result = await Promise.all(
      conversations
        .filter((c) => !c.deletedAt)
        .map(async (conv) => {
          const lastMessage = await ctx.db
            .query("messages")
            .withIndex("by_conversation_id", (q) =>
              q.eq("conversationId", conv._id)
            )
            .order("desc")
            .first();

          return {
            ...conv,
            lastMessage: lastMessage?.content?.substring(0, 100),
            lastMessageAt: lastMessage?.createdAt,
          };
        })
    );

    return result;
  },
});
```

---

## Team Management Queries

### `businessMemberships.getManagerTeam`
**Replaces**: `get_manager_team_employees` RPC

```typescript
export const getManagerTeam = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user.businessId) return [];

    // Get manager's membership to verify role
    const myMembership = await ctx.db
      .query("businessMemberships")
      .withIndex("by_user_and_business", (q) =>
        q.eq("userId", user._id).eq("businessId", user.businessId)
      )
      .unique();

    if (!myMembership || myMembership.role === "employee") {
      return [];
    }

    // Get team members
    const teamMemberships = await ctx.db
      .query("businessMemberships")
      .withIndex("by_business_id", (q) => q.eq("businessId", user.businessId))
      .collect();

    // If admin, return all; if manager, return direct reports
    const filteredMemberships = myMembership.role === "admin"
      ? teamMemberships
      : teamMemberships.filter((m) => m.managerId === user._id);

    // Join with user data
    const team = await Promise.all(
      filteredMemberships.map(async (m) => {
        const memberUser = await ctx.db.get(m.userId);
        return {
          membership: m,
          user: memberUser,
        };
      })
    );

    return team.filter((t) => t.user && t.membership.status === "active");
  },
});
```

---

## OCR Usage Queries

### `ocrUsage.getMonthly`
**Replaces**: `get_monthly_ocr_usage` RPC

```typescript
export const getMonthly = query({
  args: { periodStart: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user.businessId) return null;

    const usage = await ctx.db
      .query("ocrUsage")
      .withIndex("by_business_and_period", (q) =>
        q.eq("businessId", user.businessId).eq("periodStart", args.periodStart)
      )
      .collect();

    return {
      totalCredits: usage.reduce((sum, u) => sum + u.creditsUsed, 0),
      totalTokens: usage.reduce((sum, u) => sum + (u.tokensUsed ?? 0), 0),
      documentCount: usage.length,
    };
  },
});
```

---

## Vendor Queries

### `vendors.search`
**Uses Convex full-text search**

```typescript
export const search = query({
  args: {
    searchTerm: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user.businessId) return [];

    return await ctx.db
      .query("vendors")
      .withSearchIndex("search_name", (q) =>
        q.search("name", args.searchTerm)
         .eq("businessId", user.businessId)
      )
      .take(args.limit ?? 10);
  },
});
```

---

## Summary of RPC Replacements

| Supabase RPC | Convex Query |
|--------------|--------------|
| `get_dashboard_analytics` | `analytics.getDashboard` |
| `get_expense_claims_summary` | `expenseClaims.getSummary` |
| `get_invoices_with_linked_transactions` | `invoices.getWithLinkedTransactions` |
| `get_manager_team_employees` | `businessMemberships.getManagerTeam` |
| `get_monthly_ocr_usage` | `ocrUsage.getMonthly` |
| `list_conversations_optimized` | `conversations.listOptimized` |
| `get_user_business_id` | `users.getByClerkId` (businessId field) |
| `get_jwt_claim` | Not needed (Convex handles JWT) |
