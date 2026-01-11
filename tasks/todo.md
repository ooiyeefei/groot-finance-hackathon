# Critical Bug Fix: Multi-Page PDF Processing

## Bug Summary

**Issue:** Multi-page PDFs only extract data from page 1, even though all pages are converted and stored correctly.

**Impact:**
- Incomplete financial data extraction (missing revenue/costs from pages 2+)
- Accounting entries have understated amounts
- Affects ALL multi-page PDF invoices and receipts

## Root Cause

The extraction functions always use `images[0]` (first page only):

```python
# extract_invoice.py (line 377) and extract_receipt.py (line 339)
if images and len(images) > 0:
    image_url = s3.get_presigned_url(images[0].s3_key)  # ← ALWAYS PAGE 1
```

## Architecture Analysis

| Component | Status | Details |
|-----------|--------|---------|
| PDF Conversion | ✅ Works | Converts pages 1-10 |
| S3 Storage | ✅ Works | Stores all page images |
| Page Metadata | ✅ Works | Stores totalPages and page info |
| Frontend Preview | ✅ Works | Can navigate all pages |
| **Data Extraction** | ❌ Bug | **Always uses page 1 only** |

## Proposed Fix Strategy

### Option A: Process All Pages and Merge Results (Recommended)
- Loop through all page images
- Extract data from each page
- Intelligently merge results (combine line items, use first page for header info)
- **Pros:** Complete data extraction, handles continuation invoices
- **Cons:** Higher Gemini API costs, more complex merging logic

### Option B: Process All Pages as Single Combined Image
- Stitch all page images vertically into one tall image
- Send combined image to Gemini
- **Pros:** Single API call, simpler merging
- **Cons:** Very tall images may hit API limits, worse quality

### Option C: Smart Page Detection
- First pass: Identify which pages have extractable content
- Second pass: Only extract from relevant pages
- **Pros:** Cost-efficient for sparse documents
- **Cons:** More complex, two API calls per document

## Recommended Implementation (Option A)

### Phase 1: Fix Extraction Functions

- [ ] **1.1** Update `extract_invoice.py` to process all pages
  - Loop through all images in `images` array
  - Extract data from each page
  - Create merge function to combine results

- [ ] **1.2** Update `extract_receipt.py` to process all pages
  - Same logic as invoices
  - Receipts typically single-page, but should support multi-page

- [ ] **1.3** Create `merge_extraction_results()` utility function
  - Merge line items from all pages
  - Use first page for vendor/header info
  - Sum totals or use last page's total (which is usually the grand total)
  - Handle duplicate detection

### Phase 2: Update DSPy Prompts (if needed)

- [ ] **2.1** Review DSPy extraction signatures
  - May need to add page context to prompts
  - Handle "continued from previous page" scenarios

### Phase 3: Update Convex Storage

- [ ] **3.1** Review extracted_data schema
  - Ensure it can store merged multi-page results
  - Add page_sources array to track which data came from which page

### Phase 4: Testing

- [ ] **4.1** Test with single-page PDF (regression)
- [ ] **4.2** Test with 2-page invoice
- [ ] **4.3** Test with 5+ page invoice
- [ ] **4.4** Test expense claims with multi-page receipts

### Phase 5: Deployment

- [ ] **5.1** Deploy Lambda update via CDK
- [ ] **5.2** Monitor CloudWatch for errors
- [ ] **5.3** Re-process affected documents (optional)

## Files to Modify

1. `src/lambda/document-processor-python/steps/extract_invoice.py` - Main fix
2. `src/lambda/document-processor-python/steps/extract_receipt.py` - Main fix
3. `src/lambda/document-processor-python/utils/merge_results.py` - New utility (if needed)
4. `infra/` - CDK deployment

## Questions for Discussion

1. **Cost consideration:** Processing all pages increases Gemini API costs. Should we add a `max_extract_pages` limit?

2. **Merging strategy:** How should we handle conflicting data between pages?
   - Always trust first page for header info?
   - Sum all line items?
   - Use last page's total?

3. **Page identification:** Some pages may be terms & conditions, not invoice data. Should we filter these?

4. **Backward compatibility:** Should we re-process existing multi-page documents?

## Review Section

### Implementation Complete (2026-01-10)

**Approach Used: Option D - Multi-Image Context (Better than Option A)**

Instead of processing pages separately and merging, we leverage Gemini's native multi-image support to send ALL pages in a single API call. Gemini sees the full document context and extracts data intelligently.

### Files Modified

1. **`src/lambda/document-processor-python/steps/extract_invoice.py`**
   - Changed signature input from `document_image: dspy.Image` to `document_images: List[dspy.Image]`
   - Updated extraction function to fetch ALL page images (not just `images[0]`)
   - Added multi-page instructions to DSPy signature docstring:
     - Page 1: vendor info, customer details, invoice number, date
     - All pages: combine line items
     - Last page: total amounts (grand total)
   - Updated token logging to track actual image count

2. **`src/lambda/document-processor-python/steps/extract_receipt.py`**
   - Same changes as invoice extraction
   - Changed `receipt_image` to `receipt_images: List[dspy.Image]`
   - Added multi-page handling instructions to prompt

### Key Changes

```python
# BEFORE (Bug):
if images and len(images) > 0:
    image_url = s3.get_presigned_url(images[0].s3_key)  # ← ALWAYS PAGE 1

# AFTER (Fix):
all_image_bytes = []
for idx, img_info in enumerate(images):
    image_url = s3.get_presigned_url(img_info.s3_key)
    img_bytes = _fetch_image_bytes(image_url)
    all_image_bytes.append(img_bytes)  # ← ALL PAGES
```

### Merging Strategy (Handled by Gemini)

The DSPy signature instructs Gemini:
- **Header info**: Use page 1 (vendor, customer, invoice number, date)
- **Line items**: Combine from ALL pages
- **Totals**: Use LAST page (grand total, subtotal, tax, discount)
- **Payment info**: Extract from wherever found

### Verification
- [x] Build passes (`npm run build` successful)
- [ ] Deploy Lambda via CDK
- [ ] Test with single-page PDF (regression)
- [ ] Test with multi-page PDF

### Deployment Command
```bash
cd infra
npx cdk deploy --profile groot-finanseal --region us-west-2
```

---

# Completed: Multi-Tenancy Bug Fix (2026-01-10)

## Bug Summary
**Issue:** Creating a second business from the "Create New Business" modal was overriding the existing business instead of creating a new one.

