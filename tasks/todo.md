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

### Implementation Complete (2026-01-11)

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
