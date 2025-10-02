# FinanSEAL Applications Feature - Complete Implementation Plan

## Executive Summary

This plan outlines a two-phased approach to implementing FinanSEAL's Applications feature. **Phase 1** delivers an immediate, robust POC focused on Personal Loan applications with prescriptive document slots. **Phase 2** evolves into an intelligent, configurable system with AI-powered requirement validation.

## Phase 1: Immediate POC - "Prescriptive Slots"

### Overview
The POC focuses on a single, high-value use case: **Personal Loan Applications** requiring exactly 5 documents in prescriptive slots. This approach eliminates complexity while delivering immediate business value.

### Foundational Architecture Decisions

#### 1. Simplified Database Schema (No Junction Table)
```sql
-- Enhanced documents table with direct application linking
ALTER TABLE documents
ADD COLUMN application_id UUID REFERENCES applications(id),
ADD COLUMN document_slot VARCHAR(50), -- 'identity_card', 'payslip_recent', 'payslip_month1', 'payslip_month2', 'application_form'
ADD COLUMN slot_position INTEGER; -- For ordering within application

-- Core applications table
CREATE TABLE applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    business_id UUID REFERENCES businesses(id),

    -- Application metadata
    application_type VARCHAR NOT NULL DEFAULT 'personal_loan',
    title VARCHAR NOT NULL,
    description TEXT,

    -- Status tracking (simplified for POC)
    status VARCHAR NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'processing', 'completed', 'failed', 'needs_review'
    )),

    -- Progress tracking (calculated explicitly, not via triggers)
    slots_filled INTEGER DEFAULT 0,
    slots_total INTEGER DEFAULT 5,
    progress_percentage INTEGER DEFAULT 0,

    -- Processing metadata
    validation_results JSONB DEFAULT '{}',
    error_summary JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    submitted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Application type configurations (simplified for POC)
CREATE TABLE application_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_code VARCHAR UNIQUE NOT NULL,
    display_name VARCHAR NOT NULL,
    description TEXT,

    -- Document requirements with criticality flags
    required_documents JSONB NOT NULL DEFAULT '[]',
    -- Example: [
    --   {"slot": "identity_card", "document_type": "ic", "is_critical": true, "display_name": "Identity Card"},
    --   {"slot": "payslip_recent", "document_type": "payslip", "is_critical": true, "display_name": "Most Recent Payslip"},
    --   {"slot": "payslip_month1", "document_type": "payslip", "is_critical": true, "display_name": "Previous Month Payslip"},
    --   {"slot": "payslip_month2", "document_type": "payslip", "is_critical": false, "display_name": "2 Months Prior Payslip"},
    --   {"slot": "application_form", "document_type": "application_form", "is_critical": true, "display_name": "Bank Application Form"}
    -- ]

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

#### 2. Optimized Workflow (No Database Triggers)
```typescript
// src/trigger/orchestrate-application-workflow.ts
export const orchestrateApplicationWorkflow = task({
  id: "orchestrate-application-workflow",
  retry: { maxAttempts: 3, delay: "30s" },
  run: async (payload: { applicationId: string }) => {
    const { applicationId } = payload;

    // 1. Validate application has all required documents
    const validationResult = await validateApplicationCompleteness.triggerAndWait({
      applicationId
    });

    if (!validationResult.ok) {
      throw new Error(`Application validation failed: ${validationResult.error}`);
    }

    // 2. Process all documents in the application
    const processingResult = await processApplicationDocuments.triggerAndWait({
      applicationId,
      documentsToProcess: validationResult.output.documents
    });

    // 3. Calculate final application status (explicit task, no triggers)
    const finalStatus = await calculateFinalApplicationStatus.triggerAndWait({
      applicationId,
      processingResults: processingResult.output
    });

    return {
      success: true,
      applicationId,
      finalStatus: finalStatus.output.status,
      completedDocuments: finalStatus.output.completedDocuments,
      failedDocuments: finalStatus.output.failedDocuments
    };
  }
});

