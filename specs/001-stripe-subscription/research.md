# Research: Stripe Subscription Integration

**Date**: 2025-12-27
**Feature**: 001-stripe-subscription
**Reference**: [Next.js SaaS Starter](https://github.com/nextjs/saas-starter) | [Stripe SaaS Docs](https://docs.stripe.com/saas)

## Decision Summary

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Checkout approach | Stripe Checkout (hosted) | Reduces PCI scope, handles complexity, supports international payments |
| Subscription management | Stripe Customer Portal (hosted) | Simplicity: Stripe handles payment updates, plan changes, cancellations |
| Database design | Columns on `businesses` table | **SaaS Starter pattern** - no separate subscriptions table |
| Webhook idempotency | `stripe_events` table | Simple event ID deduplication |
| Usage tracking | Local `ocr_usage` table | Simpler soft-block logic, no Stripe metered billing |

## Key Pattern: Follow SaaS Starter

The [Next.js SaaS Starter](https://github.com/nextjs/saas-starter) by Vercel is the reference implementation. Key insight:

> **Subscription fields live ON the teams/businesses table, NOT in a separate table.**

```typescript
// From SaaS Starter schema - subscription fields on teams table
teams: {
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripeProductId: text('stripe_product_id'),
  planName: text('plan_name').default('free'),
  subscriptionStatus: text('subscription_status'),
}
```

**Why this works:**
- Stripe is source of truth, local DB just caches status
- No complex sync between subscriptions and businesses tables
- Fast queries: `businesses.plan_name` without JOINs
- Webhook handlers simply UPDATE businesses table

## 1. Pricing Page Strategy

### Options Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **Stripe Pricing Table** | Zero code, Stripe-hosted | Less customization, external redirect | Consider for MVP |
| **Custom Pricing Page** | Full control, in-app experience | More development | **Selected** |
| **Stripe Elements** | Embedded in app | Higher PCI scope | Not needed |

### Decision: Custom Pricing Page → Stripe Checkout

Following SaaS Starter pattern:
1. **Custom pricing page** (`/pricing`) - Shows plans with our branding
2. **Click "Subscribe"** → API creates Checkout Session
3. **Redirect to Stripe Checkout** - Handles payment securely
4. **Webhook receives event** → Update `businesses` table

This gives us branding control while letting Stripe handle PCI-compliant payment collection.

## 2. Checkout Strategy

### Decision: Stripe Checkout (Hosted)

**Rationale:**
- Pre-built, PCI-compliant checkout experience
- Handles subscription logic out of the box
- Supports 135+ currencies and multiple payment methods
- Mobile-optimized, localized UI
- Reduces development time significantly

**Alternatives Considered:**
- **Stripe Elements**: More customization but higher PCI scope, more development
- **Custom form**: Maximum control but PCI-DSS compliance burden

**Implementation Pattern:**
```typescript
// Create checkout session for subscription
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  customer: stripeCustomerId, // Link to existing customer
  line_items: [{ price: priceId, quantity: 1 }],
  success_url: `${APP_URL}/settings/billing?success=true`,
  cancel_url: `${APP_URL}/pricing?canceled=true`,
  subscription_data: {
    metadata: { businessId: business.id }
  }
});
```

## 2. Customer Portal Integration

### Decision: Stripe-Hosted Customer Portal

**Rationale:**
- Zero custom UI for payment method updates
- Handles plan changes with proration automatically
- Cancellation flow with retention features
- Invoice history and download built-in
- Stripe maintains compliance and security

**Configuration (via Stripe Dashboard):**
- Enable subscription cancellation (with feedback collection)
- Enable plan switching (with proration preview)
- Enable payment method updates
- Enable invoice history access

**Implementation Pattern:**
```typescript
// Create portal session
const portalSession = await stripe.billingPortal.sessions.create({
  customer: stripeCustomerId,
  return_url: `${APP_URL}/settings/billing`
});
// Redirect user to portalSession.url
```

## 3. Webhook Handling

### Decision: Database-Level Idempotency

**Critical Events to Handle:**

| Event | Action |
|-------|--------|
| `customer.subscription.created` | Create subscription record, activate plan |
| `customer.subscription.updated` | Update status, plan, period dates |
| `customer.subscription.deleted` | Mark subscription canceled, downgrade to Free |
| `invoice.payment_succeeded` | Record invoice, update payment status |
| `invoice.payment_failed` | Mark past_due, trigger notifications |
| `customer.updated` | Sync customer metadata changes |

**Idempotency Pattern:**
```typescript
// Check if event already processed
const existingEvent = await db.stripeEvents.findUnique({
  where: { eventId: event.id }
});
if (existingEvent) {
  return new Response('Already processed', { status: 200 });
}

// Process event
await db.$transaction([
  // Business logic
  db.stripeEvents.create({ data: { eventId: event.id, type: event.type } })
]);
```

**Webhook Signature Verification:**
```typescript
const event = stripe.webhooks.constructEvent(
  payload,
  signature,
  process.env.STRIPE_WEBHOOK_SECRET
);
```

## 4. Proration Handling

### Decision: Immediate Proration (Stripe Default)

**Behavior:**
- Upgrades: Charge prorated difference immediately
- Downgrades: Credit applied to next invoice
- Stripe handles all calculation automatically

**Configuration:**
```typescript
// Use 'always_invoice' for immediate billing on upgrade
proration_behavior: 'always_invoice'
```

## 5. Database Synchronization

### Decision: Webhook-Driven Sync

**Data Model:**
- `businesses` table: Add `stripe_customer_id` column
- `subscriptions` table: Mirror Stripe subscription state
- `stripe_events` table: Idempotency tracking
- `ocr_usage` table: Local usage metering

**Sync Flow:**
1. Webhook received → Verify signature
2. Check idempotency (event ID)
3. Begin transaction
4. Update local subscription state
5. Record event ID
6. Commit transaction
7. Return 200 to Stripe

**Important:** Never trust client-provided subscription state. Always verify via webhook or API call.

## 6. Usage Tracking Strategy

### Decision: Local Database Tracking (Not Stripe Metered Billing)

**Rationale:**
- Soft-block behavior not well-supported by Stripe metered billing
- Simpler to query local database for usage checks
- No additional Stripe API calls during OCR processing
- Can show real-time usage in dashboard

**Pattern:**
```typescript
// On OCR document processed (in existing OCR workflow)
await db.ocrUsage.create({
  data: {
    businessId,
    documentId,
    creditsUsed: 1,
    timestamp: new Date()
  }
});

// Check usage before OCR
const monthlyUsage = await db.ocrUsage.count({
  where: {
    businessId,
    timestamp: { gte: startOfMonth }
  }
});
const limit = getOcrLimitForPlan(subscription.planId);
if (monthlyUsage >= limit) {
  throw new OcrLimitExceededError();
}
```

## 7. Plan Configuration

### Decision: Database + Stripe Products

**Local Plan Config (for feature gating):**
```typescript
const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    ocrLimit: 5,
    features: ['read_only_data', 'limited_ocr']
  },
  pro: {
    id: 'pro',
    stripePriceId: 'price_xxx',
    name: 'Pro',
    ocrLimit: 100,
    features: ['full_access', 'priority_support']
  },
  enterprise: {
    id: 'enterprise',
    stripePriceId: 'price_yyy',
    name: 'Enterprise',
    ocrLimit: -1, // unlimited
    features: ['full_access', 'priority_support', 'api_access', 'custom_branding']
  }
};
```

## Security Considerations

1. **Never expose Stripe Secret Key** - Server-side only
2. **Always verify webhook signatures** - Prevent spoofing
3. **Use Stripe Customer Portal** - Don't handle raw payment data
4. **Store only references** - `stripe_customer_id`, `stripe_subscription_id`, not payment details
5. **Idempotent handlers** - Prevent duplicate charges/actions

## Environment Variables Required

```env
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRO_PRICE_ID=price_xxx
STRIPE_ENTERPRISE_PRICE_ID=price_yyy
```

## Testing Strategy

1. **Stripe CLI** - Forward webhooks to local environment
2. **Test Mode** - Use Stripe test API keys
3. **Test Cards** - `4242424242424242` for success, `4000000000000002` for decline
4. **Webhook Testing** - `stripe trigger customer.subscription.created`
