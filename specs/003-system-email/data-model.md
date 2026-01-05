# Data Model: Critical Transactional Emails

**Branch**: `003-system-email` | **Date**: 2026-01-04 | **Plan**: [plan.md](./plan.md)

## Overview

This document defines the Convex schema additions for the transactional email system. The design follows existing patterns from `convex/schema.ts` including multi-tenant isolation, soft deletes, and audit-style event tracking.

## Entity Relationship Diagram

```
┌──────────────────┐     ┌───────────────────────┐
│      users       │────→│   email_preferences   │
│                  │ 1:1 │                       │
└────────┬─────────┘     └───────────────────────┘
         │
         │ 1:many
         ▼
┌──────────────────┐     ┌───────────────────────┐
│   email_logs     │────→│  email_suppressions   │
│                  │     │                       │
└────────┬─────────┘     └───────────────────────┘
         │                         ▲
         │                         │ (bounces/complaints)
         ▼                         │
┌──────────────────┐               │
│workflow_executions│──────────────┘
│                  │
└──────────────────┘
```

---

## Schema Additions

### Table: `email_preferences`

**Purpose**: Store user-level email communication preferences for CAN-SPAM/GDPR compliance.

**Design Decision**: User-level (not business-level) because a user may belong to multiple businesses but their email preferences should be consistent.

```typescript
email_preferences: defineTable({
  // ─────────────────────────────────────────────
  // Identity - User level (NOT business level)
  // ─────────────────────────────────────────────
  userId: v.id("users"),

  // ─────────────────────────────────────────────
  // Marketing Preferences (user-controllable)
  // ─────────────────────────────────────────────
  marketingEnabled: v.boolean(),           // Default: true
  onboardingTipsEnabled: v.boolean(),      // Default: true (future drip sequences)
  productUpdatesEnabled: v.boolean(),      // Default: true

  // ─────────────────────────────────────────────
  // Global Unsubscribe (CAN-SPAM compliance)
  // ─────────────────────────────────────────────
  globalUnsubscribe: v.boolean(),          // Default: false
  unsubscribedAt: v.optional(v.number()),  // Unix timestamp when globally unsubscribed

  // ─────────────────────────────────────────────
  // Timestamps
  // ─────────────────────────────────────────────
  updatedAt: v.optional(v.number()),
})
  .index("by_userId", ["userId"]),
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `userId` | `Id<"users">` | Yes | - | Reference to user |
| `marketingEnabled` | `boolean` | Yes | `true` | Allow promotional emails |
| `onboardingTipsEnabled` | `boolean` | Yes | `true` | Allow onboarding drip emails |
| `productUpdatesEnabled` | `boolean` | Yes | `true` | Allow product update emails |
| `globalUnsubscribe` | `boolean` | Yes | `false` | Opt-out of ALL non-transactional emails |
| `unsubscribedAt` | `number?` | No | - | Timestamp of global unsubscribe |
| `updatedAt` | `number?` | No | - | Last modification timestamp |

**Note**: Transactional emails (payment failures, security alerts) are ALWAYS delivered regardless of preferences per CAN-SPAM regulations.

---

### Table: `email_logs`

**Purpose**: Track all email sends with delivery status for debugging, compliance auditing, and delivery metrics.

**Design Decision**: Follows `stripe_events` pattern with `sesMessageId` as idempotency key.

```typescript
email_logs: defineTable({
  // ─────────────────────────────────────────────
  // Identity (multi-tenant)
  // ─────────────────────────────────────────────
  businessId: v.optional(v.id("businesses")),  // Optional for system-level emails
  userId: v.optional(v.id("users")),           // Recipient user (if known)

  // ─────────────────────────────────────────────
  // SES Tracking
  // ─────────────────────────────────────────────
  sesMessageId: v.string(),                    // SES Message ID (idempotency key)
  configurationSet: v.string(),                // SES Configuration Set used

  // ─────────────────────────────────────────────
  // Email Details
  // ─────────────────────────────────────────────
  templateType: v.string(),                    // Email type identifier
  recipientEmail: v.string(),
  subject: v.string(),
  senderEmail: v.string(),

  // ─────────────────────────────────────────────
  // Delivery Status (updated by SNS handler)
  // ─────────────────────────────────────────────
  status: v.string(),                          // Current delivery status
  deliveredAt: v.optional(v.number()),
  bouncedAt: v.optional(v.number()),
  bounceType: v.optional(v.string()),          // "Permanent", "Transient"
  bounceSubType: v.optional(v.string()),       // "General", "NoEmail", "Suppressed"
  complainedAt: v.optional(v.number()),
  openedAt: v.optional(v.number()),
  clickedAt: v.optional(v.number()),

  // ─────────────────────────────────────────────
  // Metadata (debugging context)
  // ─────────────────────────────────────────────
  metadata: v.optional(v.any()),               // Workflow ID, request context, etc.

  // Convex adds _creationTime automatically (sent timestamp)
})
  .index("by_businessId", ["businessId"])
  .index("by_userId", ["userId"])
  .index("by_sesMessageId", ["sesMessageId"])
  .index("by_recipientEmail", ["recipientEmail"])
  .index("by_templateType", ["templateType"])
  .index("by_status", ["status"]),
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `businessId` | `Id<"businesses">?` | No | Business context (null for system emails) |
| `userId` | `Id<"users">?` | No | Recipient user ID |
| `sesMessageId` | `string` | Yes | AWS SES Message ID (unique) |
| `configurationSet` | `string` | Yes | SES config set (for routing) |
| `templateType` | `string` | Yes | Email type (see enum below) |
| `recipientEmail` | `string` | Yes | Recipient email address |
| `subject` | `string` | Yes | Email subject line |
| `senderEmail` | `string` | Yes | From email address |
| `status` | `string` | Yes | Delivery status (see enum below) |
| `deliveredAt` | `number?` | No | Delivery confirmation timestamp |
| `bouncedAt` | `number?` | No | Bounce timestamp |
| `bounceType` | `string?` | No | SES bounce type |
| `bounceSubType` | `string?` | No | SES bounce sub-type |
| `complainedAt` | `number?` | No | Spam complaint timestamp |
| `openedAt` | `number?` | No | First open timestamp |
| `clickedAt` | `number?` | No | First click timestamp |
| `metadata` | `any?` | No | Additional context |

