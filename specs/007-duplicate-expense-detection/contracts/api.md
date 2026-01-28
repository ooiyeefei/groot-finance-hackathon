# API Contracts: Duplicate Expense Claim Detection

**Feature**: 007-duplicate-expense-detection
**Date**: 2026-01-25

## Endpoints

### 1. Check Duplicates (Pre-submission)

**Endpoint**: `POST /api/v1/expense-claims/check-duplicates`

**Purpose**: Check for potential duplicates before form submission (FR-002)

**Request**:
```typescript
interface CheckDuplicatesRequest {
  referenceNumber?: string
  vendorName: string
  transactionDate: string  // YYYY-MM-DD
  totalAmount: number
  currency: string
}
```

**Response (200 OK)**:
```typescript
interface CheckDuplicatesResponse {
  success: true
  data: {
    hasDuplicates: boolean
    matches: DuplicateMatchPreview[]
    highestTier: 'exact' | 'strong' | 'fuzzy' | null
  }
}

interface DuplicateMatchPreview {
  matchedClaimId: string
  matchedClaimRef: string      // Display reference
  matchTier: 'exact' | 'strong' | 'fuzzy'
  matchedFields: string[]      // ['referenceNumber'] or ['vendorName', 'transactionDate', 'totalAmount']
  confidenceScore: number      // 0.0-1.0
  isCrossUser: boolean
  matchedClaim: {
    vendorName: string
    transactionDate: string
    totalAmount: number
    currency: string
    status: string
    submittedBy: string        // User display name
    createdAt: number          // Timestamp
  }
}
```

**Response (400 Bad Request)**:
```typescript
{
  success: false
  error: 'validation_error'
  message: 'Missing required field: vendorName'
}
```

---

### 2. Create Expense Claim (Enhanced)

**Endpoint**: `POST /api/v1/expense-claims`

**Changes**: Add optional override fields to existing endpoint

**Request** (additional fields):
```typescript
interface CreateExpenseClaimRequest {
  // ... existing fields ...

  // NEW: Duplicate override fields
  duplicateOverride?: {
    acknowledgedDuplicates: string[]  // Claim IDs user acknowledged
    reason: string                     // Justification text
    isSplitExpense: boolean           // Checkbox value
  }
}
```

**Response (409 Conflict)** - Enhanced:
```typescript
{
  success: false
  error: 'duplicate_detected'
  message: 'Potential duplicate expense claim detected'
  data: {
    matches: DuplicateMatchPreview[]
    requiresAcknowledgment: boolean   // true if cross-user duplicate
    suggestedAction: 'review' | 'acknowledge_split' | 'cancel'
  }
}
```

---

### 3. Dismiss Duplicate Flag

**Endpoint**: `POST /api/v1/expense-claims/{id}/dismiss-duplicate`

**Purpose**: Manager/user marks potential duplicate as "Not a Duplicate" (FR-007)

**Request**:
```typescript
interface DismissDuplicateRequest {
  matchId: string           // DuplicateMatch ID
  reason: string            // Justification
}
```

**Response (200 OK)**:
```typescript
{
  success: true
  data: {
    claimId: string
    duplicateStatus: 'dismissed'
    updatedAt: number
  }
}
```

---

### 4. Confirm Duplicate

**Endpoint**: `POST /api/v1/expense-claims/{id}/confirm-duplicate`

**Purpose**: Manager confirms claim is actually a duplicate

**Request**:
```typescript
interface ConfirmDuplicateRequest {
  matchId: string           // DuplicateMatch ID
}
```

**Response (200 OK)**:
```typescript
{
  success: true
  data: {
    claimId: string
    duplicateStatus: 'confirmed'
    updatedAt: number
  }
}
```

---

### 5. Resubmit Rejected Claim

**Endpoint**: `POST /api/v1/expense-claims/{id}/resubmit`

**Purpose**: Create new draft from rejected claim (FR-011)

