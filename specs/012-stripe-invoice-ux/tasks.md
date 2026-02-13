# Tasks: Stripe-Style Invoice Creation UX

**Input**: Design documents from `/specs/012-stripe-invoice-ux/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/component-interfaces.md, quickstart.md

**Tests**: No automated tests requested — manual testing via quickstart.md checklist.

**Organization**: Tasks are grouped by user story (US1–US6) to enable independent implementation and testing. Setup and foundational tasks have no story label.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US6)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No project initialization needed — existing codebase on branch `012-stripe-invoice-ux`

*(No tasks — existing project structure is in place)*

---

## Phase 2: Foundational (Data Model + Form Hook)

**Purpose**: Schema extensions, type updates, mutation validators, and form hook enhancements that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

### Data Model

- [X] T001 Extend Convex schema with new fields (lineItem: supplyDateStart/supplyDateEnd/isDiscountable; sales_invoices: footer/customFields/showTaxId; businesses.invoiceSettings: acceptedPaymentMethods) in convex/schema.ts
- [X] T002 [P] Extend TypeScript types and Zod schemas with new LineItem fields (supplyDateStart, supplyDateEnd, isDiscountable) and SalesInvoice fields (footer, customFields, showTaxId) in src/domains/sales-invoices/types/index.ts
- [X] T003 Update Convex salesInvoices.create and salesInvoices.update mutation validators with new optional fields (footer, customFields, showTaxId on invoice; supplyDateStart, supplyDateEnd, isDiscountable on lineItem) in convex/functions/salesInvoices.ts
- [ ] T004 Deploy Convex schema and function changes (npx convex deploy --yes)

### Form Hook Extension

- [X] T005 Add new invoice-level fields (footer, customFields, showTaxId) and LineItem extensions (supplyDateStart, supplyDateEnd, isDiscountable) with state management and setters to useSalesInvoiceForm hook in src/domains/sales-invoices/hooks/use-sales-invoice-form.ts
- [X] T006 Add auto-save logic with 1.5s debounce to useSalesInvoiceForm hook — draft created after first meaningful input (customer selected or first item added), save status tracked via isDraftCreated/lastSavedAt/isSaving in src/domains/sales-invoices/hooks/use-sales-invoice-form.ts
- [X] T007 Add initialData parameter support for edit mode pre-population to useSalesInvoiceForm hook — accepts SalesInvoiceFormInput and pre-populates all fields including new ones in src/domains/sales-invoices/hooks/use-sales-invoice-form.ts

**Checkpoint**: Data model and form hook ready — component implementation can begin

---

## Phase 3: User Story 1 — Create Invoice with Live Preview (Priority: P1) MVP

**Goal**: Deliver the core split-panel layout with real-time Invoice PDF and Email preview tabs

**Independent Test**: Create a new invoice, fill in customer + items, verify preview updates in real-time across both PDF and Email tabs

### Implementation for User Story 1

- [X] T008 [P] [US1] Create InvoiceEditorLayout split-panel shell component (left form ~50%, right preview ~50%, scrollable left, sticky right) in src/domains/sales-invoices/components/invoice-editor-layout.tsx
- [X] T009 [P] [US1] Create InvoicePreviewPanel with "Invoice PDF" and "Email" tab switching, rendering existing template in PDF tab in src/domains/sales-invoices/components/invoice-preview-panel.tsx
- [X] T010 [P] [US1] Create EmailPreview mockup component showing recipient email, company logo/name, total amount, due date, download link, from/to details, line items, and "Pay this invoice" CTA in src/domains/sales-invoices/components/email-preview.tsx
- [X] T011 [US1] Adapt existing InvoicePreview for side-panel rendering (remove standalone action buttons, adjust sizing for panel width) in src/domains/sales-invoices/components/invoice-preview.tsx
- [X] T012 [US1] Wire InvoiceEditorLayout with form hook and InvoicePreviewPanel — verify form state changes trigger preview re-renders within 1 second in src/domains/sales-invoices/components/invoice-editor-layout.tsx

**Checkpoint**: Split-panel layout renders with live preview updates across both tabs

---

## Phase 4: User Story 2 — Step-by-Step Form Sections (Priority: P1)

**Goal**: Organize the left form panel into clearly sequenced sections: Customer → Currency → Items → Payment Collection → Additional Options

**Independent Test**: Walk through each section sequentially, verify all fields function and the form maintains a logical guided flow with scrollable left panel and fixed right preview

### Implementation for User Story 2

- [X] T013 [P] [US2] Create CurrencySection with currency selector and "changing currency will clear all items" warning dialog in src/domains/sales-invoices/components/currency-section.tsx
- [X] T014 [P] [US2] Create PaymentCollectionSection with "Request payment" default, due date dropdown (Due on receipt, Net 15, Net 30, Net 60), and read-only payment method chips from business invoiceSettings in src/domains/sales-invoices/components/payment-collection-section.tsx
- [X] T015 [P] [US2] Adapt customer-selector for inline display after selection (show business name, email, language preference with "..." menu) in src/domains/sales-invoices/components/customer-selector.tsx
- [X] T016 [US2] Create InvoiceFormPanel container with ordered sections (CustomerSection, CurrencySection, Items, PaymentCollectionSection, AdditionalOptionsSection placeholder) in src/domains/sales-invoices/components/invoice-form-panel.tsx
- [X] T017 [US2] Update create page route to use InvoiceEditorLayout with mode='create' in src/app/[locale]/sales-invoices/create/page.tsx

**Checkpoint**: Full create flow works — user can fill all sections and see live preview. US1+US2 together deliver the MVP.

---

## Phase 5: User Story 3 — Advanced Item Options (Priority: P2)

**Goal**: Add collapsible "Item options" to line items with tax, discount, supply date range, and discountable toggle

**Independent Test**: Add a line item, expand Item options, set supply dates and tax, verify values save and appear in preview

### Implementation for User Story 3

- [X] T018 [US3] Create ItemDetailForm with line item editor (name/search, qty, price), collapsible "Item options" (tax dropdown, discount percentage/fixed, supply date range picker, discountable checkbox), and "Save and add another" action in src/domains/sales-invoices/components/item-detail-form.tsx
- [X] T019 [P] [US3] Update invoice-line-items-table to display supply date range below item descriptions (e.g., "May 27, 2025–May 26, 2026") in src/domains/sales-invoices/components/invoice-line-items-table.tsx
- [X] T020 [P] [US3] Update invoice-calculations to respect isDiscountable flag when applying invoice-level discounts in src/domains/sales-invoices/lib/invoice-calculations.ts

**Checkpoint**: Line items support advanced options; supply dates and discounts render correctly in preview and calculations

---

## Phase 6: User Story 4 — Additional Options & Customization (Priority: P2)

**Goal**: Add toggle-able customization fields: template selection, memo, footer, custom fields, tax ID display

**Independent Test**: Toggle each option on, enter content, verify it appears in PDF preview

### Implementation for User Story 4

- [X] T021 [US4] Create AdditionalOptionsSection with toggle-able fields (Template dropdown, Memo textarea, Footer textarea, Custom fields key-value pairs, Tax ID checkbox) in src/domains/sales-invoices/components/additional-options-section.tsx
- [X] T022 [US4] Update template-modern to render supply dates below item descriptions, custom fields section, footer text, and business tax ID in src/domains/sales-invoices/components/invoice-templates/template-modern.tsx
- [X] T023 [P] [US4] Update template-classic to render supply dates below item descriptions, custom fields section, footer text, and business tax ID in src/domains/sales-invoices/components/invoice-templates/template-classic.tsx
- [X] T024 [P] [US4] Update pdf-document (@react-pdf/renderer) to include supply dates, custom fields, footer, and tax ID in src/domains/sales-invoices/components/invoice-templates/pdf-document.tsx

**Checkpoint**: All customization options toggle correctly and render in both HTML templates and PDF document

---

## Phase 7: User Story 5 — Invoice Header Bar with Actions (Priority: P2)

**Goal**: Add persistent header bar with close, auto-save status, hide/show preview, and Review invoice finalization

**Independent Test**: Verify header elements are visible, click each button, confirm close/hide/review behaviors work

### Implementation for User Story 5

- [X] T025 [P] [US5] Create InvoiceEditorHeader with close button (X), page title, auto-save status ("Draft saved at [time]"), "Hide preview" toggle, and "Review invoice" primary action button in src/domains/sales-invoices/components/invoice-editor-header.tsx
- [X] T026 [P] [US5] Create ReviewInvoiceView finalization component with invoice summary, "Send invoice" action, and "Back to editing" option in src/domains/sales-invoices/components/review-invoice-view.tsx
- [X] T027 [US5] Integrate InvoiceEditorHeader into InvoiceEditorLayout and wire hide/show preview toggle, close with unsaved changes check, and review invoice navigation in src/domains/sales-invoices/components/invoice-editor-layout.tsx

**Checkpoint**: Header bar functional — auto-save status updates, preview toggles, review view accessible

---

## Phase 8: User Story 6 — Edit Existing Draft Invoice (Priority: P3)

**Goal**: Allow editing existing draft invoices using the same split-panel layout with pre-populated data

**Independent Test**: Create a draft, navigate away, return to edit — verify all fields (including new fields) pre-populate and are editable

### Implementation for User Story 6

- [X] T028 [US6] Update edit page route to use InvoiceEditorLayout with mode='edit', pass invoiceId and initialData from existing invoice data (including footer, customFields, showTaxId, supply dates) in src/app/[locale]/sales-invoices/[id]/edit/page.tsx

**Checkpoint**: Edit mode fully functional with pre-populated data and live preview

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Responsive behavior, settings integration, and build verification

- [X] T029 Implement responsive behavior — hide preview panel on mobile/tablet by default, show "Show preview" button, form expands to full width in src/domains/sales-invoices/components/invoice-editor-layout.tsx
- [X] T030 [P] Update invoice-settings-form with acceptedPaymentMethods multi-select configuration UI in src/domains/sales-invoices/components/invoice-settings-form.tsx
- [X] T031 Run build verification (npm run build) and fix any TypeScript or compilation errors
- [ ] T032 Run quickstart.md testing checklist to verify all user stories

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No tasks — existing project
- **Foundational (Phase 2)**: BLOCKS all user stories — schema, types, mutations, and hook must be complete
- **US1 (Phase 3)**: Depends on Foundational — delivers layout shell + preview
- **US2 (Phase 4)**: Depends on Foundational + US1 layout shell — delivers form sections
- **US3 (Phase 5)**: Depends on Foundational — can run parallel with US4/US5
- **US4 (Phase 6)**: Depends on Foundational — can run parallel with US3/US5
- **US5 (Phase 7)**: Depends on US1 layout shell — can run parallel with US3/US4
- **US6 (Phase 8)**: Depends on US1 + US2 (layout + form must exist to pre-populate)
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Phase 2 (Foundational)
  ├── US1 (Phase 3) ──┐
  │                    ├── US2 (Phase 4) ──┐
  │                    │                    ├── US6 (Phase 8)
  │                    ├── US5 (Phase 7)    │
  ├── US3 (Phase 5) ──┤                    │
  └── US4 (Phase 6) ──┘                    │
                                            └── Polish (Phase 9)
```

