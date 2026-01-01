# API Contracts: Onboarding & Plan Selection Flow

**Feature**: 001-onboarding-plan-selection
**Date**: 2025-12-29

## Overview

This document defines the API contracts for the onboarding and plan selection feature.

---

## 1. Initialize Business

Creates a new business for a user completing onboarding.

### Endpoint

```
POST /api/v1/onboarding/initialize-business
```

### Authentication

Required: Clerk session token

### Request Body

```typescript
interface InitializeBusinessRequest {
  // Business details (all optional with defaults)
  businessName?: string        // Default: "{user.full_name}'s Business"
  businessType?: BusinessType  // Default: 'other'
  countryCode?: string         // Default: 'SG' or from IP geolocation

  // Custom categories (optional)
  customCOGSNames?: string[]      // Max 20 items
  customExpenseNames?: string[]   // Max 20 items

  // Plan selection (required)
  planName: 'trial' | 'starter' | 'pro' | 'enterprise'

  // Stripe IDs (for paid plans only)
  stripeCustomerId?: string
  stripeSubscriptionId?: string
}
```

### Response

**Success (202 Accepted)**

```typescript
interface InitializeBusinessResponse {
  success: true
  data: {
    businessId: string        // UUID of created business
    taskId: string            // Trigger.dev task ID for status polling
    status: 'initializing'
    estimatedCompletionMs: number  // ~5000-10000
  }
}
```

**Error (400 Bad Request)**

```typescript
interface ErrorResponse {
  success: false
  error: string
  details?: Record<string, string[]>  // Zod validation errors
}
```

### Example

```bash
curl -X POST /api/v1/onboarding/initialize-business \
  -H "Authorization: Bearer $CLERK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "My Restaurant",
    "businessType": "fnb",
    "countryCode": "MY",
    "customCOGSNames": ["Ingredients", "Packaging"],
    "customExpenseNames": ["Staff Meals"],
    "planName": "trial"
  }'
```

---

## 2. Get Initialization Status

Polls for business initialization completion.

### Endpoint

```
GET /api/v1/onboarding/status?taskId={taskId}
```

### Authentication

Required: Clerk session token

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| taskId | string | Yes | Trigger.dev task ID from initialize response |

### Response

**In Progress (200 OK)**

```typescript
interface StatusInProgressResponse {
  success: true
  data: {
    status: 'initializing' | 'generating_categories'
    progress: number       // 0-100
    message: string        // e.g., "Configuring categories..."
    businessId: string
  }
}
```

**Completed (200 OK)**

```typescript
interface StatusCompletedResponse {
  success: true
  data: {
    status: 'completed'
    progress: 100
    businessId: string
    onboardingCompletedAt: string  // ISO timestamp
    categoriesGenerated: {
      cogs: number
      expense: number
    }
    redirectUrl: string  // Dashboard URL
  }
}
```

**Failed (200 OK with error status)**

```typescript
interface StatusFailedResponse {
  success: true
  data: {
    status: 'failed'
    error: string
    businessId: string
    canRetry: boolean
  }
}
```

---

## 3. Create Stripe Checkout Session

Creates a Stripe Checkout session for paid plan selection.

### Endpoint

```
POST /api/v1/billing/checkout
```

### Authentication

Required: Clerk session token

### Request Body

```typescript
interface CreateCheckoutRequest {
  planName: 'starter' | 'pro' | 'enterprise'
  successUrl: string   // Redirect after successful payment
  cancelUrl: string    // Redirect if user cancels

  // Optional business data to pass through
  businessSetup?: {
    businessName?: string
    businessType?: string
    countryCode?: string
  }
}
```

### Response

**Success (200 OK)**

```typescript
interface CheckoutResponse {
  success: true
  data: {
    checkoutUrl: string        // Stripe Checkout URL
    sessionId: string          // Stripe session ID
    customerId: string         // Stripe customer ID (created or existing)
  }
}
```

---

## 4. Get Plans

Retrieves available plans with pricing from Stripe.

### Endpoint

```
GET /api/v1/billing/plans
```

### Authentication

Optional (public endpoint)

### Response

```typescript
interface PlansResponse {
  success: true
  data: {
    plans: Array<{
      name: string           // 'trial' | 'starter' | 'pro' | 'enterprise'
      displayName: string    // 'Starter', 'Pro', etc.
      price: number | null   // null for trial, amount in cents otherwise
      currency: string       // From Stripe
      interval: 'month'      // Billing interval
      teamLimit: number      // -1 for unlimited
      ocrLimit: number       // -1 for unlimited
      features: string[]
      isRecommended?: boolean
    }>
    trialDays: 14
  }
}
```

---

## 5. Check Trial Status

Gets current trial status for a business.

### Endpoint

```
GET /api/v1/onboarding/trial-status
```

### Authentication

Required: Clerk session token

### Response

```typescript
interface TrialStatusResponse {
  success: true
  data: {
    isOnTrial: boolean
    daysRemaining: number
    isExpired: boolean
    shouldShowWarning: boolean
    trialEndDate: string | null  // ISO timestamp
    currentPlan: string
    upgradeUrl: string
  }
}
```

---

## 6. Generate AI Categories

Triggers AI generation for custom category names.

### Endpoint

```
POST /api/v1/onboarding/generate-categories
```

### Authentication

Required: Clerk session token

### Request Body

```typescript
interface GenerateCategoriesRequest {
  businessId: string
  businessType: BusinessType
  categoryType: 'cogs' | 'expense'
  categoryNames: string[]  // User-provided names to enhance
}
```

### Response

**Success (202 Accepted)**

```typescript
interface GenerateCategoriesResponse {
  success: true
  data: {
    taskId: string
    categoryCount: number
  }
}
```

---

## 7. Get Business Setup Defaults

Gets default values for business setup based on context.

### Endpoint

```
GET /api/v1/onboarding/defaults
```

### Authentication

Required: Clerk session token

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| businessType | string | No | Get category suggestions for type |

### Response

```typescript
interface DefaultsResponse {
  success: true
  data: {
    suggestedBusinessName: string  // "{user.full_name}'s Business"
    detectedCountry: string        // From IP geolocation
    detectedCurrency: string       // Based on country
    businessTypes: Array<{
      value: string
      label: string
      suggestedCOGS: string[]
      suggestedExpenses: string[]
    }>
    supportedCountries: Array<{
      code: string
      name: string
      currency: string
    }>
  }
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | User not allowed to perform action |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Request body validation failed |
| `BUSINESS_EXISTS` | 400 | User already has a business |
| `TRIAL_EXPIRED` | 403 | Trial has expired, upgrade required |
| `TEAM_LIMIT_REACHED` | 403 | Cannot add more team members |
| `STRIPE_ERROR` | 500 | Stripe API error |
| `AI_GENERATION_FAILED` | 500 | AI category generation failed |

---

## Webhook Events

### Stripe Webhooks

The following Stripe events trigger updates:

| Event | Handler Action |
|-------|----------------|
| `checkout.session.completed` | Create business with paid plan |
| `customer.subscription.created` | Update business subscription fields |
| `customer.subscription.updated` | Update plan_name, subscription_status |
| `customer.subscription.deleted` | Set subscription_status to 'canceled' |
| `invoice.payment_failed` | Set subscription_status to 'past_due' |

### Trial Expiration

Handled by scheduled job (Trigger.dev cron):
- Runs daily at 00:00 UTC
- Queries businesses where `trial_end_date < NOW()`
- Sets `subscription_status = 'expired'`
- Optionally sends notification email
