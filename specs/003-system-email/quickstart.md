# Quickstart: Critical Transactional Emails

**Branch**: `003-system-email` | **Date**: 2026-01-04 | **Plan**: [plan.md](./plan.md)

## Prerequisites

- Node.js 22.x (for Lambda Durable Functions)
- AWS CLI configured with appropriate credentials
- AWS CDK v2 installed globally (`npm install -g aws-cdk`)
- Clerk account with webhook signing secret
- Access to AWS SES (sandbox or production)

## 1. Environment Setup

### Clone and Install

```bash
# Checkout feature branch
git checkout 003-system-email

# Install dependencies
npm install

# Install CDK infrastructure dependencies
cd infra && npm install && cd ..

# Install Lambda function dependencies
cd lambda/welcome-workflow && npm install && cd ../..
cd lambda/delivery-handler && npm install && cd ../..
cd lambda/shared && npm install && cd ../..
```

### Environment Variables

Create/update `.env.local`:

```bash
# Existing variables (should already be set)
NEXT_PUBLIC_CONVEX_URL=https://kindhearted-lynx-129.convex.cloud
CLERK_SECRET_KEY=sk_live_xxxx
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxx

# NEW: Clerk Webhook (get from Clerk Dashboard → Webhooks)
CLERK_WEBHOOK_SIGNING_SECRET=whsec_xxxxxxxxxxxxxxxxxxxx

# NEW: AWS Configuration
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-west-2

# NEW: SES Configuration
SES_CONFIGURATION_SET=finanseal-transactional
SES_FROM_EMAIL=noreply@notifications.hellogroot.com

# NEW: App URL (for unsubscribe links)
APP_URL=https://finanseal.com

# NEW: JWT Secret for Unsubscribe Tokens (generate with: openssl rand -base64 32)
UNSUBSCRIBE_JWT_SECRET=your-32-byte-secret-key-here

# NEW: Welcome Workflow Lambda ARN (from CDK deploy output)
WELCOME_WORKFLOW_LAMBDA_ARN=arn:aws:lambda:us-west-2:ACCOUNT:function:SystemEmailWelcomeWorkflow

# DEPRECATED: Will be removed after migration
RESEND_API_KEY=re_xxxx  # Keep during transition
```

### Clerk Webhook Setup

