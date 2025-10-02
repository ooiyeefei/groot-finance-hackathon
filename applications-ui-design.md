# FinanSEAL Applications Feature - Phase 1 POC UX/UI Design Document

## Executive Summary

This document provides comprehensive UX/UI design specifications for FinanSEAL's Applications feature Phase 1 POC, implementing a "Prescriptive Document Slots" approach for Personal Loan applications. The design maintains FinanSEAL's banking-grade professional appearance while introducing intuitive, slot-based document upload workflows.

## Design Philosophy & Principles

### Core Design Goals
1. **Simplicity**: Eliminate confusion with prescriptive, labeled document slots
2. **Clarity**: Immediate visual feedback on document validation and processing
3. **Professional Trust**: Maintain banking-grade appearance and interaction patterns
4. **Progressive Disclosure**: Guide users step-by-step through application completion
5. **Error Prevention**: Clear labeling and validation to prevent upload mistakes

### Visual Design Language
- **Dark Professional Theme**: Gray-800 backgrounds with subtle card elevations
- **Hierarchical Typography**: Clear information architecture with proper contrast
- **Contextual Color Coding**: Red for critical, amber for processing, green for success
- **Minimal Cognitive Load**: Focus attention on current task with progressive revelation

---

## Page Designs & Wireframes

### 1. Applications Dashboard (`/applications`)

**Purpose**: Central hub showing user's loan applications with clear progress indicators.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        My Loan Applications                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [ Create New Personal Loan Application ]                           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Personal Loan #PL-2024-001              [ View Details ] │   │
│  │ Created: Sep 29, 2024                                       │   │
│  │                                                             │   │
│  │ Progress: ████████████░░ 4/5 documents                     │   │
│  │ Status: 🟡 Awaiting Final Document                         │   │
│  │ • Identity Card ✓                                          │   │
│  │ • Recent Payslip ✓                                         │   │
│  │ • Previous Payslip ✓                                       │   │
│  │ • 2 Months Payslip (Optional) ✓                           │   │
│  │ • Application Form ⏳ Required                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Personal Loan #PL-2024-002              [ View Details ] │   │
│  │ Created: Sep 25, 2024                                       │   │
│  │                                                             │   │
│  │ Progress: ████████████████ 5/5 documents                   │   │
│  │ Status: 🟢 Submitted - Under Review                        │   │
│  │ All required documents validated ✓                          │   │
│  │ Submitted: Sep 27, 2024                                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Components**:
- **Create Button**: Prominent, single-action button (only Personal Loan in POC)
- **Application Cards**: Progress visualization with document checklist preview
- **Status Indicators**: Color-coded status with clear next steps
- **Progress Bars**: Visual completion percentage with document count

### 2. Create Personal Loan (`/applications/new`)

**Purpose**: Simple application setup with clear document requirements explanation.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Create Personal Loan Application                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Basic Information                                                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Application Name: [_____________________________]            │   │
│  │ Loan Amount (MYR): [_______________]                        │   │
│  │ Purpose: [_________________________________________]         │   │
│  │          [_________________________________________]         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Required Documents (5 total):                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Critical Documents (must be provided):                       │   │
│  │ ✓ Identity Card (IC or Passport) - Clear photo/scan         │   │
│  │ ✓ Most Recent Payslip - Current month salary slip          │   │
│  │ ✓ Previous Month Payslip - 1 month ago                     │   │
│  │ ✓ Bank Application Form - Completed and signed             │   │
│  │                                                             │   │
│  │ Optional Documents (strengthens application):               │   │
│  │ ○ 2 Months Prior Payslip - Additional income verification  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Estimated Completion Time: 5-10 minutes                          │
│  Next: Upload documents for verification                           │
│                                                                     │
│  [ Cancel ]                           [ Create & Upload Documents ] │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Components**:
- **Simple Form**: Minimal required fields to get started quickly
- **Document Preview**: Clear explanation of what will be required next
- **Expectations Setting**: Time estimate and process explanation
- **Primary Action**: Direct path to document upload workflow

### 3. Application Detail - Prescriptive Document Slots (`/applications/[id]`)

