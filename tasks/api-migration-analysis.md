# Applications API Migration Analysis

## Phase 1: Understanding Legacy /api/applications Behavior

### Legacy Endpoints Analyzed

#### 1. **GET /api/applications/[id]/route.ts**
**Purpose**: Fetch single application with complete slot details and progress statistics

**Key Features**:
- Fetches application with `application_types` join
- Fetches `application_documents` (not deleted)
- Transforms data into detailed `slot_details` array
- Handles **grouped documents** (payslip_group with group_slots and group_documents)
- Calculates real-time `progress_stats`:
  - `total_slots`, `completed_slots`
  - `critical_slots`, `completed_critical_slots`
  - `can_submit`, `progress_percentage`
- RLS enforced via authenticated Supabase client

**Response Structure**:
```typescript
{
  success: true,
  data: {
    ...application,
    application_types: { type_code, display_name, description, required_documents },
    application_documents: [ /* array of docs */ ],
    slot_details: [
      {
        slot, display_name, description, is_critical, document_type, status,
        // For individual docs:
        document: { id, file_name, storage_path, processing_status, extracted_data, ... } | null,
        // For grouped docs:
        group_slots: string[],
        group_documents: [ /* array of group docs */ ]
      }
    ],
    progress_stats: { total_slots, completed_slots, critical_slots, completed_critical_slots, can_submit, progress_percentage }
  }
}
```

**Status Calculation Logic**:
- Individual documents: Maps `processing_status` to `empty`, `processing`, `completed`, `error`
- Grouped documents: Aggregates status from all documents in group (`allCompleted`, `anyProcessing`, `anyFailed`)

---

#### 2. **PUT /api/applications/[id]/route.ts**
**Purpose**: Update application title and description (draft applications only)

**Key Features**:
- Validates application exists and user has access (RLS)
- Only allows editing `draft` applications
- Updates: `title`, `description`, `updated_at`
- Returns updated application with `application_types` join

**Response Structure**:
```typescript
{
  success: true,
  data: { ...updatedApplication, application_types: {...} },
  message: 'Application updated successfully'
}
```

---

#### 3. **DELETE /api/applications/[id]/route.ts**
**Purpose**: Delete draft application and disassociate documents (preserving files in storage)

**Key Features**:
- Only allows deleting `draft` applications
- Disassociates documents: Sets `application_id` and `document_slot` to `null` (preserves files)
- Deletes application record from `applications` table
- RLS enforced

**Response Structure**:
```typescript
{
  success: true,
  message: 'Application deleted successfully (documents preserved)'
}
```

---

#### 4. **POST /api/applications/[id]/documents/route.ts**
**Purpose**: Upload document to specific application slot with type validation

**Key Features**:
- Requires `file` (FormData) and `slot` (document slot identifier)
- Validates application is `draft` status
- Checks for existing document in slot (replacement vs new upload)
- Creates/updates `application_documents` record
- Uploads to Supabase Storage with standardized path: `StoragePathBuilder.forDocument()`
- Triggers Trigger.dev background processing:
  - **PDF files**: `convert-pdf-to-image` → chains to `classify-document`
  - **Image files**: `classify-document` directly
- Passes `documentDomain: 'applications'` to Trigger.dev tasks
- Uses idempotency keys for replacements to ensure new runs

**Response Structure**:
```typescript
{
  success: true,
  data: {
    document_id, application_id, document_slot, file_name,
    processing_status: 'processing',
    expected_document_type,
    is_replacement: boolean
  },
  message: 'Document uploaded and processing started' | 'Document replaced and processing started'
}
```

---

#### 5. **GET /api/applications/[id]/documents/route.ts**
**Purpose**: Get all documents in application with slot status

**Key Features**:
- Fetches all non-deleted `application_documents` for application
- Orders by `slot_position`
- Returns processing status and extracted data

**Response Structure**:
```typescript
{
  success: true,
  data: {
    application_id,
    documents: [
      {
        id, document_slot, slot_position, file_name, storage_path,
        processing_status, document_type, extracted_data,
        classification_task_id, extraction_task_id, created_at, updated_at
      }
    ]
  }
}
```

---

#### 6. **DELETE /api/applications/[id]/documents/[documentId]/route.ts**
**Purpose**: Soft delete document from application (preserve file in storage)

**Key Features**:
- Verifies document ownership (user_id or business membership)
- **Soft delete**: Sets `deleted_at` timestamp
- **Preserves**: `application_id`, `document_slot` for audit trail
- **Preserves**: File in storage bucket
- RLS bypass with service client + explicit user/business validation

**Response Structure**:
```typescript
{
  success: true,
  message: 'Document removed from application successfully',
  preserved_file: storage_path
}
```

---

#### 7. **POST /api/applications/[id]/documents/[documentId]/process/route.ts**
**Purpose**: Reprocess document with application context for slot validation

**Key Features**:
- Fetches document and application details for context
- Gets expected document type from `application_document_types` table
- Updates document status to `pending`, clears errors
- Triggers processing pipeline:
  - **PDF files**: `convert-pdf-to-image`
  - **Image files**: `classify-document`
