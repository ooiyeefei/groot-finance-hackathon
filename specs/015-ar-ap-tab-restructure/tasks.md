# Tasks: AR/AP Two-Level Tab Restructure

**Input**: Design documents from `/specs/015-ar-ap-tab-restructure/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not included (UAT via Playwright MCP — no unit test framework in use)

**Organization**: Tasks grouped by user story. US1 is foundational and blocks all other stories.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Verify environment — no new dependencies or backend changes needed

- [x] T001 Verify branch is `015-ar-ap-tab-restructure` and all dependencies are installed (no new packages required)

---

## Phase 2: Foundational — US1: Two-Level Tab Navigation (Priority: P1) 🎯 MVP

**Goal**: Rewrite `invoices-tab-container.tsx` as a two-level AR/AP tab container with nested Radix UI Tabs and URL hash routing (`#ar-{subtab}`, `#ap-{subtab}` format)

**Independent Test**: Navigate to `/en/invoices`. Two top-level tabs (Account Receivables, Account Payables) appear. Clicking each shows different sub-tab groups. URL hash updates on tab change and persists across page refresh. Direct navigation to `#ap-vendors` pre-selects AP > Vendors.

### Implementation

- [x] T002 [US1] Rewrite `src/domains/invoices/components/invoices-tab-container.tsx` — replace flat 5-tab layout with two-level nested Radix UI Tabs (AR/AP top-level, 4 sub-tabs each). Implement hash parsing (`parseHash`), hash updating (`updateHash`), and hash-to-state mapping per data-model.md. Default to `#ar-dashboard` on empty/invalid hash. Use `React.lazy` + `Suspense` for all sub-tab content. Apply `overflow-x-auto` to sub-tab `TabsList` for mobile scrolling (FR-015). Include `forceMount` on `TabsContent` to preserve loaded state across switches.

**Checkpoint**: Two-level tab shell renders with placeholder/lazy-loaded content. Hash routing works for all 8 combinations. Tab switching is instant (client-side only).

---

## Phase 3: US2 — AR Section with Sub-tabs (Priority: P1)

**Goal**: Wire existing AR components (Sales Invoices, Debtors, Product Catalog) into AR sub-tabs. AR Dashboard is a placeholder until US4.

**Independent Test**: Click AR top-level tab. Four sub-tabs visible: Dashboard, Sales Invoices, Debtors, Product Catalog. Clicking Sales Invoices shows existing invoice list. Clicking Debtors shows debtor list with detail/statement. Clicking Catalog shows catalog item manager.

**Dependencies**: US1 (T002) must be complete

### Implementation

- [x] T003 [US2] Wire AR sub-tab content in `src/domains/invoices/components/invoices-tab-container.tsx` — lazy-import `SalesInvoiceList` from `@/domains/sales-invoices/components/sales-invoice-list`, `DebtorList` from `@/domains/sales-invoices/components/debtor-list`, `CatalogItemManager` from `@/domains/sales-invoices/components/catalog-item-manager`. Add placeholder `<div>` for AR Dashboard (replaced in US4). Verify each component renders correctly in its sub-tab.

**Checkpoint**: AR > Sales Invoices, AR > Debtors, AR > Product Catalog all load existing functionality identically to the previous flat-tab layout.

---

## Phase 4: US3 — AP Section with Sub-tabs (Priority: P1)

**Goal**: Wire existing AP components (Dashboard, Incoming Invoices, Vendors) into AP sub-tabs. Price Intelligence is a placeholder until US5.

**Independent Test**: Click AP top-level tab. Four sub-tabs visible: Dashboard, Incoming Invoices, Vendors, Price Intelligence. Dashboard shows AP analytics. Incoming Invoices shows document processing. Vendors shows vendor CRUD.

**Dependencies**: US1 (T002) must be complete. Can run in parallel with US2 if working on separate sub-tab sections.

### Implementation

- [x] T004 [US3] Wire AP sub-tab content in `src/domains/invoices/components/invoices-tab-container.tsx` — lazy-import `APDashboard` from `@/domains/payables/components/ap-dashboard`, `DocumentsContainer` from `@/domains/invoices/components/documents-container`, `VendorManager` from `@/domains/payables/components/vendor-manager`. Add placeholder `<div>` for Price Intelligence (replaced in US5). Verify each component renders correctly in its sub-tab.