**Root Cause:** The `initializeBusinessFromOnboarding` mutation was designed to complete placeholder businesses (created by Clerk webhook without `onboardingCompletedAt`). When a user clicked "Create New Business" from the modal, if their existing business lacked `onboardingCompletedAt`, the code would UPDATE it instead of creating a new business.

## Solution Implemented
Added a `forceCreateNew` parameter to distinguish between:
1. **Regular onboarding flow** (no flag): Should complete placeholder if exists
2. **Modal creation flow** (`forceCreateNew: true`): Should ALWAYS create new business

## Files Modified
1. `convex/functions/businesses.ts` - Added `forceCreateNew` arg to mutation
2. `src/domains/onboarding/lib/business-initialization.service.ts` - Pass `forceCreateNew` to Convex
3. `src/app/api/v1/onboarding/initialize-business/route.ts` - Accept `forceCreateNew` in request
4. `src/domains/onboarding/components/business-onboarding-modal.tsx` - Send `forceCreateNew: true`

## Verification
- [x] Build passes (`npm run build` successful)
- [x] Changes pushed to main (commit d861e06d)

## Testing Needed
- [ ] Create first business (new user) - should work normally
- [ ] Create second business from modal - should create NEW business, not override
- [ ] Business switcher should show both businesses

## Second Fix (2026-01-10) - Membership But No Business Row Bug

### Problem
After the first fix, the bug persisted. Creating a second business from the modal:
- Created membership records correctly
- BUT did NOT create new row in `businesses` table
- User had 2 owner memberships pointing to 1 business + 1 non-existent business

### Root Cause
The condition `user.businessId && !args.forceCreateNew` was correct, but the code structure was confusing. The execution path for `forceCreateNew === true` wasn't explicit.

### Fix Applied (commit ffb64f74)
Restructured logic to be explicit about `forceCreateNew === true`:

```typescript
// NOW: Check forceCreateNew FIRST, explicitly
if (args.forceCreateNew === true) {
  console.log(`*** FORCE CREATE NEW MODE ***`);
  // Fall through to Step 3
} else if (user.businessId) {
  // Only check onboarding for non-force-create case
}
// Step 3: Create NEW business row
```

### Key Changes
1. Explicit `args.forceCreateNew === true` check as FIRST condition
2. Added detailed logging at Steps 3, 4, 5 with emojis
3. Clear documentation of when each step runs

### Verification
- [x] Build passes
- [x] Changes pushed to main (commit ffb64f74)
- [ ] Manual test: Create second business from modal

---

# Dashboard Currency Display Fix (2026-01-10)

## Problem
- Dashboard shows SGD regardless of user's preferred display currency (USD)
- Convex analytics uses `business.homeCurrency`, ignoring user's `preferred_currency`
- No way to change display currency directly from dashboard

## Root Cause
In `convex/functions/analytics.ts:690`:
```typescript
const homeCurrency = business?.homeCurrency || "SGD";  // ← Uses BUSINESS currency, not USER preference
```

## Solution: Option A - Frontend Service Layer Conversion + UI Enhancement

### Implementation Plan

#### Phase 1: Currency Conversion in Service Layer
- [ ] **1.1** Update `analytics.service.ts` to convert Convex response to user's currency
  - Convex returns data in business currency (SGD)
  - Convert totals/amounts to user's preferred currency (USD) using CurrencyService
  - Preserve original amounts for audit trail

#### Phase 2: Dynamic Currency Symbol on Dashboard
- [ ] **2.1** Verify `complete-dashboard.tsx` uses dynamic symbol
  - Already uses `CURRENCY_SYMBOLS[homeCurrency]` ✓
  - Ensure it updates when homeCurrency changes

#### Phase 3: Currency Selector in Dashboard Header
- [ ] **3.1** Add currency dropdown next to period selector
  - Use same list: USD, SGD, MYR, THB, IDR, VND, PHP, CNY, EUR, INR
  - Show currency code + symbol (e.g., "USD ($)")
  - Store selection via `updateHomeCurrency()`

- [ ] **3.2** Refresh analytics when currency changes
  - React Query will auto-refetch due to queryKey change
  - Show loading state during conversion

#### Phase 4: Testing & Build
- [ ] **4.1** Verify build passes
- [ ] **4.2** Test currency selector changes display
- [ ] **4.3** Test amounts convert correctly

## Files to Modify

1. `src/domains/analytics/lib/analytics.service.ts` - Add currency conversion
2. `src/domains/analytics/components/complete-dashboard.tsx` - Add currency selector
3. `src/domains/users/hooks/use-home-currency.ts` - May need cache invalidation improvement

## Review Section

### Implementation Complete (2026-01-10)

**Approach Used: Service Layer Conversion + Dashboard Currency Selector**

Instead of modifying Convex (which correctly stores data in business currency), we convert in the service layer before sending to the frontend. The user can now select their preferred display currency directly from the dashboard.

### Files Modified

1. **`src/domains/analytics/lib/analytics.service.ts`**
   - Added `convertAnalyticsCurrency()` function to convert analytics amounts using exchange rates
   - Added `getBusinessHomeCurrency()` helper to fetch business's home currency from Convex
   - Modified `calculateFinancialAnalytics()` to:
     1. Get business's actual home currency from Convex
     2. Calculate analytics in business currency (via analytics engine)
     3. Convert to user's preferred currency if different using CurrencyService
   - Currency conversion affects: total_income, total_expenses, net_profit, aged_receivables, aged_payables
   - Original currency_breakdown and category_breakdown preserved (show source currency distribution)

2. **`src/domains/analytics/components/complete-dashboard.tsx`**
   - Added currency selector dropdown next to period selector
   - Imports `updateHomeCurrency` and `SUPPORTED_CURRENCIES` from use-home-currency hook
   - Added `handleCurrencyChange()` async handler to save preference and refresh data
   - Added loading state (`isCurrencyChanging`) to disable controls during update
   - Dropdown shows both symbol and code (e.g., "$ USD") for 10 supported currencies

### Data Flow

```
User selects currency (USD) → updateHomeCurrency() saves to backend
                            → localStorage + memory cache updated
                            → Analytics refresh triggered
                            → analytics.service.ts fetches data from Convex (SGD)
                            → CurrencyService converts SGD → USD
                            → Dashboard displays amounts in USD
```

### Supported Currencies
USD, SGD, MYR, THB, IDR, VND, PHP, CNY, EUR, INR

### Verification
- [x] Build passes (`npm run build` successful)
- [ ] Test currency selector changes display currency
- [ ] Test amounts convert correctly (SGD → USD)
- [ ] Test business currency preserved in database

---

# Edit Record Currency Bug Fix (2026-01-11)

