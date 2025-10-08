# Category Management UX Design Plan

## Executive Summary
Design and implement a scalable, centralized Category Management system that supports both Expense Categories (employee reimbursements) and COGS Categories (supplier invoices) with clear separation, intuitive navigation, and minimal disruption to existing users.

---

## 1. Problem Analysis

### Current State
- **Expense Categories** managed under "Approvals > Categories" tab
- Categories used for AI-powered document categorization
- Each category has: name, description, deductible status, receipt requirements, approval policies, AI keywords

### New Requirement
- **COGS Categories** for supplier invoice management
- Fundamentally different from expense categories:
  - Expense = Employee reimbursements (travel, meals, supplies)
  - COGS = Business purchases (materials, subcontractor fees, IT support)

### Key Challenge
How to manage two distinct category types without:
- Creating user confusion
- Fragmenting the information architecture
- Limiting future scalability

---

## 2. Recommended Solution: Option B (Centralized Hub)

### Strategic Rationale
**Create a dedicated "Category Management" page with tabbed interface**

#### Why This Approach Wins:

1. **Scalability**: Establishes a predictable location for all business classification rules
   - Future category types (revenue, assets, depreciation) = just add a new tab
   - No scattered "Categories" menus across the application
   - Aligns with finance professionals' mental model (like Chart of Accounts)

2. **Clarity**: Treats categories as a core data entity, not subordinate features
   - Single source of truth for all financial classifications
   - Reduces cognitive load for system administrators
   - Clear separation between operational workflows and system setup

3. **Professional Standards**: Matches accounting software conventions
   - Users expect centralized configuration areas
   - Separation of "doing work" vs "configuring the system"

#### Trade-offs Acknowledged:
- Requires moving existing feature (migration cost)
- Needs clear communication plan for existing users
- Short-term disruption for long-term architectural health

---

## 3. Information Architecture Design

### 3.1 Navigation Structure

```
Main Navigation
└── Settings (or "Accounting" or "Workspace Settings")
    └── Category Management ⭐ NEW PAGE
        ├── Tab 1: Expense Categories
        └── Tab 2: COGS Categories
```

### 3.2 URL Structure
- `/[locale]/settings/categories` (default → Expense Categories tab)
- `/[locale]/settings/categories?tab=expense`
- `/[locale]/settings/categories?tab=cogs`

### 3.3 Breadcrumb Pattern
```
Settings > Category Management > [Expense Categories | COGS Categories]
```

---

## 4. Detailed UX Design

### 4.1 Page Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│ HEADER: Category Management                             │
│ Subtitle: Manage expense and COGS categories for AI     │
│                                                          │
│ ┌───────────────────────────────────────────────────┐  │
│ │ TAB BAR                                            │  │
│ │ [Expense Categories] [COGS Categories]             │  │
│ └───────────────────────────────────────────────────┘  │
│                                                          │
│ ┌───────────────────────────────────────────────────┐  │
│ │ TAB CONTENT                                        │  │
│ │ - Search bar                                       │  │
│ │ - Add Category button                              │  │
│ │ - Categories grid (reusing existing component)     │  │
│ └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Visual Design Specifications

#### Tab Styling (Dark Theme)
```typescript
// Inactive tabs
background: 'bg-gray-800'
border: 'border-gray-700'
text: 'text-gray-400'

// Active tabs
Expense Categories → 'bg-blue-600 text-white'
COGS Categories → 'bg-orange-600 text-white'

// Hover states
hover: 'bg-gray-700'
```

#### Category Card Differentiation
- **Expense Categories**: Blue accent (existing)
- **COGS Categories**: Orange accent (new)

### 4.3 Component Reuse Strategy

**Existing Components to Reuse:**
1. `/src/components/expense-claims/category-management.tsx`
   - Grid layout
   - Search functionality
   - CRUD operations
   - Form modal structure

**New Components to Create:**
1. `CategoryManagementContainer` (parent wrapper)
   - Handles tab state
   - Manages route parameters
   - Renders appropriate child component

2. `CogsCategories` (new)
   - Based on expense-claims/category-management.tsx
   - Modified for COGS-specific fields
   - Orange color scheme

---

## 5. Migration & Transition Strategy

### Phase 1: Build New System (Week 1)
1. Create `/[locale]/settings/categories/page.tsx`
2. Build CategoryManagementContainer component
3. Refactor expense-claims/category-management.tsx for reuse
4. Build COGS categories component (clone + modify)
5. Add database schema for COGS categories
6. Create API endpoints for COGS categories

### Phase 2: Soft Launch (Week 2)
1. Deploy new Category Management page
2. Keep old "Approvals > Categories" link functional
3. Add "Settings" to main navigation (if not present)
4. Add redirection with notification

