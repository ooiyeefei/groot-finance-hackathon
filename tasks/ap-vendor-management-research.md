# AP & Vendor Management Research for FinanSEAL

**Date**: 2026-02-14
**Context**: Lightweight AP/vendor management for a financial co-pilot targeting SEA SMEs (1-50 employees)
**Scope**: NOT a full accounting system -- lightweight ERP-style tooling

---

## 1. Existing Codebase Foundations (What Already Exists)

### Vendor Master (`vendors` table)
- **Fields**: name, email, phone, address, taxId, supplierCode, category, status
- **Lifecycle**: prospective (auto-created from OCR) -> active (has transactions) -> inactive
- **Functions**: list, getById, searchByName, getCategories, create, update, deactivate, reactivate, remove
- **Internal**: upsertByName (OCR pipeline), promoteIfProspective, getByName, setStatus
- **Missing**: payment terms, default currency, credit limit, bank details, contact person

### Vendor Price History (`vendor_price_history` table)
- **Fields**: vendorId, itemDescription, itemCode, unitPrice, currency, quantity, taxAmount, taxRate, itemCategory, normalizedDescription, sourceType, sourceId, observedAt, isConfirmed, accountingEntryId
- **Indexes**: by_vendorId, by_businessId_item, by_vendor_item, by_source, by_vendor_normalized
- **Functions**: getItemPriceHistory, getVendorPriceHistory, getVendorItems, recordPriceObservation, recordPriceObservationsBatch, confirmPriceObservations, getLatestPrice
- **Strength**: Already tracks ALL price observations from documents, even unconfirmed ones

### Accounting Entries (`accounting_entries` table)
- **Transaction Types**: "Income", "Cost of Goods Sold", "Expense"
- **Statuses**: pending, paid, cancelled, overdue, disputed
- **Has**: vendorId link, dueDate, paymentDate, paymentMethod, lineItems (embedded), homeCurrencyAmount, exchangeRate
- **Critical**: This IS the AP ledger already -- expense/COGS entries with status "pending" or "overdue" are unpaid payables

### Aged Payables (Already Implemented)
- **Query**: `convex/functions/analytics.ts` -> `getAgedPayables`
- **Widget**: `AgedPayablesWidget.tsx` with risk scoring
- **Buckets**: 0-30, 31-60, 61-90, 90+ days (based on dueDate, defaults to transactionDate + 30 days)
- **Risk**: Scores 0-100 based on days past due + amount threshold

### Sales Side (AR) -- Mirror Pattern Available
- **customers** table (businessName, contactPerson, email, phone, address, taxId, customerCode, notes, status)
- **sales_invoices** table with full lifecycle (draft -> sent -> paid/overdue/partially_paid -> void)
- **payments** table with allocations against invoices
- **catalog_items** table (name, description, sku, unitPrice, currency, unitMeasurement, taxRate, category)
- **AgedReceivablesWidget** with identical structure to AgedPayablesWidget

### Document-to-Accounting Flow
- OCR extracts vendor_name, total_amount, currency, document_date, line_items
- `mapDocumentToAccountingEntry()` creates accounting entry with type "Cost of Goods Sold"
- Vendor auto-created via `upsertByName` (as "prospective"), promoted to "active" on first entry
- Price observations recorded via `recordPriceObservationsBatch`

### Multi-Currency Support
- Business has `homeCurrency` and `allowedCurrencies`
- Entries store `originalAmount`/`originalCurrency` + `homeCurrencyAmount`/`exchangeRate`
- Currency detection for SGD, MYR, THB, IDR, VND, PHP, CNY, EUR, INR, USD

---

## 2. Competitive Landscape Analysis

### Xero (Market Leader for SME Accounting)
**AP Features**:
- Bills: Create/import bills, set due dates, attach documents
- Bill payments: Batch pay, scheduled payments, bank feed matching
- Aged payables report: Current, 1-30, 31-60, 61-90, 90+ day buckets
- Vendor contacts: Full contact management with payment terms per vendor
- Purchase orders: Create POs, convert to bills (heavier feature)
- Repeating bills: Automate recurring vendor bills
- Bill approval: Multi-step approval workflows
- Vendor statements: Reconcile vendor statements against bills