**Template Types** (for `templateType` field):

```typescript
type EmailTemplateType =
  | 'welcome_new_user'      // New account welcome
  | 'welcome_team_member'   // Invited user welcome
  | 'invitation'            // Business invitation
  | 'onboarding_day1'       // Future: Day 1 tips (Phase 2)
  | 'onboarding_day3'       // Future: Day 3 tips (Phase 2)
  | 'onboarding_day7'       // Future: Day 7 tips (Phase 2)
  | 'password_reset'        // Security: password reset
  | 'email_verification';   // Security: email verification
```

**Status Values** (for `status` field):

```typescript
type EmailStatus =
  | 'sent'       // Successfully sent to SES
  | 'delivered'  // Confirmed delivered to recipient
  | 'bounced'    // Hard or soft bounce
  | 'complained' // Spam complaint received
  | 'rejected'   // SES rejected (suppression list, etc.)
  | 'opened'     // Recipient opened email
  | 'clicked';   // Recipient clicked a link
```

---

### Table: `email_suppressions`

**Purpose**: Track email addresses that should NOT receive emails due to bounces, complaints, or explicit unsubscribes.

**Design Decision**: Separate from `email_preferences` because suppressions apply to the email address itself (not the user), and addresses may not be linked to users.

```typescript
email_suppressions: defineTable({
  // ─────────────────────────────────────────────
  // Suppressed Email Address
  // ─────────────────────────────────────────────
  email: v.string(),                           // Lowercase, normalized email

  // ─────────────────────────────────────────────
  // Suppression Details
  // ─────────────────────────────────────────────
  reason: v.string(),                          // "bounce", "complaint", "unsubscribe"
  bounceType: v.optional(v.string()),          // For bounces: "Permanent", "Transient"
  bounceSubType: v.optional(v.string()),       // For bounces: specific reason

  // ─────────────────────────────────────────────
  // Source Tracking
  // ─────────────────────────────────────────────
  sourceMessageId: v.optional(v.string()),     // SES Message ID that caused suppression

  // ─────────────────────────────────────────────
  // Timestamps
  // ─────────────────────────────────────────────
  suppressedAt: v.number(),                    // When suppression was added
})
  .index("by_email", ["email"])
  .index("by_reason", ["reason"]),
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | `string` | Yes | Suppressed email (lowercase) |
| `reason` | `string` | Yes | Suppression reason |
| `bounceType` | `string?` | No | SES bounce type |
| `bounceSubType` | `string?` | No | SES bounce sub-type |
| `sourceMessageId` | `string?` | No | Message that triggered suppression |
| `suppressedAt` | `number` | Yes | Suppression timestamp |

**Important**: Before sending ANY email, check `email_suppressions` first!

---

### Table: `workflow_executions`

**Purpose**: Track Lambda Durable Function workflow state for monitoring and debugging.

**Design Decision**: Provides visibility into customer lifecycle stage without querying AWS directly. Enables admin dashboard showing onboarding progress.

```typescript
workflow_executions: defineTable({
  // ─────────────────────────────────────────────
  // Identity
  // ─────────────────────────────────────────────
  userId: v.id("users"),
  businessId: v.optional(v.id("businesses")),

  // ─────────────────────────────────────────────
  // Workflow Details
  // ─────────────────────────────────────────────
  workflowType: v.string(),                    // Workflow type identifier
  workflowArn: v.optional(v.string()),         // Lambda Durable Function ARN
  executionId: v.string(),                     // Svix webhook ID (idempotency key)

  // ─────────────────────────────────────────────
  // Status Tracking
  // ─────────────────────────────────────────────
  status: v.string(),                          // Overall workflow status
  currentStage: v.string(),                    // Current stage in workflow
  completedStages: v.array(v.string()),        // All completed stages

  // ─────────────────────────────────────────────
  // Timestamps
  // ─────────────────────────────────────────────
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  failedAt: v.optional(v.number()),
  errorMessage: v.optional(v.string()),

  // ─────────────────────────────────────────────
  // Metadata (debugging context)
  // ─────────────────────────────────────────────
  metadata: v.optional(v.any()),
})
  .index("by_userId", ["userId"])
  .index("by_businessId", ["businessId"])
  .index("by_workflowType", ["workflowType"])
  .index("by_status", ["status"])
  .index("by_executionId", ["executionId"]),
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | `Id<"users">` | Yes | User this workflow is for |
| `businessId` | `Id<"businesses">?` | No | Business context |
| `workflowType` | `string` | Yes | Workflow type (see below) |
| `workflowArn` | `string?` | No | Lambda function ARN |
| `executionId` | `string` | Yes | Svix webhook ID (`svix-id` header) for idempotency |
| `status` | `string` | Yes | Workflow status |
| `currentStage` | `string` | Yes | Current workflow stage |
| `completedStages` | `string[]` | Yes | Completed stages array |
| `startedAt` | `number` | Yes | Workflow start timestamp |
| `completedAt` | `number?` | No | Successful completion timestamp |
| `failedAt` | `number?` | No | Failure timestamp |
| `errorMessage` | `string?` | No | Error details if failed |
| `metadata` | `any?` | No | Additional context |

