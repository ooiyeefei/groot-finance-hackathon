# FinanSEAL Post-Refactor Todo List

## Current Task: Document Preview Integration for Accounting Forms

### Overview
Integrate side-by-side document preview functionality into accounting record Create/Edit/View modals to allow users to reference source invoices/receipts without disrupting their workflow.

### Current State Analysis
- **Existing Modals**: 3 types (Create, Edit, View) in `/src/domains/accounting-entries/components/`
- **Current Layout**: Two-pane (Form fields 50% left, Line items 50% right)
- **Current Document Access**: "View Document" button opens new tab (disruptive)
- **Document Storage**: Multi-page PDFs converted to JPG images in `converted_image_path` folder
- **Existing Component**: `DocumentPreviewWithAnnotations` with bounding box support in document-analysis-modal.tsx

---

## Proposed UX Solution

### Layout Strategy: Collapsible Three-Pane Adaptive Layout

Instead of cramming a third pane into the existing two-pane layout, implement a **collapsible three-pane system** that adapts to user needs:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Header (Title, "Show/Hide Document" Toggle, Save Button, Close)          │
├──────────────┬──────────────────────┬─────────────────────────────────────┤
│              │                      │                                     │
│   Form       │   Document           │   Line Items                        │
│   Fields     │   Preview            │   Table                             │
│   (Left)     │   (Center)           │   (Right)                           │
│              │   [Collapsible]      │                                     │
│              │                      │                                     │
│   30% width  │   40% width          │   30% width                         │
│   Scrollable │   Fixed with         │   Scrollable                        │
│              │   Page Navigation    │                                     │
│              │   (Prev/Next btns)   │                                     │
│              │                      │                                     │
└──────────────┴──────────────────────┴─────────────────────────────────────┘

When Preview Collapsed (Default State):
├──────────────────────────────┬─────────────────────────────────────┤
│   Form Fields (50%)          │   Line Items (50%)                  │
│   [Current Layout]           │   [Current Layout]                  │
└──────────────────────────────┴─────────────────────────────────────┘
```

### Key Design Features

#### 1. Collapsible Document Preview Panel
- **Default State**: Collapsed (shows only form + line items like current design)
- **Expanded State**: Document preview slides in as center panel with smooth transition
- **Toggle Button**: Eye icon in header "Show Document Preview" / "Hide Document Preview"
- **Preserves Familiarity**: Users who don't need preview get current experience
- **Auto-Show Logic**:
  - Create modal from document → Preview auto-shown by default
  - Edit/View modal → Preview collapsed by default, user can expand

#### 2. Adaptive Width Distribution
**When preview is shown:**
- Form Fields: 30% width (condensed but usable, vertical scroll for fields)
- Document Preview: 40% width (main focus, largest panel)
- Line Items: 30% width (condensed table, horizontal scroll if needed)

**When preview is hidden:**
- Form Fields: 50% width (current design)
- Line Items: 50% width (current design)

**CSS Implementation:**
```css
/* Preview Hidden (Default) */
.form-pane { width: 50%; }
.preview-pane { display: none; }
.line-items-pane { width: 50%; }

