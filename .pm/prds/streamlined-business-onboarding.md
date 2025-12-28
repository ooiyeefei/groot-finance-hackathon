# PRD: Streamlined Business Onboarding Flow

**Status:** NEW | **Priority:** P1 | **WINNING Score:** 45/60
**Author:** Claude Code (PRD Generator)
**Date:** 2025-12-28
**Related Issue:** Complements #73 (Onboarding & Plan Selection Flow)

---

## Problem Statement

### The Problem

Currently, after user authentication, new users land on a basic business creation form (`/onboarding/business`) that only collects:
- Business name (required)
- Country (optional, default: SG)
- Home currency (optional, default: SGD)

This creates friction and missed setup opportunities:

1. **Missing Critical Setup**: Custom expense/COGS categories are not configured during onboarding, leading users to rely on defaults they may not understand
2. **No Branding**: Logo upload is not available during onboarding - users must hunt through settings later
3. **Post-Signup Configuration Debt**: Users must manually configure categories in settings after signup, creating confusion about where to find these options
4. **AI Categorization Degradation**: Without custom categories, AI expense categorization accuracy suffers as it relies on generic default categories

### Impact

- **User Experience**: New users feel lost without guided setup
- **AI Performance**: Default categories lead to suboptimal expense/invoice categorization
- **Activation Rate**: Users who skip configuration are less likely to become power users
- **Support Load**: Users ask "how do I customize my categories?" frequently

---

## User Stories

### Primary User: SME Business Owner (Singapore/Malaysia)

**As a** new FinanSEAL user
**I want to** quickly set up my business with my specific expense categories
**So that** the AI can accurately categorize my receipts and invoices from day one

### Acceptance Scenario

```gherkin
Given I am a new user who just signed up
When I complete the streamlined onboarding flow
Then my business should be created with:
  - My business name (or "My Business" default)
  - My preferred currency (or SGD default)
  - My custom expense categories (or 9 default SEA categories)
  - My custom COGS categories (or 6 default COGS categories)
  - My business logo (or fallback color avatar)
And I should land on the dashboard ready to upload my first receipt
```

---

## Proposed Solution

### Design Philosophy

**Frictionless First, Comprehensive Later**

- All fields are **optional** with smart defaults
- Progressive disclosure - advanced users can configure more
- Tag-style inputs for category creation (familiar Gmail label UX)
- Skip button visible at every step
- Total onboarding time target: **< 60 seconds**

