# Research: Stripe-Style Invoice Creation UX

**Branch**: `012-stripe-invoice-ux` | **Date**: 2026-02-13

## Decision Log

### D1: Split-Panel Layout Strategy

**Decision**: Replace existing create/edit pages with a unified full-page split-panel layout component.

**Rationale**: The current architecture has two separate approaches — `SalesInvoiceForm` (create) with `useSalesInvoiceForm()` hook vs. `EditSalesInvoicePage` with raw `useState`. Both need the same Stripe-style split-panel layout, so unifying them into a single `InvoiceEditor` component eliminates duplication and ensures consistent behavior.

**Alternatives Considered**:
- Retrofit existing `SalesInvoiceForm` only → rejected because the edit page would remain inconsistent
- Build a wrapper around both existing pages → rejected because the layout change is fundamental (sidebar settings → scrollable left form + sticky right preview)

### D2: Preview Rendering Approach

**Decision**: Use HTML-based rendering for the Invoice PDF preview tab (reuse existing template components), not actual PDF-in-iframe rendering.

**Rationale**: The current `ModernInvoiceTemplate` and `ClassicInvoiceTemplate` already render invoice content as styled HTML. Rendering these in the preview panel is fast (<100ms), responsive, and updates instantly with form changes. Generating an actual PDF blob on every keystroke via `@react-pdf/renderer` would be too slow (500ms+ per render) and cause UI jank.

**Alternatives Considered**:
- Render actual PDF in iframe → rejected due to performance (PDF generation is expensive for real-time preview)
- Debounced PDF rendering → rejected because even 1-2s debounce creates noticeable lag

### D3: Email Preview Approach

**Decision**: Build a static HTML email preview component that mirrors the structure of the actual sent email.

**Rationale**: The Email preview needs to show: recipient, subject line, company branding, amount, due date, download link, To/From, CTA button, and line item details. This is a visual mockup — not a live email engine. The component receives the same invoice data as the PDF preview and renders it in an email-style layout.

**Alternatives Considered**:
- Use an actual email template engine → rejected; overkill for preview, and email sending is handled server-side
- Screenshot of the PDF preview → rejected; email layout is fundamentally different from PDF layout

### D4: Auto-Save Implementation

**Decision**: Use debounced auto-save (1.5s after last change) with optimistic UI. Draft created after first meaningful input (customer selected or first item added).

**Rationale**: Matches the clarified spec requirement. Debounce prevents excessive API calls while ensuring data is saved within seconds. The `useSalesInvoiceForm` hook already manages all form state — adding a debounced save effect is straightforward.

**Alternatives Considered**:
- Save on every field change → rejected; too many API calls, causes write contention
- Save only on explicit action → rejected; contradicts spec requirement for auto-save
- Save on blur → rejected; misses scenarios where user fills a field and closes browser

### D5: Data Model Extensions

**Decision**: Extend the existing `sales_invoices` schema and `LineItem` type to support new fields required by the spec.

**Rationale**: The spec introduces several new data capabilities:
- **Line items**: `supplyDateStart`, `supplyDateEnd` (service date range), `isDiscountable` (toggle)
- **Invoice**: `footer` (text), `customFields` (array of {key, value}), `showTaxId` (boolean)
- **Business settings**: `acceptedPaymentMethods` (array of strings)

The existing `notes` field maps to "Memo" in the UI (no schema change, just UI label rename). All new fields are optional to maintain backward compatibility.

**Alternatives Considered**:
- Create separate metadata table → rejected; these fields are tightly coupled to the invoice document
- Use a generic JSON blob → rejected; loses type safety and query capabilities

### D6: Existing Form Hook Reuse

**Decision**: Extend `useSalesInvoiceForm()` hook to support all new fields and both create/edit modes.

**Rationale**: The hook already manages 15+ form fields, calculations, and validation. Adding 5-6 new fields and an `initialData` parameter for edit mode is more efficient than building a new form system. The hook's computed totals, auto-recalculation, and validation patterns transfer directly.

**Alternatives Considered**:
- Build a new form hook from scratch → rejected; duplicates 80%+ of existing logic
- Use a form library (react-hook-form) → rejected; the existing hook pattern works well and switching would require rewriting all consumers

### D7: Page Route Strategy

**Decision**: Create a new unified route `/sales-invoices/create` that replaces the current create page. Update `/sales-invoices/[id]/edit` to use the same layout component.

**Rationale**: The existing routes already serve the right purpose. The change is in the page-level component that renders — swapping from the current layouts to the new split-panel `InvoiceEditor`. No URL changes needed for users.

**Alternatives Considered**:
- Create entirely new routes (e.g., `/sales-invoices/editor`) → rejected; breaks existing bookmarks and back-navigation patterns
- Use a modal overlay from the list page → rejected; the editor needs full-page real estate for the split layout

## Unknowns Resolved

| Unknown | Resolution |
| ------- | ---------- |
| PDF preview performance | Use HTML-based template rendering, not PDF generation, for real-time preview |
| Email preview content | Static HTML component mirroring sent email structure |
| Auto-save trigger timing | Debounced 1.5s; draft created after first meaningful input |
| Edit page unification | Extend `useSalesInvoiceForm` with `initialData` param for edit mode |
| New data fields storage | Extend existing Convex schema with optional fields |
| Accepted payment methods source | New `acceptedPaymentMethods` array in business `invoiceSettings` |
| Custom fields data structure | Array of `{key: string, value: string}` embedded in invoice document |
