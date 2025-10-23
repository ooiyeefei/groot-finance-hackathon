# Implementation Guide: LLM-Generated Error Messages for Expense Claims

This guide helps you implement LLM-generated error messages with actionable suggestions for the expense_claims domain, matching the implementation completed for the invoices domain.

---

## 🎯 Goal

Enable the AI extraction pipeline to generate contextual, actionable error messages with suggestions when receipt extraction fails, storing them in a structured jsonb format and displaying them with a consistent UI component.

---

## 📋 Overview

**What You're Building:**
1. **Database**: Migrate `expense_claims.error_message` from text to jsonb
2. **Python AI Script**: Update DSPy signature to generate `user_message` and `suggestions[]`
3. **TypeScript Orchestrator**: Extract LLM suggestions and store jsonb error objects
4. **Retry Configuration**: Set `maxAttempts: 1` to prevent wasteful retries on extraction failures
5. **Frontend**: Use existing `ErrorMessageCard` component to display structured errors

**Reference Implementation:**
- Invoices domain: `src/domains/invoices/CLAUDE.md` (lines 287-359)
- Completed files: `src/trigger/classify-document.ts`, `src/python/classify_document.py`

---

## 🔧 Step 1: Database Schema Migration

### **Task**: Change `expense_claims.error_message` column from text to jsonb

**Current Schema:**
```sql
-- expense_claims table
error_message TEXT NULL
```

**Target Schema:**
```sql
-- expense_claims table
error_message JSONB NULL
```

**JSONB Structure:**
```json
{
  "message": "Could not extract vendor name from receipt. Please ensure the receipt is clear and readable.",
  "suggestions": [
    "Take a clearer photo with better lighting",
    "Ensure the receipt is not crumpled or torn",
    "Try uploading the receipt again"
  ],
  "error_type": "extraction_failed",
  "detected_issues": ["poor_image_quality", "missing_vendor"],
  "confidence": 0.45
}
```

### **Migration Steps:**

1. **Create Migration File**:
```bash
# Create new migration in supabase/migrations/
touch supabase/migrations/$(date +%Y%m%d%H%M%S)_expense_claims_error_message_jsonb.sql
```

2. **Migration SQL**:
```sql
-- Migration: Convert expense_claims.error_message from text to jsonb
-- Date: 2025-10-23
-- Purpose: Enable LLM-generated error messages with suggestions

BEGIN;

-- Step 1: Add new jsonb column
ALTER TABLE expense_claims
ADD COLUMN error_message_new JSONB;

-- Step 2: Migrate existing text data to jsonb
-- Convert plain text errors to structured format
UPDATE expense_claims
SET error_message_new = jsonb_build_object(
  'message', error_message,
  'error_type', 'legacy_error'
)
WHERE error_message IS NOT NULL;

-- Step 3: Drop old column
ALTER TABLE expense_claims
DROP COLUMN error_message;

-- Step 4: Rename new column
ALTER TABLE expense_claims
RENAME COLUMN error_message_new TO error_message;

-- Step 5: Add comment for documentation
COMMENT ON COLUMN expense_claims.error_message IS
'Structured error message with LLM-generated suggestions. Format: {message: string, suggestions: string[], error_type: string, detected_issues?: string[], confidence?: number}';

COMMIT;
```

3. **Apply Migration**:
```bash
# If using Supabase CLI
supabase db push

# Or apply via Supabase dashboard SQL editor
```

4. **Verify Migration**:
```sql
-- Check column type changed
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'expense_claims'
  AND column_name = 'error_message';

-- Should return: error_message | jsonb
```

---

## 🐍 Step 2: Update Python DSPy Extraction Script

### **File**: `src/python/extract_receipt_data.py`

### **Changes Required:**

#### **2.1: Update Pydantic Model (lines ~54-60)**