**Workflow Types**:

```typescript
type WorkflowType =
  | 'welcome_new_user'      // New signup welcome workflow
  | 'welcome_team_member';  // Invited user welcome workflow
  // Phase 2:
  // | 'onboarding_sequence'  // Multi-day onboarding drip
```

**Workflow Stages** (for welcome workflows):

```typescript
type WelcomeWorkflowStage =
  | 'started'               // Workflow initiated
  | 'welcome_sent'          // Welcome email sent
  | 'completed';            // Workflow finished
  // Phase 2 stages:
  // | 'day1_sent'
  // | 'day3_sent'
  // | 'day7_sent'
```

**Status Values**:

```typescript
type WorkflowStatus =
  | 'running'    // Actively executing
  | 'paused'     // Waiting (e.g., for delay)
  | 'completed'  // Successfully finished
  | 'failed';    // Failed with error
```

---

## Validators (for schema.ts)

Add to `convex/lib/validators.ts`:

```typescript
// Email template types
export const emailTemplateTypeValidator = v.union(
  v.literal("welcome_new_user"),
  v.literal("welcome_team_member"),
  v.literal("invitation"),
  v.literal("onboarding_day1"),
  v.literal("onboarding_day3"),
  v.literal("onboarding_day7"),
  v.literal("password_reset"),
  v.literal("email_verification")
);

// Email delivery status
export const emailStatusValidator = v.union(
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("bounced"),
  v.literal("complained"),
  v.literal("rejected"),
  v.literal("opened"),
  v.literal("clicked")
);

// Email suppression reason
export const emailSuppressionReasonValidator = v.union(
  v.literal("bounce"),
  v.literal("complaint"),
  v.literal("unsubscribe")
);

// Workflow types
export const workflowTypeValidator = v.union(
  v.literal("welcome_new_user"),
  v.literal("welcome_team_member")
);

// Workflow status
export const workflowStatusValidator = v.union(
  v.literal("running"),
  v.literal("paused"),
  v.literal("completed"),
  v.literal("failed")
);
```