### User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    STREAMLINED ONBOARDING                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 1: Business Basics (10 seconds)                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ What's your business called?                                ││
│  │ ┌─────────────────────────────────────────────────────────┐ ││
│  │ │ [    Acme Trading Pte Ltd                              ]│ ││
│  │ └─────────────────────────────────────────────────────────┘ ││
│  │                                                              ││
│  │ What currency do you use?                                   ││
│  │ ┌─────────────────────────────────────────────────────────┐ ││
│  │ │ [SGD ▼]  [MYR] [THB] [IDR] [USD]                       ]│ ││
│  │ └─────────────────────────────────────────────────────────┘ ││
│  │                                                              ││
│  │               [Continue]        [Skip for now]              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Step 2: Expense Categories (20 seconds)                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ What types of expenses does your team submit?               ││
│  │ (Press Enter after each category)                           ││
│  │                                                              ││
│  │ ┌─────────────────────────────────────────────────────────┐ ││
│  │ │ Travel  ╳ │ Meals  ╳ │ Transport  ╳ │ [type here...]   │ ││
│  │ └─────────────────────────────────────────────────────────┘ ││
│  │                                                              ││
│  │ Suggestions: Office Supplies, Marketing, Training           ││
│  │                                                              ││
│  │               [Continue]        [Use defaults]              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Step 3: COGS Categories (20 seconds) - Optional                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ What costs go into your products/services?                  ││
│  │ (Skip if you don't track Cost of Goods Sold)               ││
│  │                                                              ││
│  │ ┌─────────────────────────────────────────────────────────┐ ││
│  │ │ Materials  ╳ │ Labor  ╳ │ [type here...]               │ ││
│  │ └─────────────────────────────────────────────────────────┘ ││
│  │                                                              ││
│  │               [Continue]        [Skip]                      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Step 4: Logo Upload (10 seconds) - Optional                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                     ┌──────────┐                            ││
│  │                     │   📷    │                            ││
│  │                     │  Drop   │                            ││
│  │                     │  Logo   │                            ││
│  │                     └──────────┘                            ││
│  │                                                              ││
│  │ Supports: PNG, JPG, SVG (max 2MB)                          ││
│  │                                                              ││
│  │               [Finish Setup]    [Skip]                      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Requirements

### Functional Requirements

#### P0 - Must Have

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-01 | Business name input | Optional field, default: "My Business" |
| FR-02 | Home currency selection | Quick-select buttons for SEA currencies, default: SGD |
| FR-03 | Skip all functionality | User can skip entire onboarding and use all defaults |
| FR-04 | Database insertion | All collected data inserts into `businesses` table |
| FR-05 | Default category population | If skipped, use `getDefaultExpenseCategories()` and `getDefaultCOGSCategories()` |

#### P1 - Should Have

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-06 | Custom expense categories | Tag-style input, type → Enter → tag appears |
| FR-07 | Custom COGS categories | Same tag-style input as expense categories |
| FR-08 | Logo upload | Drag-and-drop or click to upload, store in Supabase bucket |
| FR-09 | Progressive step indicator | Shows 4 steps with current position |
| FR-10 | Back navigation | User can go back to previous steps |

#### P2 - Nice to Have

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-11 | Category suggestions | Show common categories as quick-add chips |
| FR-12 | Logo preview | Show uploaded logo in circle crop preview |
| FR-13 | Industry presets | Pre-populate categories based on industry selection |

### Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-01 | Total onboarding time | < 60 seconds for full completion |
| NFR-02 | Skip path time | < 10 seconds to dashboard |
| NFR-03 | Mobile responsive | Works on 375px+ screens |
| NFR-04 | Accessibility | WCAG AA compliant |
| NFR-05 | Theme support | Works in light and dark modes |

---

## Technical Design

### Database Schema (Existing)

The `businesses` table already supports all required fields:

```sql
-- No schema changes needed - using existing columns
businesses (
  id uuid PRIMARY KEY,
  name text NOT NULL,                              -- FR-01
  home_currency text DEFAULT 'SGD',                -- FR-02
  custom_expense_categories jsonb DEFAULT '[]',   -- FR-06
  custom_cogs_categories jsonb DEFAULT '[]',      -- FR-07
  logo_url text,                                   -- FR-08
  logo_fallback_color text DEFAULT '#3b82f6',
  owner_id uuid NOT NULL,
  -- ... other existing columns
)
```

### API Endpoint

**Existing endpoint to modify:**
```
POST /api/v1/account-management/businesses

Request Body (extended):
{
  "name": "Acme Trading Pte Ltd",           // Optional, default: "My Business"
  "home_currency": "SGD",                    // Optional, default: "SGD"
  "custom_expense_categories": ["Travel", "Meals", "Transport"],  // Optional, NEW
  "custom_cogs_categories": ["Materials", "Labor"],               // Optional, NEW
  "logo_file": File                          // Optional, NEW - multipart/form-data
}

Response:
{
  "success": true,
  "business": {
    "id": "uuid",
    "name": "Acme Trading Pte Ltd",
    "slug": "acme-trading-pte-ltd",
    "home_currency": "SGD",
    "logo_url": "https://storage.supabase.co/...",
    "custom_expense_categories": [...],
    "custom_cogs_categories": [...]
  }
}
```

### Default Values Logic

```typescript
// When creating business with empty/skipped categories:

// Expense categories - use existing default function
import { getDefaultExpenseCategories } from '@/domains/expense-claims/lib/default-expense-categories'

// COGS categories - use existing default function
import { getDefaultCOGSCategories } from '@/domains/invoices/lib/default-cogs-categories'

// In business creation API:
const expenseCategories = input.custom_expense_categories?.length > 0
  ? formatUserCategories(input.custom_expense_categories)
  : getDefaultExpenseCategories()

const cogsCategories = input.custom_cogs_categories?.length > 0
  ? formatUserCategories(input.custom_cogs_categories)
  : getDefaultCOGSCategories()
```

### Logo Storage

```typescript
// Supabase bucket: 'business-logos'
// Path pattern: {business_id}/logo.{ext}

const { data, error } = await supabase.storage
  .from('business-logos')
  .upload(`${businessId}/logo.png`, file, {
    cacheControl: '3600',
    upsert: true
  })

// Store public URL in businesses.logo_url
```

### Component Structure

```
src/app/[locale]/onboarding/
├── page.tsx                    # Redirect to /onboarding/business
└── business/
    ├── page.tsx                # Current page (to be enhanced)
    └── components/
        ├── onboarding-flow.tsx        # Main orchestrator
        ├── business-basics-step.tsx   # Step 1: Name + Currency
        ├── expense-categories-step.tsx # Step 2: Tag input
        ├── cogs-categories-step.tsx   # Step 3: Tag input
        ├── logo-upload-step.tsx       # Step 4: Drag & drop
        ├── tag-input.tsx              # Reusable tag input component
        └── step-indicator.tsx         # Progress indicator
```

---

## Edge Cases

| Case | Handling |
|------|----------|
| User refreshes mid-onboarding | Store progress in localStorage, restore on return |
| Logo upload fails | Continue without logo, show toast, allow retry later |
| User enters duplicate category | Prevent duplicates, show gentle warning |
| User enters empty category | Ignore empty strings |
| User enters very long category name | Truncate to 50 characters |
| Network error during submission | Show retry button, preserve entered data |

---

## Out of Scope

The following are explicitly **NOT** included in this PRD:

1. **Stripe Integration** - Covered by Issue #73
2. **Plan Selection** - Covered by Issue #73
3. **Team Invitations** - Separate post-onboarding flow
4. **Country/Tax Configuration** - Future compliance feature
5. **Industry Templates** - P2 enhancement for later
6. **Onboarding Analytics** - Future enhancement

---

## Competitive Analysis

| Feature | FinanSEAL (Proposed) | Xero | QuickBooks | Zoho Books |
|---------|---------------------|------|------------|------------|
| Time to complete | < 60s | ~3 min | ~5 min | ~2 min |
| Fields required | 0 (all optional) | 5+ required | 8+ required | 3+ required |
| Custom categories | During onboarding | Post-setup only | Post-setup only | Post-setup only |
| Logo upload | During onboarding | Post-setup only | Post-setup only | During onboarding |
| Skip option | Every step | No | No | Partial |

**Competitive Advantage**: Zero-friction onboarding with optional deep customization is rare in SME accounting software. Most competitors front-load required fields.

---

## Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Onboarding completion rate | N/A | > 90% | Business created / signups |
| Avg onboarding time | N/A | < 45 seconds | Timestamp analytics |
| Category customization rate | 0% | > 30% | Non-default categories |
| Logo upload rate | 0% | > 20% | logo_url not null |
| First receipt within 24h | N/A | > 40% | First expense_claim timestamp |

---

## WINNING Score Analysis

| Factor | Score | Rationale |
|--------|-------|-----------|
| **Worth** (Pain Intensity) | 7/10 | Users can work without it, but setup UX is suboptimal |
| **Impact** (Revenue) | 7/10 | Better activation → better retention → revenue |
| **Now** (Timing) | 8/10 | Before launch, improves first impression |
| **Necessary** (Fit) | 8/10 | Core to onboarding value prop |
| **Implementable** | 8/10 | Schema exists, standard UX patterns |
| **Notable** (Moat) | 4/10 | Nice differentiator, not a moat |

**Total: 45/60** - **Recommended Action: FILE**

---

## Implementation Roadmap

### Phase 1: Core Flow (3-4 days)
- [ ] Create `OnboardingFlow` component with step management
- [ ] Build `BusinessBasicsStep` (name + currency)
- [ ] Build `TagInput` component (reusable)
- [ ] Build `ExpenseCategoriesStep`
- [ ] Build `COGSCategoriesStep`
- [ ] Update business creation API to handle new fields

### Phase 2: Logo & Polish (2 days)
- [ ] Create Supabase bucket `business-logos`
- [ ] Build `LogoUploadStep` with drag-and-drop
- [ ] Add `StepIndicator` progress component
- [ ] Add localStorage progress persistence
- [ ] Mobile responsive testing

### Phase 3: Integration & Testing (1 day)
- [ ] Integration with existing business context
- [ ] E2E testing all paths (complete, skip, partial)
- [ ] Dark mode verification
- [ ] Accessibility audit

---

## Appendix

### Existing Default Categories

**Expense Categories (9 defaults)**:
1. Travel
2. Petrol & Transportation
3. Entertainment & Meals
4. Office Supplies
5. Utilities & Communications
6. Training & Development
7. Marketing & Advertising
8. Maintenance & Repairs
9. Other Business Expenses

**COGS Categories (6 defaults)**:
1. Direct Materials
2. Direct Labor
3. Subcontractor & External Services
4. Freight & Logistics
5. Manufacturing & Production Overhead
6. Other Direct Costs

### Category JSONB Structure (Simplified for User Input)

When user enters simple category names, they should be converted to full JSONB structure:

```typescript
// User enters: "Travel", "Meals"
// Converted to:
[
  {
    id: "uuid-generated",
    category_name: "Travel",
    category_code: "TRAVEL",
    is_active: true,
    is_default: false,
    ai_keywords: ["travel"],  // Auto-generated from name
    sort_order: 1,
    created_at: "2025-12-28T00:00:00Z"
  },
  {
    id: "uuid-generated",
    category_name: "Meals",
    category_code: "MEALS",
    is_active: true,
    is_default: false,
    ai_keywords: ["meals", "food"],  // Auto-generated
    sort_order: 2,
    created_at: "2025-12-28T00:00:00Z"
  }
]
```

---

## Questions for User

1. **Default Business Name**: Should default be "My Business" or "[User's Name]'s Business"?
2. **Category Limit**: Should we limit max categories during onboarding (e.g., 10)?
3. **Logo Crop**: Should we enforce square crop or allow any aspect ratio?
4. **Animation**: Add subtle step transition animations?

---

*Generated by PRD Generator Agent*
*Analysis Date: 2025-12-28*