**Add suggestions field to ScriptResponse:**
```python
class ScriptResponse(BaseModel):
    success: bool = Field(..., description="Whether the script executed successfully")
    data: Optional[Dict[str, Any]] = Field(None, description="Extraction result data")
    error: Optional[str] = Field(None, description="Error message if failed")
    user_message: Optional[str] = Field(None, description="User-friendly error message")  # NEW
    suggestions: Optional[List[str]] = Field(None, description="Actionable suggestions")  # NEW
    debug_info: Optional[Dict[str, Any]] = Field(None, description="Debug information")
    processing_time_ms: Optional[int] = Field(None, description="Processing time in milliseconds")
```

#### **2.2: Update DSPy Signature (lines ~62-68)**

**Enhance SimpleReceiptSignature to generate suggestions:**
```python
class SimpleReceiptSignature(dspy.Signature):
    """Fast structured extraction for receipts with error guidance"""
    receipt_image: dspy.Image = dspy.InputField(desc="Receipt image for analysis")
    available_categories: str = dspy.InputField(desc="JSON list of available expense categories")
    extracted_data: ExtractedReceiptData = dspy.OutputField(desc="Complete structured receipt data with selected category")
    user_message: str = dspy.OutputField(desc="User-friendly message explaining extraction status or issues")  # NEW
    suggestions: List[str] = dspy.OutputField(desc="1-3 specific actionable suggestions if extraction failed or had issues")  # NEW
```

**Rationale**: DSPy signatures automatically guide the LLM to generate these fields based on the extraction context.

#### **2.3: Update Error Handling (search for error handling blocks)**

**Pattern to find:**
```python
# Search for blocks like this:
return ScriptResponse(
    success=False,
    error="Failed to extract receipt data",
    # ...
).model_dump()
```

**Update to include suggestions:**
```python
# Example error handling update:
try:
    result = extractor.extract(image_data, business_categories)
except Exception as e:
    return ScriptResponse(
        success=False,
        error=str(e),
        user_message="Could not extract data from receipt. Please check the image quality.",  # NEW
        suggestions=[  # NEW
            "Ensure the receipt is clearly visible and well-lit",
            "Try uploading a higher resolution image",
            "Check that the entire receipt is visible in the frame"
        ],
        debug_info={"error_type": "extraction_failure", "exception": str(e)}
    ).model_dump()
```

#### **2.4: Success Path with Guidance**

**Even for successful extractions, provide helpful messages:**
```python
# When extraction succeeds but confidence is low:
if result.confidence_score < 0.7:
    user_message = "Extraction completed with lower confidence. Please verify the extracted data."
    suggestions = [
        "Double-check vendor name and total amount",
        "Verify the transaction date is correct",
        "Consider re-uploading a clearer image if data looks incorrect"
    ]
else:
    user_message = "Receipt extracted successfully."
    suggestions = []

return ScriptResponse(
    success=True,
    data=result.model_dump(),
    user_message=user_message,  # NEW
    suggestions=suggestions,     # NEW
    processing_time_ms=processing_time
).model_dump()
```

---

## 📘 Step 3: Update TypeScript Trigger.dev Task

### **File**: `src/trigger/extract-receipt-data.ts`

### **Changes Required:**

#### **3.1: Update Retry Configuration (lines ~8-20 area, task definition)**

**Find the task definition:**
```typescript
export const extractReceiptData = task({
  id: "extract-receipt-data",
  // ... existing config
```

**Update retry configuration:**
```typescript
export const extractReceiptData = task({
  id: "extract-receipt-data",
  retry: {
    maxAttempts: 1,  // ✅ No retries - extraction failures should not retry
    // Note: This prevents retries for ALL errors (both extraction failures and system errors).
    // Trade-off: Avoids wasting time/resources on re-extracting unclear receipts.
    // Rationale: If extraction fails due to poor image quality, retrying won't help.
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    randomize: true
  },
  run: async (payload: ExtractReceiptPayload, { ctx }) => {
    // ... existing implementation
```

**Key Point**: Remove or set to 1 any retry configuration that might cause the task to retry on extraction failures.

