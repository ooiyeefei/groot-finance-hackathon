# Data Model: Receipt Photo to Expense Claim via Chat

## Entities

### Chat Attachment (stored in messages.metadata)

No new table. Stored as JSON in the existing `metadata` field of `messages`.

```
messages.metadata.attachments: Array<{
  id: string              // UUID, unique per attachment
  mimeType: string        // image/jpeg, image/png, image/heic, application/pdf
  filename: string        // Original filename
  size: number            // File size in bytes
  s3Path: string          // S3 key: chat-attachments/{businessId}/{conversationId}/{id}.{ext}
  thumbnailUrl?: string   // Pre-signed URL for display (generated on read)
  uploadedAt: number      // Unix timestamp
}>
```

### Receipt Extraction Result (stored in expense_claims.processingMetadata)

No new table. Uses existing `processingMetadata` field on `expense_claims`.

```
expense_claims.processingMetadata: {
  extractionMethod: 'dspy'
  confidenceScore: number           // 0-1 overall confidence
  financialData: {
    vendorName: string
    totalAmount: number
    originalCurrency: string        // ISO 4217 code
    transactionDate: string         // YYYY-MM-DD
    description: string
    taxAmount?: number
  }
  fieldConfidence: {                // Per-field confidence for UI flagging
    vendorName: number
    totalAmount: number
    transactionDate: number
    currency: number
    category: number
  }
  categoryMapping: {
    accountingCategory: string
    confidence: number
  }
  sourceType: 'chat'               // Distinguishes from manual upload / email forward
  sourceMessageId?: string         // Links back to originating chat message
  sourceConversationId?: string    // Links back to conversation
}
```

### Expense Claim (existing — extended fields)

Existing table, no schema changes needed. New claims created via chat use existing fields:

```
expense_claims: {
  // Existing fields used as-is:
  businessId, userId, vendorName, totalAmount, currency,
  transactionDate, expenseCategory, businessPurpose,
  status: 'draft' | 'submitted' | ... ,
  storageId,              // S3 key for the receipt image
  processingMetadata,     // OCR results (see above)

  // No new fields needed — sourceType in processingMetadata
  // distinguishes chat-created vs form-created claims
}
```

## State Transitions

### Receipt Processing State (within a single chat tool execution)

```
[Image Received] → [Uploading to Storage] → [Processing OCR] → [Extracting Details]
     ↓                    ↓                       ↓                    ↓
  (validate)          (S3 upload)         (Lambda invoke)      (poll completion)
                                                                      ↓
                                                              [Draft Created]
                                                                      ↓
                                                    [Employee Reviews Card]
                                                         ↓           ↓
                                                    [Corrects]   [Submits]
                                                         ↓           ↓
                                                    [Updates]   [Submitted]
                                                    [Draft]          ↓
                                                              [Routed to Manager]
```

### Chat Message with Attachments Lifecycle

```
[User attaches image] → [Client validates (type, size)]
    ↓
[Preview shown] → [User sends message]
    ↓
[Upload to S3 via /api/v1/chat/upload] → [S3 key returned]
    ↓
[Send message to /api/copilotkit with attachment refs]
    ↓
[Agent receives message → detects image attachment → invokes tool]
    ↓
[Tool: upload → OCR → extract → create claim → return action card]
    ↓
[Action card rendered in chat with Submit/Edit/Cancel]
```

## Relationships

```
Conversation (1) ←→ (N) Messages
Message (1) ←→ (N) Attachments (via metadata)
Message (1) ←→ (0..N) Expense Claims (via processingMetadata.sourceMessageId)
Expense Claim (1) ←→ (1) S3 Object (receipt image, via storageId)
Expense Claim (1) ←→ (0..1) Journal Entry (after approval)
```

## Validation Rules

- File size: max 10 MB per image
- File types: JPEG, PNG, HEIC, PDF only
- One expense claim per receipt image (1:1)
- Duplicate detection: same merchant + amount + date within business = warning
- Mandatory fields for claim creation: amount, date (merchant can default to "Unknown")
- Currency: must be valid ISO 4217 code