**Checkpoint**: AP > Dashboard, AP > Incoming Invoices, AP > Vendors all load existing functionality. AP Dashboard shows same analytics as the current `/en/payables` page.

---

## Phase 5: US4 — AR Dashboard Analytics (Priority: P2)

**Goal**: Create AR Dashboard component showing receivables summary cards (Total Receivables, Overdue Amount, Due This Week, Due This Month) and debtor aging breakdown by bucket (Current, 1-30, 31-60, 61-90, 90+).

**Independent Test**: Click AR > Dashboard. Summary cards display with real data from `useAgingReport()`. Aging breakdown table shows per-bucket totals. Empty state shows zero values with messaging when no receivables exist.

**Dependencies**: US2 (T003) must be complete (AR sub-tabs wired with placeholder for dashboard)

### Implementation

- [x] T005 [US4] Create `src/domains/sales-invoices/components/ar-dashboard.tsx` — use `useAgingReport()` and `useDebtorList()` hooks from `src/domains/sales-invoices/hooks/use-debtor-management.ts`. Build summary cards: Total Receivables (`agingReport.summary.total`), Overdue Amount (sum of `days1to30 + days31to60 + days61to90 + days90plus`), Due This Week, Due This Month. Add aging breakdown table by bucket. Include empty state for zero receivables. Use semantic design tokens (`bg-card`, `text-foreground`) and `formatCurrency` from `@/lib/utils/format-number`. Follow AP Dashboard (`ap-dashboard.tsx`) patterns for card layout consistency.
- [x] T006 [US4] Replace AR Dashboard placeholder in `src/domains/invoices/components/invoices-tab-container.tsx` — update lazy import to load `ARDashboard` from `@/domains/sales-invoices/components/ar-dashboard` instead of placeholder div.

**Checkpoint**: AR > Dashboard shows real receivables data. Summary cards and aging table match data from the existing Aging Report view.

---

## Phase 6: US5 — Price Intelligence Tab (Priority: P2)

**Goal**: Create Price Intelligence component showing tracked items with latest prices, vendor associations, alert indicators, and cross-vendor price comparison.

**Independent Test**: Click AP > Price Intelligence. List of tracked items appears with prices and vendor names. Items with significant price increases show warning/alert indicators. Selecting an item shows cross-vendor comparison with cheapest highlighted. Empty state explains data comes from invoice processing.

**Dependencies**: US3 (T004) must be complete (AP sub-tabs wired with placeholder for price intelligence)

### Implementation

- [x] T007 [P] [US5] Create `src/domains/payables/components/price-intelligence.tsx` — consume Convex queries: `vendorPriceHistory.getVendorItems` (item list per vendor), `vendorPriceHistory.getCrossVendorComparison` (cross-vendor view), `vendorPriceHistory.getVendorPriceHistory` (trend data). Use alert severity from `src/domains/payables/lib/price-thresholds.ts` (`AlertLevel: none|info|warning|alert`) for visual indicators. Build item-centric list view with columns: Item Description, Latest Price, Vendor, Last Updated, Alert Status. Add expandable row or detail panel for cross-vendor comparison (highlight cheapest). Include empty state: "Price data is automatically captured from incoming invoices." Use semantic tokens and `formatCurrency`.
- [x] T008 [US5] Replace Price Intelligence placeholder in `src/domains/invoices/components/invoices-tab-container.tsx` — update lazy import to load `PriceIntelligence` from `@/domains/payables/components/price-intelligence` instead of placeholder div.

**Checkpoint**: AP > Price Intelligence shows real price data (if any exists). Alert indicators render correctly. Cross-vendor comparison works for items available from multiple vendors.

---

## Phase 7: US6 — Remove Standalone Payables Page and Sidebar Link (Priority: P1)

**Goal**: Remove the Payables sidebar link and redirect `/en/payables` to `/en/invoices#ap-dashboard`. Delete the now-unused `payables-tab-container.tsx`.

**Independent Test**: Sidebar shows no "Payables" link. Navigating to `/en/payables` redirects to `/en/invoices#ap-dashboard`. No broken imports or dead code.

**Dependencies**: US3 (T004) must be complete (AP content is accessible from the new container before removing old entry point)

### Implementation