## Bug Summary
**Issue:** Edit Record modal shows user's preferred currency (USD) as "Home Currency" instead of business's actual home currency (SGD).

**User Observation:**
- Accounting Records List: Shows "≈ SGD 43.23" ✓ (correct)
- Record Details (View): Shows "Home Currency: SGD 43.23" ✓ (correct)
- Edit Record: Shows "Home Currency: USD" with conversion preview ❌ (wrong)

## Root Cause
In `accounting-entry-edit-modal.tsx`, the `useEffect` hook (lines 90-107) was **always** overwriting `formData.home_currency` to `userHomeCurrency` when the hook loaded, ignoring the existing transaction's `home_currency`.

```typescript
// BUG: Always overwrites to user preference
useEffect(() => {
  if (userHomeCurrency) {
    setFormData(prev => ({
      ...prev,
      home_currency: userHomeCurrency  // ← ALWAYS overwrites!
    }))
  }
}, [userHomeCurrency, ...])
```

## Solution
Preserve existing transaction's `home_currency` for edit mode. Only use user's preferred currency for NEW records.

```typescript
// FIX: Preserve existing home_currency for edits
const existingHomeCurrency = transaction?.home_currency || prefilledData?.home_currency
home_currency: existingHomeCurrency || userHomeCurrency
```

## File Modified
`src/domains/accounting-entries/components/accounting-entry-edit-modal.tsx` - Lines 90-111

## Verification
- [x] Build passes
- [x] Changes pushed to main (commit `228a0f09`)
- [ ] Manual test: Edit existing record shows SGD (business currency)
- [ ] Manual test: Create new record defaults to USD (user preference)

---

# Task: Unify Business Creation Onboarding UI/UX (2026-01-11)

## Goal
Standardize the welcome onboarding flow across both entry points (new users and existing users creating a new business), and increase the modal/window size by 33%.

## Requirements
1. Both entry points should look identical
2. Increase size from ~672px to ~896px (33% larger)
3. Keep blurred backdrop
4. Use "Create New Business" header style with close X button for both
5. Keep all existing functionality (brewing animation, loading states, step flow)

## Todo Items

- [ ] Update `business-onboarding-modal.tsx` - increase width to max-w-4xl (896px)
- [ ] Update `business/page.tsx` (full-page wizard) - match modal styling exactly
- [ ] Ensure both use same:
  - Header layout (icon + "Create New Business" + X button)
  - Step indicator styling
  - Content area sizing
  - Loading/brewing animation
- [ ] Run build and verify no errors

## Files to Modify
1. `src/domains/onboarding/components/business-onboarding-modal.tsx`
2. `src/app/[locale]/onboarding/business/page.tsx`

## Design Specifications

### New Unified Size
- Width: `max-w-4xl` (896px) - up from max-w-2xl (672px)
- Height: `max-h-[96vh]` (unchanged)
- Content height: `max-h-[calc(96vh-180px)]` (adjusted for larger header)

### Header
- Left: Building2 icon in primary/10 background + "Create New Business" title + step counter
- Right: X close button (for both flows)

### Step Indicators
- Same compact horizontal layout from modal
- Numbers with checkmarks for completed steps

### Backdrop
- `bg-black/40 backdrop-blur-sm` (unchanged)

## Review Section

### Implementation Complete (2026-01-11) - Phase 1

**Approach Used: Unified Component Styling**

Both entry points now share identical visual appearance with 33% larger sizing.

### Files Modified

1. **`src/domains/onboarding/components/business-onboarding-modal.tsx`**
   - Changed container from `max-w-2xl` to `max-w-4xl` (672px → 896px)
   - Increased padding: `px-4` → `px-6`, `py-3/4` → `py-4/5`
   - Scaled icons: `h-5 w-5` → `h-6 w-6` for Building2, `h-4 w-4` → `h-5 w-5` for X button
   - Increased progress bar height: `h-1.5` → `h-2`
   - Scaled step indicators: `w-5 h-5` → `w-6 h-6`, text `text-[10px]` → `text-xs`
   - Increased brewing animation icon container: 56px → 72px
   - Scaled form inputs: `h-9` → `h-10`
   - Increased category badge padding: `px-1.5 py-0.5` → `px-2 py-1`
   - Content max-height: `max-h-[calc(96vh-140px)]` → `max-h-[calc(96vh-180px)]`

2. **`src/app/[locale]/onboarding/business/page.tsx`**
   - Added `X` icon import from lucide-react
   - Added `handleClose()` function to navigate to plan selection
   - Changed header from centered "Set Up Your Business" to left-aligned "Create New Business" + X button
   - Matched container sizing to modal (`max-w-4xl max-h-[96vh]`)
   - Matched backdrop styling with separate backdrop div
   - Applied same scaling changes as modal component
   - Unified step indicator styling (horizontal with labels)

### Key Changes Summary

| Element | Before | After |
|---------|--------|-------|
| Container width | 580px (page) / 672px (modal) | 896px (both) |
| Header title | "Set Up Your Business" (page) / "Create New Business" (modal) | "Create New Business" (both) |
| Close button | Modal only | Both flows |
| Progress bar height | 1.5 (6px) | 2 (8px) |
| Step indicator size | 5/6 (20/24px) | 6 (24px) |
| Icon sizes | 5 (20px) | 6 (24px) |
| Input height | 9 (36px) | 10 (40px) |
| Brewing icon | 56px | 72px |
| Padding | px-4/5 | px-6 |

### Verification
- [x] Build passes (`npm run build` successful)
- [ ] Manual test: New user onboarding flow appears at 896px width
- [ ] Manual test: "Create New Business" modal from business switcher looks identical
- [ ] Manual test: X button on new user flow navigates to plan selection
- [ ] Manual test: Brewing animation scales correctly

### Phase 2 Update (2026-01-11) - Portrait Layout with Vertical Fill

**User Feedback**: Modal was "still not maximized" - should be "less landscape wide, more square or portrait" with step selection areas maximizing vertically.

### Additional Changes Made

1. **`src/domains/onboarding/components/business-onboarding-modal.tsx`**
   - Changed from `max-w-4xl` (896px) to `max-w-3xl` (768px) - narrower, more portrait
   - Added `min-h-[85vh]` to fill vertical viewport space
   - Added `flex flex-col` to outer container and Card for flex layout
   - Updated CardContent to use `flex-1 flex flex-col` for vertical fill
   - Wrapped Steps 2-4 in flex containers with className prop
   - Added spacer `<div className="flex-1" />` before navigation in Steps 1 and 5

2. **`src/app/[locale]/onboarding/business/page.tsx`**
   - Same portrait layout changes as modal
   - Updated all steps to use flex containers and spacers