### Within Each Phase

- Tasks marked [P] can run in parallel (different files)
- Sequential tasks depend on previous task in same file or logical chain
- T001 → T003 → T004 (schema → mutations → deploy)
- T005 → T006 → T007 (hook fields → auto-save → initialData)

### Parallel Opportunities

**Phase 2** (after T001):
- T002 (types) runs parallel with T001 (schema) — different files

**Phase 3** (all independent files):
- T008 (layout), T009 (preview panel), T010 (email preview) — all parallel

**Phase 4** (all independent files):
- T013 (currency), T014 (payment), T015 (customer) — all parallel

**Phase 5**:
- T019 (line items table) and T020 (calculations) — parallel with each other

**Phase 6** (after T022):
- T023 (template-classic) and T024 (pdf-document) — parallel

**Phase 7**:
- T025 (header) and T026 (review view) — parallel

**Cross-story parallelism**: After Phase 2 completes, US3/US4 can run in parallel with US1/US2 if multiple developers are available. However, for a single developer, the recommended order is P1 stories first (US1 → US2), then P2 (US3 → US4 → US5), then P3 (US6).

---

## Parallel Example: Phase 3 (US1)

```bash
# Launch all independent components together:
Task: "Create InvoiceEditorLayout in invoice-editor-layout.tsx"
Task: "Create InvoicePreviewPanel in invoice-preview-panel.tsx"
Task: "Create EmailPreview in email-preview.tsx"

# Then sequentially:
Task: "Adapt existing InvoicePreview for side-panel"
Task: "Wire layout with preview panel"
```