**What makes it heavyweight**: Purchase orders, repeating bills, bill approval workflows, bank reconciliation

**Relevant for FinanSEAL**: Aged payables, vendor payment terms, bill-from-document flow, basic vendor contact management

### Wave (Free Tier Benchmark)
**AP Features**:
- Bills: Create bills manually, track status (unpaid/partial/paid)
- Vendor management: Basic name + contact info, no payment terms
- Aged payables: Simple current/30/60/90+ report
- No purchase orders, no bill approval, no batch payments
- No vendor portal, no vendor statements

**Key insight**: Wave proves the minimum viable AP set is surprisingly small -- bills + vendor list + aging report

### FreshBooks (Freelancer/Small Business Focus)
**AP Features**:
- Bill tracking: Upload bills, track amounts owed
- Vendor profiles: Name, contact, default expense category
- Outstanding bills list with aging
- Tax tracking on purchases
- No purchase orders, no three-way matching
- No vendor portal

**Key insight**: FreshBooks keeps AP minimal because their users (freelancers, micro-businesses) have few vendors

### Zoho Books/Invoice (Strong in SEA Market)
**AP Features**:
- Bills: Create from scratch or auto-populate from uploaded documents
- Vendor credits: Track credits/returns from vendors
- Purchase orders: Convert POs to bills
- Vendor portal: Vendors can view their own statements/transactions
- Payment terms per vendor: Net 15/30/60/custom
- Vendor credit notes
- Aged payables by vendor
- Multi-currency vendor bills
- Recurring bills
- Bill approval workflows

**Key insight**: Zoho is the most full-featured for SEA, but most SMEs only use bills + aging + payment terms

### QuickBooks Simple Start / Essentials
**AP Features**:
- Bills: Enter and track bills from vendors
- Vendor list: Contact info, payment terms, default expense account, tax ID, 1099 tracking
- Aged payables (A/P aging summary and detail reports)
- Bill payment: Pay bills individually or in batch
- Vendor statement matching
- No purchase orders (those are in higher tiers)

**Key insight**: QuickBooks strikes a balance -- vendor profile + bills + aging. The "Simple Start" tier has no bills at all (only in Essentials+), which shows that many small businesses survive without formal AP.

### Competitive Minimum Viable Set for SMEs
Based on the competitive analysis, the minimum AP feature set that small businesses actually use:

| Feature | Wave | FreshBooks | QB Essentials | Xero | Zoho | Priority |
|---------|------|------------|---------------|------|------|----------|
| Vendor contact list | Y | Y | Y | Y | Y | Tablestakes |
| Bill/invoice tracking | Y | Y | Y | Y | Y | Tablestakes |
| Aged payables report | Y | Y | Y | Y | Y | Tablestakes |
| Payment terms per vendor | N | N | Y | Y | Y | P1 |
| Vendor spend summary | N | N | Y | Y | Y | P1 |
| Multi-currency bills | N | N | Y | Y | Y | P1 |
| Vendor categories | N | Y | Y | Y | Y | P2 |
| Purchase orders | N | N | N | Y | Y | P3 (exclude) |
| Vendor portal | N | N | N | N | Y | P3 (exclude) |
| Bill approval workflow | N | N | N | Y | Y | P3 (exclude) |
| Three-way matching | N | N | N | N | N | Exclude |
| Vendor credits/returns | N | N | Y | Y | Y | P3 |

---

## 3. Southeast Asian SME Needs

### Payment Patterns in SEA
1. **Bank transfer dominates**: Most B2B payments in SG, MY, TH, ID, PH are via bank transfer (not cheques, not cards)
2. **Cash still significant**: Especially in ID, TH, PH for smaller vendors and informal suppliers
3. **Multiple currencies daily**: A Singapore SME might pay Malaysian suppliers in MYR, Thai suppliers in THB, and local suppliers in SGD on the same day
4. **Informal payment terms**: Many SEA vendor relationships operate on handshake terms. "Pay when you can" or "pay within the month" is common
5. **Payment apps growing**: GrabPay, GoPay, Maya, PromptPay for smaller transactions
6. **No formal POs**: Most SMEs under 50 employees do not use formal purchase orders. They use WhatsApp/LINE messages and verbal agreements