**Purpose**: **MAIN INTERFACE** - Core document upload experience with 5 prescriptive slots.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Personal Loan Application #PL-2024-001            │
│                                                                     │
│  Progress: ████████████░░ 4/5 documents completed (80%)            │
│  Status: Missing 1 critical document • Ready when complete          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Required Documents Checklist:                                     │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ ✓ Identity Card *                              [View][Replace] │ │
│  │   IC_front_back.pdf                                           │ │
│  │   Verified IC • Confidence: 94% • Sep 29, 2024               │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ ✓ Most Recent Payslip *                       [View][Replace] │ │
│  │   payslip_september_2024.pdf                                  │ │
│  │   Verified Payslip • Confidence: 97% • Sep 29, 2024          │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ ✓ Previous Month Payslip *                     [View][Replace] │ │
│  │   payslip_august_2024.pdf                                     │ │
│  │   Verified Payslip • Confidence: 91% • Sep 29, 2024          │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ ✓ 2 Months Prior Payslip                      [View][Replace] │ │
│  │   payslip_july_2024.pdf                                       │ │
│  │   Verified Payslip • Confidence: 89% • Sep 29, 2024          │ │
│  │   Optional - Helps strengthen your application                 │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ ! Bank Application Form *                          [Upload]     │ │
│  │   Required - Completed and signed loan application           │ │
│  │                                                               │ │
│  │   📄 Drag file here or click to browse                       │ │
│  │      Accepted: PDF, JPG, PNG • Max size: 10MB                │ │
│  │                                                               │ │
│  │   [ Choose File ]                                             │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Application Status                                                 │
│  4 of 4 critical documents completed ✓                            │ │
│  1 optional document completed ✓                                   │ │
│  Ready to submit when final document uploaded                      │ │
│                                                                     │
│  [ Save Draft ]                              [ Submit Application ] │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Document Slot Component Specifications

### Core Slot Component Design

Each document slot is a self-contained component with 5 distinct visual states and clear behavioral patterns.

### Slot State 1: Empty Critical Document

```
┌───────────────────────────────────────────────────────────────┐
│ ! Identity Card *                                   [Upload] │
│   Required - Clear photo or scan of your IC (both sides)     │
│                                                               │
│   📄 Drag file here or click to browse                       │
│      Accepted: PDF, JPG, PNG • Max size: 10MB                │
│                                                               │
│   [ Choose File ]                                             │
└───────────────────────────────────────────────────────────────┘
```

**CSS Specifications**:
```css
.document-slot {
  @apply border-2 border-dashed border-red-500/50 bg-red-500/5;
  @apply rounded-lg p-6 min-h-[140px];
  @apply transition-all duration-200 hover:border-red-400;
}

.slot-header {
  @apply flex items-center justify-between mb-3;
}

.slot-title {
  @apply text-lg font-semibold text-white flex items-center gap-2;
}

.critical-indicator {
  @apply text-red-400 text-xl;
}

.slot-description {
  @apply text-sm text-gray-300 mb-4;
}

.upload-area {
  @apply flex flex-col items-center justify-center;
  @apply text-gray-400 text-center py-4;
}
```

### Slot State 2: Empty Optional Document

```
┌───────────────────────────────────────────────────────────────┐
│ ⚬ 2 Months Prior Payslip                           [Upload] │
│   Optional - Helps strengthen your application               │
│                                                               │
│   📄 Drag file here or click to browse                       │
│      Accepted: PDF, JPG, PNG • Max size: 10MB                │
│                                                               │
│   [ Choose File ]                                             │
└───────────────────────────────────────────────────────────────┘
```

**CSS Specifications**:
```css
.document-slot.optional {
  @apply border-gray-600 bg-gray-700/30;
  @apply hover:border-gray-500;
}

.optional-indicator {
  @apply text-gray-500 text-lg;
}
```

### Slot State 3: Uploading

```
┌───────────────────────────────────────────────────────────────┐
│ ⏳ Identity Card *                                   [ Cancel ] │
│    Uploading IC_scan.pdf...                                  │
│                                                               │
│    ████████████░░░░ 75%                                      │
│    2.1 MB of 2.8 MB uploaded                                 │
│                                                               │
│    [ Cancel Upload ]                                          │
└───────────────────────────────────────────────────────────────┘
```

