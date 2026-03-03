# API Contracts: PDPA Consent

**Date**: 2026-03-03 | **Branch**: `001-pdpa-consent-collect`

## Convex Functions (Primary Interface)

Consent data lives in Convex and uses real-time subscriptions for reactivity.

### Query: `consent.hasAcceptedCurrentPolicy`

Check if the authenticated user has a valid (non-revoked) consent record for a given policy type and version.

**Arguments**:
```typescript
{
  policyType: "privacy_policy" | "terms_of_service"
  policyVersion: string  // e.g., "2026-01-15"
}
```

**Returns**:
```typescript
{
  hasConsent: boolean
  record?: {
    acceptedAt: number
    source: "onboarding" | "invitation" | "banner" | "settings"
    policyVersion: string
  }
}
```

**Auth**: Authenticated user (reads own records only)

---

### Query: `consent.getConsentHistory`

Get all consent records for the authenticated user.

**Arguments**:
```typescript
{
  policyType?: "privacy_policy" | "terms_of_service"  // optional filter
}
```

**Returns**:
```typescript
{
  records: Array<{
    policyType: "privacy_policy" | "terms_of_service"
    policyVersion: string
    acceptedAt: number
    source: "onboarding" | "invitation" | "banner" | "settings"
    revokedAt?: number
  }>
}
```

**Auth**: Authenticated user (reads own records only)

---

### Mutation: `consent.recordConsent`

Record a new consent action. Called from onboarding, invitation acceptance, banner, or settings.

**Arguments**:
```typescript
{
  policyType: "privacy_policy" | "terms_of_service"
  policyVersion: string
  source: "onboarding" | "invitation" | "banner" | "settings"
  businessId?: Id<"businesses">  // optional context
  ipAddress?: string
  userAgent?: string
}
```

**Returns**:
```typescript
{
  success: boolean
  consentRecordId: Id<"consent_records">
}
```

**Auth**: Authenticated user
**Validation**: Duplicate check — if user already has active consent for same type+version, return existing record ID (idempotent).

---

### Mutation: `consent.revokeConsent`

Revoke an active consent record by adding a `revokedAt` timestamp.

**Arguments**:
```typescript
{
  policyType: "privacy_policy" | "terms_of_service"
  policyVersion: string
}
```

**Returns**:
```typescript
{
  success: boolean
  revokedRecordId: Id<"consent_records">
}
```

**Auth**: Authenticated user
**Validation**: Must have an active (non-revoked) consent record for the specified type+version.

---

## REST API Routes (For IP Capture + Data Export)

### POST `/api/v1/consent/record`

Proxy to Convex `consent.recordConsent` that captures IP address and user agent from request headers before forwarding.

**Request Body**:
```json
{
  "policyType": "privacy_policy",
  "policyVersion": "2026-01-15",
  "source": "onboarding"
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "consentRecordId": "k57..."
  }
}
```

**Response** (400):
```json
{
  "success": false,
  "error": "Invalid policy type"
}
```

**Auth**: Clerk session (via `auth()`)
**Side effects**: Extracts `x-forwarded-for` / `x-real-ip` headers, passes to Convex mutation.

---

### POST `/api/v1/consent/revoke`

Proxy to Convex `consent.revokeConsent` with IP capture.

**Request Body**:
```json
{
  "policyType": "privacy_policy",
  "policyVersion": "2026-01-15"
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "revokedRecordId": "k57..."
  }
}
```

**Auth**: Clerk session
**Side effects**: Extracts IP address for audit trail.

---

### GET `/api/v1/users/data-export`

Generate and return a JSON export of all personal data for the authenticated user.

**Response** (200):
```json
{
  "success": true,
  "data": {
    "exportDate": "2026-03-03T10:00:00Z",
    "exportVersion": "1.0",
    "user": { ... },
    "consentHistory": [ ... ],
    "businessMemberships": [ ... ],
    "activitySummary": { ... }
  }
}
```

**Response Headers**:
```
Content-Type: application/json
Content-Disposition: attachment; filename="groot-my-data-2026-03-03.json"
```

**Auth**: Clerk session (any role — this is a personal data right)
**Performance target**: < 30 seconds for any user (SC-007)

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `CONSENT_ALREADY_ACTIVE` | 409 | User already has active consent for this type+version |
| `CONSENT_NOT_FOUND` | 404 | No active consent record found to revoke |
| `INVALID_POLICY_TYPE` | 400 | Policy type not in allowed union |
| `INVALID_POLICY_VERSION` | 400 | Policy version doesn't match YYYY-MM-DD format |
| `UNAUTHORIZED` | 401 | Not authenticated |
| `EXPORT_FAILED` | 500 | Data export generation failed |