---

## Migration Strategy

### New Tables (No Migration Needed)

All four tables are new additions:
- `email_preferences`
- `email_logs`
- `email_suppressions`
- `workflow_executions`

### Resend Migration

Existing invitation emails use Resend. Migration steps:

1. **Add SES email service** alongside Resend
2. **Feature flag** to switch email provider
3. **Dual-write period**: Send via both, compare delivery
4. **Remove Resend** after validation

No data migration needed - email logs start fresh with SES.

---

## Access Patterns

### Common Queries

```typescript
// 1. Check suppression before sending
const suppression = await ctx.db
  .query("email_suppressions")
  .withIndex("by_email", q => q.eq("email", email.toLowerCase()))
  .first();

// 2. Get user preferences (with defaults)
const prefs = await ctx.db
  .query("email_preferences")
  .withIndex("by_userId", q => q.eq("userId", userId))
  .first() ?? {
    marketingEnabled: true,
    onboardingTipsEnabled: true,
    productUpdatesEnabled: true,
    globalUnsubscribe: false,
  };

// 3. Get workflow status for user
const workflow = await ctx.db
  .query("workflow_executions")
  .withIndex("by_userId", q => q.eq("userId", userId))
  .filter(q => q.eq(q.field("workflowType"), "welcome_new_user"))
  .first();

// 4. Get email delivery stats for business
const emails = await ctx.db
  .query("email_logs")
  .withIndex("by_businessId", q => q.eq("businessId", businessId))
  .collect();

// 5. Find bounced emails for cleanup
const bounced = await ctx.db
  .query("email_logs")
  .withIndex("by_status", q => q.eq("status", "bounced"))
  .collect();
```

---

## Indexes Rationale

| Table | Index | Purpose |
|-------|-------|---------|
| `email_preferences` | `by_userId` | Lookup preferences by user |
| `email_logs` | `by_businessId` | Filter logs by business (admin view) |
| `email_logs` | `by_userId` | Filter logs by recipient user |
| `email_logs` | `by_sesMessageId` | Idempotent updates from SNS |
| `email_logs` | `by_recipientEmail` | Find all emails to address |
| `email_logs` | `by_templateType` | Filter by email type (analytics) |
| `email_logs` | `by_status` | Filter by delivery status |
| `email_suppressions` | `by_email` | Check suppression before send |
| `email_suppressions` | `by_reason` | Analyze suppression causes |
| `workflow_executions` | `by_userId` | Find user's workflows |
| `workflow_executions` | `by_businessId` | Find business workflows |
| `workflow_executions` | `by_workflowType` | Filter by workflow type |
| `workflow_executions` | `by_status` | Find running/failed workflows |
| `workflow_executions` | `by_executionId` | **Idempotency check** - prevent duplicate webhook processing |
