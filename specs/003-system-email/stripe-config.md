# Stripe Configuration for System Emails

**Date Configured**: 2025-01-04
**Account**: FinanSEAL (acct_1Sj8JP2VdEm3MQFk)
**Mode**: Test Mode

---

## T031: Customer Portal Configuration ✅ (API-Configured)

**Configuration ID**: `bpc_1SlzV02VdEm3MQFk8hlpHR1O`

### Configured via Stripe CLI:

```bash
# Created billing portal configuration
stripe billing_portal configurations create \
  --business-profile.headline="Manage your FinanSEAL subscription" \
  --features.invoice-history.enabled=true \
  --features.payment-method-update.enabled=true \
  --features.subscription-cancel.enabled=true \
  --features.subscription-cancel.mode=at_period_end \
  --features.subscription-cancel.cancellation-reason.enabled=true

# Updated with additional settings
stripe billing_portal configurations update bpc_1SlzV02VdEm3MQFk8hlpHR1O \
  --business-profile.privacy-policy-url="https://finanseal.com/privacy" \
  --business-profile.terms-of-service-url="https://finanseal.com/terms" \
  --features.customer-update.enabled=true
```

### Features Enabled:

| Feature | Status | Details |
|---------|--------|---------|
| Customer Update | ✅ Enabled | Email, Name updates allowed |
| Invoice History | ✅ Enabled | Customers can view past invoices |
| Payment Method Update | ✅ Enabled | Card updates without support |
| Subscription Cancel | ✅ Enabled | End of period, with cancellation reasons |
| Cancellation Reasons | ✅ Enabled | too_expensive, missing_features, switched_service, unused, other |

### Business Profile:

- **Headline**: "Manage your FinanSEAL subscription"
- **Privacy Policy**: https://finanseal.com/privacy
- **Terms of Service**: https://finanseal.com/terms

---

## T032: Trial Reminder Emails ⚠️ (Manual Dashboard Required)

**Dashboard Location**: Settings → Emails → Subscriptions

### Manual Steps Required:

1. Go to [Stripe Dashboard → Settings → Emails](https://dashboard.stripe.com/settings/emails)
2. Scroll to **Subscriptions** section
3. Enable **"Send email when a trial is about to end"**
4. Set reminder timing: **7 days** before trial ends

### Why Manual?

The Stripe API does not support programmatic configuration of email automation settings. This is by design - Stripe requires explicit admin action for settings that impact customer communications.

---

## T033: Smart Retries ⚠️ (Manual Dashboard Required)

**Dashboard Location**: Settings → Billing → Subscriptions and emails

### Manual Steps Required:

1. Go to [Stripe Dashboard → Settings → Billing](https://dashboard.stripe.com/settings/billing/automatic)
2. Under **Manage failed payments**, ensure **Smart Retries** is enabled
3. Configure retry schedule (recommended: Stripe default optimal timing)

### Smart Retries Behavior:

- Stripe uses ML to determine optimal retry timing
- Retries for up to 7 attempts over 7-8 days
- Considers cardholder bank behavior patterns
- Higher recovery rate than fixed schedules

---

## T034: Payment Failure Customer Emails ⚠️ (Manual Dashboard Required)

**Dashboard Location**: Settings → Emails → Payments

### Manual Steps Required:

1. Go to [Stripe Dashboard → Settings → Emails](https://dashboard.stripe.com/settings/emails)
2. Under **Payments** section, enable:
   - ✅ "Failed payment" notifications
   - ✅ Include customer portal link in email

### Email Content:

- Notifies customer of failed payment
- Explains next steps
- Links to Customer Portal for payment method update
- Branded with FinanSEAL identity

---

## T035: Payment Recovery Confirmation Emails ⚠️ (Manual Dashboard Required)

**Dashboard Location**: Settings → Emails → Payments

### Manual Steps Required:

1. Go to [Stripe Dashboard → Settings → Emails](https://dashboard.stripe.com/settings/emails)
2. Under **Payments** section, enable:
   - ✅ "Successful payment after previous failure" notifications

### Email Content:

- Confirms payment was successfully processed
- Thanks customer for updating payment method
- Confirms subscription is active

---

## Summary

| Task | Status | Method |
|------|--------|--------|
| T031 Customer Portal | ✅ Complete | API (Stripe CLI) |
| T032 Trial Reminders | ⚠️ Pending | Manual Dashboard |
| T033 Smart Retries | ⚠️ Pending | Manual Dashboard |
| T034 Failed Payment Emails | ⚠️ Pending | Manual Dashboard |
| T035 Recovery Emails | ⚠️ Pending | Manual Dashboard |

---

## Production Deployment Checklist

Before going live, ensure these steps are completed in **live mode**:

- [ ] Reconfigure Customer Portal in live mode
- [ ] Enable trial reminder emails in live mode
- [ ] Enable payment failure emails in live mode
- [ ] Enable recovery confirmation emails in live mode
- [ ] Verify Smart Retries is enabled in live mode
- [ ] Test billing portal redirect from application
- [ ] Update URLs from test (finanseal.com) to production domain

---

## API Configuration Reference

### Creating Billing Portal Session (Application Code)

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Create portal session for customer
const session = await stripe.billingPortal.sessions.create({
  customer: 'cus_xxx', // Stripe customer ID
  return_url: 'https://finanseal.com/dashboard/billing',
  configuration: 'bpc_1SlzV02VdEm3MQFk8hlpHR1O', // Optional, uses default
});

// Redirect customer to session.url
```

### Environment Variables Needed

```bash
# Already configured in application
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx

# Billing Portal Configuration ID (optional, has default)
STRIPE_BILLING_PORTAL_CONFIG_ID=bpc_1SlzV02VdEm3MQFk8hlpHR1O
```