- Passes application context: `applicationId`, `documentSlot`, `expectedDocumentType`

**Response Structure**:
```typescript
{
  success: true,
  message: 'Document reprocessing started with application context',
  documentId, applicationId, documentSlot, expectedDocumentType
}
```

---

#### 8. **GET /api/applications/[id]/summary/route.ts**
**Purpose**: Consolidate AI-extracted data from all documents for loan officer review

**Key Features**:
- Fetches application with `application_types` join
- Fetches all `completed` documents with `extracted_data`
- Processes extracted data by document type:
  - **ic**: Extracts applicant personal details
  - **application_form**: Extracts employment, financing, and applicant details
  - **payslip/multi_payslip**: Calculates financial metrics (avg income, trend, consistency)
- Calculates confidence scores and completion status
- Helper functions: `calculateIncomeTrend()`, `checkEmployerConsistency()`

**Response Structure**:
```typescript
{
  success: true,
  data: {
    application: { id, title, type, status, progress, created_at, submitted_at },
    applicant: { full_name, ic_number, date_of_birth, gender, address, ... },
    employment: { employer_name, job_title, monthly_income, years_of_service, ... },
    financial: {
      payslip_count, average_net_income, average_gross_income,
      min_net_income, max_net_income, latest_net_income,
      income_trend, payslip_months[], employer_consistency
    },
    financing: { type_of_financing, amount_requested, tenor, purpose_of_financing, ... },
    processing: {
      total_documents, confidence_scores[], average_confidence, completion_status
    }
  }
}
```

---

## Migration Strategy

### V1 API Endpoints to Create

1. **GET /api/v1/applications/[id]** - Get single application with slot details
2. **PUT /api/v1/applications/[id]** - Update application (title, description)
3. **DELETE /api/v1/applications/[id]** - Delete draft application
4. **POST /api/v1/applications/[id]/documents** - Upload document to slot
5. **GET /api/v1/applications/[id]/documents** - Get all application documents
6. **DELETE /api/v1/applications/[id]/documents/[documentId]** - Soft delete document
7. **POST /api/v1/applications/[id]/documents/[documentId]/process** - Reprocess document
8. **GET /api/v1/applications/[id]/summary** - Get AI summary
9. **POST /api/v1/applications/[id]/summary** - Generate/update summary (if needed)

### Client References to Update

#### application-detail-container.tsx (5 references)
- Line 295: `GET /api/applications/${applicationId}` → `GET /api/v1/applications/${applicationId}`
- Line 323: `POST /api/applications/${applicationId}/documents` → `POST /api/v1/applications/${applicationId}/documents`
- Line 352: `POST /api/applications/${applicationId}/documents/${documentId}/process` → `POST /api/v1/applications/${applicationId}/documents/${documentId}/process`
- Line 469: `DELETE /api/applications/${applicationId}/documents/${documentId}` → `DELETE /api/v1/applications/${applicationId}/documents/${documentId}`
- Line 519: `PUT /api/applications/${applicationId}` → `PUT /api/v1/applications/${applicationId}`

#### use-applications.ts (2 references)
- Line 108: `GET /api/applications/${newApplication.id}` → `GET /api/v1/applications/${newApplication.id}`
- Line 136: `GET /api/applications/${applicationId}` → `GET /api/v1/applications/${applicationId}`

#### application-summary-container.tsx (2 references)
- Line 125: `GET /api/applications/${applicationId}/summary` → `GET /api/v1/applications/${applicationId}/summary`
- Line 213: `POST /api/applications/${applicationId}/summary` → `POST /api/v1/applications/${applicationId}/summary`

#### application-create-form.tsx (1 reference)
- Line 49: `POST /api/applications` → Already uses V1: `/api/v1/applications` ✅

#### Test files (2 references)
- `tests/api/v1/applications.spec.ts` → Already uses V1 ✅
- `tests/ui/applications-list.spec.ts` → UI test, no API calls

---

## Key Differences from V1 Pattern

The existing V1 applications route only has:
- `GET /api/v1/applications` (list applications)
- `POST /api/v1/applications` (create application)

**Missing V1 endpoints**:
- Individual application CRUD operations
- Document upload/management endpoints
- Summary endpoint

These need to be created following the V1 service layer pattern.

---

## Next Steps

1. ✅ **Analyze legacy endpoints** (DONE)
2. **Create V1 service layer** in `@/domains/applications/lib/application.service.ts`:
   - `getApplication(id)` - Single app with slot details
   - `updateApplication(id, data)` - Update title/description
   - `deleteApplication(id)` - Delete draft app
   - `uploadDocument(applicationId, file, slot)` - Document upload
   - `getApplicationDocuments(applicationId)` - Get all docs
   - `deleteDocument(applicationId, documentId)` - Soft delete doc
   - `reprocessDocument(applicationId, documentId)` - Reprocess
   - `getApplicationSummary(applicationId)` - AI summary
3. **Create V1 API routes** at `/api/v1/applications/[id]/*`
4. **Update all client references** to use V1 endpoints
5. **Test all functionality** with `npm run build`
6. **Delete legacy endpoints** completely