3. **`src/domains/onboarding/components/business-setup/business-type-step.tsx`**
   - Added `className?: string` prop to interface
   - Updated outer div to use `cn("w-full space-y-4", className)`
   - Added spacer div before footer actions

4. **`src/domains/onboarding/components/business-setup/cogs-categories-step.tsx`**
   - Added `className?: string` prop to interface
   - Updated outer div to use `cn("w-full space-y-3", className)`
   - Added spacer div before footer actions

5. **`src/domains/onboarding/components/business-setup/expense-categories-step.tsx`**
   - Added `className?: string` prop to interface
   - Imported `cn` utility from `@/lib/utils`
   - Updated outer div to use `cn("w-full space-y-3", className)`
   - Added spacer div before footer actions

### Key Layout Changes (Phase 2)

| Element | Phase 1 | Phase 2 |
|---------|---------|---------|
| Container width | 896px (max-w-4xl) | 768px (max-w-3xl) |
| Min height | None | 85vh (min-h-[85vh]) |
| Layout mode | Block | Flexbox (flex flex-col) |
| Content fill | Fixed height | Flex-grow (flex-1) |
| Navigation position | After content | Pushed to bottom via spacer |

### Verification (Phase 2)
- [x] Build passes (`npm run build` successful)
- [x] Changes pushed to main (commit `ac040080`)
- [ ] Manual test: Modal fills 85% of viewport height
- [ ] Manual test: Step content expands to fill available space
- [ ] Manual test: Navigation buttons pushed to bottom

---

# Investigation: S3 Storage Path Pattern Inconsistency (2026-01-11)

## Issue Summary

The S3 storage paths for invoices are inconsistent between upload and conversion:

**Current Upload Path** (from `storage-paths.ts` + `data-access.ts`):
```
invoices/{businessId}/{userId}/invoice/{randomUUID}/raw/{randomUUID}.pdf
```

**Current Conversion Path** (from Lambda `s3_client.py`):
```
invoices/{businessId}/{userId}/{convexId}/converted/page_X.png
```

**Problems Identified:**
1. **Different folder structures**: Upload has `/invoice/` (documentType) folder, conversion does not
2. **Different document IDs**: Upload uses `randomUUID()`, conversion uses Convex ID
3. **Orphaned folders**: Creates separate folder trees for same document

## Root Cause Analysis

### Upload Flow (`src/domains/invoices/lib/data-access.ts:400-499`)

```typescript
// Line 432: Generate random UUID BEFORE Convex record exists
const invoiceId = randomUUID()  // e.g., "b1e99523-6c60-4be3-a718-43169416cadc"

// Line 436-443: Build path with this UUID
const storagePath = generateStoragePath({
  businessId,
  userId: convexUserId,
  documentType: 'invoice',  // ← Creates /invoice/ folder
  stage: 'raw',
  filename: `${invoiceId}.${fileExtension}`,
  documentId: invoiceId     // ← Uses random UUID
})
// Result: {businessId}/{userId}/invoice/{UUID}/raw/{UUID}.pdf
```

### Storage Path Builder (`src/lib/storage-paths.ts:39-54`)

```typescript
// Line 48-50: If documentId provided, creates folder for it
if (documentId) {
  return `${businessId}/${userId}/${documentType}/${documentId}/${stage}/${filename}`
  //                     ↑ includes documentType folder
}
```

### Lambda Conversion (`src/lambda/document-processor-python/utils/s3_client.py:145-170`)

```typescript
// Line 157: Pattern WITHOUT documentType
def build_storage_path(domain, business_id, user_id, document_id, stage, filename):
    return f"{domain}/{business_id}/{user_id}/{document_id}/{stage}/{filename}"
    //              ↑ NO documentType folder!
```

### Lambda receives Convex ID (`data-access.ts:669-680`)

```typescript
// Line 670: Uses document.id which is the CONVEX ID
documentId: document.id,  // e.g., "js7b2v53b2wheqscbdtkrdsqa97yyrag"
storagePath: document.storage_path,  // Contains the UUID path
```

## Desired Pattern (User Request)

Standardized pattern:
```
invoices/{businessId}/{userId}/{invoiceTableId}/raw/{invoiceTableId}.pdf
invoices/{businessId}/{userId}/{invoiceTableId}/converted/page_X.png
```

Where `invoiceTableId` = Convex ID (consistent across upload and conversion)

## Proposed Solutions

### Option A: Create Convex Record First, Then Upload (Recommended)
1. Create invoice record in Convex first (status: 'uploading')
2. Use Convex ID for storage path
3. Upload file to S3
4. Update Convex record with storage_path (status: 'pending')

**Pros**: Clean, consistent IDs everywhere
**Cons**: Requires restructuring upload flow, orphan records if upload fails

### Option B: Remove documentType Folder
1. Update `generateStoragePath()` to NOT include documentType folder
2. Keep UUID pattern but align folder structure

**Pros**: Minimal code change
**Cons**: Still has UUID vs Convex ID mismatch

### Option C: Move/Rename After Upload
1. Keep current upload flow
2. After Convex record created, move S3 file to new path with Convex ID
3. Update Convex record with new path

**Pros**: No flow restructure needed
**Cons**: Extra S3 operations, race conditions

## Files Involved

1. `src/lib/storage-paths.ts` - Path generation logic
2. `src/domains/invoices/lib/data-access.ts` - Upload flow
3. `src/lambda/document-processor-python/utils/s3_client.py` - Lambda path builder
4. `src/domains/expense-claims/lib/data-access.ts` - Similar pattern for expense claims

## Todo Items

- [ ] Decide on approach (A, B, or C)
- [ ] Update storage path generation to remove `/invoice/` folder from pattern
- [ ] Align Lambda path builder with TypeScript path builder
- [ ] Test invoice upload and conversion paths align
- [ ] Test expense claims upload paths
- [ ] Migration plan for existing S3 files (optional)

## Review Section

(To be completed after implementation)

---

# Expense Category Name-to-ID Mapping Fix (2026-01-11)

## Bug Summary
**Issue:** Lambda stores expense category **name** ("Other") but frontend expects category **ID** (Convex document ID). This causes the category dropdown to show empty in the prefilled form.

**Root Cause:**
1. Lambda receives categories with both `name` and `id` fields
2. Lambda maps category by name and stores the NAME (e.g., "Other")
3. Frontend `<SelectItem value={category.id}>` expects ID to match
4. "Other" (name) ≠ "jd71xyz..." (id) → No match → Empty dropdown

## Why Gemini Chose "Other"

