# Phase 4: Multi-Domain Document Architecture Plan

## **Executive Summary**

This phase separates the Applications module from the legacy `documents` table while implementing a **domain routing architecture** for shared Trigger.dev tasks that serve multiple domains.

### **Three Document Domains**

1. **Invoices Domain** → `invoices` table (Phase 3 migration complete)
2. **Expense Claims Domain** → `expense_claims` table (existing system)
3. **Applications Domain** → `application_documents` table (new in Phase 4)

---

## **Problem Statement**

Currently, shared Trigger.dev tasks (`convert-pdf-to-image`, `classify-document`) hardcode `.from('documents')` in database queries. This creates issues because:

- ❌ After Phase 3, invoice documents are in `invoices` table, not `documents`
- ❌ Expense claim documents are in `expense_claims` table
- ❌ Application documents will be in `application_documents` table
- ❌ Shared tasks can't determine which table to update

---

## **Solution: Domain Routing Architecture**

### **1. Add `documentDomain` Parameter to Task Payloads**

```typescript
// Task payload interface
interface DocumentTaskPayload {
  documentId: string;
  documentDomain: 'invoices' | 'expense_claims' | 'applications'; // NEW
  // ... other fields
}
```

### **2. Table Name Mapping**

```typescript
// Domain → Table Name mapping
const DOMAIN_TABLE_MAP = {
  'invoices': 'invoices',
  'expense_claims': 'expense_claims',
  'applications': 'application_documents'
} as const;

function getTableName(domain: DocumentDomain): string {
  return DOMAIN_TABLE_MAP[domain] || 'documents'; // Fallback for safety
}
```

### **3. Update Database Helpers (`db-helpers.ts`)**

**Before:**
```typescript
export async function updateDocumentStatus(
  documentId: string,
  status: string,
  errorMessage?: string
): Promise<void> {
  const { error } = await supabase
    .from('documents')  // ❌ HARDCODED
    .update({ processing_status: status })
    .eq('id', documentId);
}
```

**After:**
```typescript
export async function updateDocumentStatus(
  documentId: string,
  status: string,
  errorMessage?: string,
  tableName: string = 'documents'  // ✅ DYNAMIC with safe default
): Promise<void> {
  const { error } = await supabase
    .from(tableName)  // ✅ ROUTED based on domain
    .update({ processing_status: status })
    .eq('id', documentId);
}
```

**All 4 helpers need this update:**
- ✅ `updateDocumentStatus()`
- ✅ `updateExtractionResults()`
- ✅ `fetchDocumentImage()`
- ✅ `updateDocumentClassification()`

---

## **4. Update Shared Tasks**

### **A. `convert-pdf-to-image.ts`**

**Line 23-31 - Add domain to payload:**
```typescript
export const convertPdfToImage = task({
  id: "convert-pdf-to-image",
  run: async (payload: {
    documentId: string;
    pdfStoragePath?: string;
    documentDomain: 'invoices' | 'expense_claims' | 'applications'; // NEW
    expectedDocumentType?: string;
    applicationId?: string;
    documentSlot?: string;
  }) => {
```

**Line 40-44 - Route database fetch:**
```typescript
const tableName = DOMAIN_TABLE_MAP[payload.documentDomain];
const { data: document, error: fetchError } = await supabase
  .from(tableName)  // ✅ ROUTED
  .select('storage_path')
  .eq('id', payload.documentId)
  .single();
```

**Line 387-393 - Route database update:**
```typescript
const { error: updateError } = await supabase
  .from(tableName)  // ✅ ROUTED
  .update({
    converted_image_path: convertedFolderPath,
    converted_image_width: uploadedPages[0]?.width,
    converted_image_height: uploadedPages[0]?.height,
  })
  .eq('id', payload.documentId)
```

**Line 425 - Pass domain to next task:**
```typescript
await classifyDocument.trigger({
  documentId: payload.documentId,
  documentDomain: payload.documentDomain,  // ✅ PASS THROUGH
  expectedDocumentType,
  applicationId,
  documentSlot
})
```

### **B. `classify-document.ts`**

**Line 24-29 - Add domain to payload:**
```typescript
interface ClassifyDocumentPayload {
  documentId: string;
  documentDomain: 'invoices' | 'expense_claims' | 'applications'; // NEW
  expectedDocumentType?: string;
  applicationId?: string;
  documentSlot?: string;
}
```

