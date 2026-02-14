# Research: Smart AP Vendor Management

**Feature**: 013-ap-vendor-management
**Date**: 2026-02-14

## Research Summary

All NEEDS CLARIFICATION items resolved through codebase exploration and spec clarification sessions. No external technology decisions needed — the feature extends existing infrastructure.

---

## Decision 1: AP Ledger Architecture

**Decision**: Reuse `accounting_entries` table as the AP ledger. Entries with `transactionType` = "Expense" | "Cost of Goods Sold" and `status` = "pending" | "overdue" are unpaid payables.

**Rationale**: The table already has all required fields (vendorId, dueDate, paymentDate, paymentMethod, status, lineItems). Creating a separate `accounts_payable` table would duplicate data and require sync logic. This mirrors how Wave and FreshBooks model AP.

**Alternatives considered**:
- Separate `accounts_payable` table: Rejected — dual-write sync complexity, no additional capability
- View/virtual table: Not needed — Convex queries already filter by transactionType

---

## Decision 2: Payment Recording Model

**Decision**: Support partial payments by adding `paidAmount` and `paymentHistory` array to `accounting_entries`. Pre-fill with full outstanding balance; user can adjust downward for partials.

**Rationale**: Clarified during spec review (Session 2026-02-14). Single-field status toggle would require schema migration if partial payments are added later. The AR side already handles partial payments via the `payments` table — AP uses embedded payment history for simplicity.

**Alternatives considered**:
- Separate `ap_payments` table (like AR `payments` table): Rejected — overkill for AP where invoices are typically paid in full or in 2-3 installments
- Status-only toggle (full payment): Rejected — would require schema change to add partial payment support later

---

## Decision 3: Purchase Price Intelligence Source

**Decision**: Use `vendor_price_history` table as-is. No separate purchase catalog.

**Rationale**: The table already tracks all price observations from OCR'd documents with `normalizedDescription` for matching, `isConfirmed` for accuracy, and `observedAt` for recency. It's a self-maintaining purchase price database.

**Alternatives considered**:
- New `purchase_catalog` table: Rejected — would be stale immediately; vendor_price_history is updated automatically from every invoice
- Catalog generated from price history: Deferred — can be an aggregated view if needed later

---

## Decision 4: Price Alert Thresholds

**Decision**: Currency-specific tiered thresholds:
- Stable currencies (SGD, MYR, USD, EUR): info >5%, warning >10%, alert >20%
- Higher-inflation currencies (IDR, VND, PHP, THB): info >8%, warning >15%, alert >25%
- Minimum 2 historical observations required before alerting

**Rationale**: SEA currencies have different inflation characteristics. IDR and VND denominations are large and price movements are larger in percentage terms. Using the same thresholds would cause excessive false positives for high-inflation currencies.

**Alternatives considered**:
- Single threshold for all currencies: Rejected — too many false positives for IDR/VND
- User-configurable thresholds: Deferred to v2 — good defaults first

---

## Decision 5: Bank Details Storage & Display

**Decision**: Store bank details as plain text in Convex (encrypted at rest by platform). Mask in UI by default (show last 4 digits of account/routing numbers). Click-to-reveal for full details.

**Rationale**: Clarified during spec review. Bank account numbers are sensitive financial data. Masking prevents shoulder-surfing and casual exposure while keeping data accessible to the business owner.

**Alternatives considered**:
- No masking: Rejected — unnecessary exposure of sensitive data
- Role-restricted access: Deferred — SEA SMEs typically have 1-2 users; role-based access is premature

---

## Decision 6: Vendorless Payable Handling

**Decision**: Show payables without a `vendorId` under an "Unassigned Vendor" row in aging views. Totals always reconcile.

**Rationale**: Clarified during spec review. Legacy entries and OCR failures may lack vendorId. Excluding them from vendor-level aging creates a discrepancy between aggregate and vendor-level totals, which erodes trust in the dashboard.

**Alternatives considered**:
- Exclude from vendor view: Rejected — numbers wouldn't match aggregate totals
- Force vendor assignment: Rejected — blocks visibility of payables until assigned

---

## Decision 7: Spend Analytics Status Scope

**Decision**: Include entries with status `paid`, `pending`, or `overdue`. Exclude `cancelled` and `disputed`.

