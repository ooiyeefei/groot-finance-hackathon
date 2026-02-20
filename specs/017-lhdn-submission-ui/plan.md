# Implementation Plan: LHDN MyInvois Submission UI

**Branch**: `017-lhdn-submission-ui` | **Date**: 2026-02-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/017-lhdn-submission-ui/spec.md`

## Summary

Build the frontend UI layer for LHDN MyInvois e-invoice submission tracking. This feature adds LHDN status badges to the invoice list, a submission flow with pre-flight validation on the invoice detail page, validation error display for rejected invoices, a visual submission timeline, and QR code generation for verified invoices (both web and PDF). All schema fields are already deployed. The actual LHDN API integration (#75) is separate — this feature provides the UI surface and a stub mutation that sets status to "pending".

## Technical Context

**Language/Version**: TypeScript 5.9.3
**Primary Dependencies**: Next.js 15.5.7, React 19.1.2, Convex 1.31.3, Clerk 6.30.0, @react-pdf/renderer, qrcode (new)
**Storage**: Convex (document database with real-time sync) — all fields already deployed
**Testing**: Manual testing via dev environment (UI feature); build verification via `npm run build`
**Target Platform**: Web (responsive desktop + mobile)
**Project Type**: Web application (Next.js + Convex)
**Performance Goals**: SC-001: LHDN status visible within 2 seconds of list load; SC-002: Submit in ≤3 clicks
**Constraints**: Must follow existing design system (semantic tokens, badge color pattern); must be responsive
**Scale/Scope**: 5 new components, 2 new Convex mutations, modifications to 4 existing files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is a template placeholder (not project-customized). Gate passes trivially — no violations to check against. Project follows CLAUDE.md rules:
- [x] Design system semantic tokens (no hardcoded colors)
- [x] Button styling rules (primary for actions, destructive for delete)
- [x] Prefer modification over creation (modifying existing list, detail, PDF components)
- [x] Build-fix loop required (`npm run build` must pass)
- [x] Convex deploy required after mutation changes (`npx convex deploy --yes`)

**Post-Phase 1 re-check**: Design maintains all constitution constraints. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/017-lhdn-submission-ui/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: codebase research findings
├── data-model.md        # Phase 1: data model extensions
├── quickstart.md        # Phase 1: dev setup guide
├── contracts/
│   ├── convex-mutations.md  # Convex mutation contracts
│   └── components.md        # Component interface contracts
└── tasks.md             # Phase 2: task breakdown (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/domains/sales-invoices/
├── components/
│   ├── sales-invoice-list.tsx          # MODIFY: Add LHDN badge column
│   ├── invoice-status-badge.tsx        # REFERENCE: Pattern for badge
│   ├── invoice-templates/
│   │   └── pdf-document.tsx            # MODIFY: Add QR code section
│   ├── lhdn-status-badge.tsx           # NEW: LHDN status badge
│   ├── lhdn-submit-button.tsx          # NEW: Submit/resubmit with confirmation
│   ├── lhdn-validation-errors.tsx      # NEW: Error display panel
│   ├── lhdn-submission-timeline.tsx    # NEW: Visual lifecycle timeline
│   ├── lhdn-qr-code.tsx               # NEW: QR code display
│   └── lhdn-detail-section.tsx         # NEW: Orchestrator for detail page
├── hooks/
│   └── use-sales-invoice-mutations.ts  # MODIFY: Add submitToLhdn, resubmitToLhdn
├── types/
│   └── index.ts                        # MODIFY: Add LHDN fields to SalesInvoice
└── ...

src/app/[locale]/sales-invoices/
└── [id]/
    └── page.tsx                        # MODIFY: Integrate LhdnDetailSection

convex/functions/
└── salesInvoices.ts                    # MODIFY: Add submitToLhdn, resubmitToLhdn mutations
```

**Structure Decision**: Follows existing domain-driven structure under `src/domains/sales-invoices/`. New LHDN components are co-located with existing invoice components. No new directories needed beyond what exists.

## Implementation Phases

### Phase A: Foundation (Types + Badge + Mutation)

