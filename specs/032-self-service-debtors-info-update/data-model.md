# Data Model: Debtor Self-Service Information Update

**Feature**: 032-self-service-debtors-info-update
**Date**: 2026-03-22

## New Tables

### debtor_update_tokens

Stores time-limited tokens that map to a specific business+customer pair. One active token per debtor.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | Id\<businesses\> | Yes | FK to businesses table |
| customerId | Id\<customers\> | Yes | FK to customers table |
| token | string | Yes | UUID v4, unique identifier for the public URL |
| createdAt | number | Yes | Unix timestamp of creation |
| expiresAt | number | Yes | Unix timestamp of expiry (default: createdAt + 30 days) |
| usageCount | number | Yes | Number of form submissions using this token (starts at 0) |
| lastUsedAt | number | No | Timestamp of most recent form submission |
| emailSentAt | number | No | Timestamp of most recent email sent with this token |
| isRevoked | boolean | No | True if admin manually invalidated this token |

**Indexes**:
- `by_token` → [token] — Primary lookup for public form access
- `by_businessId_customerId` → [businessId, customerId] — Find existing token for debtor
- `by_businessId` → [businessId] — List all tokens for a business

**Lifecycle**: Created on first QR code generation or email send → Active until expiry or revocation → Replaced on regeneration (old token revoked)

### debtor_change_log

Immutable audit trail of every self-service update. Supports field-level diff display and full snapshot revert.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | Id\<businesses\> | Yes | FK to businesses table |
| customerId | Id\<customers\> | Yes | FK to customers table |
| tokenId | Id\<debtor_update_tokens\> | Yes | Token used for this submission |
| changedFields | array\<{fieldName, oldValue, newValue}\> | Yes | Field-level diffs |
| oldSnapshot | object | Yes | Full customer record before update |
| newSnapshot | object | Yes | Full customer record after update |
| submittedAt | number | Yes | Unix timestamp of submission |
| source | string | Yes | "self_service" or "admin_revert" |
| isReverted | boolean | No | True if this change was reverted |
| revertedAt | number | No | Timestamp of revert action |
| revertedBy | string | No | User ID of admin who reverted |

**Indexes**:
- `by_businessId_customerId` → [businessId, customerId] — Change history for a debtor
- `by_businessId` → [businessId] — All changes for a business (for Action Center queries)

**Lifecycle**: Created on every form submission → Immutable (never deleted) → Marked as reverted if admin reverts

## Modified Tables

### businesses (invoiceSettings)

Add to existing `invoiceSettings` object:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| enableDebtorSelfServiceQr | boolean | true | Toggle QR code on invoice PDFs |

### customers (no schema changes)

All required fields already exist: businessName, email, phone, contactPerson, contactPersonPosition, tin, brn, sstRegistration, idType, addressLine1-3, city, stateCode, postalCode, countryCode, phone2, fax, website, businessNature, customerCode.

## Entity Relationships

```
businesses (1) ──→ (many) customers
businesses (1) ──→ (many) debtor_update_tokens
customers  (1) ──→ (many) debtor_update_tokens (but only 1 active at a time)
customers  (1) ──→ (many) debtor_change_log
debtor_update_tokens (1) ──→ (many) debtor_change_log
actionCenterInsights ←── created on each debtor_change_log entry
```

## State Transitions

### Token States
```
[none] → Active (created via QR generation or email send)
Active → Expired (expiresAt < now)
Active → Revoked (admin clicks "Regenerate" or manually revokes)
Expired/Revoked → [new Active] (admin regenerates)
```

### Change Log States
```
Created → [immutable] (normal state)
Created → Reverted (admin clicks "Revert", isReverted=true)
```

## Validation Rules

- Token must be UUID v4 format
- expiresAt must be > createdAt
- usageCount must be < 5 per 24h window (rate limit check at submission time)
- changedFields array must not be empty (no-op submissions rejected)
- Customer fields follow existing validation: TIN format, state codes from MALAYSIAN_STATE_CODES, country codes from COUNTRY_CODES