#### **3.2: Update Database Helper Type (if not already done)**

**File**: `src/trigger/utils/db-helpers.ts` (line ~50)

**Ensure `updateDocumentStatus` accepts jsonb:**
```typescript
export async function updateDocumentStatus(
  documentId: string,
  status: string,
  errorMessage?: string | {
    message: string;
    suggestions?: string[];
    error_type?: string;
    detected_issues?: string[];
    confidence?: number
  },
  tableName: string = 'documents'
): Promise<void> {
  const updateData: any = {
    processing_status: status
  };

  // Add error message if provided (handles both legacy strings and new jsonb objects)
  if (errorMessage) {
    updateData.error_message = errorMessage;  // ✅ Supabase handles jsonb serialization automatically
  }

  // ... rest of function
```

#### **3.3: Update Extraction Result Handling**

**Find where Python script results are processed** (search for `python.runScript` or `rawResult`):

**Pattern to find:**
```typescript
const rawResult = await python.runScript(
  "./src/python/extract_receipt_data.py",
  [signedUrl, businessCategories]
);

// Parse result
const result = JSON.parse(rawResult.stdout);

// Handle errors
if (!result.success) {
  await updateDocumentStatus(documentId, 'extraction_failed', result.error, 'expense_claims');
  throw new Error(result.error);
}
```

**Update to extract suggestions:**
```typescript
const rawResult = await python.runScript(
  "./src/python/extract_receipt_data.py",
  [signedUrl, businessCategories]
);

// Parse result
const result = JSON.parse(rawResult.stdout);

// Handle errors with LLM-generated suggestions
if (!result.success) {
  // ✅ Construct jsonb error object with suggestions
  const errorDetails = {
    message: result.user_message || result.error || 'Receipt extraction failed',
    suggestions: result.suggestions || [
      'Ensure the receipt is clearly visible and well-lit',
      'Try uploading a higher resolution image',
      'Check that the entire receipt is visible in the frame'
    ],
    error_type: 'extraction_failed',
    detected_issues: result.debug_info?.detected_issues || [],
    confidence: result.debug_info?.confidence || 0
  };

  console.log(`[Extract] Receipt extraction failed - LLM-generated error:`, errorDetails);

  await updateDocumentStatus(documentId, 'extraction_failed', errorDetails, 'expense_claims');

  // ⚠️ CRITICAL: Throw error AFTER database update (not before)
  throw new Error(errorDetails.message);
}

// Success path - also handle low confidence warnings
if (result.data && result.suggestions && result.suggestions.length > 0) {
  console.log(`[Extract] Low confidence extraction - suggestions:`, result.suggestions);
  // Store suggestions in metadata for UI display even on success
}
```

#### **3.4: Fix Catch Block (CRITICAL)**

**Find the catch block** (usually at the bottom of the task):

**❌ WRONG (overwrites jsonb with plain string):**
```typescript
} catch (error) {
  console.error(`[Extract] Extraction failed for ${documentId}:`, error);

  // ❌ DON'T DO THIS - overwrites jsonb error with plain string
  await updateDocumentStatus(
    documentId,
    'extraction_failed',
    error.message,  // ❌ Plain string overwrites jsonb
    'expense_claims'
  );

  throw error;
}
```

**✅ CORRECT (preserve jsonb error):**
```typescript
} catch (error) {
  console.error(`[Extract] Extraction failed for ${documentId}:`, error);

  // ✅ Don't overwrite error_message if it was already set with jsonb structure
  // The error handler above (lines XXX-YYY) already updated the database
  // with structured error messages. Re-updating here would overwrite with plain string.

  // Re-throw for Trigger.dev error handling
  throw error;
}
```

**Critical Rule**: The catch block should **NEVER** call `updateDocumentStatus()` if the error was already handled and the database already updated with jsonb structure.

#### **3.5: Update TypeScript Schemas**

**File**: `src/trigger/utils/schemas.ts` (or wherever extraction result schemas are defined)

