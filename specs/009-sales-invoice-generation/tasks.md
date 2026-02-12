# Tasks: Sales Invoice Generation

**Input**: Design documents from `/specs/009-sales-invoice-generation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not included (no automated test framework configured in this project — manual UAT per project convention).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Domain structure initialization and shared type definitions

- [ ] T001 Create domain folder structure: `src/domains/sales-invoices/` with subdirectories `types/`, `components/`, `hooks/`, `lib/`, `components/invoice-templates/`
- [ ] T002 Create TypeScript types and Zod validation schemas for all entities (SalesInvoice, LineItem, Customer, CatalogItem, InvoiceSettings, RecurringSchedule, PaymentTerms enum, InvoiceStatus enum) in `src/domains/sales-invoices/types/index.ts`
- [ ] T003 Create invoice calculation utility functions (calculateLineTotal, calculateSubtotal, calculateTaxByRate, calculateInvoiceTotal, applyDiscount — supporting both tax-inclusive and tax-exclusive modes) in `src/domains/sales-invoices/lib/invoice-calculations.ts`
- [ ] T004 Create invoice number formatting utility (formatInvoiceNumber with prefix-YYYY-NNN pattern, computeDueDate from payment terms) in `src/domains/sales-invoices/lib/invoice-number-format.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Convex schema changes and core backend functions that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete. Must run `npx convex dev` after schema changes.

- [ ] T005 Add `sales_invoices` table definition with all fields, validators, and indexes to `convex/schema.ts` per data-model.md
- [ ] T006 [P] Add `customers` table definition with all fields, validators, and indexes to `convex/schema.ts` per data-model.md
- [ ] T007 [P] Add `catalog_items` table definition with all fields, validators, and indexes to `convex/schema.ts` per data-model.md
- [ ] T008 [P] Add `recurring_invoice_schedules` table definition with all fields, validators, and indexes to `convex/schema.ts` per data-model.md
- [ ] T009 Add `invoiceSettings` optional embedded object field to the existing `businesses` table in `convex/schema.ts` per data-model.md
- [ ] T010 Extend `sourceDocumentType` union validator in `accounting_entries` table to include `"sales_invoice"` literal in `convex/schema.ts`
- [ ] T011 Create `convex/functions/salesInvoices.ts` with: `list` query (with filtering by status/customer/date, sorting, pagination, summary counts), `getById` query, `getNextInvoiceNumber` query, `create` mutation (finance admin auth, atomic invoice number increment, auto-calculate totals, set status to draft), `update` mutation (draft-only constraint), `send` mutation (status transition, AR accounting entry creation, sentAt timestamp), `recordPayment` mutation (amount tracking, status transition to paid/partially_paid, accounting entry update), `void` mutation (status transition, AR reversal), `markOverdue` internalMutation (find overdue invoices by dueDate)
- [ ] T012 [P] Create `convex/functions/customers.ts` with: `list` query (with search/filter), `searchByName` query (autocomplete, limit 10), `create` mutation, `update` mutation, `deactivate` mutation — all with finance admin auth and business scoping per convex-functions.md contract
- [ ] T013 [P] Create `convex/functions/catalogItems.ts` with: `list` query (with search/filter/category), `searchByName` query (autocomplete), `create` mutation, `update` mutation, `deactivate` mutation — all with finance admin auth and business scoping per convex-functions.md contract
- [ ] T014 Add `getInvoiceSettings` query and `updateInvoiceSettings` mutation to business functions (either in existing `convex/functions/businesses.ts` or new section) per convex-functions.md contract
- [ ] T015 Run `npx convex dev` to push schema changes and verify all functions compile without errors

**Checkpoint**: Foundation ready — Convex schema deployed, all backend functions available. User story implementation can now begin.

---

## Phase 3: User Story 1 — Create and Send a Sales Invoice (Priority: P1) MVP

**Goal**: Finance admin can create a sales invoice with customer details and line items, preview it, download as PDF, and send via email. This is the complete end-to-end invoicing flow.

**Independent Test**: Log in as finance admin, create an invoice with 2+ line items, preview it, download PDF, and send to an email address. Verify totals calculate correctly, PDF renders professionally, and email is delivered.

### Implementation for User Story 1

