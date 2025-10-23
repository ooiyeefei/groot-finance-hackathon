# Quick LLM Prompt: Implement LLM-Generated Error Messages for Expense Claims

Copy this entire prompt and share it with an LLM working in a different branch/worktree:

---

## Context

I need you to implement LLM-generated error messages with actionable suggestions for the expense_claims domain, following the exact pattern completed for the invoices domain.

**Reference Implementation:**
- File: `src/domains/invoices/CLAUDE.md` (lines 287-359)
- Trigger task: `src/trigger/classify-document.ts`
- Python script: `src/python/classify_document.py`
- UI component: `src/components/ui/error-message-card.tsx`
- Frontend usage: `src/domains/invoices/components/documents-list.tsx`

**Full Implementation Guide**: Read `EXPENSE_CLAIMS_LLM_ERROR_MESSAGES_IMPLEMENTATION.md` for detailed step-by-step instructions.

---

## Your Task

Implement the following 5 changes for expense_claims domain:

### 1. Database Migration

Migrate `expense_claims.error_message` from `TEXT` to `JSONB`:

```sql
-- Create migration: supabase/migrations/$(date +%Y%m%d%H%M%S)_expense_claims_error_message_jsonb.sql

BEGIN;

ALTER TABLE expense_claims ADD COLUMN error_message_new JSONB;

UPDATE expense_claims
SET error_message_new = jsonb_build_object('message', error_message, 'error_type', 'legacy_error')
WHERE error_message IS NOT NULL;

ALTER TABLE expense_claims DROP COLUMN error_message;
ALTER TABLE expense_claims RENAME COLUMN error_message_new TO error_message;

COMMIT;
```

**Jsonb Structure:**
```json
{
  "message": "Could not extract vendor name from receipt.",
  "suggestions": [
    "Take a clearer photo with better lighting",
    "Ensure the receipt is not crumpled or torn"
  ],
  "error_type": "extraction_failed",
  "confidence": 0.45
}
```

### 2. Python Script Updates

**File**: `src/python/extract_receipt_data.py`

**A. Update Pydantic Model:**
```python
class ScriptResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    user_message: Optional[str] = None        # ADD THIS
    suggestions: Optional[List[str]] = None   # ADD THIS
    processing_time_ms: Optional[int] = None
```

**B. Update DSPy Signature:**
```python
class SimpleReceiptSignature(dspy.Signature):
    """Fast structured extraction for receipts with error guidance"""
    receipt_image: dspy.Image = dspy.InputField(desc="Receipt image for analysis")
    available_categories: str = dspy.InputField(desc="JSON list of available expense categories")
    extracted_data: ExtractedReceiptData = dspy.OutputField(desc="Complete structured receipt data")

    # ADD THESE TWO FIELDS:
    user_message: str = dspy.OutputField(desc="User-friendly message explaining extraction status or issues")
    suggestions: List[str] = dspy.OutputField(desc="1-3 specific actionable suggestions if extraction failed")
```

**C. Update Error Returns:**
```python
# Find error handling blocks and add user_message + suggestions:
return ScriptResponse(
    success=False,
    error=str(e),
    user_message="Could not extract data from receipt. Please check the image quality.",  # ADD
    suggestions=[  # ADD
        "Ensure the receipt is clearly visible and well-lit",
        "Try uploading a higher resolution image"
    ]
).model_dump()
```

### 3. TypeScript Trigger Task Updates

**File**: `src/trigger/extract-receipt-data.ts`

**A. Update Retry Configuration:**
```typescript
export const extractReceiptData = task({
  id: "extract-receipt-data",
  retry: {
    maxAttempts: 1,  // CHANGE THIS (was likely 3)
    // Prevents wasteful retries on extraction failures
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    randomize: true
  },
  run: async (payload, { ctx }) => {
```

**B. Update Result Handling:**
```typescript
// Find where Python result is processed:
const result = JSON.parse(rawResult.stdout);

if (!result.success) {
  // REPLACE simple string error with jsonb structure:
  const errorDetails = {
    message: result.user_message || result.error || 'Receipt extraction failed',
    suggestions: result.suggestions || [
      'Ensure the receipt is clearly visible and well-lit',
      'Try uploading a higher resolution image'
    ],
    error_type: 'extraction_failed',
    confidence: result.debug_info?.confidence || 0
  };

  console.log(`[Extract] Receipt extraction failed - LLM-generated error:`, errorDetails);

  await updateDocumentStatus(documentId, 'extraction_failed', errorDetails, 'expense_claims');
  throw new Error(errorDetails.message);  // Throw AFTER database update
}
```

**C. Fix Catch Block (CRITICAL):**
```typescript
} catch (error) {
  console.error(`[Extract] Extraction failed for ${documentId}:`, error);

  // ❌ REMOVE THIS IF IT EXISTS:
  // await updateDocumentStatus(documentId, 'extraction_failed', error.message, 'expense_claims');

  // ✅ Just re-throw (database already updated before error was thrown):
  throw error;
}
```

