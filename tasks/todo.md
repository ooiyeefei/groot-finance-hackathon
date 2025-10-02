# Document Container Redesign - Compact & Minimal Design

## Goal
Redesign document containers in the application details page to be fully collapsible at the container level, with a clean minimal design that removes technical jargon and provides consistent behavior across all document types (IC, Payslip, Application Form).

## Current State Analysis
- Document containers show mixed expanded/collapsed content inconsistently
- Technical details like "Expected document type:" and confidence scores are prominently displayed
- Each document type (IC, Payslip, Application Form) has its own display component with different expansion patterns
- The main container at `application-detail-container.tsx` (lines 665-864) shows some fields while others use internal expand/collapse

## Design Requirements
1. **Container-Level Collapse**: Make entire document container collapsible
2. **Collapsed State**: Show only document name, status badge, and "Required" badge
3. **Expanded State**: Show all extracted data in a clean organized manner
4. **Remove Technical Jargon**: Replace "Expected document type:" with cleaner labels
5. **Simplify Confidence Display**: Replace confidence scores with "AI Extraction - Please verify accuracy" disclaimer
6. **Consistent Design**: Apply same pattern across IC, Payslip, and Application Form documents

## Implementation Plan

### Task 1: Update ICDataDisplay Component
- [ ] Add container-level collapse/expand functionality to replace internal expand pattern
- [ ] Move AI extraction disclaimer to top when expanded (replace confidence at bottom)
- [ ] Simplify the confidence score display format
- [ ] Maintain clean field organization with summary view

### Task 2: Update PayslipDataDisplay Component
- [ ] Add container-level collapse/expand functionality to replace internal expand pattern
- [ ] Move AI extraction disclaimer to top when expanded
- [ ] Simplify confidence score display format
- [ ] Keep earnings/deductions breakdown structure but simplify header

### Task 3: Update ApplicationFormDataDisplay Component
- [ ] Already has good section-level collapse, but needs container-level wrapper
- [ ] Add AI extraction disclaimer at top when expanded
- [ ] Simplify confidence score display
- [ ] Ensure consistent styling with other document types

### Task 4: Update Application Detail Container
- [ ] Modify document slot rendering to implement container-level collapse
- [ ] Remove "Expected document type:" text (line 687)
- [ ] Simplify the collapsed state to show only: document name + status badge + required badge
- [ ] Move all document details (file info, upload date, actions) inside expanded state
- [ ] Ensure consistent collapse/expand button positioning

### Task 5: Build and Test
- [ ] Run npm run build to verify no TypeScript errors
- [ ] Test all three document types (IC, Payslip, Application Form)
- [ ] Verify responsive behavior and accessibility

## Design Specifications

### Collapsed State Structure
```
┌─────────────────────────────────────────────────────────┐
│ [Icon] Identity Card  [Completed] [Required]  [Expand] │
└─────────────────────────────────────────────────────────┘
```

### Expanded State Structure
```
┌─────────────────────────────────────────────────────────┐
│ [Icon] Identity Card  [Completed] [Required]  [Collapse]│
├─────────────────────────────────────────────────────────┤
│ ⚠️ AI Extraction - Please verify accuracy              │
├─────────────────────────────────────────────────────────┤
│ [File name and metadata]                                │
│ [Action buttons: View, Download, Reprocess, Delete]     │
│                                                          │
│ [Extracted data fields in clean organized format]       │
└─────────────────────────────────────────────────────────┘
```

### Styling Principles
- Use consistent spacing and borders
- Gray-scale color palette with status-based accent colors
- Clean typography hierarchy
- Smooth transitions for expand/collapse animations
- Accessible ARIA labels for screen readers

## Notes
- Follow existing Tailwind CSS patterns in the codebase
- Maintain existing functionality (upload, view, download, delete, reprocess)
- Keep TypeScript strict mode compliance
- Preserve existing data extraction and display logic
