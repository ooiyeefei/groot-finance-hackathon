# Research: Critical Transactional Emails

**Branch**: `003-system-email` | **Date**: 2026-01-04 | **Plan**: [plan.md](./plan.md)

## Executive Summary

This research resolves the 5 unknowns identified in Phase 0 planning. Key findings:

1. **Lambda Durable Functions** - Use `context.step()` for checkpointing, `context.wait()` for delays
2. **Clerk Webhooks** - Use Svix-based `verifyWebhook()` (NOT IAM SigV4) - plan.md needs update
3. **SES via CDK** - `ses.EmailIdentity` with `Identity.domain()` auto-handles DKIM/SPF
4. **SES SNS Notifications** - Use `ConfigurationSet.addEventDestination()` with SNS topic
5. **Convex Schema** - Follow existing `audit_events` and `stripe_events` patterns

**Critical Finding**: Clerk webhooks use Svix signatures, not AWS IAM SigV4. The architecture must change from "API Gateway with IAM auth" to "Next.js API route with Svix verification".

---

## 1. AWS Lambda Durable Functions Patterns

### Overview

AWS Lambda Durable Functions (December 2025) provide long-running workflow orchestration with automatic checkpointing. Key capabilities:

- **Max execution**: 1 year (sufficient for onboarding drip sequences)
- **Checkpointing**: Automatic state persistence via `context.step()`
- **Delays**: Built-in `context.wait()` for scheduled resumption

### Workflow Design Pattern

```typescript
// lambda/welcome-workflow/index.ts
import { Handler, Context } from 'aws-lambda';

export const handler: Handler = async (event, context: Context) => {
  // Step 1: Send welcome email (checkpointed)
  const welcomeResult = await context.step('send-welcome-email', async () => {
    return await sendWelcomeEmail(event.userId, event.email);
  });

  // Checkpoint: Workflow can resume from here if interrupted
  await context.step('checkpoint-welcome-sent', async () => {
    return { stage: 'welcome_sent', timestamp: Date.now() };
  });

  // Future Phase 2: Wait for Day 1 drip
  // await context.wait('day-1-delay', { seconds: 86400 });
  // await context.step('send-day-1-tips', async () => {...});

  return {
    workflowId: event.workflowId,
    status: 'completed',
    stages: ['welcome_sent']
  };
};
```

### Best Practices

1. **Idempotent Steps**: Each `context.step()` should be idempotent (safe to retry)
2. **Granular Checkpoints**: Break workflow into small steps for better recovery
3. **Error Handling**: Use try-catch within steps, workflow engine handles retries
4. **State Monitoring**: Use CloudWatch metrics for `DurableFunctionExecutionTime`

### CDK Configuration

```typescript
// infra/lib/constructs/durable-workflow.ts
import * as lambda from 'aws-cdk-lib/aws-lambda';

const welcomeWorkflow = new lambda.Function(this, 'WelcomeWorkflow', {
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('../lambda/welcome-workflow'),
  timeout: Duration.minutes(15), // Per-invocation timeout
  memorySize: 256,
  environment: {
    CONVEX_URL: process.env.CONVEX_URL!,
    SES_CONFIGURATION_SET: configSet.configurationSetName,
  },
  // Enable Durable Functions
  durableFunction: {
    enabled: true,
    maxDuration: Duration.days(365), // 1 year max
  },
});
```

---

## 2. Clerk Webhook Security (UPDATED)

### Critical Finding