**Line 46-50 - Route database fetch:**
```typescript
const tableName = DOMAIN_TABLE_MAP[payload.documentDomain];
const { data: document, error: fetchError } = await supabase
  .from(tableName)  // ✅ ROUTED
  .select('storage_path, converted_image_path, file_type, document_metadata')
  .eq('id', documentId)
  .single();
```

**Line 157-158 - Route helper calls:**
```typescript
await updateDocumentClassification(
  documentId,
  classificationResult,
  taskId,
  tableName  // ✅ PASS TABLE NAME
)
```

**Lines 204-253 - Pass domain to extraction tasks:**
```typescript
switch (docType) {
  case 'ic':
    await tasks.trigger("extract-ic-data", {
      documentId,
      imageStoragePath,
      documentDomain: payload.documentDomain  // ✅ PASS THROUGH
    })
  case 'payslip':
    await tasks.trigger("extract-payslip-data", {
      documentId,
      imageStoragePath,
      documentDomain: payload.documentDomain  // ✅ PASS THROUGH
    })
  // ... etc
}
```

---

## **5. Update Extraction Tasks**

All extraction tasks need similar updates:

### **`extract-ic-data.ts`**
```typescript
export const extractIcData = task({
  id: "extract-ic-data",
  run: async (payload: {
    documentId: string;
    imageStoragePath: string;
    documentDomain: 'invoices' | 'expense_claims' | 'applications'; // NEW
  }) => {
    const tableName = DOMAIN_TABLE_MAP[payload.documentDomain];

    // Use tableName in all database operations
    const { data: document } = await supabase
      .from(tableName)  // ✅ ROUTED
      .select('*')
      .eq('id', payload.documentId)
      .single();

    // Use helper with table name
    await updateExtractionResults(
      payload.documentId,
      result,
      tableName  // ✅ PASS TABLE NAME
    );
  }
});
```

**Same pattern for:**
- ✅ `extract-payslip-data.ts`
- ✅ `extract-application-form-data.ts`
- ✅ `validate-payslip-dates.ts`
- ✅ `annotate-document-image.ts`

---

## **6. Update API Invocation Points**

### **A. Invoices Domain**

**`src/app/api/invoices/[invoiceId]/process/route.ts`** (line 133):

```typescript
if (document.file_type === 'application/pdf') {
  await tasks.trigger<typeof convertPdfToImage>("convert-pdf-to-image", {
    documentId: documentId,
    pdfStoragePath: document.storage_path,
    documentDomain: 'invoices'  // ✅ ADD DOMAIN
  });
} else {
  await tasks.trigger<typeof classifyDocument>("classify-document", {
    documentId: documentId,
    documentDomain: 'invoices'  // ✅ ADD DOMAIN
  });
}
```

### **B. Applications Domain**

**`src/app/api/applications/[id]/documents/route.ts`** (line 277-284):

```typescript
const payload = {
  documentId: document.id,
  pdfStoragePath: storagePath,
  documentDomain: 'applications',  // ✅ ADD DOMAIN
  expectedDocumentType,
  applicationId: applicationId,
  documentSlot
}

const processingRun = await tasks.trigger<typeof convertPdfToImage>(
  "convert-pdf-to-image",
  payload,
  { idempotencyKey, tags }
)
```

### **C. Expense Claims Domain**

**`src/trigger/dspy-receipt-extraction.ts`** (check if it triggers shared tasks):

```typescript
// If it triggers convert-pdf or classify-document, add:
documentDomain: 'expense_claims'  // ✅ ADD DOMAIN
```

---

## **7. Create `application_documents` Table**

### **Schema Design (30 Fields)**

