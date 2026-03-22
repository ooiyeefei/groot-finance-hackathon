# Tasks: Debtor Self-Service Information Update

**Input**: Design documents from `/specs/032-self-service-debtors-info-update/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/convex-functions.md, research.md, quickstart.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Schema & Infrastructure)

**Purpose**: Add new Convex tables, middleware route, and shared types needed by all user stories

- [x] T001 Add `debtor_update_tokens` and `debtor_change_log` table definitions to `convex/schema.ts` with all fields and indexes per data-model.md. Add `enableDebtorSelfServiceQr: v.optional(v.boolean())` to `invoiceSettings` object in businesses table.
- [x] T002 Add public route `'/:locale/debtor-update(.*)'` to the `isPublicRoute` matcher in `src/middleware.ts` so the debtor form page bypasses Clerk auth.
- [x] T003 Create `convex/functions/debtorSelfService.ts` with the `createToken` internalMutation (generate UUID token, check for existing active token, set 30-day expiry) and the `validateToken` + `getFormData` public queries per contracts/convex-functions.md.
- [x] T004 Run `npx convex deploy --yes` to deploy schema changes and new functions to production. (SKIPPED: worktree — deploy from main after merge)

**Checkpoint**: Schema deployed, token creation works, public route registered.

---

## Phase 2: User Story 1 — Debtor Fills Out Self-Service Form (Priority: P1) 🎯 MVP

**Goal**: A debtor opens a token URL, sees a pre-filled form, edits fields, submits, and changes auto-apply to the customer record.

**Independent Test**: Generate a token in Convex dashboard → visit `/en/debtor-update/{token}` → form loads with pre-filled data → edit TIN → submit → verify customer record updated.

### Implementation

- [x] T005 [US1] Create the public form page at `src/app/[locale]/debtor-update/[token]/page.tsx` as a server component. It should call the Convex `getFormData` query to validate the token and fetch customer data. Show error states for expired/invalid tokens. Render the `PublicDebtorForm` client component with pre-filled data. No sidebar/header (this is an external debtor page). Include Groot branding and mobile-responsive layout.
- [x] T006 [US1] Create `src/domains/sales-invoices/components/public-debtor-form.tsx` as a client component. Pre-fill all editable fields (businessName, contactPerson, position, email, phone, phone2, fax, addressLine1-3, city, stateCode, postalCode, countryCode, tin, brn, idType, sstRegistration, website, businessNature). Display customerCode as read-only. Use expandable sections for address and tax fields (follow customer-form.tsx patterns). Add field validation (TIN format, state codes from MALAYSIAN_STATE_CODES, required fields). Use semantic design tokens (`bg-card`, `text-foreground`, etc.). Submit button: `bg-primary hover:bg-primary/90 text-primary-foreground`.
- [x] T007 [US1] Implement the `submitUpdate` public mutation in `convex/functions/debtorSelfService.ts` per contracts. Logic: validate token (not expired, not revoked) → check rate limit (usageCount < 5 in 24h) → fetch current customer (old snapshot) → compute field-level diff → patch customer record → create `debtor_change_log` entry → create Action Center alert (category: "compliance", priority: "low") → increment token usageCount → return success.
- [x] T008 [US1] Wire the public form submission to the `submitUpdate` mutation. On success, show a confirmation message ("Thank you! Your details have been updated."). On rate limit error, show "Daily submission limit reached. Please try again tomorrow." On expired token, redirect to the expiry message.
- [x] T009 [US1] Run `npx convex deploy --yes` then `npm run build` to verify everything compiles and deploys.

**Checkpoint**: US1 complete — debtor can open form, edit fields, submit, customer record updated, change log entry created, Action Center alert created.

---

## Phase 3: User Story 2 — Change Log & Revert (Priority: P1)

**Goal**: Admin sees change history on debtor detail page with old→new diffs and can revert any change.

**Independent Test**: After a debtor submits an update → open debtor detail page → see change log with highlighted diffs → click "Revert" → customer record restored to previous values.

### Implementation

- [x] T010 [US2] Implement `getChangeLog` authenticated query in `convex/functions/debtorSelfService.ts` — fetch all `debtor_change_log` entries for a customer, sorted by submittedAt desc. Also implement `getTokenStatus` query.
- [x] T011 [US2] Implement `revertChange` authenticated mutation in `convex/functions/debtorSelfService.ts` — fetch change log entry → restore customer from oldSnapshot → mark entry as reverted (isReverted=true, revertedAt, revertedBy) → create new change log with source="admin_revert".
- [x] T012 [US2] Create `src/domains/sales-invoices/components/debtor-change-log.tsx` client component. Display a list of change log entries with: timestamp, source ("Self-service" / "Admin revert"), changed fields with old→new values highlighted (use `text-destructive` for old, `text-primary` for new). Add a "Revert" button per entry (only for non-reverted entries, uses `bg-destructive` styling). Show "Reverted" badge on reverted entries.
- [x] T013 [US2] Modify `src/domains/sales-invoices/components/debtor-detail.tsx` to add a "Self-Service Updates" collapsible section that renders the `DebtorChangeLog` component. Query `getChangeLog` and `getTokenStatus` using existing hook patterns (useQuery + useActiveBusiness).
- [x] T014 [US2] Run `npx convex deploy --yes` then `npm run build` to verify.

**Checkpoint**: US2 complete — admin can see change history, revert changes.

---

## Phase 4: User Story 3 — QR Code on Invoice PDF (Priority: P2)

**Goal**: Sales invoice PDFs display a QR code in the footer that links to the debtor's self-service form, gated by business toggle.

**Independent Test**: Enable the QR toggle in invoice settings → generate a sales invoice PDF → QR code visible in footer with bilingual label → scan QR → opens the self-service form for the correct debtor.

### Implementation

- [x] T015 [US3] Create `src/domains/sales-invoices/components/debtor-qr-code.tsx` utility — export an async function `generateDebtorUpdateQrDataUrl(token: string, locale: string)` that returns a data URL. Use the existing `qrcode` npm package (same pattern as `lhdn-qr-code.tsx`). URL format: `https://finance.hellogroot.com/${locale}/debtor-update/${token}`. QR size: 100px, margin: 1.
- [x] T016 [US3] Add `enableDebtorSelfServiceQr` toggle to `src/domains/sales-invoices/components/invoice-settings-form.tsx`. Place under existing PDF settings section. Label: "Show debtor self-service QR code on invoices". Help text: "Debtors can scan to update their business details for e-invoice compliance". Default: checked.
- [x] T017 [US3] Modify the invoice PDF data preparation logic to: (a) check if `enableDebtorSelfServiceQr` is true, (b) get or create a token for the debtor via `createToken`, (c) generate QR data URL, (d) pass `debtorUpdateQrDataUrl` to the PDF component. Update the `PdfInvoiceData` interface to include `debtorUpdateQrDataUrl?: string`.
- [x] T018 [P] [US3] Add QR code section to `src/domains/sales-invoices/components/invoice-templates/pdf-document.tsx` — render in footer area below payment terms. Show QR image + bilingual label text: "Scan to update your business details / Imbas untuk kemaskini maklumat perniagaan anda". Only render when `debtorUpdateQrDataUrl` is provided.
- [x] T019 [P] [US3] Add same QR code section to `src/domains/sales-invoices/components/invoice-templates/template-modern.tsx` (HTML preview version) — same layout and bilingual label.
- [x] T020 [P] [US3] Add same QR code section to `src/domains/sales-invoices/components/invoice-templates/template-classic.tsx` (HTML preview version) — same layout and bilingual label.
- [x] T021 [US3] Run `npx convex deploy --yes` then `npm run build` to verify.