// src/trigger/calculate-final-application-status.ts
export const calculateFinalApplicationStatus = task({
  id: "calculate-final-application-status",
  run: async (payload: {
    applicationId: string,
    processingResults: any[]
  }) => {
    const { applicationId, processingResults } = payload;

    // Fetch application type configuration for criticality flags
    const { data: application } = await supabase
      .from('applications')
      .select(`
        *,
        application_types!inner (required_documents)
      `)
      .eq('id', applicationId)
      .single();

    const requiredDocs = application.application_types.required_documents;

    // Analyze processing results against criticality flags
    let criticalFailures = 0;
    let nonCriticalFailures = 0;
    let totalCompleted = 0;

    for (const result of processingResults) {
      const docConfig = requiredDocs.find(doc => doc.slot === result.documentSlot);

      if (result.status === 'completed') {
        totalCompleted++;
      } else if (result.status === 'failed') {
        if (docConfig?.is_critical) {
          criticalFailures++;
        } else {
          nonCriticalFailures++;
        }
      }
    }

    // Determine final status based on criticality
    let finalStatus: string;
    if (criticalFailures > 0) {
      finalStatus = 'failed';
    } else if (nonCriticalFailures > 0) {
      finalStatus = 'needs_review';
    } else {
      finalStatus = 'completed';
    }

    // Update application with calculated status
    await supabase
      .from('applications')
      .update({
        status: finalStatus,
        slots_filled: totalCompleted,
        progress_percentage: Math.round((totalCompleted / requiredDocs.length) * 100),
        completed_at: finalStatus === 'completed' ? new Date().toISOString() : null,
        validation_results: {
          total_documents: requiredDocs.length,
          completed_documents: totalCompleted,
          critical_failures: criticalFailures,
          non_critical_failures: nonCriticalFailures,
          calculated_at: new Date().toISOString()
        }
      })
      .eq('id', applicationId);

    return {
      status: finalStatus,
      completedDocuments: totalCompleted,
      failedDocuments: criticalFailures + nonCriticalFailures,
      criticalFailures,
      nonCriticalFailures
    };
  }
});
```

#### 3. Critical API Endpoints
```typescript
// POST /api/applications/[applicationId]/documents - Slot-specific upload
export async function POST(
  request: NextRequest,
  { params }: { params: { applicationId: string } }
) {
  const { userId } = await auth();
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const documentSlot = formData.get('slot') as string;

  // 1. Validate application ownership
  const { data: application } = await supabase
    .from('applications')
    .select('*')
    .eq('id', params.applicationId)
    .eq('user_id', userId)
    .single();

  if (!application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // 2. Check if slot is already filled
  const { data: existingDoc } = await supabase
    .from('documents')
    .select('id')
    .eq('application_id', params.applicationId)
    .eq('document_slot', documentSlot)
    .single();

  if (existingDoc) {
    return NextResponse.json(
      { error: 'Document slot already filled' },
      { status: 409 }
    );
  }

  // 3. Upload to Supabase Storage
  const filePath = `applications/${params.applicationId}/${documentSlot}_${Date.now()}_${file.name}`;
  const { data: uploadResult, error: uploadError } = await supabaseAdmin.storage
    .from('documents')
    .upload(filePath, file);

  if (uploadError) {
    return NextResponse.json(
      { error: 'File upload failed' },
      { status: 500 }
    );
  }

  // 4. Create document record with application link
  const { data: document, error: docError } = await supabase
    .from('documents')
    .insert({
      user_id: userId,
      business_id: application.business_id,
      application_id: params.applicationId, // Direct foreign key
      document_slot: documentSlot, // Slot identifier
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type,
      processing_status: 'pending'
    })
    .select()
    .single();

  if (docError) {
    return NextResponse.json(
      { error: 'Database insert failed' },
      { status: 500 }
    );
  }

  // 5. Trigger document processing with slot validation
  const processingRun = await tasks.trigger<typeof processDocumentWithSlotValidation>(
    "process-document-with-slot-validation",
    {
      documentId: document.id,
      expectedDocumentType: getExpectedTypeForSlot(documentSlot),
      applicationId: params.applicationId,
      documentSlot
    },
    { idempotencyKey: `doc-${document.id}-slot-${documentSlot}` }
  );

  return NextResponse.json({
    success: true,
    documentId: document.id,
    applicationId: params.applicationId,
    documentSlot,
    processingTaskId: processingRun.id,
    message: 'Document uploaded and processing started'
  });
}
```

#### 4. Enhanced Classification Task with Slot Validation
```typescript
// src/trigger/classify-document.ts (Enhanced for POC)
export const classifyDocument = task({
  id: "classify-document",
  run: async (payload: {
    documentId: string,
    expectedDocumentType?: string, // NEW: For slot validation
    documentSlot?: string // NEW: For context
  }) => {
    const { documentId, expectedDocumentType, documentSlot } = payload;

    // 1. Run existing Python classification
    const classificationResult = await python.runScript({
      command: "python",
      args: ["src/python/classify_document.py", documentId],
      context: { documentId }
    });

    if (!classificationResult.success) {
      throw new Error(`Classification failed: ${classificationResult.error}`);
    }

    const { document_type, confidence_score } = classificationResult;

    // 2. NEW: Slot validation logic (if expectedDocumentType provided)
    if (expectedDocumentType) {
      const isCorrectType = document_type === expectedDocumentType;

      if (!isCorrectType) {
        // Update document with validation error
        await supabase
          .from('documents')
          .update({
            processing_status: 'classification_failed',
            error_message: `Expected ${getDocumentTypeLabel(expectedDocumentType)}, but detected ${getDocumentTypeLabel(document_type)}. Please upload the correct document type.`,
            processed_at: new Date().toISOString()
          })
          .eq('id', documentId);

        return {
          success: false,
          error: 'document_type_mismatch',
          expected: expectedDocumentType,
          detected: document_type,
          documentSlot
        };
      }
    }

    // 3. Update document with successful classification
    await supabase
      .from('documents')
      .update({
        document_type,
        document_classification_confidence: confidence_score,
        processing_status: 'pending_extraction'
      })
      .eq('id', documentId);

    // 4. Trigger appropriate extraction task
    const extractionTaskName = `extract-${document_type}-data`;
    const extractionResult = await tasks.triggerAndWait(
      extractionTaskName,
      { documentId },
      { idempotencyKey: `extract-${documentId}-${document_type}` }
    );

    // 5. Update final document status
    const finalStatus = extractionResult.ok ? 'completed' : 'extraction_failed';
    await supabase
      .from('documents')
      .update({
        processing_status: finalStatus,
        processed_at: new Date().toISOString(),
        error_message: extractionResult.ok ? null : extractionResult.error
      })
      .eq('id', documentId);

    return {
      success: extractionResult.ok,
      document_type,
      confidence_score,
      documentSlot,
      extractionResults: extractionResult.output
    };
  }
});

function getExpectedTypeForSlot(slot: string): string {
  const slotMapping = {
    'identity_card': 'ic',
    'payslip_recent': 'payslip',
    'payslip_month1': 'payslip',
    'payslip_month2': 'payslip',
    'application_form': 'application_form'
  };
  return slotMapping[slot] || 'unknown';
}

function getDocumentTypeLabel(type: string): string {
  const labels = {
    'ic': 'Identity Card',
    'payslip': 'Payslip',
    'application_form': 'Application Form'
  };
  return labels[type] || type;
}
```

### POC API Endpoints

```typescript
// Application Management
POST /api/applications                    // Create new personal loan application
GET /api/applications                     // List user's applications
GET /api/applications/[id]               // Get application details with slot status
PUT /api/applications/[id]               // Update application details
DELETE /api/applications/[id]            // Delete draft application

// Document Slot Management
POST /api/applications/[id]/documents    // Upload document to specific slot
GET /api/applications/[id]/documents     // Get all documents in application
DELETE /api/applications/[id]/documents/[docId] // Remove document from slot

// Workflow Control
POST /api/applications/[id]/submit       // Submit application for processing
GET /api/applications/[id]/status        // Get real-time processing status
POST /api/applications/[id]/retry        // Retry failed document processing

// Configuration
GET /api/application-types               // Get available application types (POC: only personal_loan)
```

### Default Application Type Configuration

```sql
-- Insert Personal Loan application type for POC
INSERT INTO application_types (type_code, display_name, description, required_documents) VALUES
('personal_loan', 'Personal Loan Application', 'Standard personal loan application with 5 required documents',
'[
  {
    "slot": "identity_card",
    "document_type": "ic",
    "is_critical": true,
    "display_name": "Identity Card",
    "description": "Clear photo or scan of your IC (both sides)"
  },
  {
    "slot": "payslip_recent",
    "document_type": "payslip",
    "is_critical": true,
    "display_name": "Most Recent Payslip",
    "description": "Your latest salary slip (current month)"
  },
  {
    "slot": "payslip_month1",
    "document_type": "payslip",
    "is_critical": true,
    "display_name": "Previous Month Payslip",
    "description": "Salary slip from 1 month ago"
  },
  {
    "slot": "payslip_month2",
    "document_type": "payslip",
    "is_critical": false,
    "display_name": "2 Months Prior Payslip",
    "description": "Salary slip from 2 months ago (helps strengthen application)"
  },
  {
    "slot": "application_form",
    "document_type": "application_form",
    "is_critical": true,
    "display_name": "Bank Application Form",
    "description": "Completed and signed loan application form"
  }
]'::jsonb);
```

## POC UX/UI Design - Prescriptive Document Slots

### Application Detail Page Layout

```
┌─────────────────────────────────────────────────────────────────┐
│                    Personal Loan Application                     │
│                         Progress: 3/5                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                │
│  Required Documents Checklist:                                │
│                                                                │
│  ✓ [ Identity Card ]                    [View] [Replace]       │
│    IC_front_back.pdf                                           │
│    Uploaded: Sep 29, 2024                                     │
│                                                                │
│  ✓ [ Most Recent Payslip ]             [View] [Replace]       │
│    payslip_september_2024.pdf                                 │
│    Uploaded: Sep 29, 2024                                     │
│                                                                │
│  ✓ [ Previous Month Payslip ]          [View] [Replace]       │
│    payslip_august_2024.pdf                                    │
│    Uploaded: Sep 29, 2024                                     │
│                                                                │
│  ⚠ [ 2 Months Prior Payslip ]          [Upload File]          │
│    Optional - helps strengthen your application                │
│    Drag file here or click to browse                          │
│                                                                │
│  ! [ Bank Application Form ] *          [Upload File]         │
│    Required - completed and signed loan application           │
│    Drag file here or click to browse                          │
│                                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                │
│  Application Status: Ready for Review                         │
│  3 of 4 required documents completed                          │
│  1 optional document pending                                  │
│                                                                │
│  [ Save Draft ]              [ Submit Application ]          │
│                                                                │
└─────────────────────────────────────────────────────────────────┘
```

### Document Slot Component States

**Empty Required Slot:**
```
┌─────────────────────────────────────────┐
│  ! [ Identity Card ] *                  │
│     Required Document                   │
│                                         │
│     Drag file here or click to browse  │
│     Accepted: PDF, JPG, PNG            │
│     Max size: 10MB                     │
│                                         │
│     [  Browse Files  ]                 │
└─────────────────────────────────────────┘
```

**Processing State:**
```
┌─────────────────────────────────────────┐
│  ⏳ [ Identity Card ]                   │
│     Processing IC_scan.pdf...           │
│                                         │
│     ████████░░░ 80%                     │
│     Verifying document type...          │
│                                         │
│     [ Cancel ]                         │
└─────────────────────────────────────────┘
```

**Completed State:**
```
┌─────────────────────────────────────────┐
│  ✓ [ Identity Card ]                    │
│    IC_scan.pdf                          │
│    Verified IC • Confidence: 94%        │
│    Uploaded: Sep 29, 2024              │
│                                         │
│    [ View ] [ Replace ]                 │
└─────────────────────────────────────────┘
```

**Validation Error State:**
```
┌─────────────────────────────────────────┐
│  ✗ [ Identity Card ] *                  │
│    payslip_file.pdf                     │
│                                         │
│    ⚠ Wrong Document Type                │
│    Expected: IC, Found: Payslip        │
│    Please upload your Identity Card     │
│                                         │
│    [ Try Again ] [ Upload Different ]  │
└─────────────────────────────────────────┘
```

### POC User Flow

1. **Create Application**: User clicks "New Personal Loan" → fills basic details
2. **Document Checklist**: User sees 5 prescriptive slots with clear labels
3. **Slot Upload**: User uploads to specific slot → immediate type validation
4. **Real-time Feedback**: UI updates instantly with processing status
5. **Progress Tracking**: Visual progress bar shows completion percentage
6. **Submit When Ready**: User can submit when all critical slots are filled
7. **Status Monitoring**: User tracks application through processing stages

## Phase 2 Roadmap: The Intelligent Application Agent

### A. Configurable Application Templates (Admin Feature)

**Business Value**: Enable bank staff to create custom application types without developer intervention.

**Technical Implementation**:
- Admin UI for creating application templates
- Visual template designer with drag-and-drop document requirements
- Template versioning and approval workflows
- Multi-tenancy support for different bank branches

**Database Extensions**:
```sql
-- Enhanced application types for admin configuration
ALTER TABLE application_types ADD COLUMN created_by_user_id UUID REFERENCES users(id);
ALTER TABLE application_types ADD COLUMN template_version INTEGER DEFAULT 1;
ALTER TABLE application_types ADD COLUMN approval_status VARCHAR DEFAULT 'draft';

-- Template change history
CREATE TABLE application_template_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_type_id UUID REFERENCES application_types(id),
    version_number INTEGER NOT NULL,
    changes_made JSONB NOT NULL,
    changed_by_user_id UUID REFERENCES users(id),
    changed_at TIMESTAMPTZ DEFAULT now()
);
```

**Admin UI Features**:
- Template creation wizard with document requirement builder
- Preview mode showing end-user experience
- Template analytics (usage rates, completion rates)
- Bulk template management for multiple branches

### B. The "Smart Uploader" & Requirement Validation Agent

**Business Value**: Transform document upload from manual slot-filling to intelligent batch processing.

**User Experience Revolution**:
```
┌─────────────────────────────────────────────────────────────────┐
│                    Smart Document Processing                     │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                         │    │
│  │         Drop all application documents here             │    │
│  │              (up to 50 files at once)                  │    │
│  │                                                         │    │
│  │              📁 Drag folder or files                    │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                │
│  🤖 AI Agent Status: Analyzing documents...                    │
│                                                                │
│  Progress: ████████████░░░░ 75%                               │
│                                                                │
│  ✓ Identity Card detected and verified                        │
│  ✓ Payslip (Sept 2024) - automatically sorted to "Recent"    │
│  ✓ Payslip (Aug 2024) - automatically sorted to "Previous"   │
│  ✓ Bank Statement (3 pages) - all pages linked               │
│  ⏳ Processing Application Form...                            │
│  ⚠ Found extra document: Insurance Policy (moved to Supporting)│
│                                                                │
│  Still needed: 1 more recent bank statement                   │
│                                                                │
└─────────────────────────────────────────────────────────────────┘
```

**Technical Architecture**:

```typescript
// src/lib/agents/requirement-validation-agent.ts
export class RequirementValidationAgent {
  private applicationId: string;
  private requirements: ApplicationRequirement[];
  private state: AgentState;