## Parallel Example: Phase 4 (US2)

```bash
# Launch all section components together:
Task: "Create CurrencySection in currency-section.tsx"
Task: "Create PaymentCollectionSection in payment-collection-section.tsx"
Task: "Adapt customer-selector for inline display"

# Then sequentially:
Task: "Create InvoiceFormPanel container"
Task: "Update create page route"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 2: Foundational (schema + types + hook)
2. Complete Phase 3: US1 (split-panel layout + preview)
3. Complete Phase 4: US2 (form sections + create page)
4. **STOP and VALIDATE**: Test full create flow with live preview
5. Deploy/demo — users can now create invoices with the new Stripe-style UX

### Incremental Delivery

1. Phase 2 → Foundation ready
2. US1 + US2 → Core creation UX (MVP!)
3. US3 → Advanced item options (power users)
4. US4 → Customization (compliance/branding)
5. US5 → Header bar + review flow (finalization polish)
6. US6 → Edit mode (complete feature)
7. Polish → Responsive + settings + build verification

### Single Developer Recommended Order

Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps each task to its user story for traceability
- No automated test tasks — use quickstart.md manual testing checklist
- All new Convex schema fields are optional (backward compatible)
- Existing `notes` field serves as "Memo" — UI label change only, no schema change
- After ANY Convex changes, must run `npx convex deploy --yes` (T004)
- Must run `npm run build` before considering work complete (T031)