- [x] T009 [P] [US6] Remove Payables sidebar link in `src/components/ui/sidebar.tsx` — remove the `{ name: 'Payables', href: localizedHref('/payables'), icon: Wallet }` entry from `financeGroup` items array. Remove `Wallet` from the lucide-react import if no longer used elsewhere.
- [x] T010 [P] [US6] Redirect payables page in `src/app/[locale]/payables/page.tsx` — replace current component with Next.js server-side `redirect()` to `/{locale}/invoices#ap-dashboard`. Remove all existing imports and component logic.
- [x] T011 [US6] Delete `src/domains/payables/components/payables-tab-container.tsx` — this file is fully replaced by the unified `invoices-tab-container.tsx`. Verify no remaining imports reference it.

**Checkpoint**: Sidebar has no Payables link. `/en/payables` URL redirects to `/en/invoices#ap-dashboard`. No dead code remains.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Build validation, edge case handling, final cleanup

- [x] T012 Verify edge cases in `src/domains/invoices/components/invoices-tab-container.tsx` — invalid hash falls back to `ar-dashboard`, rapid AR/AP switching preserves loaded content, no hash defaults to `ar-dashboard`
- [x] T013 Run `npm run build` — must pass with zero errors (SC-007). Fix any TypeScript or import errors.
- [x] T014 Verify all 8 hash deep links work: `#ar-dashboard`, `#ar-sales`, `#ar-debtors`, `#ar-catalog`, `#ap-dashboard`, `#ap-incoming`, `#ap-vendors`, `#ap-prices`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational US1 (Phase 2)**: Depends on Setup — **BLOCKS all user stories**
- **US2 (Phase 3)**: Depends on US1 (T002)
- **US3 (Phase 4)**: Depends on US1 (T002) — can run in parallel with US2
- **US4 (Phase 5)**: Depends on US2 (T003) — AR sub-tabs must be wired
- **US5 (Phase 6)**: Depends on US3 (T004) — AP sub-tabs must be wired
- **US6 (Phase 7)**: Depends on US3 (T004) — AP content must be in new container before removing old page
- **Polish (Phase 8)**: Depends on all story phases complete

### User Story Dependencies

```
US1 (Tab Container) ──┬──► US2 (AR Sub-tabs) ──► US4 (AR Dashboard)
                      │
                      └──► US3 (AP Sub-tabs) ──┬──► US5 (Price Intelligence)
                                                │
                                                └──► US6 (Remove Payables)
```

### Within Each User Story

- Container shell before content wiring
- Existing component wiring before new component creation
- New component creation before wiring into container
- All wiring before cleanup/deletion

### Parallel Opportunities

- **US2 + US3**: Can run in parallel after US1 (different sub-tab sections of same file — coordinate edits)
- **US4 + US5**: Can run in parallel (different files: `ar-dashboard.tsx` vs `price-intelligence.tsx`)
- **T009 + T010**: Parallel (different files: `sidebar.tsx` vs `payables/page.tsx`)
- **T005 (new component) + T007 (new component)**: Fully parallel (separate files, no dependencies)

---

## Parallel Example: US4 + US5 (New Components)

```bash
# These can run simultaneously since they're in different files:
Task: "Create ar-dashboard.tsx in src/domains/sales-invoices/components/"
Task: "Create price-intelligence.tsx in src/domains/payables/components/"
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US3 + US6)

1. Complete T001: Setup verification
2. Complete T002: Two-level tab container (US1) — **this is the core**
3. Complete T003 + T004: Wire all existing components into AR/AP sub-tabs (US2 + US3)
4. Complete T009 + T010 + T011: Remove old Payables page (US6)
5. **STOP and VALIDATE**: All existing functionality works in new two-level layout
6. Run `npm run build` — must pass

### Incremental P2 Delivery

7. Complete T005 + T006: AR Dashboard (US4)
8. Complete T007 + T008: Price Intelligence (US5)
9. Complete T012–T014: Polish and edge cases
10. Final `npm run build` validation

### Single-Developer Sequential Order

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014

---

## Notes

- **No backend changes**: Zero Convex queries, mutations, or schema changes. No `npx convex deploy` needed.
- **No new packages**: All dependencies (`@radix-ui/react-tabs`, `lucide-react`, etc.) already installed.
- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 is truly foundational — every other story depends on the two-level container existing
- The AR Dashboard (US4) and Price Intelligence (US5) are the only net-new components
- All other work is reorganizing existing components into the new tab structure
- Commit after each phase checkpoint for clean git history