**Checkpoint**: US3 complete — QR code appears on invoice PDFs when toggle enabled, links to correct form.

---

## Phase 5: User Story 4 — Email Info Request (Priority: P2)

**Goal**: Business user clicks "Request Info Update" on debtor detail page, sends branded email with self-service link.

**Independent Test**: Open debtor with email → click "Request Info Update" → email sent → debtor receives email with CTA link → link opens pre-filled form.

### Implementation

- [x] T022 [US4] Create `src/app/api/v1/debtor-info-request/route.ts` — POST handler with Clerk auth. Validate user has business access. Get or create token for debtor. Fetch debtor email. Send SES email using existing `notifications.hellogroot.com` domain. Email content: subject "[Business Name] — Please update your business details", body with greeting, e-invoice compliance explanation, CTA button with self-service URL, expiry notice, "Powered by Groot Finance" footer. Update token `emailSentAt`. Return success.
- [x] T023 [US4] Modify `src/domains/sales-invoices/components/debtor-detail.tsx` to add a "Request Info Update" button in the header actions area. If debtor has no email: show disabled button with tooltip "No email address on file. Add an email first." If email sent within 24h: show confirmation dialog "An email was sent X hours ago. Send again?" On click: call API route, show success toast.
- [x] T024 [US4] Run `npm run build` to verify.

**Checkpoint**: US4 complete — single email sending works from debtor detail page.

---

## Phase 6: User Story 5 — Bulk Email (Priority: P3)

**Goal**: Select multiple debtors in list, send bulk info request emails.