### SEA-Specific Vendor Challenges
1. **Vendor name inconsistency**: Same vendor might appear as "PT Maju Jaya", "Maju Jaya", "CV Maju Jaya" across different invoices (already addressed by OCR normalization)
2. **GST/VAT complexity**: Singapore GST, Malaysia SST, Thailand VAT, Indonesia PPN all have different rates and rules
3. **Currency fluctuation risk**: IDR, THB, PHP can move significantly. Business owners need to know if they are paying more in home currency terms
4. **Regulatory requirements**: Singapore requires tracking of GST-registered suppliers. Malaysia requires SST treatment
5. **Seasonal cash flow**: Many SEA SMEs have seasonal businesses (tourism, agriculture, festivals) and need to plan vendor payments around cash flow
6. **Related party transactions**: Common in SEA family businesses -- need to flag but not block

### What SEA SMEs Actually Need from AP
Based on the market context:

**Must-have (P1)**:
- See total outstanding to all vendors
- Know what is overdue and by how much
- Track payment terms so they know WHEN to pay
- Multi-currency payables with home currency equivalent
- Simple payment recording (mark as paid with date + method)

**Nice-to-have (P2)**:
- Vendor spend analytics (top vendors, trends over time)
- Price increase alerts (they are very price-sensitive)
- Category-level spend breakdown
- Cash flow forecast based on upcoming payables

**Future (P3)**:
- Vendor statements/reconciliation
- Automated payment reminders
- Vendor performance scoring
- Budget vs actual by vendor category

---

## 4. Detailed Feature Recommendations

### 4.1 Creditor Aging (P1) -- Mirror AR Approach

**Recommendation**: The existing `getAgedPayables` query and `AgedPayablesWidget` already work. The gaps are:

1. **Missing: Vendor-level breakdown**
   - Current implementation only shows aggregate buckets
   - Need: "Top 5 vendors by overdue amount" drill-down
   - Need: Vendor-level aging (click vendor -> see their aging breakdown)

2. **Missing: Proper due date handling**
   - Currently defaults to transactionDate + 30 days if no dueDate
   - Should use vendor's default payment terms instead
   - When vendor has net_60 terms, a 45-day-old bill should NOT be in "31-60 overdue" bucket

3. **Aging buckets**: Keep the same as AR: Current, 1-30, 31-60, 61-90, 90+ days
   - This is industry standard and matches what Xero/QB/Zoho all use
   - "Current" = not yet due (within payment terms)
   - 1-30 overdue, 31-60 overdue, etc. = past the due date

4. **Enhancement: Payment schedule view**
   - "What do I need to pay this week/month?"
   - Grouped by due date, shows vendor + amount + currency

**Schema changes needed**: None for basic creditor aging (data already exists in accounting_entries). Add `defaultPaymentTerms` to vendors table.

### 4.2 Vendor Payment Terms (P1) -- Extend Vendor Schema

**Recommendation**: Add payment terms to the vendor master. This is the single most valuable enhancement.

```
vendors table additions:
  defaultPaymentTerms: v.optional(paymentTermsValidator),  // net_15, net_30, net_60, custom, due_on_receipt
  defaultPaymentTermsDays: v.optional(v.number()),         // For custom terms: exact number of days
  defaultCurrency: v.optional(v.string()),                 // Vendor's primary currency
  bankDetails: v.optional(v.object({
    bankName: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    routingNumber: v.optional(v.string()),                 // Or SWIFT code
    accountHolderName: v.optional(v.string()),
  })),
  contactPerson: v.optional(v.string()),
  website: v.optional(v.string()),
  notes: v.optional(v.string()),
```

**Impact**: When an OCR'd invoice creates an accounting entry, the due date can be auto-calculated from the vendor's payment terms instead of defaulting to 30 days. This makes aged payables much more accurate.