- [ ] T016 [US1] Create `use-sales-invoices.ts` hook in `src/domains/sales-invoices/hooks/` — wraps Convex `useQuery` for `salesInvoices.list` with real-time subscription, returns invoices array, loading state, summary counts
- [ ] T017 [P] [US1] Create `use-sales-invoice-form.ts` hook in `src/domains/sales-invoices/hooks/` — manages form state (customer info, line items array, tax mode, payment terms, notes), line item CRUD operations (add/update/remove), real-time total calculations using `invoice-calculations.ts`, form validation (required fields per FR-021), due date auto-computation from payment terms
- [ ] T018 [P] [US1] Create `invoice-status-badge.tsx` component in `src/domains/sales-invoices/components/` — renders semantic status badges for Draft (gray), Sent (blue), Paid (green), Overdue (red), Partially Paid (yellow), Void (muted) using existing badge component and semantic tokens
- [ ] T019 [US1] Create `invoice-line-items-table.tsx` component in `src/domains/sales-invoices/components/` — editable CSS grid table following expense-claims line-item-table.tsx pattern with columns: #, Description, Qty, Unit Price, Tax %, Discount, Total. Supports add/remove rows, inline editing, real-time per-row total calculation, summary row (Subtotal, Tax breakdown by rate, Discount, Grand Total). Uses semantic tokens, formatCurrency utility.
- [ ] T020 [US1] Create `sales-invoice-form.tsx` component in `src/domains/sales-invoices/components/` — main form assembling: customer info section (business name, contact, email, phone, address, tax ID — manual entry for US1), line items table (T019), payment terms selector (presets: Due on Receipt, Net 15, Net 30, Net 60, Custom), tax mode toggle (exclusive/inclusive), currency selector, notes/memo textarea, payment instructions textarea. Uses `use-sales-invoice-form.ts` hook. Calls `salesInvoices.create` Convex mutation on save.
- [ ] T021 [P] [US1] Create `template-modern.tsx` invoice template in `src/domains/sales-invoices/components/invoice-templates/` — clean, minimal layout with: accent color bar header, company logo + details (left), invoice number + dates (right), customer billing section, line items table, totals section, payment instructions footer, notes section. Uses inline styles for PDF compatibility alongside semantic tokens for on-screen preview.
- [ ] T022 [P] [US1] Create `template-classic.tsx` invoice template in `src/domains/sales-invoices/components/invoice-templates/` — traditional bordered layout with: structured header with logo, invoice metadata box, from/to address blocks, bordered line items table, totals with separator lines, payment details and terms footer. Uses inline styles for PDF compatibility.
- [ ] T023 [US1] Create `invoice-preview.tsx` component in `src/domains/sales-invoices/components/` — renders selected template (modern/classic) with invoice data in a modal or full-page view. Includes "Download PDF", "Send", and "Edit" action buttons at the top. Fetches invoice data via `salesInvoices.getById`.
- [ ] T024 [US1] Create `use-invoice-pdf.ts` hook in `src/domains/sales-invoices/hooks/` — wraps html2pdf.js with dynamic import (avoid SSR), accepts a DOM element ref, generates PDF with options: A4 format, 10mm margins, 2x scale, jpeg quality 0.98. Returns `generatePdf(filename)` function.
- [ ] T025 [US1] Extend `src/lib/services/email-service.ts` — add `sendInvoiceEmail()` method with HTML and plain-text templates for invoice delivery. Template includes: company name, invoice number, amount due, due date, payment instructions, and a link or attachment note. Uses existing SES + Resend dual-provider pattern.
- [ ] T026 [US1] Create API route `src/app/api/v1/sales-invoices/[invoiceId]/send-email/route.ts` — POST endpoint per api-routes.md contract. Validates Clerk session + finance admin role, fetches invoice from Convex, calls `emailService.sendInvoiceEmail()`, updates invoice sentAt via Convex mutation.
- [ ] T027 [US1] Create `src/app/[locale]/sales-invoices/create/page.tsx` — Next.js page with Clerk auth gate (finance admin redirect), renders `SalesInvoiceForm` component. Server-side auth check following existing invoices page pattern.
- [ ] T028 [US1] Create `sales-invoice-list.tsx` component in `src/domains/sales-invoices/components/` — list/dashboard view with: summary cards (total draft, sent, overdue, paid, outstanding amount), filterable table (invoice number, customer, date, due date, amount, status badge), filter controls (status dropdown, date range, search), sort by columns, click-to-view navigation. Uses `use-sales-invoices.ts` hook, semantic tokens, formatCurrency, formatBusinessDate.
- [ ] T029 [US1] Create `src/app/[locale]/sales-invoices/page.tsx` — Next.js page with Clerk auth gate, renders `SalesInvoiceList`. Finance admin sees full controls (Create Invoice button), non-admin sees read-only list. Server-side auth check and role-based UI rendering.
- [ ] T030 [US1] Add "Sales Invoices" navigation item to sidebar component (likely in `src/components/` sidebar or layout). Link to `/{locale}/sales-invoices`. Show for all roles (read-only for non-admin).
- [ ] T031 [US1] Wire end-to-end send flow: Preview "Send" button → calls `salesInvoices.send` Convex mutation (creates AR accounting entry per FR-024 accrual-basis) → calls send-email API route → updates UI status to "Sent". Handle errors with user-friendly messages.
- [ ] T032 [US1] Run `npm run build` and fix any TypeScript/build errors for User Story 1