**CSS Specifications**:
```css
.document-slot.uploading {
  @apply border-blue-500 bg-blue-500/10;
}

.upload-progress {
  @apply w-full bg-gray-700 rounded-full h-2 mb-2;
}

.upload-progress-bar {
  @apply bg-blue-500 h-2 rounded-full transition-all duration-300;
}

.upload-stats {
  @apply text-xs text-gray-400;
}
```

### Slot State 4: Processing & Validating

```
┌───────────────────────────────────────────────────────────────┐
│ ⏳ Identity Card *                                            │
│    Processing IC_scan.pdf...                                 │
│                                                               │
│    🔄 Validating document type...                            │
│    This may take 30-60 seconds                               │
│                                                               │
│    [ Cancel ]                                                 │
└───────────────────────────────────────────────────────────────┘
```

**CSS Specifications**:
```css
.document-slot.processing {
  @apply border-amber-500 bg-amber-500/10;
}

.processing-spinner {
  @apply animate-spin text-amber-400 text-xl;
}

.processing-text {
  @apply text-amber-300 font-medium;
}
```

### Slot State 5: Completed Successfully

```
┌───────────────────────────────────────────────────────────────┐
│ ✓ Identity Card *                              [View][Replace] │
│   IC_front_back.pdf                                           │
│   Verified IC • Confidence: 94% • Sep 29, 2024               │
│                                                               │
│   Document successfully validated and processed ✓             │
│                                                               │
│   [ View Details ] [ Replace Document ]                       │
└───────────────────────────────────────────────────────────────┘
```

**CSS Specifications**:
```css
.document-slot.completed {
  @apply border-green-500 bg-green-500/10;
}

.success-indicator {
  @apply text-green-400 text-xl;
}

.document-info {
  @apply text-gray-200 font-medium mb-1;
}

.validation-info {
  @apply text-green-300 text-sm;
}
```

### Slot State 6: Validation Error

```
┌───────────────────────────────────────────────────────────────┐
│ ✗ Identity Card *                                             │
│   payslip_wrong_file.pdf                                      │
│                                                               │
│   ⚠ Wrong Document Type                                       │
│   Expected: Identity Card, Found: Payslip                    │
│   Please upload your Identity Card (IC or Passport)          │
│                                                               │
│   [ Try Again ] [ Upload Different File ]                     │
└───────────────────────────────────────────────────────────────┘
```

**CSS Specifications**:
```css
.document-slot.error {
  @apply border-red-500 bg-red-500/10;
}

.error-indicator {
  @apply text-red-400 text-xl;
}

.error-message {
  @apply text-red-300 font-medium mb-2;
}

.error-details {
  @apply text-red-200 text-sm;
}
```

---

## Mobile Responsive Design

### Mobile Layout (`< 768px`)

```
┌─────────────────────────────────┐
│ Personal Loan Application       │
│ Progress: 4/5 (80%)            │
├─────────────────────────────────┤
│                                 │
│ Documents Required:             │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ✓ Identity Card *           │ │
│ │   IC_front_back.pdf         │ │
│ │   [View] [Replace]          │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ✓ Most Recent Payslip *     │ │
│ │   payslip_sept_2024.pdf     │ │
│ │   [View] [Replace]          │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ! Application Form *        │ │
│ │   📄 Tap to upload          │ │
│ │   [ Choose File ]           │ │
│ └─────────────────────────────┘ │
│                                 │
│ [ Save Draft ] [ Submit ]      │
│                                 │
└─────────────────────────────────┘
```

**Mobile-Specific Features**:
- **Single Column Layout**: Vertical stacking of all document slots
- **Touch-Friendly Targets**: 44px minimum touch target size
- **Simplified Buttons**: Condensed button text for mobile screens
- **Swipe Navigation**: Optional swipe between completed slots
- **Optimized Upload**: Native file picker integration

### Tablet Layout (`768px - 1024px`)