**PAYMENT_TERMS_OPTIONS already exists**: `due_on_receipt`, `net_15`, `net_30`, `net_60`, `custom` -- reuse this.

### 4.3 Vendor Spend Analytics (P1) -- New Query + Dashboard Widget

**Recommendation**: Create a spend analytics view that answers:

1. **Top vendors by spend** (last 30/90/365 days)
   - Query: Group accounting_entries by vendorId where type = Expense|COGS
   - Show: Vendor name, total spend in home currency, transaction count, % of total

2. **Spend by category**
   - Query: Group by accounting_entries.category
   - Show: Category name, total, % of total, trend vs previous period

3. **Spend trend over time**
   - Monthly spend aggregation over last 12 months
   - Simple line chart

4. **Currency exposure**
   - How much is owed in each currency
   - Home currency equivalent

**Data source**: All data already exists in `accounting_entries`. This is purely a query + UI task.

### 4.4 Price Intelligence (P2) -- Leverage Existing Price History

**The system already tracks vendor prices from OCR'd documents. This is a differentiator. Here is how to activate it.**

**Price Increase Detection Algorithm**:
```
For each item in a new invoice:
  1. Look up vendor_price_history for this vendor + normalized item description
  2. Get the previous price (most recent confirmed observation)
  3. Calculate % change = (new_price - previous_price) / previous_price * 100
  4. Flag if:
     - > 5% increase (info level)
     - > 10% increase (warning level)
     - > 20% increase (alert level)
  5. Also flag if price is higher than the cheapest vendor for same item (cross-vendor comparison)
```

**When to surface**:
- **At extraction time**: When an invoice is OCR'd and the accounting entry is being reviewed, show a badge "Price increased 12% from last order" next to each flagged line item
- **In the Action Center**: Generate `actionCenterInsights` with category "optimization" for significant price increases
- **On vendor profile**: Show price trend chart per item

**Thresholds (SEA-specific)**:
- For IDR/VND amounts: Use 8%/15%/25% thresholds (higher inflation currencies)
- For SGD/MYR/USD: Use 5%/10%/20% thresholds
- Time window: Compare against last 90 days of observations
- Minimum observations: Need at least 2 price points to detect change

**Cross-vendor comparison**:
- For items purchased from multiple vendors, show "Vendor A charges 15% more than Vendor B for this item"
- This is extremely valuable for SEA SMEs who are price-sensitive

### 4.5 Purchase Item Catalog (P2) -- Use vendor_price_history, NOT a Separate Catalog

**Recommendation**: Do NOT create a separate purchase catalog table. The `vendor_price_history` table already serves this purpose.

**Reasoning**:
1. A purchase catalog would be a master list of "things we buy" with standard prices
2. But SEA SMEs buy from multiple vendors at different prices, and prices change frequently
3. `vendor_price_history` already tracks what was bought, from whom, at what price, and when
4. The `getVendorItems` query already extracts unique items with latest price per vendor

**What to build instead**:
- A "Purchase Items" view that aggregates from `vendor_price_history`:
  - Item name (normalized), average price across vendors, price range (min-max), preferred vendor (lowest price or most frequent), last purchased date
- When creating a new accounting entry manually, offer autocomplete from this aggregated list
- This is lighter weight and data-driven rather than manually maintained

**If a formal catalog is later needed**: It can be generated from vendor_price_history data, not the other way around.

### 4.6 Invoice-to-AP Integration (P1) -- Refine Existing Flow

**Current flow**: OCR invoice -> user reviews -> creates accounting entry (manual trigger)

**Recommendation**: Keep the manual trigger but enhance it.

**Do NOT auto-create AP entries**. Here is why:
1. OCR confidence varies. Auto-creating entries from low-confidence extractions creates cleanup work
2. Many uploaded invoices are already paid (receipts mislabeled as invoices)
3. Duplicate risk: Same invoice uploaded twice -> duplicate AP entries
4. SEA SMEs want control over what enters their books