**Goal**: Establish the data layer and most basic visual component.

**Tasks**:
1. **Extend SalesInvoice interface** — Add LHDN fields to `types/index.ts`, import `LhdnStatus` and `EinvoiceType` from constants
2. **Create LhdnStatusBadge** — New component following `InvoiceStatusBadge` pattern with 5 status → color mappings
3. **Add Convex mutations** — `submitToLhdn` and `resubmitToLhdn` in `convex/functions/salesInvoices.ts` with role check + pre-flight validation
4. **Add mutation hooks** — Extend `use-sales-invoice-mutations.ts` with `submitToLhdn()` and `resubmitToLhdn()` wrappers

**Dependency**: None (can start immediately)
**Validation**: `npm run build` passes; badge renders in isolation

### Phase B: Invoice List Integration

**Goal**: LHDN status visible at a glance on the invoices list.

**Tasks**:
5. **Add LHDN badge to desktop table** — New `<th>` column header "e-Invoice" and `<td>` with `<LhdnStatusBadge>` in `sales-invoice-list.tsx`
6. **Add LHDN badge to mobile cards** — Add badge below the existing status badge in the mobile card layout

**Dependency**: Phase A (badge component exists)
**Validation**: List shows correct badges for invoices with various `lhdnStatus` values; no badge for invoices without

### Phase C: Submission Flow (Detail Page)

**Goal**: Users can submit invoices to LHDN from the detail page.

**Tasks**:
7. **Create LhdnSubmitButton** — Confirmation card, loading state, pre-flight checks (business config, customer TIN), role gating
8. **Create LhdnValidationErrors** — Error list panel for invalid invoices with code/message/target display
9. **Create LhdnSubmissionTimeline** — Vertical timeline with status stages and timestamps
10. **Create LhdnDetailSection** — Orchestrator that conditionally renders submit button, errors, timeline, and document IDs
11. **Integrate into detail page** — Add `<LhdnDetailSection>` to `src/app/[locale]/sales-invoices/[id]/page.tsx`

**Dependency**: Phase A (mutations + types), partially Phase B (badge reused in timeline)
**Validation**: Full submit flow works: button shows for eligible invoices, confirmation dialog, loading state, status update on success, error display for invalid invoices, role restriction enforced

### Phase D: QR Code (Web + PDF)

**Goal**: Validated invoices show a verification QR code.

**Tasks**:
12. **Install qrcode library** — `npm install qrcode @types/qrcode`
13. **Create LhdnQrCode** — Web component + `toDataURL()` export for PDF
14. **Add QR code to LhdnDetailSection** — Render when `lhdnLongId` exists
15. **Add QR code to PDF template** — New section in `pdf-document.tsx` for LHDN verification QR code (separate from payment QR codes)

**Dependency**: Phase C (detail section exists), qrcode library installed
**Validation**: QR code renders on web for invoices with `lhdnLongId`; QR code appears in generated PDF; scanning QR opens correct LHDN URL

### Phase E: Build & Deploy

**Goal**: Everything compiles and deploys cleanly.

**Tasks**:
16. **Build verification** — `npm run build` must pass with zero errors
17. **Convex deploy** — `npx convex deploy --yes` for new mutations
18. **Manual smoke test** — Walk through all 5 user stories in dev environment

**Dependency**: All prior phases
**Validation**: Clean build, successful Convex deploy, all user stories manually verified

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| #206 (business fields UI) not merged yet | Submit button always shows "missing config" warning | Use Convex dashboard to seed business LHDN fields for testing; submit flow works regardless |
| LHDN API integration (#75) not started | Mutation sets "pending" but never progresses | Acceptable — this is the expected state; mutation is the contract that #75 will fulfill |
| QR code library adds bundle size | Minimal impact on load time | `qrcode` is ~30KB minified; consider dynamic import if needed |
| @react-pdf/renderer QR code rendering | Image from data URL may not render in all PDF viewers | Test with multiple viewers; `toDataURL('image/png')` is widely compatible |

## Complexity Tracking

No constitution violations to justify. Feature follows existing patterns throughout.