```
┌─────────────────────────────────────────────────────────────┐
│            Personal Loan Application #PL-2024-001           │
│                    Progress: 4/5 (80%)                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────┐  ┌─────────────────────┐           │
│ │ ✓ Identity Card *   │  │ ✓ Recent Payslip *  │           │
│ │   IC_front.pdf      │  │   payslip_sept.pdf  │           │
│ │   [View][Replace]   │  │   [View][Replace]   │           │
│ └─────────────────────┘  └─────────────────────┘           │
│                                                             │
│ ┌─────────────────────┐  ┌─────────────────────┐           │
│ │ ✓ Previous Payslip *│  │ ✓ 2 Month Payslip   │           │
│ │   payslip_aug.pdf   │  │   payslip_july.pdf  │           │
│ │   [View][Replace]   │  │   [View][Replace]   │           │
│ └─────────────────────┘  └─────────────────────┘           │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐     │
│ │ ! Bank Application Form *                           │     │
│ │   📄 Drag file here or tap to browse               │     │
│ │   [ Choose File ]                                   │     │
│ └─────────────────────────────────────────────────────┘     │
│                                                             │
│ [ Save Draft ]                           [ Submit App ]     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Progress Tracking & Status Management

### Progress Indicator Component

```
Progress: ████████████░░ 4/5 documents completed (80%)
Critical: ████████████ 3/4 required documents ✓
```

**Implementation Logic**:
```typescript
interface ApplicationProgress {
  totalSlots: 5
  completedSlots: number
  criticalSlots: 4
  completedCriticalSlots: number
  canSubmit: boolean // true when completedCriticalSlots === 4
}

const calculateProgress = (documents: DocumentSlot[]): ApplicationProgress => {
  const completed = documents.filter(doc => doc.status === 'completed').length
  const criticalCompleted = documents
    .filter(doc => doc.isCritical && doc.status === 'completed').length

  return {
    totalSlots: 5,
    completedSlots: completed,
    criticalSlots: 4,
    completedCriticalSlots: criticalCompleted,
    canSubmit: criticalCompleted === 4
  }
}
```

### Application Status Messages

```typescript
const getStatusMessage = (progress: ApplicationProgress): string => {
  if (progress.canSubmit && progress.completedSlots === 5) {
    return "All documents completed • Ready to submit"
  }
  if (progress.canSubmit) {
    return "All critical documents completed • Ready to submit"
  }
  const remaining = progress.criticalSlots - progress.completedCriticalSlots
  return `${remaining} critical document${remaining > 1 ? 's' : ''} remaining`
}
```

---

## Interaction Flows & User Journey

### Complete User Flow Diagram

```
1. Dashboard View
   ├─ [Create New Personal Loan]
   │
2. Application Setup
   ├─ Fill basic details (name, amount, purpose)
   ├─ Review document requirements
   ├─ [Create & Upload Documents]
   │
3. Document Upload Interface
   ├─ See 5 prescriptive slots
   ├─ Upload to first empty critical slot
   │  ├─ File selection
   │  ├─ Upload progress
   │  ├─ Type validation (Universal Classifier)
   │  ├─ Success confirmation OR error handling
   │  └─ Move to next slot
   ├─ Repeat for remaining slots
   ├─ Visual progress updates after each completion
   │
4. Application Submission
   ├─ All critical slots completed
   ├─ [Submit Application] enabled
   ├─ Confirmation dialog
   ├─ Processing workflow triggered
   │
5. Status Monitoring
   ├─ Return to dashboard
   ├─ Track processing status
   └─ Receive completion notifications
```

### Error Recovery Flow

```
Document Upload Error:
├─ Upload fails or wrong document type detected
├─ Slot shows error state with specific message
├─ User options:
│  ├─ [Try Again] - retry same file
│  ├─ [Upload Different File] - select new file
│  └─ [Cancel] - return to empty state
├─ Clear guidance on what document is expected
└─ No progress lost on other completed slots
```

---

## Technical Integration Specifications

### API Endpoint Integration

**Slot-Specific Upload**:
```typescript
POST /api/applications/[applicationId]/documents

interface SlotUploadRequest {
  file: File
  slot: 'identity_card' | 'payslip_recent' | 'payslip_month1' |
        'payslip_month2' | 'application_form'
  applicationId: string
}