**Instead, enhance the existing flow**:
1. When an invoice is OCR'd, show a clear "Create Payable" button (instead of generic "Create Accounting Entry")
2. Auto-populate the due date from vendor's default payment terms
3. Show price change alerts on line items (from vendor_price_history)
4. Pre-fill vendor from name matching
5. Show "This vendor has 3 unpaid bills totaling MYR 12,450" as context
6. After creation, the accounting entry IS the AP entry (status: pending)

**Status flow for AP entries**:
- `pending` = bill entered, not yet paid
- `overdue` = past due date and not paid (could be auto-detected by a scheduled job)
- `paid` = payment recorded
- `cancelled` = voided
- `disputed` = under dispute with vendor

This is already the existing `ACCOUNTING_ENTRY_STATUSES` -- no changes needed.

### 4.7 AP Dashboard (P1) -- New Page

**Recommendation**: Create a dedicated AP dashboard page at `/en/accounts-payable` or as a tab within the existing dashboard.

**Components**:
1. **Summary cards** (top row):
   - Total outstanding payables (home currency)
   - Amount overdue
   - Due this week
   - Due this month

2. **Aged Payables chart** (already exists as widget)
   - Enhance with vendor-level drill-down

3. **Upcoming payments** (table):
   - Bills due in next 7/14/30 days
   - Sorted by due date
   - Shows vendor, amount, currency, days until due

4. **Top vendors** (list):
   - Top 5-10 vendors by outstanding amount
   - Quick action: "Mark as paid"

5. **Recent activity** (feed):
   - Recently created bills
   - Recently paid bills
   - Price alerts

---

## 5. What to Explicitly NOT Build

These features would push FinanSEAL toward becoming a full accounting system. Exclude them:

### Hard Exclude (P3 or Never)
1. **Purchase Orders**: SEA SMEs under 50 employees rarely use formal POs. They use chat messages. Adding POs adds complexity without value for the target market.

2. **Three-way matching** (PO vs receipt vs invoice): This is enterprise ERP territory. Xero added it for mid-market; it is not relevant for SMEs.

3. **Bill approval workflows**: The system already has expense claim approval. Vendor bills in SMEs are typically approved by the owner who is also the bookkeeper. If needed later, reuse the expense approval pattern.

4. **Vendor portal**: Vendors logging in to see their statements. This requires onboarding vendors as users. Too heavyweight.

5. **Accruals and deferrals**: Proper accrual accounting (recognizing expenses in the period they relate to, not when paid) is important for larger businesses but overwhelming for SMEs using cash-basis or simplified accrual.

6. **Vendor credit notes / returns management**: Track these as negative accounting entries if needed. No separate workflow.

7. **Payment runs / batch payments**: Integration with banking APIs to actually execute payments. This is a fintech feature, not an accounting feature. Consider as future premium feature.

8. **Recurring/repeating bills**: Nice idea but adds schema complexity. Defer until after the core AP is solid.

9. **Vendor performance scoring**: Algorithmic scoring of vendors based on price, delivery, quality. This requires data that SMEs do not reliably capture.

10. **Budget management**: Budget vs actual by vendor or category. This is a separate major feature area.

---

## 6. Implementation Priority (Build Order)

### Phase 1: AP Foundation (P1) -- Estimated 3-5 days

These require minimal schema changes and leverage existing data:

**1a. Extend vendor schema** (0.5 days)
- Add `defaultPaymentTerms`, `defaultPaymentTermsDays`, `defaultCurrency`, `contactPerson`, `notes` to vendors table
- Add `bankDetails` as optional embedded object
- Update vendor create/update mutations
- Update vendor detail UI to show/edit new fields

**1b. Improve due date calculation** (0.5 days)
- When creating accounting entry from invoice, use vendor's payment terms to calculate dueDate
- Fallback chain: invoice-specified due date > vendor default terms > business default (30 days)
- Update `mapDocumentToAccountingEntry` to pass dueDate through

