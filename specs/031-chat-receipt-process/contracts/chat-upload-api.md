# API Contract: Chat Image Upload

## POST /api/v1/chat/upload

Upload an image file for use in chat. Returns S3 storage reference.

### Request

**Content-Type**: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | Yes | Image file (JPEG, PNG, HEIC, PDF). Max 10 MB. |
| conversationId | string | Yes | Convex conversation ID |
| businessId | string | Yes | Business ID for S3 path scoping |

### Response (200 OK)

```json
{
  "id": "a1b2c3d4-uuid",
  "s3Path": "chat-attachments/business123/conv456/a1b2c3d4.jpg",
  "mimeType": "image/jpeg",
  "filename": "receipt.jpg",
  "size": 245760,
  "uploadedAt": 1711036800000
}
```

### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | `INVALID_FILE_TYPE` | File type not in allowed list |
| 400 | `FILE_TOO_LARGE` | File exceeds 10 MB limit |
| 400 | `MISSING_FIELDS` | conversationId or businessId missing |
| 401 | `UNAUTHORIZED` | Clerk auth failed |
| 500 | `UPLOAD_FAILED` | S3 upload error |

---

## Extended ChatRequestBody (existing endpoint)

### POST /api/copilotkit

Updated request body with optional attachments:

```json
{
  "message": "Here's my lunch receipt",
  "conversationId": "conv_123",
  "businessId": "biz_456",
  "language": "en",
  "attachments": [
    {
      "id": "a1b2c3d4-uuid",
      "s3Path": "chat-attachments/business123/conv456/a1b2c3d4.jpg",
      "mimeType": "image/jpeg",
      "filename": "receipt.jpg",
      "size": 245760
    }
  ]
}
```

### New SSE Event: Status Phases

```
event: status
data: {"phase": "uploading_receipt"}

event: status
data: {"phase": "reading_receipt"}

event: status
data: {"phase": "extracting_details"}
```

---

## Action Card: receipt_claim

Returned as an `action` SSE event when receipt processing completes:

```json
{
  "type": "receipt_claim",
  "data": {
    "claimId": "expense_claim_123",
    "status": "draft",
    "merchant": "Starbucks KLCC",
    "amount": 18.50,
    "currency": "MYR",
    "date": "2026-03-19",
    "category": "Meals & Entertainment",
    "confidence": 0.92,
    "receiptThumbnailUrl": "https://...",
    "lowConfidenceFields": ["category"],
    "actions": ["submit", "edit", "cancel"]
  }
}
```

### Action Card Button Callbacks

| Button | Action | Description |
|--------|--------|-------------|
| Submit | Sends `"Submit expense claim EC-2026-0045"` as user message | Triggers submit_expense_claim tool |
| Edit | Opens inline edit form or sends `"Edit the amount to..."` | Triggers correction flow |
| Cancel | Sends `"Cancel this expense claim"` as user message | Deletes draft claim |