interface SlotUploadResponse {
  success: boolean
  documentId: string
  documentSlot: string
  processingTaskId: string
  message: string
}
```

**Real-time Status Updates**:
```typescript
// Polling approach for POC (WebSocket for Phase 2)
const useDocumentSlotPolling = (applicationId: string) => {
  const [slots, setSlots] = useState<DocumentSlot[]>([])

  useEffect(() => {
    const pollStatus = async () => {
      const response = await fetch(`/api/applications/${applicationId}/documents`)
      const { documents } = await response.json()

      setSlots(mapDocumentsToSlots(documents))
    }

    const interval = setInterval(pollStatus, 2000)
    return () => clearInterval(interval)
  }, [applicationId])

  return slots
}
```

### Universal Classifier Integration

**Document Type Validation**:
```typescript
interface ValidationResult {
  success: boolean
  expectedType: string
  detectedType: string
  confidence: number
  error?: 'document_type_mismatch' | 'classification_failed'
}

const validateDocumentSlot = async (
  documentId: string,
  expectedSlot: string
): Promise<ValidationResult> => {
  const classification = await classifyDocument(documentId)
  const expectedType = getExpectedTypeForSlot(expectedSlot)

  return {
    success: classification.document_type === expectedType,
    expectedType,
    detectedType: classification.document_type,
    confidence: classification.confidence_score
  }
}
```

---

## CSS Design System & Component Library

### Core CSS Classes

```css
/* Application Layout */
.application-container {
  @apply max-w-4xl mx-auto p-6 bg-gray-800 min-h-screen;
}

.application-header {
  @apply border-b border-gray-700 pb-6 mb-8;
}

.application-title {
  @apply text-2xl font-bold text-white mb-2;
}

.progress-section {
  @apply mb-8 p-4 bg-gray-700/50 rounded-lg;
}

/* Document Slots Grid */
.slots-container {
  @apply grid gap-6 mb-8;
  @apply grid-cols-1 md:grid-cols-2 lg:grid-cols-2;
}

.slot-container {
  @apply relative;
}

/* Progress Components */
.progress-bar {
  @apply w-full bg-gray-700 rounded-full h-3 mb-2;
}

.progress-fill {
  @apply bg-blue-500 h-3 rounded-full transition-all duration-500;
}

.progress-text {
  @apply text-sm text-gray-300 mb-1;
}

/* Status Indicators */
.status-critical {
  @apply text-red-400 font-medium;
}

.status-optional {
  @apply text-gray-400;
}

.status-completed {
  @apply text-green-400;
}

.status-processing {
  @apply text-amber-400;
}

/* Button Styles */
.btn-primary {
  @apply bg-blue-600 hover:bg-blue-700 text-white;
  @apply px-6 py-3 rounded-lg font-medium;
  @apply transition-colors duration-200;
}

.btn-secondary {
  @apply bg-gray-700 hover:bg-gray-600 text-white;
  @apply px-4 py-2 rounded-lg;
  @apply transition-colors duration-200;
}

.btn-danger {
  @apply bg-red-600 hover:bg-red-700 text-white;
  @apply px-4 py-2 rounded-lg;
  @apply transition-colors duration-200;
}

/* Mobile Responsive Adjustments */
@media (max-width: 768px) {
  .slots-container {
    @apply grid-cols-1 gap-4;
  }

  .application-container {
    @apply p-4;
  }

  .document-slot {
    @apply min-h-[120px] p-4;
  }
}
```

### Animation & Transitions

```css
/* Slot State Transitions */
.slot-transition {
  @apply transition-all duration-300 ease-in-out;
}

.slot-enter {
  @apply opacity-0 scale-95;
}

.slot-enter-active {
  @apply opacity-100 scale-100;
}

.progress-animation {
  @apply transition-all duration-500 ease-out;
}

/* Success Animation */
@keyframes success-pulse {
  0% { @apply bg-green-500/10; }
  50% { @apply bg-green-500/20; }
  100% { @apply bg-green-500/10; }
}

.slot-success-animation {
  animation: success-pulse 1s ease-in-out;
}

/* Upload Progress Animation */
@keyframes upload-progress {
  0% { width: 0%; }
  100% { width: var(--progress-width); }
}