**1c. Vendor-level aged payables** (1 day)
- New query: `getAgedPayablesByVendor` - groups payables by vendorId with aging breakdown
- New component: Vendor payables drill-down (click vendor -> see their unpaid bills)
- Enhance existing `AgedPayablesWidget` with "Top overdue vendors" summary

**1d. Upcoming payments view** (1 day)
- New query: `getUpcomingPayments` - bills due in next 7/14/30 days
- New component: Upcoming payments table sorted by due date
- Shows: vendor name, amount, currency, due date, days remaining

**1e. Quick payment recording** (1 day)
- On any pending/overdue accounting entry, add "Mark as Paid" action
- Records: paymentDate, paymentMethod (bank_transfer, cash, cheque, card, other)
- Updates status to "paid"
- This is simple since accounting_entries already have paymentDate and paymentMethod fields

### Phase 2: Intelligence Layer (P2) -- Estimated 3-4 days

These add analytical value on top of existing data:

**2a. Vendor spend analytics** (1.5 days)
- New query: `getVendorSpendAnalytics` - top vendors by spend, category breakdown
- New dashboard component with bar chart (top 10 vendors) + category pie/donut chart
- Period selector: 30/90/365 days
- Show trend vs previous period

**2b. Price increase detection** (1.5 days)
- New internal function: `detectPriceChanges` called during price observation recording
- Compare new price against last confirmed price for same vendor+item
- Generate `actionCenterInsights` for significant increases
- Show inline badge on accounting entry review screen: "Price +12% vs last order"

**2c. Cross-vendor price comparison** (1 day)
- New query: `getItemPriceComparison` - for a given item, show all vendor prices
- Show in vendor comparison card (already exists) and in accounting entry review
- Flag when current vendor is not the cheapest for an item

### Phase 3: Dashboard & Polish (P1 -- IN SCOPE) -- Estimated 2-3 days

> **Note**: Originally marked as P2/future, these items have been promoted to P1 (in-scope) to deliver a complete AP experience in the initial build.

**3a. Dedicated AP dashboard page** (1.5 days)
- New page at `/en/payables` or tab in existing dashboard
- Composes: Summary cards + Aged payables + Upcoming payments + Top vendors + Recent activity
- Reuses existing widgets with enhancements from Phase 1

**3b. Enhanced invoice review UX** (1 day)
- When reviewing OCR'd invoice, show vendor context:
  - Vendor's payment terms
  - Outstanding balance with this vendor
  - Price change indicators on line items
  - "Create Payable" button (clearer than "Create Accounting Entry")

**3c. Overdue AP auto-detection cron** (0.5 days)
- Mirror the existing AR overdue cron (`salesInvoices.markOverdue`)
- Scheduled Convex action or cron: scan pending accounting entries (type Expense/COGS) past dueDate
- Auto-update status from "pending" to "overdue"
- Generate actionCenterInsight for newly overdue bills
- Run daily alongside the AR overdue job

---

## 7. Schema Changes Summary

### Vendors Table Additions
```typescript
// Add to vendors table in schema.ts
defaultPaymentTerms: v.optional(paymentTermsValidator),    // Reuse existing
defaultPaymentTermsDays: v.optional(v.number()),           // For custom terms
defaultCurrency: v.optional(v.string()),                   // e.g., "MYR"
contactPerson: v.optional(v.string()),
website: v.optional(v.string()),
notes: v.optional(v.string()),
bankDetails: v.optional(v.object({
  bankName: v.optional(v.string()),
  accountNumber: v.optional(v.string()),
  routingCode: v.optional(v.string()),            // SWIFT, routing number, etc.
  accountHolderName: v.optional(v.string()),
})),
```

### No New Tables Needed
- AP entries = accounting_entries with type Expense/COGS and status pending/overdue
- Purchase catalog = aggregated view from vendor_price_history
- Vendor payments = accounting_entries with paymentDate filled in
- Price alerts = actionCenterInsights with category "optimization"

### New Indexes Potentially Needed
```typescript
// On accounting_entries - for upcoming payments query
.index("by_businessId_dueDate", ["businessId", "dueDate"])

// On accounting_entries - for vendor payables query
.index("by_businessId_vendorId_status", ["businessId", "vendorId", "status"])
```

