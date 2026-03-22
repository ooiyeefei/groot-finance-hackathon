# Convex Function Contracts: Debtor Self-Service

## Public Queries (no auth)

### `debtorSelfService.validateToken`
**Type**: `query` (public, no auth)
**Input**: `{ token: string }`
**Output**: `{ valid: boolean, expired?: boolean, rateLimited?: boolean, customer?: CustomerSnapshot, businessName?: string }`
**Logic**: Look up token → check expiry → check rate limit → return customer data if valid

### `debtorSelfService.getFormData`
**Type**: `query` (public, no auth)
**Input**: `{ token: string }`
**Output**: `{ customer: CustomerFields, businessName: string, tokenExpiresAt: number } | null`
**Logic**: Validate token → fetch customer → return pre-fill data

## Public Mutations (no auth)

### `debtorSelfService.submitUpdate`
**Type**: `mutation` (public, no auth)
**Input**: `{ token: string, updates: Partial<CustomerFields> }`
**Output**: `{ success: boolean, error?: string }`
**Logic**:
1. Validate token (not expired, not revoked)
2. Check rate limit (usageCount < 5 in last 24h)
3. Fetch current customer record (old snapshot)
4. Compute changed fields (field-level diff)
5. Update customer record directly
6. Create debtor_change_log entry
7. Create Action Center alert
8. Increment token usageCount, set lastUsedAt
9. Return success

## Internal Mutations

### `debtorSelfService.createToken`
**Type**: `internalMutation`
**Input**: `{ businessId: Id<businesses>, customerId: Id<customers> }`
**Output**: `{ tokenId: Id<debtor_update_tokens>, token: string }`
**Logic**: Check for existing active token → if valid, return it → else create new UUID token with 30-day expiry

### `debtorSelfService.revokeToken`
**Type**: `mutation` (auth required)
**Input**: `{ businessId: Id<businesses>, tokenId: Id<debtor_update_tokens> }`
**Output**: `{ success: boolean }`
**Logic**: Validate business ownership → set isRevoked=true

### `debtorSelfService.regenerateToken`
**Type**: `mutation` (auth required)
**Input**: `{ businessId: Id<businesses>, customerId: Id<customers> }`
**Output**: `{ tokenId: Id<debtor_update_tokens>, token: string }`
**Logic**: Revoke existing token → create new token → return new token

## Authenticated Queries

### `debtorSelfService.getChangeLog`
**Type**: `query` (auth required)
**Input**: `{ businessId: Id<businesses>, customerId: Id<customers> }`
**Output**: `Array<ChangeLogEntry>`
**Logic**: Fetch all change log entries for customer, sorted by submittedAt desc

### `debtorSelfService.getTokenStatus`
**Type**: `query` (auth required)
**Input**: `{ businessId: Id<businesses>, customerId: Id<customers> }`
**Output**: `{ token?: string, createdAt?: number, expiresAt?: number, isActive: boolean, usageCount?: number, emailSentAt?: number } | null`

## Authenticated Mutations

### `debtorSelfService.revertChange`
**Type**: `mutation` (auth required)
**Input**: `{ businessId: Id<businesses>, changeLogId: Id<debtor_change_log> }`
**Output**: `{ success: boolean }`
**Logic**:
1. Fetch change log entry → get oldSnapshot
2. Restore customer record from oldSnapshot
3. Mark change log entry as reverted (isReverted=true, revertedAt, revertedBy)
4. Create new change log entry with source="admin_revert"

## API Routes

### `POST /api/v1/debtor-info-request`
**Auth**: Clerk (authenticated business user)
**Input**: `{ businessId: string, customerId: string }`
**Output**: `{ success: boolean, tokenUrl: string }`
**Logic**:
1. Validate user has access to business
2. Get or create token for debtor
3. Fetch debtor email
4. Send SES email with self-service link
5. Update token.emailSentAt
6. Return success + token URL

### `POST /api/v1/debtor-info-request/bulk`
**Auth**: Clerk (authenticated business user)
**Input**: `{ businessId: string, customerIds: string[] }`
**Output**: `{ sent: number, skipped: number, errors: number }`
**Logic**:
1. Validate user has access to business
2. For each customer: check email exists → get/create token → send email
3. Return summary
