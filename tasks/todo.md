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