The receipt was: "Meal at Strong Flour restaurant including pasta, pizza, and coffee."

**Staff Meals keywords** require staff-specific terms:
- "staff food", "employee meal", "team lunch", "daily meal", "worker food"

**Receipt contains none of these!** → Gemini correctly defaulted to "Other"

## Solution

**Fix Lambda to map category name → ID before storing.**

The Lambda already has access to categories with both `name` and `id`. We just need to:
1. After LLM selects category by name
2. Look up the matching category's ID
3. Store the ID instead of the name

## Files to Modify

1. `src/lambda/document-processor-python/steps/extract_receipt.py` - Map name→ID after selection
2. `src/lambda/document-processor-python/steps/extract_invoice.py` - Same fix

## Todo Items

- [x] Investigate category selection issue
- [x] Fix Lambda receipt extraction to map name→ID
- [x] Fix Lambda invoice extraction to map name→ID
- [x] Deploy Lambda (2026-01-11)
- [ ] Test with new expense claim

## Review Section (2026-01-11)

### Fix Applied
Both `extract_receipt.py` and `extract_invoice.py` now map category name → ID before storing.

### Key Changes

**`extract_receipt.py` (lines 421-467):**
```python
# Track both name (for logging/metadata) and ID (for frontend)
expense_category_name = None
expense_category_id = None

if expense_category:
    # Find matching category to get its ID
    matching_cat = next((cat for cat in categories if cat.name == expense_category), None)
    if matching_cat:
        expense_category_name = matching_cat.name
        expense_category_id = matching_cat.id

# Use category ID for storage (frontend expects ID)
expense_category = expense_category_id
```

**`extract_invoice.py` (lines 461-504):**
Same pattern - tracks `suggested_category_name` and `suggested_category_id`, stores ID for frontend.

### Result Dictionary Changes
Both files now return:
- `expense_category` / `suggested_category`: The ID (for frontend form)
- `expense_category_name` / `suggested_category_name`: The name (for logging/display)

### Why "Other" was selected
The receipt "Meal at Strong Flour restaurant including pasta, pizza, and coffee" didn't match "Staff Meals" keywords which require staff-specific terms like:
- "staff food", "employee meal", "team lunch", "daily meal", "worker food"

This is correct behavior - the receipt is a general meal, not specifically a staff meal.

---

# Dashboard Currency Dropdown Fix (2026-01-11)

## Bug Summary
**Issue:** When user changed the dashboard currency dropdown from SGD to USD (or any other currency), the selection wasn't persisting. The API logs showed `Currency: SGD` even when USD was selected.

**User Observation:**
- Dropdown selection changed visually
- API returned 200 OK for preference update
- But dashboard kept showing data in SGD (the old currency)

## Root Cause
In `use-home-currency.ts`, the `updateHomeCurrency()` function updated:
1. Module-level `cachedCurrency` variable ✓
2. `localStorage` ✓
3. Backend API ✓

But **React state in `useHomeCurrency` hook** didn't update because:
- `localStorage` storage events **only fire for OTHER tabs**, not the same tab
- The hook's `useState(currency)` stayed at old value
- When dashboard called `refresh()`, it used the OLD `homeCurrency` from React state

## Solution
Added **custom event pattern** for same-tab synchronization:

```typescript
// Custom event name for same-tab currency updates
const CURRENCY_CHANGE_EVENT = 'finanseal:currency-change'

// In updateHomeCurrency():
window.dispatchEvent(new CustomEvent(CURRENCY_CHANGE_EVENT, { detail: newCurrency }))

// In useHomeCurrency hook:
window.addEventListener(CURRENCY_CHANGE_EVENT, handleCurrencyChange)
```

Also removed premature `refresh()` call in dashboard - TanStack Query auto-refetches when `homeCurrency` changes in queryKey.

## Files Modified
1. `src/domains/users/hooks/use-home-currency.ts` - Added custom event dispatch and listener
2. `src/domains/analytics/components/complete-dashboard.tsx` - Removed manual refresh() call

## Verification
- [x] Build passes (`npm run build` successful)
- [x] Changes pushed to main (commit `de6331a5`)
- [ ] Manual test: Dashboard currency selector properly changes display currency

---

# Fast Mode Optimization for Expense Claims (2026-01-11)

## Goal
Reduce document processing time from ~20.2 seconds to 5-8 seconds for simple expense claims.

## Performance Breakdown (Before)
| Step | Time | Optimization |
|------|------|--------------|
| PDF Conversion | 3.7s | Keep (required) |
| Validation | 3.7s | **Skip for expense_claims** |
| Extraction | 12.8s | **Use dspy.Predict + simplified schema** |
| Total | ~20.2s | Target: 5-8s |

## Implementation Summary

### 1. Fast Mode Flag Infrastructure
**`types_def.py`**: Added `fast_mode: bool = False` to `DocumentProcessingRequest`

### 2. Skip Validation for Expense Claims
**`handler.py`** (lines 267-277):
```python
skip_validation = request.domain == "expense_claims" or request.fast_mode

if skip_validation:
    validation_result = {
        "is_supported": True,
        "document_type": "receipt",
        "confidence": 1.0,
        "reasoning": "Validation skipped - domain-based routing",
        "skipped": True,
    }
```

### 3. Simplified Fast Mode Schemas

**`extract_receipt.py`** - `FastReceiptData`:
- KEEP: vendor_name, transaction_date, total_amount, currency, receipt_number
- KEEP: expense_category, description, business_purpose
- KEEP: confidence_score, extraction_quality
- REMOVE: line_items, vendor_address, vendor_contact, subtotal_amount, tax_amount, tip_amount, payment_method, missing_fields, suggestions

**`extract_invoice.py`** - `FastInvoiceData`:
- KEEP: vendor_name, transaction_date, total_amount, currency, document_number
- KEEP: suggested_category, description, business_purpose
- KEEP: confidence_score, extraction_quality
- REMOVE: line_items, vendor/customer details, financial breakdown, payment info

### 4. Fast Extraction with dspy.Predict

**Fast mode** uses `dspy.Predict` (direct prediction):
```python
if fast_mode:
    processor = dspy.Predict(FastReceiptExtractionSignature)
    prediction = processor(
        receipt_image=receipt_images[0],  # Single page only
        available_categories=categories_json
    )
```

**Full mode** uses `dspy.ChainOfThought` (reasoning steps):
```python
else:
    processor = dspy.ChainOfThought(ReceiptExtractionSignature)
    prediction = processor(
        receipt_images=receipt_images,  # All pages
        available_categories=categories_json
    )
```