**Checkpoint**: User Story 1 complete — finance admin can create invoices with manual customer entry, preview in 2 templates, download PDF, send via email, and view in list. Accrual-basis AR accounting entry created on send. This is the MVP.

---

## Phase 4: User Story 2 — Manage Product/Service Catalog (Priority: P2)

**Goal**: Finance admin can maintain a catalog of products/services and quickly add them to invoices via search/select autocomplete.

**Independent Test**: Create 3 catalog items with different prices and tax rates, then create a new invoice and select each item from the catalog. Verify line items auto-populate with correct defaults and can be overridden per invoice.

### Implementation for User Story 2

- [ ] T033 [P] [US2] Create `use-catalog-items.ts` hook in `src/domains/sales-invoices/hooks/` — wraps Convex `useQuery` for `catalogItems.list` and `catalogItems.searchByName`, returns items array with loading state. Provides `createItem`, `updateItem`, `deactivateItem` mutation wrappers.
- [ ] T034 [US2] Create `catalog-item-form.tsx` component in `src/domains/sales-invoices/components/` — modal or slide-over form for creating/editing catalog items. Fields: name (required), description, SKU/code, unit price (required), currency, unit of measure dropdown (pcs, hours, kg, units, custom), tax rate (%), category. Uses Zod validation. Supports create and edit modes.
- [ ] T035 [US2] Create `catalog-item-selector.tsx` component in `src/domains/sales-invoices/components/` — search/autocomplete dropdown for the invoice form line items. Searches by name or SKU. On selection, auto-populates line item fields (description, unitPrice, taxRate, unitMeasurement, itemCode) while preserving editability. Includes "Add new item" quick-create option.
- [ ] T036 [US2] Integrate `catalog-item-selector.tsx` into `invoice-line-items-table.tsx` — add a "Search catalog" input on each line item row (or an "Add from catalog" button) that opens the selector. When an item is selected, fill in the line's fields with catalog defaults. Store `catalogItemId` reference for tracking.
- [ ] T037 [US2] Add catalog management UI — either as a tab/section within the sales-invoices page or as a dedicated sub-route. Display catalog items in a table/list with name, SKU, price, tax rate, status. Include "Add Item", "Edit", and "Deactivate" actions. Finance admin only.
- [ ] T038 [US2] Run `npm run build` and fix any TypeScript/build errors for User Story 2

**Checkpoint**: User Story 2 complete — catalog items can be created, edited, deactivated, and selected in the invoice form for fast line item population.

---

## Phase 5: User Story 3 — Manage Customer Directory (Priority: P2)

**Goal**: Finance admin can save customer details and quickly select returning customers when creating invoices.

**Independent Test**: Add 2 customers to the directory, create a new invoice and select one customer. Verify billing fields auto-populate with saved details. Modify customer info on the invoice and verify the directory entry is unchanged.

### Implementation for User Story 3

