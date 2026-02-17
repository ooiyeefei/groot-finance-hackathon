# Error Taxonomy for Groot Finance

Comprehensive guide to error tracking, categorization, and handling in the application.

## Overview

All errors are captured in Sentry with rich context. This document defines:
- Error severity levels
- Domain categorization
- HTTP status codes
- Error codes (for API responses)
- PII protection rules

---

## Error Severity Levels

| Level | Description | Example | Auto-Alerts |
|-------|-------------|---------|-------------|
| `fatal` | System crash, unrecoverable | Database connection down | Discord + Telegram |
| `error` | Application error, user-visible | API route failure | Discord + Telegram |
| `warning` | Unexpected but handled | Rate limit hit | Sentry only |
| `info` | Notable event | Large import completed | Sentry only |
| `debug` | Diagnostic info | Cache miss logged | Sentry only (dev) |

**Note:** Only `fatal` and `error` trigger Discord/Telegram notifications.

---

## Domain Taxonomy

Errors are tagged by domain for filtering and routing:

| Domain | Description | Components |
|--------|-------------|------------|
| `account-management` | User/business management | auth, onboarding, profile |
| `analytics` | Dashboards, reports, metrics | charts, exports |
| `applications` | Job applications | CRUD, workflows |
| `audit` | Audit logging | history, compliance |
| `chat` | AI chat, assistants | conversations, citations |
| `expense-claims` | Expense tracking | submissions, approvals |
| `invoices` | Invoicing | sales-invoices, bills |
| `system` | Infrastructure, webhooks | Sentry, health, notifications |
| `tasks` | Task management | todos, assignments |
| `users` | User settings | preferences, security |
| `utilities` | Helper functions | parsers, formatters |
| `integrations` | Third-party APIs | Stripe, S3, GitHub |

---

## HTTP Status Code Mapping

| Code | Usage | Sentry Action |
|------|-------|---------------|
| `400` | Bad Request (validation) | Breadcrumb only |
| `401` | Unauthorized | Breadcrumb only |
| `403` | Forbidden | Breadcrumb only |
| `404` | Not Found | Breadcrumb only |
| `409` | Conflict | Breadcrumb only |
| `422` | Unprocessable Entity | Breadcrumb only |
| `429` | Too Many Requests | Breadcrumb + metric |
| `500` | Internal Server Error | Full exception capture |
| `502` | Bad Gateway | Full exception capture |
| `503` | Service Unavailable | Full exception capture |

---

## Error Codes (API Response `code` field)

Structured error codes for client handling:

### Authentication (`401-403`)
```typescript
'UNAUTHORIZED'           // No auth token
'TOKEN_EXPIRED'          // JWT expired
'INVALID_TOKEN'          // JWT malformed
'FORBIDDEN'              // Insufficient permissions
'BUSINESS_REQUIRED'      // No business context
```

### Validation (`400`)
```typescript
'INVALID_JSON'           // Malformed request body
'VALIDATION_ERROR'       // Schema validation failed
'REQUIRED_FIELD'         // Missing required field
'INVALID_FORMAT'         // Wrong data type
'OUT_OF_RANGE'           // Value outside allowed range
```

### Business Logic (`409-422`)
```typescript
'ALREADY_EXISTS'         // Duplicate resource
'NOT_FOUND'              // Resource not found
'CONFLICT'               // State conflict
'INVALID_STATE'          // Workflow state violation
'RATE_LIMITED'           // Too many requests
```

### Infrastructure (`500-503`)
```typescript
'INTERNAL_ERROR'         // Generic server error
'DATABASE_ERROR'         // Convex/DB failure
'EXTERNAL_API_ERROR'     // Third-party API failure
'SERVICE_UNAVAILABLE'    // Temporary outage
'TIMEOUT'                // Operation timed out
```

---

## PII Protection

Sensitive data is automatically redacted in Sentry:

### Headers (Always Redacted)
- `Authorization`
- `Cookie`
- `X-Api-Key`
- Any header containing `token`, `key`, `secret`, `auth`

### Request Body (Pattern-Based)
- `password`: `"[REDACTED]"`
- `token`: `"[REDACTED]"`
- `credit_card`: `"[REDACTED]"`
- `ssn`: `"[REDACTED]"`
- `api_key`: `"[REDACTED]"`

### User Context
- Email addresses removed from Sentry user object
- IP addresses: Configurable (currently preserved for geo)

---

## Error Capturing Patterns

### API Routes
```typescript
import { handleApiError, ApiError } from '@/lib/api-error-handler'

try {
  // ... logic
} catch (error) {
  return handleApiError(error, {
    route: '/api/v1/invoices',
    method: 'POST',
    domain: 'invoices',
    request,
    userId,
    businessId,
  })
}
```

### Convex Functions
```typescript
import { captureConvexError } from '@/lib/convex-error-handler'

try {
  await ctx.runMutation(api.functions.invoices.create, args)
} catch (error) {
  captureConvexError(error, {
    function: 'invoices.create',
    type: 'mutation',
    domain: 'invoices',
    userId,
  })
  throw error
}
```

### React Components
```typescript
import * as Sentry from '@sentry/nextjs'

try {
  await submitForm(data)
} catch (error) {
  Sentry.captureException(error, {
    tags: { component: 'InvoiceForm', domain: 'invoices' },
    extra: { invoiceId: data.id },
  })
  showErrorToast('Failed to save')
}
```

---

## Sentry Tags Reference

| Tag | Values | Description |
|-----|--------|-------------|
| `domain` | See Domain Taxonomy | Error origin domain |
| `errorBoundary` | `global`, `route` | Where error was caught |
| `api` | `true` | API route error |
| `convex` | `true` | Convex function error |
| `level` | `fatal`, `error`, `warning` | Severity level |
| `route` | Full API path | API route path |
| `method` | `GET`, `POST`, etc. | HTTP method |
| `status_code` | `200`, `500`, etc. | HTTP response code |

---

## Alert Routing

### Discord/Telegram (Real-time)
- Triggers: `level: error|fatal`
- Filter: Production environment only
- Delay: Immediate (webhook)
- Rate limit: Max 1 per 30 seconds per issue

### Sentry (All Errors)
- Triggers: All severity levels
- Sampling: 10% traces in prod, 100% in dev
- Retention: 90 days
- Integrations: GitHub issues (manual link)

### PagerDuty (Future)
- Triggers: `level: fatal` + specific conditions
- Examples: >50% error rate, payment service down

---

## Debugging Response Headers

For 5xx errors, responses include:
```json
{
  "success": false,
  "error": "Internal server error",
  "code": "INTERNAL_ERROR",
  "request_id": "abc123-def456"  // Sentry event ID
}
```

Use `request_id` to find the exact error in Sentry.

---

## Best Practices

1. **Always use `handleApiError`** in API routes (consistent handling)
2. **Use `ApiError` for expected failures** (validation, permissions)
3. **Add context with `extra`** fields (IDs, timestamps, durations)
4. **Don't double-capture** (handler captures automatically)
5. **Re-throw in Convex** after capturing (maintain flow)
6. **Test error scenarios** in development (use `/api/test-error` pattern)

---

## Quick Reference

| Situation | Function | Severity |
|-----------|----------|----------|
| API route catch | `handleApiError()` | auto-detected |
| Validation failure | `new ApiError(..., 400)` | breadcrumb |
| Auth failure | `new ApiError(..., 401)` | breadcrumb |
| DB failure | `handleApiError()` | error/fatal |
| Unexpected error | `handleApiError()` | error |
| Convex function | `captureConvexError()` | auto-detected |
| Client-side error | `Sentry.captureException()` | auto-detected |