### 5. Single Page Processing in Fast Mode
- Fast mode: `pages_to_fetch = 1`
- Full mode: `pages_to_fetch = len(images)` (all pages)

## Files Modified

1. **`src/lambda/document-processor-python/types_def.py`**
   - Added `fast_mode: bool = False` to DocumentProcessingRequest

2. **`src/lambda/document-processor-python/handler.py`**
   - Skip validation for expense_claims or fast_mode
   - Pass fast_mode to extraction functions

3. **`src/lambda/document-processor-python/steps/extract_receipt.py`**
   - Added `FastReceiptData` Pydantic model (simplified)
   - Added `FastReceiptExtractionSignature` DSPy signature
   - Updated function to accept `fast_mode` parameter
   - Conditional extraction logic (Predict vs ChainOfThought)

4. **`src/lambda/document-processor-python/steps/extract_invoice.py`**
   - Added `FastInvoiceData` Pydantic model (simplified)
   - Added `FastInvoiceExtractionSignature` DSPy signature
   - Updated function to accept `fast_mode` parameter
   - Conditional extraction logic

## Expected Performance Gains

| Optimization | Estimated Savings |
|--------------|-------------------|
| Skip validation | ~3.7s |
| dspy.Predict vs ChainOfThought | ~3-5s |
| Simplified schema | ~1-2s |
| Single page only | ~1s per additional page |
| **Total Expected Savings** | **~8-11s** |

**Expected Processing Time**: 9-12s (down from 20.2s)

## Verification
- [x] Build passes (`npm run build` successful)
- [x] Deploy Lambda via CDK (commit `4df0fb0b`, deployed 2026-01-11)
- [ ] Test with expense claim (verify ~5-8s target)
- [ ] Test invoice extraction still works (full mode)

## Deployment Details
- **Commit**: `4df0fb0b` - "feat(lambda): add fast mode for expense claim extraction"
- **Lambda ARN**: `arn:aws:lambda:us-west-2:837224017779:function:finanseal-document-processor`
- **Alias ARN**: `arn:aws:lambda:us-west-2:837224017779:function:finanseal-document-processor:prod`
- **Docker Image**: Pushed to ECR with updated extraction logic

---

# Investigation: Dashboard Currency Dropdown Business Update Bug (2026-01-11)

## Reported Bug
**User Report:** Changing the dashboard currency dropdown allegedly updates the business-level currency setting. Expected behavior is that dashboard dropdown should be session-only (temporary), not persisting any changes.

## Investigation Summary

**FINDING: NO BUG FOUND IN CODE**

After exhaustive code analysis, I could NOT find any code path that would update business-level currency when changing the dashboard dropdown.

## Code Analysis

### 1. Dashboard Component (`complete-dashboard.tsx`)
```typescript
// Lines 38-39: Session-only state
const [displayCurrency, setDisplayCurrency] = useState<SupportedCurrency>('SGD');

// Lines 63-67: Handler ONLY updates local React state
const handleCurrencyChange = (newCurrency: SupportedCurrency) => {
  if (newCurrency === displayCurrency) return;
  setDisplayCurrency(newCurrency);  // ← ONLY local state, NO API call
  // TanStack Query will auto-refetch when displayCurrency changes
};
```
**Conclusion:** Dashboard dropdown changes ONLY affect session state. No API calls.

### 2. Analytics Hook (`use-financial-analytics.tsx`)
- Only does GET requests to `/api/v1/analytics/dashboards`
- Passes `homeCurrency` as query parameter for conversion
- Does NOT write any currency settings

### 3. Analytics API (`route.ts`)
- Read-only operation
- Calculates and returns data converted to requested currency
- Does NOT update any database records

### 4. Business Update Mutation (`businesses.ts`)
- `updateBusinessByStringId` ACCEPTS `home_currency` parameter
- **BUT no code paths found that call this with currency from dashboard**

### 5. Business Settings Currency Dropdown (`business-profile-settings.tsx`)
- Calls `updateHomeCurrency()` which updates **USER's** preferred_currency
- Does NOT update business-level currency

### Search Results Summary
| Search | Result |
|--------|--------|
| `updateBusiness.*homeCurrency` | No matches |
| `patch.*businesses.*homeCurrency` | No matches |
| `ctx.db.patch.*homeCurrency` (businesses) | Only in create/onboarding flows |
| Convex crons/triggers | None found |
| Currency sync webhooks | None found |

## Three-Tier Currency Architecture (Working Correctly)

1. **Business-level currency** (`businesses.homeCurrency`)
   - Set during onboarding
   - Only changeable by owner in business settings
   - **No code found that updates this from dashboard**

2. **User-level preferred currency** (`users.homeCurrency` / `preferred_currency`)
   - Set in user profile settings
   - Used as default for dashboard display
   - Updated via `updateHomeCurrency()` function

3. **Session-level display currency** (`displayCurrency` state)
   - Local React state only
   - Resets to user preferred currency on page refresh
   - **This is what dashboard dropdown controls**

## Possible Explanations for User Report

1. **Browser Cache/State Issue**: Old cached data showing stale business currency
2. **UI Confusion**: User may be confusing business settings currency dropdown with dashboard dropdown
3. **Race Condition**: Unlikely but possible state management timing issue
4. **Already Fixed**: The dashboard currency dropdown was previously fixed (commit `de6331a5`) for a DIFFERENT issue (persistence not working)

## Verification Needed

To confirm, user should:
1. Open browser DevTools Network tab
2. Change dashboard currency dropdown
3. Check if any PUT/PATCH requests are made to business profile API
4. If no requests → Bug is not in code (possibly browser issue)
5. If requests are made → Need to identify which component is making them

## Files Investigated

| File | Result |
|------|--------|
| `src/domains/analytics/components/complete-dashboard.tsx` | ✅ Session-only state |
| `src/domains/analytics/hooks/use-financial-analytics.tsx` | ✅ Read-only |
| `src/app/api/v1/analytics/dashboards/route.ts` | ✅ Read-only |
| `convex/functions/businesses.ts` | ✅ No dashboard-triggered updates |
| `src/domains/account-management/lib/account-management.service.ts` | ✅ Does not accept currency |
| `src/domains/users/hooks/use-home-currency.ts` | ✅ Updates USER only |

## Review Conclusion

**Status: No code fix needed**

The codebase correctly implements the three-tier currency architecture. If the user is still experiencing the bug, it's likely:
- A browser-specific issue (cache, extension)
- A misunderstanding of which dropdown is being used
- An edge case not reproducible through code analysis

**Recommended Next Steps:**
1. Ask user to provide browser network logs when reproducing the bug
2. Have user clear browser cache and retry
3. Verify user is using dashboard dropdown, not business settings dropdown