/* Preview Shown */
.form-pane { width: 30%; }
.preview-pane { display: block; width: 40%; }
.line-items-pane { width: 30%; }
```

#### 3. Multi-Page Document Navigation
Reuse existing pattern from `document-analysis-modal.tsx`:
- **Page Counter**: "Page 1 of 5" displayed above preview
- **Navigation Buttons**: ◀ Previous | Next ▶ buttons
- **Keyboard Shortcuts**: Arrow Left/Right for page navigation
- **Loading State**: Spinner overlay while fetching new page
- **Error State**: "Failed to load page" with retry button

#### 4. Responsive Breakpoints
- **Extra Large (>1600px)**: Full three-pane layout with comfortable spacing
- **Large (1200-1600px)**: Three-pane works, preview toggle recommended
- **Medium (<1200px)**: Preview opens as overlay modal instead of inline panel
- **Small (<768px)**: Preview always opens as fullscreen modal overlay

---

## Component Architecture

### New Components to Create

#### 1. `MultiPageDocumentPreview.tsx`
**Purpose**: Reusable multi-page document viewer with navigation
**Location**: `/src/components/documents/multi-page-document-preview.tsx`

**Props Interface**:
```typescript
interface MultiPageDocumentPreviewProps {
  documentId: string              // Required: Document database ID
  convertedImagePath?: string      // Optional: Pre-cached path
  currentPage?: number             // Optional: Initial page (default: 1)
  onPageChange?: (page: number) => void  // Optional: Callback for page changes
  showAnnotations?: boolean        // Optional: Show OCR bounding boxes
  boundingBoxes?: BoundingBox[]    // Optional: Annotation data
  className?: string               // Optional: Additional styling
  maxHeight?: string              // Optional: Max height (default: 70vh)
}
```

**Features**:
- Fetches document images via `/api/v1/invoices/${documentId}/image-url` API
- Page navigation UI with previous/next buttons
- Loading states with skeleton placeholders
- Error handling with retry capability
- Optional annotation overlay (reuse from document-analysis-modal)
- Keyboard event listeners for arrow key navigation
- Responsive image sizing (fit within container)

**Internal State**:
```typescript
const [currentPage, setCurrentPage] = useState(initialPage)
const [totalPages, setTotalPages] = useState(1)
const [imageUrl, setImageUrl] = useState<string | null>(null)
const [isLoading, setIsLoading] = useState(false)
const [error, setError] = useState<string | null>(null)
```

---

### Updated Modal Components

**Files to Modify**:
1. `/src/domains/accounting-entries/components/accounting-entry-view-modal.tsx`
2. `/src/domains/accounting-entries/components/accounting-entry-edit-modal.tsx`
3. New: `/src/domains/accounting-entries/components/accounting-entry-create-modal.tsx` (extract from form modal)

**New State for All Modals**:
```typescript
const [showDocumentPreview, setShowDocumentPreview] = useState(false)
const [currentDocumentPage, setCurrentDocumentPage] = useState(1)
```

**Header Button Addition**:
```tsx
{/* Document Preview Toggle - Only show if source_record_id exists */}
{transaction?.source_record_id && (
  <button
    onClick={() => setShowDocumentPreview(!showDocumentPreview)}
    className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-lg transition-colors"
    title={showDocumentPreview ? "Hide Document Preview" : "Show Document Preview"}
  >
    {showDocumentPreview ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
  </button>
)}
```

**Layout Changes**:
```tsx
{/* Modal Content - Adaptive Three-Pane Layout */}
<div className="flex-1 flex min-h-0">
  {/* Left Pane - Form Fields */}
  <div className={`border-r border-gray-700 flex flex-col min-h-0 transition-all duration-300 ${
    showDocumentPreview ? 'w-[30%]' : 'w-1/2'
  }`}>
    {/* Existing form content */}
  </div>

  {/* Center Pane - Document Preview (Collapsible) */}
  {showDocumentPreview && transaction?.source_record_id && (
    <div className="w-[40%] border-r border-gray-700 flex flex-col min-h-0 bg-gray-900">
      <div className="p-6 flex-1 overflow-hidden">
        <MultiPageDocumentPreview
          documentId={transaction.source_record_id}
          currentPage={currentDocumentPage}
          onPageChange={setCurrentDocumentPage}
          className="h-full"
        />
      </div>
    </div>
  )}

  {/* Right Pane - Line Items */}
  <div className={`flex flex-col min-h-0 transition-all duration-300 ${
    showDocumentPreview ? 'w-[30%]' : 'w-1/2'
  }`}>
    {/* Existing line items table */}
  </div>
</div>
```

---

## Implementation Tasks

### ✅ Phase 0: Planning & Design Review (CURRENT)
- [x] Analyze existing modal components and layout
- [x] Study document-analysis-modal.tsx for reusable patterns
- [x] Research multi-page navigation UX best practices
- [x] Create comprehensive design specification
- [ ] **AWAITING APPROVAL**: Get user feedback on three-pane collapsible approach

---

### Phase 1: Shared Component Development
**Estimated Time**: 3-4 hours

- [ ] **Task 1.1**: Create `MultiPageDocumentPreview.tsx` component
  - [ ] Set up component structure with TypeScript interface
  - [ ] Implement page fetching logic via existing image-url API
  - [ ] Add navigation controls (prev/next buttons, page counter)
  - [ ] Implement keyboard shortcuts (ArrowLeft/ArrowRight)
  - [ ] Add loading state with skeleton placeholder
  - [ ] Add error state with retry button
  - [ ] Implement responsive image sizing (max-height: 70vh)
  - [ ] Add smooth transitions for page changes
  - [ ] Test with single-page and multi-page documents

- [ ] **Task 1.2**: Create shared types/interfaces
  - [ ] Define `DocumentPreviewProps` interface
  - [ ] Define `DocumentPageInfo` interface
  - [ ] Export from `/src/types/documents.ts`

---

### Phase 2: API Verification & Enhancement
**Estimated Time**: 1-2 hours

- [ ] **Task 2.1**: Verify existing document image API
  - [ ] Test `/api/v1/invoices/${documentId}/image-url?pageNumber=X` endpoint
  - [ ] Verify pagination support works correctly
  - [ ] Test with documents missing converted_image_path (graceful degradation)
  - [ ] Ensure proper error responses for invalid document IDs

- [ ] **Task 2.2**: Add caching optimization (optional)
  - [ ] Implement in-memory cache for frequently accessed pages
  - [ ] Add cache headers for browser caching
  - [ ] Consider adding prefetch for next page

---

### Phase 3: Modal Integration - View Modal
**Estimated Time**: 3-4 hours

- [ ] **Task 3.1**: Update `accounting-entry-view-modal.tsx`
  - [ ] Add `showDocumentPreview` state (default: false)
  - [ ] Add `currentDocumentPage` state (default: 1)
  - [ ] Add toggle button in header (Eye icon)
  - [ ] Implement three-pane layout with conditional width classes
  - [ ] Integrate `MultiPageDocumentPreview` component in center pane
  - [ ] Add smooth CSS transitions for panel collapse/expand (300ms ease-in-out)
  - [ ] Update responsive classes for mobile (preview as overlay)
  - [ ] Test with documents that have source_record_id
  - [ ] Test with documents without source_record_id (no preview button shown)

- [ ] **Task 3.2**: Add keyboard shortcut
  - [ ] Implement Ctrl+D / Cmd+D to toggle preview
  - [ ] Add tooltip hint in header button
  - [ ] Handle keyboard event cleanup on unmount

- [ ] **Task 3.3**: Test View Modal
  - [ ] Test with invoice source documents
  - [ ] Test with expense claim source documents
  - [ ] Test with multi-page documents (5+ pages)
  - [ ] Test preview toggle animation smoothness
  - [ ] Test responsive behavior on different screen sizes

---

### Phase 4: Modal Integration - Edit Modal
**Estimated Time**: 3-4 hours

- [ ] **Task 4.1**: Update `accounting-entry-edit-modal.tsx`
  - [ ] Apply same changes as View modal (Task 3.1)
  - [ ] Ensure form validation works with condensed layout (30% width)
  - [ ] Test auto-save doesn't conflict with preview interactions
  - [ ] Verify line items table remains usable in 30% width
  - [ ] Add horizontal scroll for line items table if needed

- [ ] **Task 4.2**: Form field UX optimization
  - [ ] Verify all form fields are accessible in 30% width
  - [ ] Adjust label positioning if needed (top instead of side-by-side)
  - [ ] Test form submission with preview shown and hidden

- [ ] **Task 4.3**: Test Edit Modal
  - [ ] Test editing records with source documents
  - [ ] Test form validation in condensed layout
  - [ ] Test line items editing in condensed table
  - [ ] Verify save functionality works correctly

---

### Phase 5: Modal Integration - Create Modal
**Estimated Time**: 4-5 hours

- [ ] **Task 5.1**: Extract create functionality to separate modal
  - [ ] Create new file: `accounting-entry-create-modal.tsx`
  - [ ] Move create logic from `accounting-entry-edit-modal.tsx`
  - [ ] Separate props interface for create vs edit

- [ ] **Task 5.2**: Add conditional document preview
  - [ ] Show preview only if `prefilledData?.source_record_id` exists
  - [ ] **Auto-show preview by default** when creating from document
  - [ ] Add "Created from Document X" indicator in header
  - [ ] Show document type badge (Invoice/Expense) with appropriate colors

- [ ] **Task 5.3**: Test Create Modal
  - [ ] Test creating record from document with auto-shown preview
  - [ ] Test creating manual record (no preview available)
  - [ ] Verify prefilled data matches document extraction
  - [ ] Test toggling preview while reviewing extracted data

---

### Phase 6: Polish & UX Refinements
**Estimated Time**: 3-4 hours

- [ ] **Task 6.1**: Animation & Transitions
  - [ ] Add smooth slide-in animation for preview panel (300ms ease-in-out)
  - [ ] Add fade transition for page changes (150ms fade)
  - [ ] Add button hover states (200ms)
  - [ ] Test animation performance on low-end devices

- [ ] **Task 6.2**: Accessibility Enhancements
  - [ ] Add ARIA labels for preview toggle button
  - [ ] Add ARIA labels for page navigation buttons
  - [ ] Add keyboard focus indicators
  - [ ] Add screen reader announcements for page changes
  - [ ] Test with screen reader (VoiceOver/NVDA)

- [ ] **Task 6.3**: User Preference Persistence
  - [ ] Add localStorage to remember preview toggle state
  - [ ] Implement "Pin Preview" checkbox option
  - [ ] Restore user preference on modal open
  - [ ] Clear preference on business context change

- [ ] **Task 6.4**: Tooltip & Help Text
  - [ ] Add tooltip for preview toggle: "View source document (Ctrl+D)"
  - [ ] Add tooltip for page navigation buttons
  - [ ] Add inline hint: "💡 Toggle document preview to verify extracted data"

---

### Phase 7: Responsive Design & Mobile
**Estimated Time**: 2-3 hours

- [ ] **Task 7.1**: Medium screen optimization (1200-1600px)
  - [ ] Test three-pane layout usability
  - [ ] Adjust font sizes if needed
  - [ ] Ensure line items table remains functional

- [ ] **Task 7.2**: Small screen fallback (<1200px)
  - [ ] Implement preview as overlay modal instead of inline
  - [ ] Add fullscreen preview mode for mobile
  - [ ] Test touch gestures for page navigation
  - [ ] Ensure modal close button is accessible

- [ ] **Task 7.3**: Tablet testing (768-1200px)
  - [ ] Test on iPad/tablet devices
  - [ ] Verify touch interactions work correctly
  - [ ] Test portrait and landscape orientations

---

### Phase 8: Testing & Quality Assurance
**Estimated Time**: 3-4 hours

- [ ] **Task 8.1**: Unit Testing
  - [ ] Test MultiPageDocumentPreview component
  - [ ] Test page navigation logic
  - [ ] Test error handling
  - [ ] Test keyboard shortcuts

- [ ] **Task 8.2**: Integration Testing
  - [ ] Test Create → Edit → View workflow with preview
  - [ ] Test with single-page documents
  - [ ] Test with multi-page PDFs (5+ pages)
  - [ ] Test with very large documents (20+ pages)
  - [ ] Test with missing documents (graceful degradation)
  - [ ] Test with corrupted image paths

- [ ] **Task 8.3**: Performance Testing
  - [ ] Test preview load time with large images
  - [ ] Test page navigation speed
  - [ ] Test memory usage with multiple modals open
  - [ ] Test with slow network conditions
  - [ ] Verify no memory leaks

- [ ] **Task 8.4**: Browser Compatibility
  - [ ] Test on Chrome/Edge (Chromium)
  - [ ] Test on Firefox
  - [ ] Test on Safari (macOS/iOS)
  - [ ] Test CSS Grid layout compatibility
  - [ ] Verify transitions work across browsers

- [ ] **Task 8.5**: User Acceptance Testing
  - [ ] Have user test the new preview functionality
  - [ ] Gather feedback on layout and usability
  - [ ] Identify pain points or confusion
  - [ ] Iterate based on feedback

---

### Phase 9: Documentation & Deployment
**Estimated Time**: 1-2 hours

- [ ] **Task 9.1**: Code Documentation
  - [ ] Add JSDoc comments to MultiPageDocumentPreview
  - [ ] Document props and usage examples
  - [ ] Add inline comments for complex logic

- [ ] **Task 9.2**: User Documentation
  - [ ] Update user guide with preview feature
  - [ ] Add screenshots showing preview functionality
  - [ ] Document keyboard shortcuts (Ctrl+D)

- [ ] **Task 9.3**: Build & Deploy
  - [ ] Run `npm run build` to verify production build
  - [ ] Test build output for bundle size impact
  - [ ] Deploy to staging environment
  - [ ] Perform smoke tests on staging
  - [ ] Deploy to production after approval

---

## User Interaction Patterns

### Scenario 1: Creating Record from Document (Most Common)
1. User uploads invoice/receipt → OCR processing completes
2. User clicks "Create Accounting Record from Document"
3. Modal opens with form pre-filled from OCR data
4. **Document preview is AUTO-SHOWN by default** (since user needs to verify)
5. User can see source document side-by-side with extracted fields
6. User verifies amounts, line items, vendor name against preview
7. User can collapse preview if confident in OCR accuracy
8. User saves record

**Why auto-show**: Users are creating from AI extraction and need to verify accuracy. Preview helps them catch OCR errors before saving.

### Scenario 2: Editing Existing Record
1. User clicks "Edit" on existing accounting entry
2. Modal opens with form populated from database
3. Document preview is **COLLAPSED by default** (user already saved, likely confident)
4. User can click Eye icon or press Ctrl+D to expand preview if needed
5. Preview remembers last viewed page from View modal
6. User makes edits and saves

**Why collapsed**: User already reviewed and saved this record. Preview is available but not intrusive.

### Scenario 3: Viewing Record Details
1. User clicks on record row to view details
2. Modal opens in read-only mode
3. Document preview is **COLLAPSED by default**
4. "View Document" button in header toggles preview (backward compatible)
5. User can browse through multiple pages of source document
6. Preview state is remembered if user opens Edit modal

**Why collapsed**: Read-only view is for quick reference. Users who need deep inspection can expand preview.

---

## Technical Considerations

### Performance Optimization

**1. Image Loading Strategy**
- **Lazy Loading**: Only fetch document images when preview is shown (not on modal open)
- **Prefetching**: Prefetch next page while viewing current page
- **Caching**: Cache page images in memory during session
- **Optimized Formats**: Use already-converted JPG images from Supabase (no additional processing)

**2. Bundle Size**
- **Code Splitting**: MultiPageDocumentPreview as separate chunk (lazy import)
- **Tree Shaking**: Ensure unused preview code is removed when not needed
- **Image Optimization**: Use Supabase image optimization features

**3. Virtual Scrolling** (Future Enhancement)
- For documents with 10+ pages, implement virtual scrolling
- Only render visible pages in DOM
- Lazy load pages as user scrolls

### Accessibility (WCAG 2.1 AA Compliance)

**1. Keyboard Navigation**
- Tab: Navigate between toggle button, prev/next buttons, form fields
- Enter/Space: Activate preview toggle button
- Arrow Left/Right: Navigate document pages
- Escape: Close modal
- Ctrl+D / Cmd+D: Toggle preview (custom shortcut)

**2. Screen Reader Support**
- ARIA label for toggle button: "Show document preview" / "Hide document preview"
- ARIA label for page navigation: "Previous page" / "Next page"
- ARIA live region for page changes: "Page 2 of 5 loaded"
- Semantic HTML: `<button>`, `<img>` with proper alt text

**3. Visual Indicators**
- Focus outlines on all interactive elements
- High contrast for buttons and borders
- Loading spinner with ARIA label
- Error states with clear error messages

### Browser Compatibility

**1. CSS Grid Layout**
- Modern browsers fully support CSS Grid (97% global support)
- Fallback for IE11: Use Flexbox (if needed)

**2. CSS Transitions**
- Widely supported (99% global support)
- Test smooth animations on low-end devices

**3. Fetch API**
- Native support in all modern browsers
- Use existing fetch polyfills if needed

**4. localStorage**
- Widely supported (99% global support)
- Graceful degradation if unavailable (no persistence)

---

## Design Specifications

### Colors & Typography (Dark Theme)

**Background Colors**:
- Modal background: `bg-gray-800`
- Preview panel: `bg-gray-900`
- Panel borders: `border-gray-700`
- Loading overlay: `bg-gray-800/50`

**Button Colors**:
- Preview toggle: `bg-gray-600 hover:bg-gray-500`
- Page navigation: `bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700`
- Active state: `bg-blue-500`

**Text Colors**:
- Primary text: `text-white`
- Secondary text: `text-gray-400`
- Disabled text: `text-gray-500`
- Link text: `text-blue-400 hover:text-blue-300`

**Icons**:
- Eye icon: Lucide React `Eye` / `EyeOff`
- Navigation: `ChevronLeft` / `ChevronRight`
- Loading: Spinning animation on existing icon

### Spacing & Layout

**Panel Padding**:
- All panels: `p-6` (1.5rem = 24px)
- Gap between panels: 0 (shared borders)

**Preview Image Sizing**:
- Max height: `70vh` (70% of viewport height)
- Width: Auto (maintain aspect ratio)
- Object fit: `contain` (show full image without cropping)

**Button Sizes**:
- Toggle button: `p-2` (icon only)
- Page navigation: `px-3 py-1.5 text-xs`
- Standard buttons: `px-4 py-2 text-sm`

### Animations & Transitions

**Panel Slide Animation**:
```css
.preview-pane {
  transition: all 300ms ease-in-out;
  transform: translateX(0);
}

.preview-pane.collapsed {
  transform: translateX(-100%);
  opacity: 0;
}
```

**Page Transition**:
```css
.document-image {
  transition: opacity 150ms ease;
}

.document-image.loading {
  opacity: 0.5;
}
```

**Button Hover**:
```css
button {
  transition: background-color 200ms ease, color 200ms ease;
}
```

---

## Success Criteria

### Functional Requirements
- [ ] Users can toggle document preview without losing form data
- [ ] Multi-page documents are easy to navigate with prev/next buttons
- [ ] Preview state is remembered when switching between View/Edit modals
- [ ] Layout remains usable on various screen sizes (1200px+)
- [ ] No performance degradation with large multi-page documents (20+ pages)
- [ ] Existing workflows are not disrupted (preview is opt-in except Create from Document)

### Performance Targets
- [ ] Preview panel opens in <300ms
- [ ] Page navigation completes in <500ms
- [ ] Bundle size increase <50KB (gzipped)
- [ ] First Contentful Paint (FCP) not affected
- [ ] Memory usage increase <10MB per open modal

### User Experience Goals
- [ ] 90%+ of users prefer integrated preview over new tab (user testing)
- [ ] Users can verify OCR extracted data more efficiently
- [ ] Reduced support tickets for "wrong data extracted" issues
- [ ] Positive feedback from user acceptance testing

### Code Quality Standards
- [ ] All TypeScript strict mode checks pass
- [ ] Zero console errors or warnings
- [ ] 80%+ test coverage for new component
- [ ] ESLint passes with no violations
- [ ] Build completes successfully

---

## Future Enhancements (Out of Scope for Initial Release)

### Phase 10: Advanced Features (Future)
- [ ] **Split-screen compare mode**: Document vs extracted data side-by-side with highlighting
- [ ] **Annotation editing**: Allow users to add/edit bounding boxes within modal
- [ ] **Document zoom/pan**: Pinch-to-zoom and pan gestures for mobile
- [ ] **Side-by-side comparison**: Compare multiple documents in preview
- [ ] **AI-powered field highlighting**: Show which document region maps to which form field
- [ ] **OCR confidence indicators**: Show confidence scores for extracted fields
- [ ] **Document search**: Search for text within multi-page documents
- [ ] **Export annotations**: Download annotated document with highlights

---

## Risk Assessment & Mitigation

### Risk 1: Screen Real Estate Constraints
**Concern**: Three panes may feel cramped on 1200-1400px screens
**Mitigation**:
- Default to collapsed state (current two-pane layout)
- User can opt-in to preview only when needed
- Responsive fallback for medium screens (overlay modal)

### Risk 2: Performance with Large Documents
**Concern**: 50-page documents may cause memory issues
**Mitigation**:
- Lazy load pages on demand (not all at once)
- Implement virtual scrolling for 10+ page documents (future)
- Add pagination with "Jump to Page" input

### Risk 3: User Confusion
**Concern**: Users may not understand when to use preview
**Mitigation**:
- Clear tooltip hints ("View source document")
- Auto-show preview for Create from Document scenario
- Inline help text: "💡 Toggle document preview to verify extracted data"

### Risk 4: Mobile Usability
**Concern**: Three-pane layout won't work on mobile
**Mitigation**:
- Responsive breakpoint: overlay modal for <1200px
- Fullscreen preview mode for mobile devices
- Touch gestures for page navigation

---

## Next Steps for Approval

**User, please review this comprehensive plan and provide feedback on:**

1. **Layout Approach**: Is the three-pane collapsible design acceptable?
2. **Screen Real Estate**: Any concerns about 30%/40%/30% split when preview is shown?
3. **Auto-Show Behavior**: Should preview be auto-shown for Create (from document) or remain collapsed?
4. **Keyboard Shortcut**: Is Ctrl+D / Cmd+D acceptable for toggle, or prefer different key?
5. **Responsive Behavior**: Is overlay modal acceptable for <1200px screens?
6. **Additional Requirements**: Any other UX features or interactions you'd like to see?

Once you approve the plan, I will begin implementation starting with **Phase 1** (creating the `MultiPageDocumentPreview` shared component).

---

**Last Updated**: 2025-01-17
**Status**: Design Phase - Awaiting User Approval
**Estimated Total Implementation Time**: 24-30 hours
**Priority**: High - Improves core UX for accounting record management

---

# Previous Todo Items Below...

(Keeping existing todo items from previous sessions for reference)
