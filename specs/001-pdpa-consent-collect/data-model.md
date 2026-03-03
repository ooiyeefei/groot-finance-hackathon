# Data Model: PDPA Consent Collection

**Date**: 2026-03-03 | **Branch**: `001-pdpa-consent-collect`

## Entity: consent_records

Immutable audit trail of all consent actions. Records are append-only — never deleted. Revocation adds a timestamp to the existing record.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | Reference → users | Yes | The user who gave/revoked consent |
| `businessId` | Reference → businesses | No | Optional business context (consent is user-level, but context is useful for audit) |
| `policyType` | Union: `"privacy_policy"`, `"terms_of_service"` | Yes | Which policy was consented to |
| `policyVersion` | String | Yes | Date-based version identifier (e.g., `"2026-01-15"`) |
| `acceptedAt` | Number (timestamp) | Yes | When consent was recorded |
| `ipAddress` | String | No | Best-effort IP capture for audit trail |
| `userAgent` | String | No | Browser/device info for audit trail |
| `source` | Union: `"onboarding"`, `"invitation"`, `"banner"`, `"settings"` | Yes | Where consent was collected |
| `revokedAt` | Number (timestamp) | No | When consent was revoked (null = active) |

### Indexes

| Index Name | Fields | Purpose |
|------------|--------|---------|
| `by_userId` | `[userId]` | Look up all consent records for a user |
| `by_userId_policyType` | `[userId, policyType]` | Check if user has consented to a specific policy type |
| `by_userId_policyType_policyVersion` | `[userId, policyType, policyVersion]` | Check consent for a specific version (primary consent check) |
| `by_businessId` | `[businessId]` | Admin reporting: consent rates per business |

### Validation Rules

- `policyVersion` must match date format `YYYY-MM-DD`
- `acceptedAt` must be a valid Unix timestamp in milliseconds
- `revokedAt` (if set) must be >= `acceptedAt`
- `source` must be one of the defined union values
- `policyType` must be one of the defined union values

### State Transitions

```
[No Record] → accepted (new record created with acceptedAt)
accepted → revoked (revokedAt timestamp added to existing record)
revoked → [New Record] (re-consent creates a NEW record, old one preserved)
```

**Key constraint**: Revocation modifies the existing record (adds `revokedAt`). Re-consent after revocation creates a **new** record. This preserves the full audit trail.

### Consent Check Logic (Pseudocode)

```
function hasValidConsent(userId, policyType, policyVersion):
  records = query consent_records
    WHERE userId = userId
    AND policyType = policyType
    AND policyVersion = policyVersion
    ORDER BY acceptedAt DESC
    LIMIT 1

  if no records: return false
  if latest record has revokedAt: return false
  return true
```

### Grace Period Logic (Pseudocode)

```
function isGracePeriodExpired(gracePeriodStart):
  GRACE_DAYS = 30
  now = Date.now()
  gracePeriodEnd = gracePeriodStart + (GRACE_DAYS * 24 * 60 * 60 * 1000)
  return now > gracePeriodEnd
```

## Entity: Personal Data Export (Virtual — No Dedicated Table)

Personal data exports are generated on-demand from existing tables. No new table is needed.

### Export Schema (JSON Output)

```json
{
  "exportDate": "2026-03-03T10:00:00Z",
  "exportVersion": "1.0",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "User Name",
    "clerkId": "clerk_abc",
    "createdAt": "2025-01-01T00:00:00Z",
    "emailPreferences": { ... },
    "notificationPreferences": { ... }
  },
  "consentHistory": [
    {
      "policyType": "privacy_policy",
      "policyVersion": "2026-01-15",
      "acceptedAt": "2026-03-01T10:00:00Z",
      "source": "onboarding",
      "revokedAt": null
    }
  ],
  "businessMemberships": [
    {
      "businessName": "Acme Corp",
      "role": "employee",
      "joinedAt": "2025-06-01T00:00:00Z"
    }
  ],
  "activitySummary": {
    "lastLoginAt": "2026-03-03T09:00:00Z",
    "totalExpenseClaims": 42,
    "totalInvoices": 15
  }
}
```

### Data Sources for Export

| Export Section | Source Table | Fields Included |
|---------------|-------------|-----------------|
| `user` | `users` | Profile info, preferences (excluding internal IDs) |
| `consentHistory` | `consent_records` | All records for this user |
| `businessMemberships` | `businesses` + `users.businessMemberships` | Business names, roles, join dates |
| `activitySummary` | Aggregated counts from `expense_claims`, `invoices` | Summary counts only (not full records) |

### Fields Explicitly Excluded from Export

- Internal Convex `_id` fields (replaced with user-facing IDs where applicable)
- `sesEmailVerified`, `sesVerificationToken` (internal system state)
- Other users' data (even within same business)
- Business financial data (available via `/reporting` Export tab for authorized roles)

## Existing Tables Modified

### users (no schema change)

No fields are added to the users table. Consent status is derived by querying `consent_records`.

### businesses (no schema change)

No fields are added. Consent is user-level, not business-level.

## Relationship Diagram

```
users ──1:N──→ consent_records
                  │
                  ├── policyType (privacy_policy | terms_of_service)
                  ├── policyVersion (date string)
                  └── source (onboarding | invitation | banner | settings)

businesses ──optional──→ consent_records.businessId (audit context only)
```