**D. Update TypeScript Schema:**
```typescript
// File: src/trigger/utils/schemas.ts (or similar)
export const ExtractionResultSchema = z.object({
  success: z.boolean(),
  extracted_data: z.any().optional(),
  error: z.string().optional(),
  user_message: z.string().optional(),         // ADD
  suggestions: z.array(z.string()).optional(), // ADD
  // ... rest of fields
});
```

**E. Verify db-helpers accepts jsonb:**
```typescript
// File: src/trigger/utils/db-helpers.ts
export async function updateDocumentStatus(
  documentId: string,
  status: string,
  errorMessage?: string | {
    message: string;
    suggestions?: string[];
    error_type?: string;
    confidence?: number
  },  // ✅ Should accept both string and jsonb
  tableName: string = 'documents'
): Promise<void> {
```

### 4. Frontend Integration

**File**: `src/domains/expense-claims/components/expense-claims-list.tsx` (or wherever expense claims are displayed)

**A. Import Component:**
```typescript
import { ErrorMessageCard } from '@/components/ui/error-message-card'
```

**B. Add Type Definitions:**
```typescript
interface ErrorDetails {
  message: string
  suggestions?: string[]
  error_type?: string
  confidence?: number
}

// Type guard
function isErrorDetails(value: unknown): value is ErrorDetails {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as ErrorDetails).message === 'string'
  )
}
```

**C. Render Error Messages:**
```typescript
{claim.processing_status === 'extraction_failed' && (
  <div className="mt-4">
    {(() => {
      const errorMsg = claim.error_message
      const message = isErrorDetails(errorMsg)
        ? errorMsg.message
        : typeof errorMsg === 'string'
        ? errorMsg
        : 'Extraction failed'
      const suggestions = isErrorDetails(errorMsg)
        ? errorMsg.suggestions || []
        : []

      return <ErrorMessageCard message={message} suggestions={suggestions} />
    })()}
  </div>
)}
```

### 5. Update Domain Types

**File**: `src/domains/expense-claims/lib/data-access.ts` (or similar)

**Update ErrorDetails export:**
```typescript
export interface ErrorDetails {
  message: string
  suggestions?: string[]
  error_type?: string
  detected_issues?: string[]
  confidence?: number
}

export interface ExpenseClaim {
  id: string
  // ... other fields
  error_message?: ErrorDetails | null  // ✅ Accept jsonb structure
  processing_status: 'pending' | 'processing' | 'completed' | 'extraction_failed'
}
```

---

## Testing Checklist

After implementation, verify:

- [ ] **Database**: `SELECT error_message FROM expense_claims WHERE processing_status = 'extraction_failed'` shows jsonb with suggestions array
- [ ] **Python**: Test script output includes `user_message` and `suggestions` fields
- [ ] **TypeScript**: Logs show `[Extract] Receipt extraction failed - LLM-generated error: {message, suggestions[]...}`
- [ ] **Frontend**: ErrorMessageCard displays with bullet-point suggestions
- [ ] **Trigger.dev**: Only 1 attempt shown (no retries)
- [ ] **Build**: `npm run build` completes successfully

---

## Key Points to Remember

1. **Catch Block Rule**: NEVER call `updateDocumentStatus()` in the catch block - database is already updated before the error is thrown
2. **Retry Strategy**: Set `maxAttempts: 1` to prevent wasteful retries
3. **Jsonb Construction**: Always construct the jsonb object with `message`, `suggestions`, `error_type`, `confidence`
4. **Type Guard**: Use `isErrorDetails()` to safely check if error is jsonb or legacy string
5. **Component Reuse**: Use existing `ErrorMessageCard` component - don't create a new one

---

## Reference Component

The `ErrorMessageCard` component is already created at `src/components/ui/error-message-card.tsx`:

```typescript
<ErrorMessageCard
  message="Could not extract vendor name from receipt."
  suggestions={[
    "Take a clearer photo with better lighting",
    "Ensure the receipt is not crumpled or torn",
    "Try uploading the receipt again"
  ]}
/>
```

**Design Standards**: Component follows Layer 1-2-3 semantic design system:
- Light mode: `bg-red-50 text-red-800 border-red-200`
- Dark mode: `bg-red-900/20 text-red-300 border-red-700/30`
- Uses semantic tokens for consistent theming

---

## Common Errors to Avoid

❌ **Don't**: Overwrite jsonb errors in catch block
❌ **Don't**: Use hardcoded error messages (use LLM-generated)
❌ **Don't**: Keep `maxAttempts: 3` (change to 1)
❌ **Don't**: Forget to update Python DSPy signature
❌ **Don't**: Skip the type guard when accessing error_message

✅ **Do**: Update database BEFORE throwing error
✅ **Do**: Extract suggestions from Python output
✅ **Do**: Use ErrorMessageCard component
✅ **Do**: Test both light and dark mode
✅ **Do**: Run `npm run build` to verify changes

---

## Build Command

Run this to verify all changes compile:

```bash
npm run build
```

If build fails with type errors, check:
1. ErrorDetails type definition updated
2. db-helpers accepts jsonb (string | object)
3. Extraction result schema includes suggestions field

---

Good luck! Follow the pattern exactly as shown in the invoices domain implementation. The full detailed guide is in `EXPENSE_CLAIMS_LLM_ERROR_MESSAGES_IMPLEMENTATION.md`.