.upload-progress-animated {
  animation: upload-progress 0.3s ease-out;
}
```

---

## Accessibility & Professional Standards

### ARIA Labels & Screen Reader Support

```typescript
// Document Slot ARIA Implementation
interface SlotAriaProps {
  'aria-label': string
  'aria-describedby': string
  'role': 'button' | 'region'
  'aria-live'?: 'polite' | 'assertive'
  'aria-expanded'?: boolean
}

const getSlotAriaProps = (slot: DocumentSlot): SlotAriaProps => {
  const criticalText = slot.isCritical ? 'Required' : 'Optional'
  const statusText = getStatusText(slot.status)

  return {
    'aria-label': `${slot.displayName}, ${criticalText} document, ${statusText}`,
    'aria-describedby': `slot-${slot.id}-description`,
    'role': slot.status === 'empty' ? 'button' : 'region',
    'aria-live': slot.status === 'processing' ? 'polite' : undefined
  }
}
```

### Keyboard Navigation

```typescript
// Keyboard Navigation Implementation
const handleSlotKeyDown = (event: KeyboardEvent, slot: DocumentSlot) => {
  switch (event.key) {
    case 'Enter':
    case ' ':
      if (slot.status === 'empty') {
        event.preventDefault()
        triggerFileUpload(slot.id)
      }
      break

    case 'Escape':
      if (slot.status === 'uploading') {
        event.preventDefault()
        cancelUpload(slot.id)
      }
      break

    case 'Tab':
      // Natural tab order through slots
      break
  }
}
```

### Color Contrast & Visual Accessibility

**WCAG 2.1 AA Compliance**:
- **Text Contrast**: All text meets 4.5:1 contrast ratio minimum
- **Interactive Elements**: 3:1 contrast ratio for UI components
- **Focus Indicators**: High contrast focus rings on all interactive elements
- **Color Independence**: Status never conveyed by color alone

```css
/* High Contrast Focus Indicators */
.slot-focusable:focus {
  @apply outline-none ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-800;
}

/* Accessible Color Palette */
:root {
  --text-primary: #ffffff;     /* White on dark bg = ∞:1 */
  --text-secondary: #d1d5db;   /* Gray-300 = 8.4:1 */
  --text-muted: #9ca3af;       /* Gray-400 = 5.8:1 */
  --accent-critical: #f87171; /* Red-400 = 4.8:1 */
  --accent-success: #34d399;   /* Emerald-400 = 5.2:1 */
}
```

---

## Implementation Roadmap & Development Phases

### Phase 1: Foundation (Week 1)
- [ ] Create base application layouts and routing
- [ ] Implement document slot component with all states
- [ ] Set up API endpoints for slot-based uploads
- [ ] Integrate with existing Universal Classifier

### Phase 2: Core Functionality (Week 2)
- [ ] Complete document validation workflow
- [ ] Real-time status polling implementation
- [ ] Progress tracking and submission logic
- [ ] Error handling and recovery flows

### Phase 3: Polish & Responsive (Week 3)
- [ ] Mobile responsive optimization
- [ ] Accessibility enhancements and testing
- [ ] Animation and transition polishing
- [ ] Cross-browser compatibility testing

### Phase 4: Integration Testing (Week 4)
- [ ] End-to-end workflow testing
- [ ] Performance optimization
- [ ] User acceptance testing
- [ ] Production deployment preparation

## Success Metrics & Testing Criteria

### User Experience Metrics
- **Task Completion Rate**: > 85% of users complete full application
- **Time to Complete**: < 5 minutes average for full 5-document upload
- **Error Recovery Rate**: > 90% of users successfully retry after document errors
- **Mobile Usability**: Equivalent completion rates on mobile vs desktop

### Technical Performance Metrics
- **Upload Success Rate**: > 98% of file uploads succeed
- **Validation Accuracy**: > 95% correct document type detection
- **Processing Time**: < 30 seconds average per document validation
- **Page Load Time**: < 2 seconds for application detail page

This comprehensive UX/UI design document provides all specifications needed to implement a professional, user-friendly Personal Loan application system using prescriptive document slots that maintain FinanSEAL's banking-grade standards while delivering an intuitive, error-resistant user experience.