- [ ] T039 [P] [US3] Create `use-customers.ts` hook in `src/domains/sales-invoices/hooks/` — wraps Convex `useQuery` for `customers.list` and `customers.searchByName`, returns customers array with loading state. Provides `createCustomer`, `updateCustomer`, `deactivateCustomer` mutation wrappers.
- [ ] T040 [US3] Create `customer-form.tsx` component in `src/domains/sales-invoices/components/` — modal form for creating/editing customers. Fields: business name (required), contact person, email (required), phone, billing address (textarea), tax registration number, customer code, internal notes. Zod validation. Supports create and edit modes.
- [ ] T041 [US3] Create `customer-selector.tsx` component in `src/domains/sales-invoices/components/` — search/autocomplete dropdown for the invoice form customer section. Searches by business name or email. On selection, populates customerSnapshot fields (businessName, contactPerson, email, phone, address, taxId). Includes "Add new customer" quick-create option that opens customer-form.tsx.
- [ ] T042 [US3] Integrate `customer-selector.tsx` into `sales-invoice-form.tsx` — replace the manual customer entry fields with the selector at the top of the form. When a saved customer is selected, auto-fill all customer fields. Allow per-invoice overrides (edits don't affect directory). Add "Save as new customer" prompt after creating invoice with unsaved customer details.
- [ ] T043 [US3] Add customer directory management UI — table/list of all customers with business name, email, status. Include "Add Customer", "Edit", and "Deactivate" actions. Finance admin only. Can be a tab within the sales-invoices section or standalone management view.
- [ ] T044 [US3] Run `npm run build` and fix any TypeScript/build errors for User Story 3

**Checkpoint**: User Story 3 complete — customers can be saved, searched, selected for invoices, and managed independently.

---

## Phase 6: User Story 4 — Track Invoice Lifecycle (Priority: P2)

**Goal**: Finance admin can track invoice status, record payments, void invoices, and see overdue invoices flagged automatically.

**Independent Test**: Create 3 invoices (one sent, one with past due date, one draft). Verify the list shows correct statuses. Record a payment against the sent invoice and verify status changes to Paid. Void the draft and verify it shows as Void.

### Implementation for User Story 4

- [ ] T045 [US4] Create `payment-recorder.tsx` component in `src/domains/sales-invoices/components/` — modal form for recording payments. Fields: payment amount (pre-filled with balance due), payment date (date picker, default today), payment method dropdown (bank transfer, cash, card, other), payment reference (optional text). Shows invoice total, amount already paid, and remaining balance. Validates amount > 0 and <= balanceDue. Calls `salesInvoices.recordPayment` mutation.
- [ ] T046 [US4] Add void action with confirmation dialog — add "Void Invoice" button to invoice detail/preview view. Uses existing `confirmation-dialog.tsx` component. Optional reason text input. Calls `salesInvoices.void` mutation. Shows warning that voiding is permanent and will reverse the accounting entry.
- [ ] T047 [US4] Add overdue cron job — register `markOverdue` scheduled function in `convex/crons.ts` as a daily cron (midnight UTC). The `markOverdue` internalMutation in `salesInvoices.ts` finds all invoices with status "sent" or "partially_paid" where `dueDate < today` and updates status to "overdue".
- [ ] T048 [US4] Enhance `sales-invoice-list.tsx` with lifecycle actions — add row-level action menu (three-dot or buttons): "View", "Record Payment" (for sent/overdue/partially_paid), "Void" (for non-void), "Edit" (for draft only). Wire each to respective modal or navigation. Filter presets: "All", "Outstanding" (sent+overdue+partially_paid), "Paid", "Draft".
- [ ] T049 [US4] Create invoice detail view — when clicking an invoice in the list, show a detail panel or page with: full invoice preview (using template), status timeline (created → sent → paid/overdue), payment history (list of recorded payments with date, amount, method), action buttons (Record Payment, Void, Download PDF, Resend Email).
- [ ] T050 [US4] Run `npm run build` and fix any TypeScript/build errors for User Story 4

**Checkpoint**: User Story 4 complete — full invoice lifecycle management with payment recording, voiding, automatic overdue detection, and status-based filtering.

---

## Phase 7: User Story 5 — Customize Invoice Template and Business Profile (Priority: P3)

**Goal**: Finance admin can configure their business profile (logo, company details, payment instructions) once and have it auto-populate on every invoice. Choose from 2 templates.

**Independent Test**: Upload a company logo, fill in business details and payment instructions, select a template. Create a new invoice and verify the seller section is pre-filled with saved profile. Switch templates and verify the preview updates.

### Implementation for User Story 5

- [ ] T051 [US5] Create API route `src/app/api/v1/sales-invoices/logo-upload/route.ts` — POST endpoint for company logo upload per api-routes.md contract. Validates Clerk session + finance admin role, accepts multipart/form-data (PNG/JPEG/SVG, max 2MB), stores in Convex file storage, returns storageId and URL.
- [ ] T052 [US5] Create invoice settings UI component in `src/domains/sales-invoices/components/` — settings page or modal for configuring business profile. Fields: logo upload (with preview), company name, company address, phone, email, registration number, tax ID, default currency, invoice number prefix, default payment terms (dropdown), default payment instructions (textarea), template selector (modern/classic with visual previews). Calls `updateInvoiceSettings` mutation on save. Shows live preview of a sample invoice with entered settings.
- [ ] T053 [US5] Wire invoice settings defaults into `sales-invoice-form.tsx` — on form load, fetch `getInvoiceSettings` and pre-populate: seller info section (from business profile), payment instructions, currency, payment terms, template selection. User can override per invoice.
- [ ] T054 [US5] Add template selector to invoice form — dropdown or toggle in `sales-invoice-form.tsx` to choose between Modern and Classic templates. Preview updates in real-time when switching.
- [ ] T055 [US5] Add settings navigation — add a "Settings" or gear icon in the sales invoices section header that opens the invoice settings UI. Finance admin only.
- [ ] T056 [US5] Run `npm run build` and fix any TypeScript/build errors for User Story 5

**Checkpoint**: User Story 5 complete — business profile configured once, auto-populated on all new invoices, 2 template options available.

---

## Phase 8: User Story 6 — Recurring Invoices (Priority: P3)

**Goal**: Finance admin can set up recurring invoice schedules that auto-generate draft invoices on a cadence.

**Independent Test**: Create an invoice, enable recurring with "Monthly" frequency. Trigger the cron function manually. Verify a new draft invoice is created with the same line items, customer, and an incremented invoice number.

### Implementation for User Story 6

- [ ] T057 [US6] Create recurring schedule Convex functions — add `create`, `cancel`, `listByBusiness` queries/mutations and `generateDueInvoices` internalMutation to `convex/functions/salesInvoices.ts` (or a separate `convex/functions/recurringInvoices.ts`). The `generateDueInvoices` function clones the source invoice data into a new draft, increments invoice number, advances `nextGenerationDate` to next period, and deactivates schedule if `endDate` reached.
- [ ] T058 [US6] Register recurring invoice cron job in `convex/crons.ts` — daily cron at 1:00 AM UTC calling `generateDueInvoices` internalMutation.
- [ ] T059 [US6] Add recurring invoice UI to invoice form/detail — "Make Recurring" toggle or button on invoice detail view. When enabled, shows: frequency selector (weekly, monthly, quarterly, yearly), start date (defaults to invoice date + frequency), end date (optional), active/inactive toggle. Calls recurring schedule create/cancel mutations.
- [ ] T060 [US6] Add recurring indicator to invoice list — show a recurring icon or badge on invoices that are source templates for recurring schedules. Add a "Recurring" section or filter in the list view showing active schedules with next generation date.
- [ ] T061 [US6] Run `npm run build` and fix any TypeScript/build errors for User Story 6

**Checkpoint**: User Story 6 complete — recurring invoices auto-generate as drafts on schedule for review and sending.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Quality improvements that affect multiple user stories

- [ ] T062 [P] Create domain documentation `src/domains/sales-invoices/CLAUDE.md` — document the domain structure, key files, patterns used, invoice lifecycle, and accounting integration for future developers/agents
- [ ] T063 [P] Verify mobile responsiveness — test all sales invoice views (list, form, preview, PDF) on mobile viewport sizes. Fix layout issues using existing responsive patterns (bottom-nav, p-card-padding, max-w constraints).
- [ ] T064 Verify multi-currency formatting — test invoice creation in SGD, MYR, THB, IDR (no decimals, large numbers), VND, PHP, USD. Verify formatCurrency renders correctly for all currencies on form, list, preview, and PDF.
- [ ] T065 Verify accrual-basis accounting integration — create an invoice, send it (verify AR entry created with transactionType "Income", status "pending", sourceDocumentType "sales_invoice"), record payment (verify entry status updated to "paid"), void a different invoice (verify AR entry reversed/cancelled).
- [ ] T066 Final `npm run build` — verify entire project builds cleanly with all sales invoice features integrated

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 types (T002) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion — this is the MVP
- **User Story 2 (Phase 4)**: Depends on Phase 2 + T019 (line items table from US1)
- **User Story 3 (Phase 5)**: Depends on Phase 2 + T020 (invoice form from US1)
- **User Story 4 (Phase 6)**: Depends on Phase 2 + T028/T029 (list component from US1)
- **User Story 5 (Phase 7)**: Depends on Phase 2 + T020/T021/T022 (form + templates from US1)
- **User Story 6 (Phase 8)**: Depends on Phase 2 + T011 (salesInvoices functions)
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: No dependencies on other stories — fully standalone MVP
- **US2 (P2)**: Integrates with US1 line items table (adds catalog selector) — but catalog management is independently testable
- **US3 (P2)**: Integrates with US1 invoice form (adds customer selector) — but customer directory is independently testable
- **US4 (P2)**: Enhances US1 list and detail views (adds payment, void, overdue) — but lifecycle functions are independently testable
- **US5 (P3)**: Enhances US1 form and templates (adds defaults from settings) — but settings UI is independently testable
- **US6 (P3)**: Uses US1 invoice creation functions (clones invoices) — requires US1 backend

### Within Each User Story

- Hooks before components (data layer before UI)
- Simpler components before complex ones (badge before form)
- Backend integration before UI wiring
- Build verification as final task

### Parallel Opportunities

Within Phase 2:
- T006, T007, T008 can run in parallel (separate table definitions)
- T012, T013 can run in parallel (separate Convex function files)

Within Phase 3 (US1):
- T017, T018 can run in parallel (different files)
- T021, T022 can run in parallel (separate template files)

After Phase 2, US2 through US6 can proceed in parallel if team capacity allows (though sequential P1→P2→P3 is recommended for solo development).

---

## Parallel Example: User Story 1

```bash
# After Phase 2 foundational is complete, launch parallel US1 tasks:

# Parallel batch 1 (hooks + badge — different files):
Task T016: "Create use-sales-invoices.ts hook"
Task T017: "Create use-sales-invoice-form.ts hook"
Task T018: "Create invoice-status-badge.tsx"

# Parallel batch 2 (templates — different files):
Task T021: "Create template-modern.tsx"
Task T022: "Create template-classic.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T004)
2. Complete Phase 2: Foundational (T005–T015)
3. Complete Phase 3: User Story 1 (T016–T032)
4. **STOP and VALIDATE**: Test full invoice creation → preview → PDF → email → list flow
5. Deploy/demo — finance admin can start invoicing customers immediately

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 → **MVP!** Full invoicing flow (create, preview, PDF, email, list)
3. US2 + US3 → Speed boost (catalog + customer directory for repeat invoicing)
4. US4 → Cash flow management (payments, overdue tracking, void)
5. US5 → Professional polish (branding, templates, business profile)
6. US6 → Automation (recurring invoices)

### Parallel Team Strategy

With multiple developers after Phase 2:
- Developer A: US1 (core flow — must complete first for others to integrate)
- Developer B: US2 + US3 (catalog + customers — can build management UIs independently, wire into US1 form later)
- Developer C: US4 (lifecycle — can build payment/void functions independently, wire into US1 list later)

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [US#] label maps task to specific user story for traceability
- All Convex functions must include finance admin auth checks and business scoping
- All components must use semantic design tokens (no hardcoded colors)
- All currency display must use `formatCurrency()` from `@/lib/utils/format-number`
- All business dates must use `formatBusinessDate()` (no timezone conversion)
- Run `npm run build` after each phase to catch errors early
- Run `npx convex dev` after any `convex/schema.ts` changes