1. Go to [Clerk Dashboard](https://dashboard.clerk.com) → Webhooks
2. Add endpoint: `https://finanseal.com/api/v1/webhooks/clerk`
3. Select events: `user.created`, `user.updated`
4. Copy the **Signing Secret** to `CLERK_WEBHOOK_SIGNING_SECRET`

---

## 2. AWS Infrastructure

### Bootstrap CDK (First Time Only)

```bash
cd infra
cdk bootstrap aws://ACCOUNT_ID/us-west-2
```

### Deploy Infrastructure

```bash
# Preview changes
cdk diff

# Deploy (creates API Gateway, Lambda, SES, SNS)
cdk deploy

# Note the outputs:
# - WelcomeWorkflowArn: Lambda function ARN
# - EmailEventsTopicArn: SNS topic for delivery events
```

### SES Domain Verification

If not using Route53, manually add DNS records:

```bash
# Get DKIM records from CDK output or AWS Console
# Add these CNAME records to your DNS:

# DKIM Record 1
[selector1]._domainkey.notifications.hellogroot.com → [token].dkim.amazonses.com

# DKIM Record 2
[selector2]._domainkey.notifications.hellogroot.com → [token].dkim.amazonses.com

# DKIM Record 3
[selector3]._domainkey.notifications.hellogroot.com → [token].dkim.amazonses.com

# MAIL FROM (SPF)
mail.notifications.hellogroot.com TXT "v=spf1 include:amazonses.com ~all"
mail.notifications.hellogroot.com MX 10 feedback-smtp.us-west-2.amazonses.com
```

---

## 3. Database Schema

### Update Convex Schema

Add to `convex/schema.ts`:

```typescript
// Add imports at top
import {
  // ... existing imports ...
  emailTemplateTypeValidator,
  emailStatusValidator,
  emailSuppressionReasonValidator,
  workflowTypeValidator,
  workflowStatusValidator,
} from "./lib/validators";

// Add after existing tables (before closing brace)

// ============================================
// EMAIL DOMAIN: Preferences & Delivery Tracking
// ============================================

email_preferences: defineTable({
  userId: v.id("users"),
  marketingEnabled: v.boolean(),
  onboardingTipsEnabled: v.boolean(),
  productUpdatesEnabled: v.boolean(),
  globalUnsubscribe: v.boolean(),
  unsubscribedAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
})
  .index("by_userId", ["userId"]),

email_logs: defineTable({
  businessId: v.optional(v.id("businesses")),
  userId: v.optional(v.id("users")),
  sesMessageId: v.string(),
  configurationSet: v.string(),
  templateType: v.string(),
  recipientEmail: v.string(),
  subject: v.string(),
  senderEmail: v.string(),
  status: v.string(),
  deliveredAt: v.optional(v.number()),
  bouncedAt: v.optional(v.number()),
  bounceType: v.optional(v.string()),
  bounceSubType: v.optional(v.string()),
  complainedAt: v.optional(v.number()),
  openedAt: v.optional(v.number()),
  clickedAt: v.optional(v.number()),
  metadata: v.optional(v.any()),
})
  .index("by_businessId", ["businessId"])
  .index("by_userId", ["userId"])
  .index("by_sesMessageId", ["sesMessageId"])
  .index("by_recipientEmail", ["recipientEmail"])
  .index("by_templateType", ["templateType"])
  .index("by_status", ["status"]),

email_suppressions: defineTable({
  email: v.string(),
  reason: v.string(),
  bounceType: v.optional(v.string()),
  bounceSubType: v.optional(v.string()),
  sourceMessageId: v.optional(v.string()),
  suppressedAt: v.number(),
})
  .index("by_email", ["email"])
  .index("by_reason", ["reason"]),

workflow_executions: defineTable({
  userId: v.id("users"),
  businessId: v.optional(v.id("businesses")),
  workflowType: v.string(),
  workflowArn: v.optional(v.string()),
  executionId: v.string(),
  status: v.string(),
  currentStage: v.string(),
  completedStages: v.array(v.string()),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  failedAt: v.optional(v.number()),
  errorMessage: v.optional(v.string()),
  metadata: v.optional(v.any()),
})
  .index("by_userId", ["userId"])
  .index("by_businessId", ["businessId"])
  .index("by_workflowType", ["workflowType"])
  .index("by_status", ["status"])
  .index("by_executionId", ["executionId"]),
```

### Deploy Schema

```bash
npx convex dev  # Development
# OR
npx convex deploy  # Production
```

---

## 4. Local Development

### Start Development Servers

```bash
# Terminal 1: Next.js dev server
npm run dev

# Terminal 2: Convex dev server
npx convex dev

# Terminal 3: Local webhook testing (optional)
npx ngrok http 3000
```

### Test Webhook Locally

Use [ngrok](https://ngrok.com) to expose local server:

```bash
# Start ngrok
ngrok http 3000

# Update Clerk webhook URL temporarily:
# https://xxxx.ngrok.io/api/v1/webhooks/clerk
```

### Test Email Sending

```bash
# From project root
npm run test:email

# Or manually via curl:
curl -X POST http://localhost:3000/api/v1/test/send-welcome \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "name": "Test User"}'
```

---

## 5. Stripe Dashboard Configuration

### Enable Trial Reminders

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → Settings → Billing → Customer portal
2. Under "Subscriptions":
   - Enable "Allow customers to update payment methods"
   - Enable "Allow customers to cancel subscriptions"
3. Go to Settings → Billing → Emails
4. Enable "Send emails about upcoming trial expirations"
5. Set reminder: **7 days before trial ends**

### Enable Payment Recovery

1. Go to Settings → Billing → Subscriptions and emails
2. Under "Manage failed payments":
   - Enable "Smart Retries" (recommended)
   - Enable "Send emails to customers when payments fail"
   - Enable "Send emails when payments are recovered"
3. Configure retry schedule (Stripe's default is recommended)

---

## 6. Email Preferences & Unsubscribe

### API Endpoints

The following endpoints are available for email preference management:

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/v1/email-preferences` | GET | Clerk | Get user's email preferences |
| `/api/v1/email-preferences` | PATCH | Clerk | Update email preferences |
| `/api/v1/unsubscribe?token=xxx` | GET | JWT Token | Render unsubscribe confirmation page |
| `/api/v1/unsubscribe` | POST | JWT Token | Process unsubscribe request |
| `/api/v1/unsubscribe/one-click?token=xxx` | POST | JWT Token | RFC 8058 one-click unsubscribe |
| `/api/v1/unsubscribe/success` | GET | None | Unsubscribe success page |

### Email Preference Fields

```typescript
{
  marketingEnabled: boolean;     // Marketing emails
  onboardingTipsEnabled: boolean; // Onboarding tips and tutorials
  productUpdatesEnabled: boolean; // Product update announcements
  globalUnsubscribe: boolean;     // Unsubscribe from all non-transactional
}
```

### Unsubscribe Token

Unsubscribe tokens are JWT-based with 7-day expiration:

```typescript
// Token payload
{
  userId: string;      // Convex user ID
  email: string;       // Email address
  type: 'marketing' | 'onboarding' | 'product_updates' | 'all';
}
```

### RFC 8058 Compliance

All marketing emails include these headers for one-click unsubscribe:

```
List-Unsubscribe: <https://finanseal.com/api/v1/unsubscribe?token=xxx>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

Gmail, Yahoo, and other major email providers will show an "Unsubscribe" button in the email header.

---

## 7. Testing Checklist

### Manual Testing Checklist

- [ ] **Welcome Email**: Create new user → Welcome email arrives within 5 minutes
- [ ] **Team Invitation**: Invite user to business → Invitation email with correct branding
- [ ] **Unsubscribe Page**: Click unsubscribe link → Confirmation page renders correctly
- [ ] **Unsubscribe Flow**: Submit unsubscribe → Marketing emails stop, transactional continue
- [ ] **One-Click Unsubscribe**: RFC 8058 headers present in emails
- [ ] **Email Preferences API**: GET/PATCH `/api/v1/email-preferences` returns correct data
- [ ] **Bounce Handling**: Test bounce → Suppression list updated
- [ ] **Stripe Trial Reminder**: Check Stripe Dashboard → Trial reminder configured
- [ ] **Stripe Payment Failure**: Simulate payment failure → Stripe recovery email sent

### Unit Tests

```bash
# Run all email-related tests
npm test -- --grep "email"

# Run specific test files
npm test tests/unit/email-service.test.ts
npm test tests/unit/webhook-handler.test.ts
```

### Integration Tests

```bash
# Test welcome workflow
npm test tests/integration/welcome-workflow.test.ts

# Test SES delivery
npm test tests/integration/ses-delivery.test.ts
```

### Manual Testing

- [ ] Create new user → Welcome email arrives within 5 minutes
- [ ] Invite user to business → Invitation email with correct branding
- [ ] Click unsubscribe → Marketing emails stop, transactional continue
- [ ] Trigger bounce (test email) → Suppression list updated
- [ ] Check Stripe Dashboard → Trial reminder configured
- [ ] Simulate payment failure → Stripe recovery email sent

---

## 7. Monitoring

### CloudWatch Metrics

Key metrics to monitor:

- `WelcomeWorkflowExecutionTime` - Workflow duration
- `WelcomeWorkflowErrors` - Failed workflows
- `SESBounceRate` - Email bounce rate
- `SESComplaintRate` - Spam complaint rate

### Convex Dashboard

1. Go to [Convex Dashboard](https://dashboard.convex.dev)
2. Check `email_logs` table for delivery status
3. Check `workflow_executions` for workflow state

### SES Reputation Dashboard

1. Go to AWS Console → SES → Account dashboard
2. Monitor:
   - Bounce rate (keep < 5%)
   - Complaint rate (keep < 0.1%)
   - Sending quota usage

---

## 8. Troubleshooting

### Webhook Not Triggering

```bash
# Check webhook signature
curl -X POST https://finanseal.com/api/v1/webhooks/clerk \
  -H "Content-Type: application/json" \
  -H "svix-id: test" \
  -H "svix-timestamp: $(date +%s)" \
  -H "svix-signature: invalid" \
  -d '{}'

# Should return 400 "Webhook verification failed"
```

### SES Sandbox Mode

If in SES sandbox:

```bash
# Verify recipient email first
aws ses verify-email-identity --email-address recipient@example.com

# Check verification status
aws ses list-verified-email-addresses
```

### Lambda Not Invoking

```bash
# Check Lambda logs
aws logs tail /aws/lambda/SystemEmailWelcomeWorkflow --follow

# Check IAM permissions
aws lambda get-function --function-name SystemEmailWelcomeWorkflow
```

### Email Not Delivered

1. Check `email_logs` in Convex for status
2. Check `email_suppressions` for recipient
3. Check SES bounce/complaint notifications in SNS
4. Verify DKIM/SPF records: `nslookup -type=txt _domainkey.notifications.hellogroot.com`

---

## 9. Migration from Resend

### Phase 1: Dual-Write (Current)

Both Resend and SES active:

```typescript
// Feature flag in .env
EMAIL_PROVIDER=ses  // or 'resend' for rollback
```

### Phase 2: SES Primary

After 2 weeks of successful SES operation:

1. Set `EMAIL_PROVIDER=ses` in production
2. Monitor delivery rates
3. Remove Resend fallback code

### Phase 3: Remove Resend

After 30 days:

1. Remove `RESEND_API_KEY` from env
2. Uninstall resend package: `npm uninstall resend`
3. Delete Resend-related code

---

## Quick Reference

| Service | Dashboard | Purpose |
|---------|-----------|---------|
| Clerk | [dashboard.clerk.com](https://dashboard.clerk.com) | Webhook configuration |
| Stripe | [dashboard.stripe.com](https://dashboard.stripe.com) | Billing email settings |
| AWS SES | AWS Console → SES | Email sending, reputation |
| Convex | [dashboard.convex.dev](https://dashboard.convex.dev) | Database, logs |
| CloudWatch | AWS Console → CloudWatch | Lambda metrics, logs |

| Environment Variable | Purpose |
|---------------------|---------|
| `CLERK_WEBHOOK_SIGNING_SECRET` | Svix signature verification |
| `AWS_ACCESS_KEY_ID` | AWS authentication |
| `AWS_SECRET_ACCESS_KEY` | AWS authentication |
| `AWS_REGION` | AWS region (us-west-2) |
| `SES_CONFIGURATION_SET` | SES event tracking |
| `SES_FROM_EMAIL` | Sender email address |
| `APP_URL` | Base URL for unsubscribe links |
| `UNSUBSCRIBE_JWT_SECRET` | JWT signing for unsubscribe tokens |
| `WELCOME_WORKFLOW_LAMBDA_ARN` | Lambda function ARN for welcome emails |

---

## Implementation Summary

### Completed Phases

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Setup (CDK, Lambda directories) | ✅ Complete |
| Phase 2 | Foundational (Schema, Functions, Templates) | ✅ Complete |
| Phase 3 | US1 & US2 (Stripe Billing Emails) | ✅ Complete |
| Phase 4 | US3 (Welcome Email Workflow) | ✅ Complete |
| Phase 5 | US4 (Email Preferences & Unsubscribe) | ✅ Complete |
| Phase 6 | Migration (Resend → SES) | ⏸️ Deferred |
| Phase 7 | Polish & Admin APIs | 🔄 In Progress |

### Key Files Created

| File | Purpose |
|------|---------|
| `src/lib/aws/lambda-client.ts` | AWS Lambda client for triggering workflows |
| `src/lib/services/unsubscribe-token.ts` | JWT token generation/verification |
| `src/app/api/v1/email-preferences/route.ts` | Email preferences API |
| `src/app/api/v1/unsubscribe/route.ts` | Unsubscribe page and handler |
| `src/app/api/v1/unsubscribe/one-click/route.ts` | RFC 8058 one-click unsubscribe |
| `src/app/api/v1/unsubscribe/success/route.ts` | Unsubscribe confirmation page |
| `lambda/shared/email-service.ts` | SES email service with RFC 8058 headers |
| `lambda/welcome-workflow/index.ts` | Lambda Durable Function handler |
| `lambda/delivery-handler/index.ts` | SES delivery event processor |
| `convex/functions/emails.ts` | Email-related Convex functions |
| `convex/functions/workflows.ts` | Workflow tracking functions |
