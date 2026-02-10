# REST API Contracts: Expense Submissions

**Feature Branch**: `009-batch-receipt-submission`
**Base Path**: `/api/v1/expense-submissions`

## Endpoints

### `GET /api/v1/expense-submissions`

List expense submissions for the authenticated user's business.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | No | Filter by status (draft, submitted, approved, rejected, reimbursed) |
| `limit` | number | No | Max results (default 20, max 100) |
| `cursor` | string | No | Pagination cursor |

**Response 200:**
```json
{
  "submissions": [
    {
      "id": "jd7abc123...",
      "title": "Submission - Feb 2026",
      "status": "draft",
      "claimCount": 3,
      "totalsByCurrency": [
        { "currency": "THB", "total": 4500.00 },
        { "currency": "USD", "total": 125.50 }
      ],
      "reimbursementProgress": null,
      "submitterName": "John Doe",
      "submittedAt": null,
      "approvedAt": null,
      "createdAt": 1738972800000
    }
  ],
  "cursor": "next_page_token",
  "hasMore": true
}
```

### `GET /api/v1/expense-submissions/:id`

Get a single submission with all claims.

**Response 200:**
```json
{
  "submission": {
    "id": "jd7abc123...",
    "title": "Submission - Feb 2026",
    "status": "submitted",
    "description": null,
    "rejectionReason": null,
    "claimNotes": null,
    "submittedAt": 1738972800000,
    "approvedAt": null,
    "createdAt": 1738972800000
  },
  "claims": [
    {
      "id": "claim_abc...",
      "vendorName": "Grab",
      "totalAmount": 350.00,
      "currency": "THB",
      "expenseCategory": "Transportation",
      "transactionDate": "2026-02-05",
      "status": "submitted",
      "businessPurpose": "Client meeting transport",
      "confidenceScore": 0.92,
      "hasReceipt": true,
      "receiptThumbnailUrl": "https://cdn.example.com/..."
    }
  ],
  "submitter": { "name": "John Doe", "email": "john@example.com" },
  "approver": { "name": "Jane Manager", "email": "jane@example.com" },
  "totalsByCurrency": [
    { "currency": "THB", "total": 4500.00 }
  ],
  "reimbursementProgress": null
}
```

### `POST /api/v1/expense-submissions`

Create a new draft submission.

**Request Body:**
```json
{
  "title": "Business Trip - Bangkok"
}
```
`title` is optional. Auto-generated if not provided.

**Response 201:**
```json
{
  "id": "jd7abc123...",
  "title": "Submission - Feb 2026",
  "status": "draft"
}
```

### `PUT /api/v1/expense-submissions/:id`

Update a draft submission's metadata.

**Request Body:**
```json
{
  "title": "Updated Title",
  "description": "Monthly expenses for February"
}
```

**Response 200:**
```json
{
  "id": "jd7abc123...",
  "title": "Updated Title",
  "status": "draft"
}
```

**Error 400:** Submission is not in draft status.

### `POST /api/v1/expense-submissions/:id/submit`

Submit for manager approval.

**Request Body:** None

**Response 200:**
```json
{
  "id": "jd7abc123...",
  "status": "submitted",
  "submittedAt": 1738972800000,
  "designatedApproverId": "user_xyz..."
}
```

**Error 400:** No claims in submission, or claims still processing.

### `POST /api/v1/expense-submissions/:id/approve`

Approve an entire submission (manager only).

**Request Body:**
```json
{
  "notes": "Looks good, approved."
}
```

**Response 200:**
```json
{
  "id": "jd7abc123...",
  "status": "approved",
  "approvedAt": 1738972800000,
  "accountingEntriesCreated": 5
}
```

**Error 403:** Current user is not the designated approver.

### `POST /api/v1/expense-submissions/:id/reject`

Reject an entire submission (manager only).

**Request Body:**
```json
{
  "reason": "Receipt for Grab ride is unclear, please reupload.",
  "claimNotes": [
    { "claimId": "claim_abc...", "note": "Receipt image is blurry" },
    { "claimId": "claim_def...", "note": "Amount doesn't match receipt" }
  ]
}
```

**Response 200:**
```json
{
  "id": "jd7abc123...",
  "status": "draft",
  "rejectedAt": 1738972800000
}
```

**Error 403:** Current user is not the designated approver.

### `DELETE /api/v1/expense-submissions/:id`

Soft-delete a draft submission.

**Response 200:**
```json
{
  "deleted": true
}
```

**Error 400:** Submission is not in draft status.

### `POST /api/v1/expense-submissions/:id/claims`

Add a receipt to a submission (triggers AI extraction).

**Request Body:** `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `file` | File | Receipt image or PDF (max 10MB, JPEG/PNG/WebP/PDF) |
| `businessPurpose` | string | Optional — can be set later after extraction |

**Response 201:**
```json
{
  "claimId": "claim_new...",
  "status": "uploading",
  "submissionId": "jd7abc123..."
}
```

### `DELETE /api/v1/expense-submissions/:id/claims/:claimId`

Remove a claim from a submission.

**Response 200:**
```json
{
  "removed": true,
  "remainingClaims": 4
}
```

**Error 400:** Submission is not in draft status.

### `GET /api/v1/expense-submissions/pending-approvals`

List submissions awaiting the current manager's approval.

**Response 200:**
```json
{
  "submissions": [
    {
      "id": "jd7abc123...",
      "title": "Submission - Feb 2026",
      "submitterName": "John Doe",
      "claimCount": 5,
      "totalsByCurrency": [
        { "currency": "THB", "total": 8500.00 }
      ],
      "submittedAt": 1738972800000
    }
  ]
}
```

## Error Responses

All errors follow the existing API pattern:

```json
{
  "error": {
    "code": "SUBMISSION_NOT_DRAFT",
    "message": "Submission must be in draft status to perform this action."
  }
}
```

| Code | Status | Description |
|------|--------|-------------|
| `SUBMISSION_NOT_FOUND` | 404 | Submission ID does not exist |
| `SUBMISSION_NOT_DRAFT` | 400 | Action requires draft status |
| `SUBMISSION_EMPTY` | 400 | Cannot submit with zero claims |
| `CLAIMS_STILL_PROCESSING` | 400 | Cannot submit while claims are being processed |
| `NOT_DESIGNATED_APPROVER` | 403 | Current user is not the assigned approver |
| `MAX_CLAIMS_EXCEEDED` | 400 | Submission has reached 50-claim limit |
| `UNAUTHORIZED` | 401 | User not authenticated |
| `FORBIDDEN` | 403 | User lacks permission for this action |