**Request**:
```typescript
interface ResubmitClaimRequest {
  replaceReceipt?: boolean  // If true, expect new file upload
}
```

**Response (201 Created)**:
```typescript
{
  success: true
  data: {
    newClaimId: string
    status: 'draft'
    resubmittedFromId: string   // Original rejected claim ID
    message: 'New draft created from rejected claim'
  }
}
```

**Response (400 Bad Request)**:
```typescript
{
  success: false
  error: 'invalid_status'
  message: 'Only rejected claims can be resubmitted'
}
```

---

### 6. Get Duplicate Report

**Endpoint**: `GET /api/v1/expense-claims/duplicate-report`

**Purpose**: Batch duplicate detection report for admins (User Story 3)

**Query Parameters**:
```
?startDate=2025-01-01
&endDate=2025-01-31
&status=pending              // pending | confirmed_duplicate | dismissed | all
&minConfidence=0.7           // Filter by confidence score
```

**Response (200 OK)**:
```typescript
{
  success: true
  data: {
    totalPairs: number
    pairs: DuplicatePairReport[]
    generatedAt: number
  }
}

interface DuplicatePairReport {
  matchId: string
  claim1: ClaimSummary
  claim2: ClaimSummary
  matchTier: 'exact' | 'strong' | 'fuzzy'
  matchedFields: string[]
  confidenceScore: number
  status: 'pending' | 'confirmed_duplicate' | 'dismissed'
}

interface ClaimSummary {
  id: string
  referenceNumber: string | null
  vendorName: string
  transactionDate: string
  totalAmount: number
  currency: string
  status: string
  submittedBy: string
  createdAt: number
}
```

---

## Convex Functions

### Query: checkDuplicates

```typescript
// convex/functions/expenseClaims.ts

export const checkDuplicates = query({
  args: {
    businessId: v.id('businesses'),
    userId: v.id('users'),
    referenceNumber: v.optional(v.string()),
    vendorName: v.string(),
    transactionDate: v.string(),
    totalAmount: v.number(),
    currency: v.string(),
  },
  returns: v.object({
    hasDuplicates: v.boolean(),
    matches: v.array(v.object({
      matchedClaimId: v.id('expenseClaims'),
      matchTier: v.string(),
      matchedFields: v.array(v.string()),
      confidenceScore: v.number(),
      isCrossUser: v.boolean(),
      matchedClaim: v.object({
        vendorName: v.string(),
        transactionDate: v.string(),
        totalAmount: v.number(),
        currency: v.string(),
        status: v.string(),
        submittedBy: v.string(),
        createdAt: v.number(),
      }),
    })),
    highestTier: v.union(v.literal('exact'), v.literal('strong'), v.literal('fuzzy'), v.null()),
  }),
  handler: async (ctx, args) => {
    // Implementation in duplicate-detection.ts
  },
})
```

### Mutation: dismissDuplicate

```typescript
export const dismissDuplicate = mutation({
  args: {
    claimId: v.id('expenseClaims'),
    matchId: v.id('duplicateMatches'),
    reason: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    // Update duplicateMatches status
    // Update expenseClaim duplicateStatus
  },
})
```

### Mutation: resubmitRejectedClaim

```typescript
export const resubmitRejectedClaim = mutation({
  args: {
    claimId: v.id('expenseClaims'),
  },
  returns: v.object({
    newClaimId: v.id('expenseClaims'),
  }),
  handler: async (ctx, args) => {
    // Validate claim is rejected
    // Create new draft with copied data
    // Set resubmittedFromId/resubmittedToId links
  },
})
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `duplicate_detected` | 409 | Duplicate found, user must acknowledge or cancel |
| `invalid_status` | 400 | Claim status doesn't allow the operation |
| `match_not_found` | 404 | Referenced duplicate match doesn't exist |
| `not_authorized` | 403 | User doesn't have permission for this claim |
| `validation_error` | 400 | Request validation failed |