---

## 8. Key Design Decisions

### Decision 1: No Separate AP Table
**Rationale**: accounting_entries with type "Expense"/"COGS" and status "pending"/"overdue" ARE the AP ledger. Creating a separate `accounts_payable` table would duplicate data and require sync logic. The single-table approach mirrors how Wave and FreshBooks work (bills are just categorized transactions).

### Decision 2: No Separate Purchase Catalog
**Rationale**: vendor_price_history is richer than a static catalog because it captures actual prices over time from real documents. A static catalog would become stale and conflict with observed prices. The aggregated view approach gives the same UX without the maintenance burden.

### Decision 3: Manual AP Entry Creation (Not Auto)
**Rationale**: OCR confidence varies; many documents are already-paid receipts; duplicate risk is high. The "Create Payable" button keeps the user in control while the system pre-fills everything it can.

### Decision 4: Reuse Payment Terms Validator
**Rationale**: The `PAYMENT_TERMS_OPTIONS` (due_on_receipt, net_15, net_30, net_60, custom) already exist for sales invoices. Reusing them for vendor payment terms is consistent and avoids a parallel enum.

### Decision 5: Mirror AR Pattern for Creditor Aging
**Rationale**: The AR side (AgedReceivablesWidget, sales_invoices, payments, customers) is well-built. The AP side should mirror it structurally for consistency. Same aging buckets, same risk scoring approach, same UI pattern.

---

## 9. Differentiation Opportunity

What makes FinanSEAL's AP different from Xero/QB/Zoho:

1. **AI-powered data entry**: Invoice OCR auto-populates AP entries. Competitors require manual entry or basic scan-to-text.

2. **Proactive price intelligence**: Automatic price increase detection and cross-vendor comparison. No competitor does this for SMEs. This is the "co-pilot" value proposition.

3. **SEA-first multi-currency**: Native multi-currency with SEA currency detection (SGD, MYR, THB, IDR, PHP) built into the OCR pipeline. Competitors treat SEA currencies as afterthoughts.

4. **Lightweight by design**: No POs, no three-way matching, no approval workflows for bills. Fast to set up, nothing to configure. This is an advantage for SMEs, not a limitation.

5. **Vendor intelligence from document history**: The system builds vendor profiles passively from uploaded documents. Competitors require manual vendor setup before you can enter bills.

---

## 10. Risk Considerations

1. **Scope creep**: AP is a gateway to full accounting. Every "small addition" (vendor credits, recurring bills, payment runs) pulls toward ERP territory. Hold the line on Phase 1-3 scope.

2. **Data quality dependency**: Price intelligence is only as good as OCR accuracy. Need to handle cases where item descriptions vary slightly between invoices from the same vendor (normalization is already in place but may need tuning).

3. **Performance**: The current getAgedPayables query collects ALL accounting entries for a business and filters in JS. For businesses with many entries (1000+), this will need pagination or a more efficient index-based query.

4. **Multi-currency complexity**: Aged payables should show both original currency amounts AND home currency equivalents. Exchange rates change daily -- need to decide if aging uses the rate at invoice time or current rate.

---

## Scope Decision (2026-02-14)

All three phases (Phase 1 + Phase 2 + Phase 3) are **IN SCOPE** for initial implementation:
- **Phase 1**: AP Foundation (vendor schema, creditor aging, upcoming payments, quick payment recording)
- **Phase 2**: Intelligence Layer (spend analytics, price increase detection, cross-vendor comparison)
- **Phase 3**: Dashboard & Polish (AP dashboard page, enhanced invoice review UX, overdue AP auto-detection cron)

### Confirmed Design Decisions
1. No separate AP table — accounting_entries with type Expense/COGS IS the AP ledger
2. No separate purchase catalog — vendor_price_history aggregated views serve this purpose
3. Exclusions confirmed: No POs, no three-way matching, no bill approval workflows, no vendor portal, no accruals, no vendor credits, no batch payments, no recurring bills, no vendor performance scoring, no budget management