### Phase 3: User Communication (Week 2-3)
**Redirect Notification UI:**
```
┌─────────────────────────────────────────────────────────┐
│ ℹ️  NOTICE: Category Management Has Moved              │
│                                                          │
│ Expense Categories are now in Settings > Category       │
│ Management to support additional category types.        │
│                                                          │
│ [Got It] [×]                                            │
└─────────────────────────────────────────────────────────┘
```

### Phase 4: Deprecation (Week 4+)
1. Monitor usage of old link (analytics)
2. After 2 release cycles, remove old link entirely
3. Update documentation and help guides

---

## 6. Field Specifications

### 6.1 Expense Categories (Existing)
```typescript
interface ExpenseCategory {
  id: string
  category_name: string
  category_code: string
  description?: string
  is_active: boolean
  parent_category_id?: string
  ai_keywords: string[]
  vendor_patterns: string[]
  tax_treatment: 'deductible' | 'non_deductible' | 'partial'
  requires_receipt: boolean
  receipt_threshold?: number
  policy_limit?: number
  requires_manager_approval: boolean
  sort_order: number
  is_default: boolean
}
```

### 6.2 COGS Categories (New)
```typescript
interface CogsCategory {
  id: string
  category_name: string
  category_code: string
  description?: string
  is_active: boolean
  parent_category_id?: string
  ai_keywords: string[]
  vendor_patterns: string[]

  // COGS-specific fields
  account_code?: string // GL account mapping
  is_direct_cost: boolean // Direct vs indirect COGS
  requires_approval: boolean
  approval_threshold?: number
  project_linkable: boolean // Can be linked to projects
  sort_order: number
  is_default: boolean
}
```

---

## 7. User Flows

### 7.1 Manager Creates New Expense Category
1. Navigate to Settings > Category Management
2. Ensure "Expense Categories" tab is active (default)
3. Click "Add Category" button
4. Fill form with expense-specific fields
5. Save → Returns to expense categories grid

### 7.2 Manager Creates New COGS Category
1. Navigate to Settings > Category Management
2. Click "COGS Categories" tab
3. Click "Add Category" button
4. Fill form with COGS-specific fields
5. Save → Returns to COGS categories grid

### 7.3 Existing User Discovers New Location
1. User clicks old "Approvals > Categories" link
2. System redirects to Settings > Category Management
3. One-time notification displays explaining the move
4. User dismisses notification (stores in localStorage)
5. User continues normal workflow

---

## 8. Accessibility Requirements

### WCAG 2.1 AA Compliance
1. **Keyboard Navigation**
   - Tab between tabs using arrow keys
   - Focus visible on all interactive elements
   - Skip links for main content

2. **Screen Reader Support**
   - `aria-label` on tabs: "Expense Categories tab" / "COGS Categories tab"
   - `role="tablist"` and `role="tab"` attributes
   - Announce active tab on change

3. **Color & Contrast**
   - Blue/Orange accents with 4.5:1 contrast ratio
   - Don't rely solely on color (add icons)
   - Focus indicators visible in high contrast mode

4. **Semantic HTML**
   - `<nav>` for tab navigation
   - `<section>` for tab content
   - Proper heading hierarchy (h1 → h2 → h3)

---

## 9. Performance Considerations

### Optimization Strategies
1. **Code Splitting**: Lazy load COGS component
   ```typescript
   const CogsCategories = dynamic(() => import('./cogs-categories'))
   ```

2. **Data Caching**: Cache category lists client-side
   - Use React Query or SWR
   - Invalidate on mutation

3. **Search Optimization**: Debounce search input (300ms)

4. **Render Optimization**: Virtualize long category lists (>50 items)

---

## 10. Testing Requirements

### 10.1 Functional Tests
- [ ] Tab switching updates URL and content
- [ ] Deep linking to specific tabs works
- [ ] Search filters categories correctly in both tabs
- [ ] CRUD operations work for both category types
- [ ] Redirect from old location works
- [ ] Notification dismissal persists

### 10.2 Visual Regression Tests
- [ ] Tab active states match design
- [ ] Category cards render correctly in both tabs
- [ ] Form modals display appropriate fields per type
- [ ] Responsive layout works on mobile/tablet

### 10.3 Accessibility Tests
- [ ] Keyboard navigation flows logically
- [ ] Screen reader announces tab changes
- [ ] Focus trap works in modals
- [ ] Color contrast meets WCAG AA

### 10.4 Performance Tests
- [ ] Initial page load < 2s
- [ ] Tab switching < 100ms
- [ ] Search results update < 300ms
- [ ] Category list handles 100+ items smoothly

---

## 11. Success Metrics