**Add suggestions field:**
```typescript
export const ExtractionResultSchema = z.object({
  success: z.boolean(),
  document_type: z.string().optional(),
  extracted_data: z.any().optional(),
  confidence_score: z.number().optional(),
  extraction_method: z.string().optional(),
  model_used: z.string().optional(),
  metadata: z.any().optional(),
  error: z.string().optional(),
  user_message: z.string().optional(),       // NEW
  suggestions: z.array(z.string()).optional(), // NEW
  error_type: z.string().optional()
});
```

---

## 🎨 Step 4: Frontend Integration

### **File**: `src/domains/expense-claims/components/expense-claims-list.tsx` (or wherever expense claims are displayed)

### **Changes Required:**

#### **4.1: Import ErrorMessageCard**

```typescript
import { ErrorMessageCard } from '@/components/ui/error-message-card'
```

#### **4.2: Define ErrorDetails Type**

```typescript
// Add to your types file or inline:
interface ErrorDetails {
  message: string
  suggestions?: string[]
  error_type?: string
  detected_issues?: string[]
  confidence?: number
}
```

#### **4.3: Type Guard for ErrorDetails**

```typescript
// Type guard to check if error_message is structured jsonb
function isErrorDetails(value: unknown): value is ErrorDetails {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as ErrorDetails).message === 'string'
  )
}
```

#### **4.4: Render Error Messages**

**Find where expense claims with errors are displayed:**

```typescript
// Example rendering pattern:
{expenseClaim.processing_status === 'extraction_failed' && (
  <div className="mt-4">
    {(() => {
      const errorMsg = expenseClaim.error_message
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

**Example in card layout:**
```typescript
<Card className="bg-card border-border">
  <CardHeader>
    <CardTitle className="text-foreground">Receipt Extraction</CardTitle>

    {/* Status Badge */}
    <Badge className={getStatusBadgeClass(claim.processing_status)}>
      {claim.processing_status}
    </Badge>
  </CardHeader>

  <CardContent>
    {/* Display extracted data or error */}
    {claim.processing_status === 'completed' && (
      <div className="space-y-2">
        <p className="text-foreground">Vendor: {claim.vendor_name}</p>
        <p className="text-muted-foreground">Amount: {claim.total_amount} {claim.currency}</p>
      </div>
    )}

    {claim.processing_status === 'extraction_failed' && (
      <ErrorMessageCard
        message={isErrorDetails(claim.error_message)
          ? claim.error_message.message
          : claim.error_message || 'Extraction failed'
        }
        suggestions={isErrorDetails(claim.error_message)
          ? claim.error_message.suggestions
          : undefined
        }
      />
    )}
  </CardContent>
</Card>
```

---

## 🧪 Step 5: Testing & Validation

### **5.1: Database Testing**

```sql
-- Test 1: Verify column type changed
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'expense_claims'
  AND column_name = 'error_message';
-- Expected: jsonb

-- Test 2: Insert structured error
INSERT INTO expense_claims (id, error_message, processing_status)
VALUES (
  gen_random_uuid(),
  '{"message": "Test error", "suggestions": ["Suggestion 1", "Suggestion 2"]}'::jsonb,
  'extraction_failed'
);

-- Test 3: Query structured errors
SELECT
  id,
  error_message->>'message' as error_msg,
  error_message->'suggestions' as suggestions,
  processing_status
FROM expense_claims
WHERE processing_status = 'extraction_failed'
LIMIT 5;
```

### **5.2: Python Script Testing**

```bash
# Test Python script locally with a sample receipt image
cd src/python

# Create test script:
python3 extract_receipt_data.py \
  "https://example.com/sample-receipt.jpg" \
  '[{"category_name":"Meals","category_code":"MEALS"}]'