**Independent Test**: Select 10 debtors (7 with email, 3 without) → click "Request Info Update" → see summary "Will send to 7 (3 skipped)" → confirm → 7 emails sent.

### Implementation

- [x] T025 [US5] Add bulk endpoint to `src/app/api/v1/debtor-info-request/route.ts` — handle `POST /api/v1/debtor-info-request/bulk` with `{ businessId, customerIds }`. Loop through customers, skip those without email, create tokens and send emails. Respect SES rate limits. Return `{ sent, skipped, errors }`.
- [x] T026 [US5] Modify `src/domains/sales-invoices/components/debtor-list.tsx` to add multi-select checkboxes and a bulk action bar. When debtors are selected, show "Request Info Update (X selected)" button. On click, show a confirmation dialog with summary: "Will send to Y debtors (Z skipped — no email)". On confirm, call bulk API. Show result toast with sent/skipped/error counts.
- [x] T027 [US5] Run `npm run build` to verify.

**Checkpoint**: US5 complete — bulk email sending works.

---

## Phase 7: User Story 6 — Token Management (Priority: P3)

**Goal**: Admin can view token status, regenerate expired tokens, copy self-service links.

**Independent Test**: Open debtor detail → see token status (active/expired) → click "Regenerate Link" → new token created → old link no longer works → copy new link.

### Implementation

- [x] T028 [US6] Implement `regenerateToken` and `revokeToken` mutations in `convex/functions/debtorSelfService.ts` per contracts.
- [x] T029 [US6] Enhance the "Self-Service Updates" section in `src/domains/sales-invoices/components/debtor-detail.tsx` to show token management: current token status (active/expired badge), creation and expiry dates, "Regenerate Link" button (calls `regenerateToken`), "Copy Link" button (copies self-service URL to clipboard). If no token exists, show "Generate Link" button.
- [x] T030 [US6] Run `npx convex deploy --yes` then `npm run build` to verify.

**Checkpoint**: US6 complete — token management works.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, build check, documentation

- [x] T031 Run full `npm run build` and fix any remaining TypeScript or build errors.
- [x] T032 Update `src/domains/sales-invoices/CLAUDE.md` (if exists) or add section to relevant docs documenting the self-service debtor update feature: new tables, public page route, QR code toggle, email API.
- [x] T033 Verify Convex deployment is up-to-date: `npx convex deploy --yes`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US1 — Form)**: Depends on Phase 1 (schema + functions)
- **Phase 3 (US2 — Change Log)**: Depends on Phase 2 (needs form submissions to display)
- **Phase 4 (US3 — QR Code)**: Depends on Phase 1 (needs token creation). Can run in parallel with Phase 3.
- **Phase 5 (US4 — Email)**: Depends on Phase 1 (needs token creation). Can run in parallel with Phase 3/4.
- **Phase 6 (US5 — Bulk Email)**: Depends on Phase 5 (extends single email flow)
- **Phase 7 (US6 — Token Mgmt)**: Depends on Phase 1. Can run in parallel with Phase 3-6.
- **Phase 8 (Polish)**: Depends on all desired phases being complete

### Parallel Opportunities

```
After Phase 1 (Setup):
  ├── Phase 2 (US1 — Form) ──→ Phase 3 (US2 — Change Log)
  ├── Phase 4 (US3 — QR Code) [T018, T019, T020 can run in parallel]
  ├── Phase 5 (US4 — Email) ──→ Phase 6 (US5 — Bulk Email)
  └── Phase 7 (US6 — Token Mgmt)
```

---

## Implementation Strategy

### MVP First (US1 + US2 only)

1. Complete Phase 1: Setup (schema, middleware, token functions)
2. Complete Phase 2: US1 — Public form with auto-apply
3. Complete Phase 3: US2 — Change log with revert
4. **STOP and VALIDATE**: Test end-to-end: token → form → submit → customer updated → change log visible → revert works
5. Deploy if ready — businesses can manually share links with debtors

### Incremental Delivery

1. US1+US2 → Core self-service flow works (MVP)
2. US3 → QR codes on invoices (passive distribution)
3. US4 → Email requests (active distribution)
4. US5 → Bulk email (efficiency)
5. US6 → Token management (admin convenience)

---

## Notes

- All Convex deploys (`npx convex deploy --yes`) must happen BEFORE `npm run build`
- Public form page has no sidebar/header — it's for external debtors
- Follow existing customer-form.tsx patterns for field layout and validation
- Use semantic design tokens throughout (no hardcoded colors)
- Rate limit: 5 submissions per token per 24h (checked in submitUpdate mutation)
- Token expiry: 30 days default
- QR code: gated by `invoiceSettings.enableDebtorSelfServiceQr` (default: true)