---

# Business Profile Settings Currency Bug Fix (2026-01-11)

## Bug Summary
**Issue:** The Business Profile Settings page currency dropdown was incorrectly updating the USER's preferred currency (`users.homeCurrency`) instead of the BUSINESS's home currency (`businesses.homeCurrency`).

**User Report:** "the business level settings should only be updated by admin/manager that is to set business table currency... the 'settings' page by each user is only to update users' preferred currency column"

## Root Cause
In `business-profile-settings.tsx`, the currency dropdown used `useHomeCurrency()` hook which manages USER preferences:
- Line 9: Imported `useHomeCurrency, updateHomeCurrency` from user hook
- Line 21: Used `useHomeCurrency()` hook (reads USER's currency)
- Lines 83-111: `handleCurrencyChange` called `updateHomeCurrency()` (updates USER's currency)
- Line 368: Dropdown used `value={homeCurrency}` (USER's currency)

## Solution
Replaced all usages of the user preference hook with business profile data:
1. Read business currency from `profile?.home_currency` (from `useBusinessProfile()` context)
2. Update business currency via business profile API endpoint

## Files Modified

1. **`src/domains/account-management/components/business-profile-settings.tsx`**
   - Changed import to only get `SUPPORTED_CURRENCIES` constant
   - Removed `useHomeCurrency()` hook call
   - Rewrote `handleCurrencyChange` to call business profile PUT API with CSRF token
   - Updated dropdown `value` to use `profile?.home_currency`
   - Updated info text to use `profile?.home_currency`

2. **`src/contexts/business-context.tsx`**
   - Added `home_currency?: string` to `BusinessProfile` interface

3. **`src/domains/account-management/lib/account-management.service.ts`** (from previous session)
   - Added `home_currency: string` to `BusinessProfile` interface
   - Added `home_currency` parameter to `updateBusinessProfile()` function

## Key Changes

```typescript
// BEFORE (Bug):
const { currency: homeCurrency } = useHomeCurrency()
const handleCurrencyChange = async (newCurrency) => {
  await updateHomeCurrency(newCurrency)  // ← Updates USER's currency
}
<select value={homeCurrency}>  // ← Shows USER's currency

// AFTER (Fix):
const { profile } = useBusinessProfile()
const handleCurrencyChange = async (newCurrency) => {
  await fetch('/api/v1/account-management/businesses/profile', {
    method: 'PUT',
    body: JSON.stringify({ home_currency: newCurrency })  // ← Updates BUSINESS's currency
  })
}
<select value={profile?.home_currency}>  // ← Shows BUSINESS's currency
```

## Three-Tier Currency Architecture (Clarified)

| Tier | Table | Field | Purpose | Updated By |
|------|-------|-------|---------|------------|
| Business | `businesses` | `homeCurrency` | Operational currency for the business | Admin/Manager in Business Settings |
| User | `users` | `homeCurrency` / `preferred_currency` | Display preference for dashboard | Any user in their own User Settings |
| Session | React state | `displayCurrency` | Temporary dashboard view | Session-only, resets on refresh |

## Verification
- [x] Build passes (`npm run build` successful)
- [ ] Manual test: Business Settings currency dropdown updates `businesses.homeCurrency`
- [ ] Manual test: User Settings currency dropdown still updates `users.homeCurrency`

---

# Fix DSPy Threading Issue in Lambda Document Processor (2026-01-11)

## Bug Summary
**Issue:** Expense claims processing fails with error:
```
EXTRACTION_FAILED: Receipt extraction failed: dspy.settings can only be changed by the thread that initially configured it.
```

## Root Cause
- DSPy's `dspy.settings` is a global singleton with thread affinity
- Both `extract_receipt.py` (line 501) and `extract_invoice.py` (line 485) call `dspy.settings.configure()` inside extraction functions
- AWS Durable Execution SDK checkpoints Lambda state and may resume on different threads
- When extraction functions try to reconfigure DSPy on a different thread, it throws the error

## Solution
Move DSPy configuration to module-level initialization that happens once when the module is loaded, before any checkpointed steps run.

## Todo Items
- [ ] Create shared DSPy configuration module `steps/dspy_config.py`
- [ ] Update `extract_receipt.py` to use module-level DSPy config
- [ ] Update `extract_invoice.py` to use module-level DSPy config
- [ ] Deploy Lambda via CDK
- [ ] Test with expense claim upload

## Files to Modify
1. `src/lambda/document-processor-python/steps/dspy_config.py` (NEW)
2. `src/lambda/document-processor-python/steps/extract_receipt.py`
3. `src/lambda/document-processor-python/steps/extract_invoice.py`

## Review Section (2026-01-11)

### Fix Applied
Created module-level DSPy configuration to avoid threading issues with AWS Durable Execution SDK.

### Key Changes

**New file: `steps/dspy_config.py`**
- Configures DSPy once at module import time (Lambda cold start)
- Thread-safe with lock-protected initialization
- Exports `ensure_dspy_configured()`, `get_lm()`, `is_configured()`
- Auto-configures on import if `GEMINI_API_KEY` is available

**`extract_receipt.py` changes:**
- Added import: `from steps.dspy_config import ensure_dspy_configured, get_lm`
- Replaced ~15 lines of DSPy config code with single `ensure_dspy_configured()` call
- Updated token logging to use `get_lm()` instead of local `gemini_lm` variable

**`extract_invoice.py` changes:**
- Same pattern as extract_receipt.py

**`handler.py` changes:**
- Added early import: `from steps.dspy_config import ensure_dspy_configured`
- This ensures DSPy is configured at Lambda cold start, before any durable steps run

**`steps/__init__.py` changes:**
- Added exports for dspy_config functions

### Why This Works
1. DSPy settings are configured ONCE when the module is first imported (Lambda cold start)
2. The main thread that imports the module "owns" the DSPy settings
3. When AWS Durable Execution SDK checkpoints and resumes on a different thread:
   - The extraction functions call `ensure_dspy_configured()` which is a no-op (already configured)
   - No attempt to reconfigure → no threading error

### Deployment
- **Commit**: `b80d6465` - "fix(lambda): resolve DSPy threading issue with AWS Durable Execution SDK"
- **Lambda ARN**: `arn:aws:lambda:us-west-2:837224017779:function:finanseal-document-processor`
- **Alias ARN**: `arn:aws:lambda:us-west-2:837224017779:function:finanseal-document-processor:prod`
- **Docker Image**: Pushed to ECR with updated configuration

### Verification
- [x] Code changes committed and pushed to main
- [x] Lambda deployed via CDK
- [ ] Manual test: Upload expense claim and verify processing succeeds

---

# User-Friendly Error Handling for Document Processing (2026-01-11)

## Goal
Show user-friendly error messages to end users instead of raw technical errors like "dspy.settings can only be changed by the thread that initially configured it."

## Implementation Summary

### Error Handling Architecture

```
Lambda Error Occurs
        │
        ▼
┌───────────────────────────────────────┐
│ get_user_friendly_error(code, error)  │
│                                       │
│ 1. Pattern match technical error      │
│ 2. Fall back to error code mapping    │
│ 3. Return generic friendly message    │
└───────────────────────────────────────┘
        │
        ▼
┌─────────────────────────┐  ┌────────────────────────┐
│ CloudWatch Logs         │  │ Convex / Frontend      │
│ (Technical details)     │  │ (User-friendly message)│
│                         │  │                        │
│ [EXTRACTION_FAILED]     │  │ "We couldn't extract   │
│ Receipt extraction      │  │ data from this         │
│ failed: dspy.settings...│  │ document..."           │
└─────────────────────────┘  └────────────────────────┘
```

### Files Modified

1. **`types_def.py`** - Added centralized error handling utilities:
   - `USER_FRIENDLY_MESSAGES`: Maps error codes to friendly messages
   - `TECHNICAL_ERROR_PATTERNS`: Pattern matches technical errors to specific messages
   - `get_user_friendly_error()`: Main function to convert errors
   - `format_error_for_logging()`: Format for CloudWatch logs

2. **`handler.py`** - Updated to use friendly errors:
   - Import error utilities
   - Log technical errors to CloudWatch
   - Send user-friendly messages to Convex (what users see)

3. **`extract_receipt.py`** - Updated exception handler:
   - Returns both `error` (technical) and `error_message`/`user_message` (friendly)

4. **`extract_invoice.py`** - Same updates as receipt extraction

### Error Pattern Examples

| Technical Error | User-Friendly Message |
|----------------|----------------------|
| `dspy.settings can only be changed by the thread...` | "We encountered a temporary issue. Please try again in a moment." |
| `GEMINI_API_KEY not set` | "The AI service is temporarily unavailable. Please try again later." |
| `rate limit` | "Our AI service is busy. Please wait a moment and try again." |
| `image corrupt` | "There was an issue reading your image. Please upload a clearer photo." |

### Deployment
- **Commit**: `b0945d71` - "feat(lambda): add user-friendly error messages for document processing"
- **Lambda ARN**: `arn:aws:lambda:us-west-2:837224017779:function:finanseal-document-processor`
- **Alias ARN**: `arn:aws:lambda:us-west-2:837224017779:function:finanseal-document-processor:prod`

### Verification
- [x] Build passes
- [x] Code committed and pushed to main
- [x] Lambda deployed via CDK
- [ ] Manual test: Trigger error and verify friendly message shown to user

---

# Two-Phase Expense Claim Extraction (2026-01-11)

## Goal
Improve perceived performance by splitting Gemini extraction into two phases:
1. **Phase 1 (Fast)**: Extract core fields → update Convex → frontend renders immediately (~3-4s)
2. **Phase 2 (Background)**: Extract line items → update Convex → frontend updates via real-time

## Motivation
Current FAST mode still takes ~6-7s because it extracts `line_items`. By deferring line items to Phase 2, users see results in ~3-4s while line items load in background.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       TWO-PHASE EXTRACTION                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Upload → Lambda → Gemini Phase 1 (core) → Convex → Frontend        │
│                         ~3-4s              ↓        (renders!)       │
│                                            │                         │
│                    Gemini Phase 2 (line items) → Convex update      │
│                         ~3-4s                      ↓                 │
│                                            Frontend updates (reactive)│
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Phase 1 Schema (Core Fields Only)
- vendor_name, transaction_date, total_amount, currency
- receipt_number, expense_category, description, business_purpose
- subtotal_amount, tax_amount, tip_amount
- confidence_score, extraction_quality
- **NO line_items**

## Phase 2 Schema (Line Items Only)
- line_items: List[ReceiptLineItem]

## Implementation Plan

### Step 1: Create Core-Only Schema
- [ ] **1.1** Create `CoreReceiptData` Pydantic model (no line_items)
- [ ] **1.2** Create `CoreReceiptExtractionSignature` DSPy signature
- [ ] **1.3** Create `LineItemsExtractionSignature` DSPy signature

### Step 2: Update Convex Schema
- [ ] **2.1** Add `line_items_status` field to expense_claims table
  - Values: `'pending' | 'extracting' | 'complete' | 'skipped'`
- [ ] **2.2** Create `updateExpenseClaimLineItems` mutation for Phase 2 update

### Step 3: Update Lambda Two-Phase Logic
- [ ] **3.1** Modify `extract_receipt_step()` to support two-phase mode
- [ ] **3.2** Phase 1: Extract core → call `update_expense_claim_extraction`
- [ ] **3.3** Phase 2: Extract line items → call new `updateExpenseClaimLineItems`
- [ ] **3.4** Update handler.py to orchestrate two phases

### Step 4: Update Frontend
- [ ] **4.1** Update expense claim form to handle `line_items_status`
- [ ] **4.2** Show loading skeleton for line items while `line_items_status === 'extracting'`
- [ ] **4.3** Convex `useQuery` will auto-update when line items arrive

### Step 5: Deploy & Test
- [ ] **5.1** Run `npm run build` to verify no TypeScript errors
- [ ] **5.2** Deploy Convex schema changes
- [ ] **5.3** Deploy Lambda via CDK
- [ ] **5.4** Test expense claim upload - verify two-phase timing

## Files to Modify

**Lambda:**
1. `src/lambda/document-processor-python/steps/extract_receipt.py` - Two-phase schemas
2. `src/lambda/document-processor-python/handler.py` - Orchestration
3. `src/lambda/document-processor-python/utils/convex_client.py` - New mutation call

**Convex:**
4. `convex/schema.ts` - Add `line_items_status` field
5. `convex/functions/expense-claims.ts` - Add `updateExpenseClaimLineItems` mutation

**Frontend:**
6. `src/domains/expense-claims/components/expense-claim-form.tsx` - Loading state

## Expected Performance

| Phase | Fields | Time | User Sees |
|-------|--------|------|-----------|
| Phase 1 | Core fields | ~3-4s | Form populated, can start editing |
| Phase 2 | Line items | ~3-4s | Line items appear (auto-update) |
| **Total** | All | ~6-8s | But user productive after 3-4s |

## Review Section

(To be completed after implementation)