  async processDocumentBatch(files: File[]): Promise<ProcessingResult> {
    // 1. Batch classify all documents
    const classifications = await this.classifyDocuments(files);

    // 2. Intelligent requirement matching
    const matches = await this.matchDocumentsToRequirements(classifications);

    // 3. Handle conflicts and duplicates
    const resolved = await this.resolveConflicts(matches);

    // 4. Update application state
    await this.updateApplicationProgress(resolved);

    // 5. Determine next actions
    const nextActions = await this.calculateNextActions();

    return {
      matchedDocuments: resolved.matched,
      unmatched: resolved.unmatched,
      stillNeeded: nextActions.stillNeeded,
      readyForSubmission: nextActions.isComplete
    };
  }

  private async matchDocumentsToRequirements(
    classifications: ClassificationResult[]
  ): Promise<DocumentMatch[]> {
    const matches: DocumentMatch[] = [];

    for (const classification of classifications) {
      // Find best requirement match
      const bestMatch = this.findBestRequirementMatch(classification);

      if (bestMatch) {
        // Handle special cases (e.g., payslip date sorting)
        if (classification.documentType === 'payslip') {
          const payslipDate = await this.extractPayslipDate(classification);
          const specificSlot = this.determinePayslipSlot(payslipDate);
          bestMatch.assignedSlot = specificSlot;
        }

        matches.push({
          document: classification,
          requirement: bestMatch,
          confidence: this.calculateMatchConfidence(classification, bestMatch)
        });
      }
    }

    return matches;
  }