```sql
CREATE TABLE application_documents (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,

  -- Document Slot Context
  document_slot TEXT NOT NULL,  -- 'ic', 'payslip_1', 'payslip_2', 'application_form'
  slot_position INTEGER DEFAULT 1,  -- Position within slot (for multi-document slots)

  -- File Metadata
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  converted_image_path TEXT,
  converted_image_width INTEGER,
  converted_image_height INTEGER,
  file_size BIGINT NOT NULL,
  file_type TEXT NOT NULL,

  -- Processing State
  processing_status TEXT NOT NULL DEFAULT 'pending',
  document_type TEXT,
  document_classification_confidence FLOAT,
  classification_method TEXT,
  classification_task_id TEXT,
  extraction_task_id TEXT,

  -- Extracted Results
  document_metadata JSONB DEFAULT '{}'::jsonb,
  extracted_data JSONB DEFAULT '{}'::jsonb,
  confidence_score FLOAT,
  error_message TEXT,

  -- Visual Annotations
  annotated_image_path TEXT,

  -- Timestamps
  processing_started_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,  -- Soft delete

  -- Indexes
  CONSTRAINT application_documents_pkey PRIMARY KEY (id)
);

-- Indexes for common queries
CREATE INDEX idx_application_documents_application_id ON application_documents(application_id);
CREATE INDEX idx_application_documents_user_id ON application_documents(user_id);
CREATE INDEX idx_application_documents_slot ON application_documents(document_slot);
CREATE INDEX idx_application_documents_status ON application_documents(processing_status);
CREATE INDEX idx_application_documents_deleted ON application_documents(deleted_at);

-- RLS Policies
ALTER TABLE application_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own application documents"
  ON application_documents FOR SELECT
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert their own application documents"
  ON application_documents FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update their own application documents"
  ON application_documents FOR UPDATE
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can delete their own application documents"
  ON application_documents FOR DELETE
  USING (auth.uid()::text = user_id::text);
```

---

## **8. Migration Strategy**

### **Step-by-Step Execution**

1. ✅ **Phase 4B-1:** Update `db-helpers.ts` with table name parameters
2. ✅ **Phase 4B-2:** Update `convert-pdf-to-image.ts` with domain routing
3. ✅ **Phase 4B-3:** Update `classify-document.ts` with domain routing
4. ✅ **Phase 4C:** Update extraction tasks (IC, payslip, application_form)
5. ✅ **Phase 4D:** Update invoices API to pass `documentDomain: 'invoices'`
6. ✅ **Phase 4E:** Create `application_documents` table with migration
7. ✅ **Phase 4F:** Update applications API to pass `documentDomain: 'applications'`
8. ✅ **Phase 4G:** Update frontend components for `application_documents`
9. ✅ **Phase 4H:** Test all three domains independently

---

## **9. Testing Checklist**

### **Invoices Domain** (`documentDomain: 'invoices'`)
- [ ] Upload PDF invoice → converts → classifies → extracts → updates `invoices` table
- [ ] Upload image invoice → classifies → extracts → updates `invoices` table
- [ ] Check all fields update correctly in `invoices` table

### **Applications Domain** (`documentDomain: 'applications'`)
- [ ] Upload IC PDF → converts → classifies → extracts → updates `application_documents` table
- [ ] Upload payslip image → classifies → extracts → updates `application_documents` table
- [ ] Upload application form PDF → converts → classifies → extracts → updates `application_documents` table
- [ ] Check slot validation works correctly
- [ ] Check all fields update correctly in `application_documents` table

### **Expense Claims Domain** (`documentDomain: 'expense_claims'`)
- [ ] Upload receipt → processes → updates `expense_claims` table
- [ ] Check backward compatibility with existing expense claims workflow

---

## **10. Backward Compatibility**

### **Default Table Name**
All helper functions default to `'documents'` table for safety:
```typescript
tableName: string = 'documents'  // ✅ Safe fallback
```

### **Legacy Documents Table**
- Keep `documents` table as fallback for any legacy workflows
- Eventually migrate or deprecate once all domains are separated

---

## **11. Benefits of This Architecture**

✅ **Clean Separation:** Each domain has its own table with tailored schema
✅ **Shared Tasks:** PDF conversion and classification remain DRY (Don't Repeat Yourself)
✅ **Type Safety:** TypeScript union types ensure only valid domains are passed
✅ **Backward Compatible:** Default parameters prevent breaking existing code
✅ **Scalable:** Easy to add new domains (e.g., `'contracts'`, `'receipts'`) in the future
✅ **Explicit Routing:** Every task call explicitly declares its domain - no ambiguity

---

## **Next Steps**

**Ready to proceed with Phase 4B-1?** I'll start by updating `db-helpers.ts` to accept table name parameters while maintaining backward compatibility.

Please review this plan and confirm before I begin implementation.