**Rationale**: Clarified during spec review. Cancelled entries represent transactions that never materialized. Disputed entries have uncertain status. Including them would inflate spend numbers inaccurately.

**Alternatives considered**:
- Paid only: Rejected — misses committed spend that hasn't been paid yet
- All non-cancelled (including disputed): Rejected — disputed amounts are uncertain

---

## Decision 8: AP Dashboard Navigation

**Decision**: New page at `/[locale]/payables/` route, added to sidebar Finance group alongside Dashboard, Invoices, and Transactions.

**Rationale**: The AR side doesn't have a dedicated page (debtor management is within invoices tabs), but the research doc recommends a dedicated AP page. This is consistent with the spec's User Story 9 requirement for a consolidated AP view.

**Alternatives considered**:
- Tab within existing analytics dashboard: Rejected — AP is complex enough for its own page
- Tab within invoices page: Rejected — incoming invoices and AP management serve different workflows

---

## Decision 9: Overdue Detection Cron Pattern

**Decision**: Mirror the existing `salesInvoices.markOverdue` cron pattern. Daily at midnight UTC. Scan `accounting_entries` where `transactionType` in ["Expense", "Cost of Goods Sold"] AND `status` = "pending" AND `dueDate` < today. Update status to "overdue". Generate Action Center insight for newly overdue entries.

**Rationale**: The AR side already has this exact pattern running successfully. Mirroring it ensures consistency and reuses proven infrastructure.

**Alternatives considered**:
- Real-time checks on query: Rejected — puts computation in the read path; cron is better for batch status updates
- Hourly detection: Rejected — daily is sufficient; overdue status changes are not time-critical within hours

---

## Decision 10: Vendor Profile UI Pattern

**Decision**: New vendor detail panel as a component within the payables domain. Accessible from vendor aging drill-down and invoice review. Not a standalone page (yet).

**Rationale**: No vendor management pages exist currently. Creating a full vendor management page is out of scope for this feature. The vendor detail panel serves as a contextual side-panel or modal that shows vendor info + payment terms + outstanding balance.

**Alternatives considered**:
- Full vendor management page: Deferred — would be a separate feature; this feature focuses on AP
- Inline editing in aging table: Rejected — too cramped for all the vendor fields

---

## Codebase Patterns to Mirror

| Pattern | Existing Example | AP Equivalent |
|---------|-----------------|---------------|
| Domain structure | `src/domains/sales-invoices/` | `src/domains/payables/` |
| Aging widget | `AgedReceivablesWidget.tsx` | Enhanced `AgedPayablesWidget.tsx` + vendor drill-down |
| Debtor hooks | `use-debtor-management.ts` | `use-vendor-payables.ts` |
| Payment recording | `convex/functions/payments.ts` | Embedded payment history in accounting entries |
| Overdue cron | `salesInvoices.markOverdue` | `accountingEntries.markOverduePayables` |
| Dashboard layout | `complete-dashboard.tsx` | `ap-dashboard.tsx` |
| Action Center insights | `actionCenterInsights.ts` | Same — use existing infrastructure |
| Sidebar nav | `sidebar.tsx` financeGroup | Add "Payables" entry |
| Form modal | `AccountingEntryFormModal` | Enhanced with vendor context panel |

## Existing Infrastructure Reuse

| Component | Status | Modification Needed |
|-----------|--------|-------------------|
| `accounting_entries` table | Exists | Add `paidAmount`, `paymentHistory` fields |
| `vendors` table | Exists | Add payment terms, bank details, metadata fields |
| `vendor_price_history` table | Exists | No schema changes; new queries only |
| `AgedPayablesWidget` | Exists | Enhance with vendor drill-down |
| `getAgedPayables` query | Exists | Add vendor-grouped variant |
| `PAYMENT_TERMS_OPTIONS` | Exists | Reuse as-is |
| `paymentTermsValidator` | Exists | Reuse as-is |
| Action Center system | Exists | Add new insight categories |
| `mapDocumentToAccountingEntry` | Exists | Enhance with vendor context |
| Vendor normalizer | Exists | Reuse for price matching |
| Cron infrastructure | Exists | Add new daily job |