# Verify output includes:
# - success: true/false
# - user_message: <string>
# - suggestions: [<array of strings>]
```

### **5.3: End-to-End Testing**

**Test Case 1: Clear Receipt (Happy Path)**
1. Upload a clear, readable receipt image
2. Expected: Extraction completes successfully
3. Verify: `processing_status = 'completed'`, no error_message
4. Verify: Extracted data displayed correctly

**Test Case 2: Poor Quality Receipt (Error Path)**
1. Upload a blurry, dark, or torn receipt image
2. Expected: Extraction fails with structured error
3. Verify database:
```sql
SELECT error_message FROM expense_claims WHERE id = 'test-document-id';
-- Should show: {"message": "...", "suggestions": [...], "error_type": "..."}
```
4. Verify frontend: ErrorMessageCard displays message + suggestions
5. Verify Trigger.dev: Only 1 attempt (no retries)

**Test Case 3: Low Confidence Extraction**
1. Upload a receipt with partially obscured text
2. Expected: Extraction completes but with warnings
3. Verify: Suggestions provided even though status is 'completed'

### **5.4: Validation Checklist**

- [ ] Database column migrated from text to jsonb
- [ ] Python script generates `user_message` and `suggestions` fields
- [ ] TypeScript extracts suggestions and constructs jsonb error object
- [ ] Database stores jsonb structure (NOT plain string)
- [ ] Catch block does NOT overwrite jsonb errors
- [ ] `maxAttempts: 1` set in retry configuration
- [ ] Frontend displays ErrorMessageCard with suggestions
- [ ] Build passes: `npm run build`
- [ ] TypeScript compilation successful
- [ ] No hardcoded error messages (all LLM-generated)

---

## 📚 Reference Files

### **Completed Implementation (Invoices Domain)**
- `src/trigger/classify-document.ts` - TypeScript orchestrator pattern
- `src/python/classify_document.py` - Python DSPy signature pattern
- `src/domains/invoices/CLAUDE.md` (lines 287-359) - Implementation documentation
- `src/components/ui/error-message-card.tsx` - Reusable UI component

### **Key Patterns to Follow**

**Pattern 1: Jsonb Error Construction**
```typescript
const errorDetails = {
  message: result.user_message || result.error,
  suggestions: result.suggestions || [],
  error_type: 'extraction_failed',
  detected_issues: [],
  confidence: 0
};
```

**Pattern 2: Database Update Before Error**
```typescript
// ✅ CORRECT ORDER
await updateDocumentStatus(documentId, 'extraction_failed', errorDetails, tableName);
throw new Error(errorDetails.message);  // Throw AFTER database update
```

**Pattern 3: Catch Block Preservation**
```typescript
} catch (error) {
  console.error(`[Extract] Failed:`, error);
  // ✅ DON'T call updateDocumentStatus() here - database already updated
  throw error;  // Just re-throw
}
```

---

## 🎯 Success Criteria

You've successfully implemented LLM-generated error messages when:

1. ✅ Database query shows jsonb structure with suggestions array
2. ✅ Python script output includes `user_message` and `suggestions` fields
3. ✅ TypeScript logs show: `[Extract] Receipt extraction failed - LLM-generated error: {message, suggestions[]...}`
4. ✅ Frontend displays ErrorMessageCard with bullet-point suggestions
5. ✅ Trigger.dev shows only 1 attempt (no retries) for extraction failures
6. ✅ Build completes without TypeScript errors
7. ✅ No plain string errors overwriting jsonb structures

---

## 🐛 Common Issues & Solutions

### **Issue 1: Build Fails with Type Error**
```
Type 'string' is not assignable to type '{ message: string; suggestions?: string[]; ... }'
```

**Solution**: Update the type definition in your domain's data-access file:
```typescript
// src/domains/expense-claims/lib/data-access.ts
export interface ErrorDetails {
  message: string
  suggestions?: string[]
  error_type?: string
  detected_issues?: string[]
  confidence?: number
}