  private determinePayslipSlot(payslipDate: Date): string {
    const now = new Date();
    const monthsAgo = this.getMonthsDifference(now, payslipDate);

    if (monthsAgo === 0) return 'payslip_recent';
    if (monthsAgo === 1) return 'payslip_month1';
    if (monthsAgo === 2) return 'payslip_month2';

    return 'payslip_supporting'; // Extra payslips become supporting documents
  }
}
```

**Agent State Management**:
```typescript
interface AgentState {
  applicationId: string;
  requirements: ApplicationRequirement[];
  fulfilledRequirements: FulfilledRequirement[];
  pendingDocuments: PendingDocument[];
  conflicts: ConflictResolution[];
  completionStatus: {
    totalRequired: number;
    fulfilled: number;
    criticalMissing: string[];
    optionalMissing: string[];
    readyForSubmission: boolean;
  };
}
```

**Real-time UI Updates**:
- WebSocket connection for live progress updates
- Animated requirement checklist with auto-completion
- Conflict resolution UI for ambiguous documents
- Smart suggestions for missing documents

## Implementation Timeline

### Phase 1 POC (4-6 weeks)
**Week 1-2**: Database schema + core API endpoints
**Week 3-4**: Prescriptive slots UI + document validation workflow
**Week 5-6**: Testing, polish, and deployment

### Phase 2 Roadmap (3-6 months)
**Month 1**: Admin template configuration system
**Month 2-3**: Smart uploader infrastructure and agent development
**Month 4**: AI agent training and requirement matching algorithms
**Month 5-6**: Advanced UI, testing, and production deployment

## Success Metrics

### Phase 1 POC Metrics
- Application creation time: < 5 minutes for complete submission
- Document type validation accuracy: > 95%
- User completion rate: > 80% of started applications
- Processing time: < 2 minutes for full 5-document application

### Phase 2 Metrics
- Admin template creation time: < 15 minutes for new application type
- Smart uploader accuracy: > 90% correct document-to-requirement matching
- Batch processing efficiency: Handle 50+ documents in < 5 minutes
- Agent intelligence: > 85% of applications auto-sorted without human intervention

## Technical Risk Mitigation

### Phase 1 Risks
- **Document type validation accuracy**: Mitigated by existing Universal Classifier with 95%+ accuracy
- **Slot-specific upload complexity**: Mitigated by clear UI design and immediate feedback
- **Processing workflow reliability**: Mitigated by explicit status calculation and comprehensive error handling

### Phase 2 Risks
- **AI agent complexity**: Mitigated by incremental development and fallback to manual processing
- **Requirement matching accuracy**: Mitigated by confidence scoring and human review workflows
- **System performance with large batches**: Mitigated by streaming processing and progress indicators

This two-phased approach ensures immediate business value through the POC while establishing a clear path to revolutionary AI-powered document processing capabilities.

## Critical Production Considerations & Technical Debt

### ⚠️ Known Technical Debt from Phase 1 Implementation

#### 1. Real-Time Polling Mechanism: Good for POC, Problematic for Production Scale

**Current Implementation**: The Phase 1 POC uses client-side polling (`useDocumentPolling` hook) that queries the API every 3 seconds when documents are processing.

**Why It Works for POC**:
- Simple to implement and provides immediate "real-time" feel
- Smart optimizations like tab visibility handling
- Perfect for demos and initial testing with 1-5 concurrent users

**The Scalability Problem**:
- **Resource Intensive**: 50 bank staff with open application pages = hundreds of unnecessary database queries per minute
- **Database Load**: Each poll hits the applications API, database, and potentially cascades to document status checks
- **Inefficient**: Queries happen even when no status changes occur
- **Cost Scaling**: Cloud database costs increase linearly with query volume

**Production Solution Required**:
- **Supabase Realtime Subscriptions**: WebSocket-based real-time database change notifications
- **Push-Based Updates**: Database changes push directly to connected clients
- **Vastly More Efficient**: Only sends updates when actual changes occur
- **True Real-Time**: Sub-second latency vs 3-second polling intervals

**Technical Debt Ticket**:
```
Title: Upgrade Application Status Updates from Polling to Supabase Realtime
Priority: High (Pre-Production Blocker)
Effort: 3-5 days
Impact: Eliminates 90%+ of unnecessary database queries at scale
```

#### 2. Missing Aggregated Data View: The Extracted Data Display Gap

**Current Implementation Status**: ❌ **CRITICAL GAP IDENTIFIED**

**What's Missing**: The ApplicationDetailContainer does NOT currently display the extracted data from completed documents. Users can see processing status but cannot view the actual extracted information.

**User Impact**:
- Bank staff see "✓ Completed" but cannot access the extracted IC number, name, salary amounts, etc.
- Defeats the primary purpose of document processing
- Forces users to export or use separate tools to see extracted data

**Expected Implementation**:
- Reuse existing `DynamicFieldRenderer` component within expandable sections for each document slot
- Display extracted data when `document.processing_status === 'completed'` and `document.extracted_data` exists
- Show structured field values with proper labels and formatting

**Immediate Action Required**:
```
Title: Implement Extracted Data Display in Application Detail View
Priority: Critical (POC Incomplete Without This)
Effort: 4-6 hours
Components: ApplicationDetailContainer, DynamicFieldRenderer integration
```

### 🔧 Required Immediate Fixes for POC Completion

#### Fix #1: Add Extracted Data Rendering to ApplicationDetailContainer

**Implementation Plan**:
1. Import existing `DynamicFieldRenderer` component
2. Add expandable section within each completed document slot
3. Render `document.extracted_data` using field renderer
4. Add proper error handling for malformed extracted data

#### Fix #2: Create Technical Debt Tracking

**Production Readiness Checklist**:
- [ ] Replace polling with Supabase Realtime subscriptions
- [x] Implement extracted data display ✅ **COMPLETED**
- [ ] Add comprehensive error boundaries for document processing failures
- [ ] Implement proper loading states for all async operations
- [ ] Add audit logging for all application state changes
- [ ] Performance testing with 50+ concurrent users

### 📋 Post-POC Implementation Priority Queue

1. ~~**P0 (Blocking)**: Implement extracted data display in application detail view~~ ✅ **COMPLETED**
2. **P0 (Blocking)**: Replace polling with Supabase Realtime for production readiness
3. **P1 (High)**: Add comprehensive error handling and user feedback for failed document processing
4. **P1 (High)**: Implement audit trail for all application and document state changes
5. **P2 (Medium)**: Performance optimization and caching layer implementation
6. **P3 (Nice-to-have)**: Enhanced UI animations and micro-interactions

This completes the honest technical assessment of the Phase 1 POC implementation with clear production considerations.

## 🎯 Implementation Status Update

### ✅ Critical Fix Completed: Extracted Data Display (January 30, 2025)

**Problem Resolved**: The ApplicationDetailContainer now properly displays extracted data from completed documents, closing the critical gap where users could see "✓ Completed" status but couldn't access the actual extracted information (IC numbers, names, salary amounts, etc.).

**Implementation Details**:
- **Component**: Added `ExtractedDataDisplay` component within `ApplicationDetailContainer`
- **Integration**: Reused existing `DynamicFieldRenderer` and `useDocumentSchema` hook
- **User Experience**: Extracted data appears in expandable sections for completed documents
- **Error Handling**: Graceful fallbacks for missing schemas and loading states
- **Location**: `src/components/applications/application-detail-container.tsx:25-64,381-386`

**Technical Approach**:
```typescript
// Shows for completed documents with extracted data
{slot.document.processing_status === 'completed' && slot.document.extracted_data && (
  <ExtractedDataDisplay
    documentType={slot.document.document_type}
    extractedData={slot.document.extracted_data}
  />
)}
```

**Build Validation**: ✅ `npm run build` completed successfully with no TypeScript errors

**Remaining P0 Task**: Replace polling mechanism with Supabase Realtime subscriptions for production scalability.

This fix eliminates the primary usability gap in the Phase 1 POC and makes the Applications feature functionally complete for user testing.