**Clerk does NOT support AWS IAM SigV4 signing**. Clerk uses [Svix](https://www.svix.com/) for webhook delivery with HMAC-SHA256 signatures.

### Verification Approach

Clerk provides built-in verification utilities via `@clerk/nextjs/webhooks`:

```typescript
// src/app/api/webhooks/clerk/route.ts
import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // Automatically reads CLERK_WEBHOOK_SIGNING_SECRET from env
    const evt = await verifyWebhook(req);

    const { id } = evt.data;
    const eventType = evt.type;

    if (evt.type === 'user.created') {
      // Trigger Lambda Durable Function for welcome workflow
      await triggerWelcomeWorkflow(evt.data);
    }

    return new Response('Success', { status: 200 });
  } catch (err) {
    console.error('Webhook verification failed:', err);
    return new Response('Webhook verification failed', { status: 400 });
  }
}
```

### Webhook Headers

Clerk sends three Svix headers for verification:

| Header | Purpose |
|--------|---------|
| `svix-id` | Unique event ID for replay protection |
| `svix-timestamp` | Event timestamp for signature verification |
| `svix-signature` | HMAC-SHA256 signature of payload |

### Architecture Revision Required

**Original Plan**: API Gateway + IAM Auth → Lambda
**Revised Plan**: Next.js API Route + Svix Verification → AWS SDK → Lambda

```
Clerk Webhook → Next.js API Route (Vercel) → AWS SDK invokeLambda() → Lambda Durable Function
                     ↓
              verifyWebhook() validates Svix signature
```

This approach:
- Uses Clerk's built-in security (Svix)
- Leverages existing Next.js infrastructure on Vercel
- Invokes Lambda via AWS SDK with IAM credentials

### Environment Variables

```bash
# .env.local
CLERK_WEBHOOK_SIGNING_SECRET=whsec_xxxxxxxxxxxx  # From Clerk Dashboard

# AWS credentials for Lambda invocation
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-west-2
```

---

## 3. SES Domain Verification via CDK

### CDK Implementation

```typescript
// infra/lib/constructs/ses-domain.ts
import * as ses from 'aws-cdk-lib/aws-ses';
import * as route53 from 'aws-cdk-lib/aws-route53';

// Option A: With Route53 Hosted Zone (automatic DNS records)
const hostedZone = route53.HostedZone.fromLookup(this, 'Zone', {
  domainName: 'hellogroot.com',
});

const emailIdentity = new ses.EmailIdentity(this, 'EmailIdentity', {
  identity: ses.Identity.publicHostedZone(hostedZone),
  mailFromDomain: 'mail.notifications.hellogroot.com',
});

// Option B: Manual DNS (for external DNS providers)
const manualIdentity = new ses.EmailIdentity(this, 'ManualIdentity', {
  identity: ses.Identity.domain('notifications.hellogroot.com'),
});

// Output DKIM records for manual DNS setup
for (const record of manualIdentity.dkimRecords) {
  new CfnOutput(this, `DkimRecord${record.name}`, {
    value: `CNAME: ${record.name} -> ${record.value}`,
  });
}
```

### DKIM/SPF Auto-Configuration

CDK's `ses.EmailIdentity` with `Identity.domain()` automatically:

1. **Enables Easy DKIM** - 2048-bit DKIM signing
2. **Creates CNAME records** - 3 DKIM CNAME records (if using Route53)
3. **Configures MAIL FROM** - Custom return-path domain

### DNS Records Required (Manual Setup)

If not using Route53, add these DNS records:

```
# DKIM Records (3 CNAMEs)
[selector1]._domainkey.notifications.hellogroot.com CNAME [dkim-tokens].dkim.amazonses.com
[selector2]._domainkey.notifications.hellogroot.com CNAME [dkim-tokens].dkim.amazonses.com
[selector3]._domainkey.notifications.hellogroot.com CNAME [dkim-tokens].dkim.amazonses.com

# SPF Record (if using custom MAIL FROM)
mail.notifications.hellogroot.com TXT "v=spf1 include:amazonses.com ~all"
mail.notifications.hellogroot.com MX 10 feedback-smtp.us-west-2.amazonses.com
```

### Grant Permissions to Lambda

```typescript
// Grant Lambda permission to send emails
emailIdentity.grantSendEmail(welcomeWorkflowLambda);
```

---

## 4. SES SNS Delivery Notifications

### Configuration Set with SNS Events

```typescript
// infra/lib/system-email-stack.ts
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';

// Create SNS Topic for delivery events
const emailEventsTopic = new sns.Topic(this, 'EmailEventsTopic', {
  displayName: 'SES Email Delivery Events',
});

// Create Configuration Set
const configSet = new ses.ConfigurationSet(this, 'EmailConfigSet', {
  configurationSetName: 'finanseal-transactional',
  reputationMetrics: true,
  sendingEnabled: true,
});

// Add SNS destination for all event types
configSet.addEventDestination('ToSns', {
  destination: ses.EventDestination.snsTopic(emailEventsTopic),
  events: [
    ses.EmailSendingEvent.SEND,
    ses.EmailSendingEvent.DELIVERY,
    ses.EmailSendingEvent.BOUNCE,
    ses.EmailSendingEvent.COMPLAINT,
    ses.EmailSendingEvent.REJECT,
    ses.EmailSendingEvent.OPEN,
    ses.EmailSendingEvent.CLICK,
  ],
});

// Lambda to process delivery events
const deliveryHandler = new lambda.Function(this, 'DeliveryHandler', {
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('../lambda/delivery-handler'),
});

// Subscribe Lambda to SNS topic
emailEventsTopic.addSubscription(
  new snsSubscriptions.LambdaSubscription(deliveryHandler)
);
```

### Delivery Handler Lambda

```typescript
// lambda/delivery-handler/index.ts
import { SNSEvent } from 'aws-lambda';
import { ConvexHttpClient } from 'convex/browser';

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

export const handler = async (event: SNSEvent) => {
  for (const record of event.Records) {
    const sesEvent = JSON.parse(record.Sns.Message);
    const eventType = sesEvent.eventType; // SEND, DELIVERY, BOUNCE, COMPLAINT, etc.

    // Log to Convex
    await convex.mutation('emails:logDeliveryEvent', {
      messageId: sesEvent.mail.messageId,
      eventType: eventType.toLowerCase(),
      timestamp: sesEvent.mail.timestamp,
      recipient: sesEvent.mail.destination[0],
      details: sesEvent,
    });

    // Handle bounces/complaints
    if (eventType === 'BOUNCE' || eventType === 'COMPLAINT') {
      await convex.mutation('emails:markEmailUndeliverable', {
        email: sesEvent.mail.destination[0],
        reason: eventType.toLowerCase(),
      });
    }
  }

  return { statusCode: 200 };
};
```

### SNS Event Payload Structure

```json
{
  "eventType": "Delivery",
  "mail": {
    "messageId": "0000014c-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "timestamp": "2026-01-04T12:00:00.000Z",
    "source": "noreply@notifications.hellogroot.com",
    "destination": ["user@example.com"]
  },
  "delivery": {
    "timestamp": "2026-01-04T12:00:01.000Z",
    "recipients": ["user@example.com"],
    "processingTimeMillis": 1234
  }
}
```

---

## 5. Convex Email Schema Design

### Schema Design (following existing patterns)

Based on analysis of existing `convex/schema.ts`, the email tables should follow:

1. **Multi-tenant isolation** via `businessId` with index
2. **Soft deletes** via `deletedAt` field
3. **Audit patterns** similar to `audit_events`
4. **Event tracking** similar to `stripe_events`

```typescript
// convex/schema.ts additions

// ============================================
// EMAIL DOMAIN: Preferences & Delivery Tracking
// ============================================

email_preferences: defineTable({
  // Identity - User level (not business level)
  userId: v.id("users"),

  // Marketing Preferences (user can control)
  marketingEnabled: v.boolean(),           // Default: true
  onboardingTipsEnabled: v.boolean(),      // Default: true
  productUpdatesEnabled: v.boolean(),      // Default: true

  // Transactional (always delivered - not toggleable)
  // Note: Transactional emails (payment, security) always sent regardless

  // Global Unsubscribe (CAN-SPAM compliance)
  globalUnsubscribe: v.boolean(),          // Default: false
  unsubscribedAt: v.optional(v.number()),  // Unix timestamp

  // Timestamps
  updatedAt: v.optional(v.number()),
})
  .index("by_userId", ["userId"]),

email_logs: defineTable({
  // Identity
  businessId: v.optional(v.id("businesses")),  // Optional for system emails
  userId: v.optional(v.id("users")),           // Recipient user (if known)

  // SES Tracking
  sesMessageId: v.string(),                    // SES Message ID (idempotency)
  configurationSet: v.string(),                // SES Configuration Set used

  // Email Details
  templateType: v.string(),                    // "welcome", "invitation", "payment_failed", etc.
  recipientEmail: v.string(),
  subject: v.string(),
  senderEmail: v.string(),

  // Delivery Status
  status: v.string(),                          // "sent", "delivered", "bounced", "complained", "opened", "clicked"
  deliveredAt: v.optional(v.number()),
  bouncedAt: v.optional(v.number()),
  bounceType: v.optional(v.string()),          // "Permanent", "Transient"
  bounceSubType: v.optional(v.string()),       // "General", "NoEmail", "Suppressed"
  complainedAt: v.optional(v.number()),
  openedAt: v.optional(v.number()),
  clickedAt: v.optional(v.number()),

  // Metadata (for debugging)
  metadata: v.optional(v.any()),               // Additional context (workflow ID, etc.)

  // Timestamps (Convex adds _creationTime automatically)
})
  .index("by_businessId", ["businessId"])
  .index("by_userId", ["userId"])
  .index("by_sesMessageId", ["sesMessageId"])
  .index("by_recipientEmail", ["recipientEmail"])
  .index("by_templateType", ["templateType"])
  .index("by_status", ["status"]),

email_suppressions: defineTable({
  // Email that should not receive messages
  email: v.string(),

  // Suppression Reason
  reason: v.string(),                          // "bounce", "complaint", "unsubscribe"
  bounceType: v.optional(v.string()),

  // Source
  sourceMessageId: v.optional(v.string()),     // SES Message ID that caused suppression

  // Timestamps
  suppressedAt: v.number(),
})
  .index("by_email", ["email"])
  .index("by_reason", ["reason"]),

workflow_executions: defineTable({
  // Identity
  userId: v.id("users"),
  businessId: v.optional(v.id("businesses")),

  // Workflow Details
  workflowType: v.string(),                    // "welcome_new_user", "welcome_team_member"
  workflowArn: v.optional(v.string()),         // Lambda Durable Function ARN
  executionId: v.string(),                     // Lambda execution ID

  // Status
  status: v.string(),                          // "running", "completed", "failed"
  currentStage: v.string(),                    // "welcome_sent", "day1_sent", etc.
  completedStages: v.array(v.string()),

  // Timestamps
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  failedAt: v.optional(v.number()),
  errorMessage: v.optional(v.string()),

  // Metadata
  metadata: v.optional(v.any()),
})
  .index("by_userId", ["userId"])
  .index("by_businessId", ["businessId"])
  .index("by_workflowType", ["workflowType"])
  .index("by_status", ["status"])
  .index("by_executionId", ["executionId"]),
```

### Query Patterns

```typescript
// convex/functions/emails.ts

// Check if email is suppressed before sending
export const isEmailSuppressed = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("email_suppressions")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();
  },
});

// Get user email preferences
export const getEmailPreferences = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const prefs = await ctx.db
      .query("email_preferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    // Return defaults if no preferences set
    return prefs ?? {
      marketingEnabled: true,
      onboardingTipsEnabled: true,
      productUpdatesEnabled: true,
      globalUnsubscribe: false,
    };
  },
});

// Log email send
export const logEmailSend = mutation({
  args: {
    sesMessageId: v.string(),
    configurationSet: v.string(),
    templateType: v.string(),
    recipientEmail: v.string(),
    subject: v.string(),
    senderEmail: v.string(),
    businessId: v.optional(v.id("businesses")),
    userId: v.optional(v.id("users")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("email_logs", {
      ...args,
      status: "sent",
    });
  },
});
```

---

## Architecture Revision Summary

### Original Architecture (plan.md)

```
Clerk Webhook → API Gateway (IAM Auth) → Lambda Durable Function
```

### Revised Architecture

```
Clerk Webhook → Next.js API Route (Svix Verification) → AWS SDK → Lambda Durable Function
                                                              ↓
                                                    SES → SNS → Delivery Handler Lambda
                                                              ↓
                                                         Convex (email_logs)
```

### Key Changes Required

| Component | Original | Revised |
|-----------|----------|---------|
| Webhook Endpoint | API Gateway | Next.js API Route |
| Auth Method | IAM SigV4 | Svix HMAC-SHA256 |
| Lambda Invocation | Direct via API Gateway | AWS SDK `invokeLambda()` |
| Verification Library | N/A | `@clerk/nextjs/webhooks` |

### Idempotency Pattern (AWS Builder Best Practice)

**Problem**: Clerk may retry webhook delivery if it doesn't receive a timely response. Without idempotency, duplicate Lambda invocations could send duplicate welcome emails.

**Solution**: Use `svix-id` header as idempotency key, check before Lambda invocation.

```typescript
// src/app/api/v1/webhooks/clerk/route.ts
import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { NextRequest } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const evt = await verifyWebhook(req);

    // Extract svix-id for idempotency
    const svixId = req.headers.get('svix-id');
    if (!svixId) {
      return new Response('Missing svix-id header', { status: 400 });
    }

    // Idempotency check: Skip if already processed
    const existing = await convex.query(api.workflows.getByExecutionId, {
      executionId: svixId,
    });

    if (existing) {
      console.log(`Webhook ${svixId} already processed, skipping`);
      return new Response('Already processed', { status: 200 });
    }

    if (evt.type === 'user.created') {
      // Trigger Lambda with svixId as executionId for tracking
      await triggerWelcomeWorkflow({
        userId: evt.data.id,
        email: evt.data.email_addresses[0]?.email_address,
        executionId: svixId,  // Use svix-id for idempotency tracking
      });
    }

    return new Response('Success', { status: 200 });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('Webhook processing failed', { status: 400 });
  }
}
```

**Why This Works**:
1. Svix guarantees unique `svix-id` per event
2. Query is fast (indexed by `executionId`)
3. Prevents duplicate Lambda invocations
4. Safe to return 200 for duplicates (Clerk stops retrying)

**Alternative Considered**: DynamoDB `ConditionExpression` (AWS Builder pattern) - rejected because we already use Convex and adding DynamoDB would increase complexity.

### Impact on Plan

1. **Remove**: API Gateway IAM authentication construct
2. **Add**: Next.js webhook route with Svix verification
3. **Add**: AWS SDK Lambda client for invocation
4. **Update**: FR-023, FR-024 in spec.md to reflect Svix-based security

---

## References

1. [AWS Lambda Durable Functions Documentation](https://docs.aws.amazon.com/lambda/latest/dg/durable-functions.html)
2. [Clerk Webhooks - Syncing Data](https://clerk.com/docs/webhooks/sync-data)
3. [AWS CDK SES Module](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ses-readme.html)
4. [Convex Schema Design](https://docs.convex.dev/database/schemas)
5. [SES Event Publishing](https://docs.aws.amazon.com/ses/latest/dg/event-publishing.html)