export interface ExpenseClaim {
  // ...
  error_message?: ErrorDetails | null  // ✅ Accept jsonb structure
}
```

### **Issue 2: Frontend Shows "undefined" for Suggestions**
**Cause**: Type guard not properly checking for jsonb structure

**Solution**: Use the provided `isErrorDetails()` type guard:
```typescript
function isErrorDetails(value: unknown): value is ErrorDetails {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as ErrorDetails).message === 'string'
  )
}
```

### **Issue 3: Database Still Shows Plain Text Errors**
**Cause**: Catch block is overwriting jsonb errors with plain strings

**Solution**: Remove or comment out the `updateDocumentStatus()` call in the catch block:
```typescript
} catch (error) {
  console.error(`[Extract] Failed:`, error);
  // ❌ REMOVE THIS:
  // await updateDocumentStatus(documentId, 'extraction_failed', error.message, 'expense_claims');

  // ✅ Just re-throw:
  throw error;
}
```

### **Issue 4: Python Script Not Generating Suggestions**
**Cause**: DSPy signature not updated or LLM not receiving proper instructions

**Solution**: Update the SimpleReceiptSignature with clear field descriptions:
```python
class SimpleReceiptSignature(dspy.Signature):
    """Fast structured extraction for receipts with error guidance"""
    receipt_image: dspy.Image = dspy.InputField(desc="Receipt image for analysis")
    available_categories: str = dspy.InputField(desc="JSON list of available expense categories")
    extracted_data: ExtractedReceiptData = dspy.OutputField(desc="Complete structured receipt data")
    user_message: str = dspy.OutputField(
        desc="Clear, user-friendly message explaining extraction status, issues, or success"
    )
    suggestions: List[str] = dspy.OutputField(
        desc="1-3 specific, actionable suggestions if extraction had issues (e.g., 'Try uploading a clearer image', 'Ensure receipt is well-lit'). Empty list if extraction was successful."
    )
```

---

## 🚀 Quick Start Checklist

Use this checklist to track your progress:

- [ ] **Step 1**: Create and apply database migration (text → jsonb)
- [ ] **Step 2.1**: Update Python Pydantic model (add `user_message`, `suggestions`)
- [ ] **Step 2.2**: Update Python DSPy signature (add output fields)
- [ ] **Step 2.3**: Update Python error handling (generate suggestions)
- [ ] **Step 3.1**: Update TypeScript retry config (`maxAttempts: 1`)
- [ ] **Step 3.2**: Update TypeScript db-helpers (accept jsonb)
- [ ] **Step 3.3**: Update TypeScript extraction handler (construct jsonb)
- [ ] **Step 3.4**: Fix TypeScript catch block (remove db update)
- [ ] **Step 3.5**: Update TypeScript schemas (add suggestion fields)
- [ ] **Step 4.1**: Import ErrorMessageCard in frontend
- [ ] **Step 4.2**: Add ErrorDetails type definition
- [ ] **Step 4.3**: Add isErrorDetails type guard
- [ ] **Step 4.4**: Render ErrorMessageCard for failed extractions
- [ ] **Step 5**: Run tests and validate end-to-end flow
- [ ] **Final**: Run `npm run build` and verify success

---

## 💡 Tips for Success

1. **Follow the Invoices Pattern**: The implementation is identical, just applied to expense_claims domain
2. **Test Incrementally**: Test each step before moving to the next
3. **Check Logs**: Look for the `[Extract] Receipt extraction failed - LLM-generated error:` log message
4. **Use Type Guards**: Always use `isErrorDetails()` to safely access jsonb fields
5. **Preserve Catch Block**: Never overwrite jsonb errors in the catch block
6. **Build Often**: Run `npm run build` after each major change to catch errors early

---

## 📞 Getting Help

If you encounter issues:
1. Check the **Common Issues** section above
2. Review the reference implementation in `src/domains/invoices/`
3. Compare your code with `src/trigger/classify-document.ts` patterns
4. Verify database migration completed successfully
5. Check Trigger.dev logs for error details

Good luck! 🚀