### Quantitative Metrics
1. **Adoption Rate**: 80% of users find new location within 2 weeks
2. **Error Rate**: <5% support tickets about missing categories
3. **Task Completion Time**: No increase in time to manage categories
4. **Page Load Performance**: <2s initial load, <100ms tab switch

### Qualitative Metrics
1. User feedback on clarity of new structure
2. Finance manager confidence in system setup
3. Reduction in "where do I find X?" support questions

---

## 12. Future Scalability Considerations

### Potential Future Category Types
Based on typical SME accounting needs:

1. **Revenue Categories**
   - Service types
   - Product lines
   - Revenue streams

2. **Asset Categories**
   - Fixed assets
   - Depreciation schedules
   - Asset tracking

3. **Project Categories**
   - Job codes
   - Project types
   - Client classifications

### Architectural Pattern to Support Growth
```
Category Management
├── Expense Categories
├── COGS Categories
├── Revenue Categories (future)
├── Asset Categories (future)
└── Project Categories (future)
```

Each new category type = new tab with specialized fields, but same core CRUD patterns.

---

## 13. Implementation Checklist

### Backend Tasks
- [ ] Create `cogs_categories` database table
- [ ] Add RLS policies for COGS categories
- [ ] Create API endpoints (`/api/cogs-categories`)
- [ ] Add COGS category seed data
- [ ] Update TypeScript types

### Frontend Tasks
- [ ] Create `/[locale]/settings/categories/page.tsx`
- [ ] Build `CategoryManagementContainer` component
- [ ] Refactor `category-management.tsx` for reuse
- [ ] Build `CogsCategories` component
- [ ] Create `CogsForm` modal component
- [ ] Add Settings to main navigation (if missing)
- [ ] Implement redirect from old location
- [ ] Create notification component
- [ ] Update documentation

### Testing Tasks
- [ ] Unit tests for COGS CRUD operations
- [ ] Integration tests for category API
- [ ] E2E tests for user flows
- [ ] Accessibility audit
- [ ] Performance benchmarking

### Deployment Tasks
- [ ] Deploy Phase 1 (new system)
- [ ] Monitor error rates
- [ ] Deploy Phase 2 (redirect notification)
- [ ] Collect user feedback
- [ ] Deploy Phase 3 (remove old link)

---

## 14. Risk Mitigation

### Risk 1: User Confusion During Transition
**Mitigation:**
- Clear notification with explanation
- Breadcrumb trail shows new location
- Keep redirect active for minimum 2 release cycles

### Risk 2: Data Migration Issues
**Mitigation:**
- No data migration needed (only navigation change)
- Existing expense categories remain untouched
- COGS categories start fresh

### Risk 3: Performance Impact
**Mitigation:**
- Lazy load tab content
- Implement caching
- Monitor page load metrics

### Risk 4: Accessibility Regressions
**Mitigation:**
- Automated a11y testing in CI/CD
- Manual keyboard navigation testing
- Screen reader validation

---

## 15. Next Steps & Recommendations

### Immediate Actions (This Sprint)
1. **Get stakeholder approval** on centralized hub approach
2. **Review database schema** for COGS categories
3. **Create detailed technical spec** for backend team
4. **Design high-fidelity mockups** for COGS form fields

### Short-Term (Next Sprint)
1. Build backend infrastructure (database, API)
2. Develop frontend components
3. Conduct internal testing
4. Prepare user communication materials

### Medium-Term (Following Sprint)
1. Soft launch with redirect
2. Monitor adoption metrics
3. Collect user feedback
4. Iterate on UX issues

### Long-Term (Roadmap)
1. Plan for additional category types (revenue, assets)
2. Enhance AI keyword management UI
3. Add category analytics/insights
4. Build category import/export tools

---

## Appendix A: Design Mockups Reference

### Key Screens to Mock Up:
1. Category Management landing page (Expense tab active)
2. COGS Categories tab view
3. COGS Category form modal
4. Redirect notification UI
5. Mobile responsive views

### Color Palette:
- Primary (Blue): `#2563eb` (expense categories)
- Secondary (Orange): `#ea580c` (COGS categories)
- Background: `#111827` (gray-900)
- Surface: `#1f2937` (gray-800)
- Border: `#374151` (gray-700)

---

## Appendix B: Consultation Notes

**Expert Recommendation from Gemini 2.5 Pro:**
- Option B (Centralized Hub) strongly preferred
- Scalability is critical for financial applications
- Short-term migration cost justified by long-term benefits
- Fragmented approach (Option A) creates technical debt
- Centralized structure aligns with accounting software conventions
- Finance professionals expect unified configuration areas

---

**Document Status:** ✅ Ready for Stakeholder Review
**Last Updated:** 2025-10-06
**Owner:** UX Design Team (Mel)
**Reviewers Needed:** Product Manager, Engineering Lead, Finance Team Representative
