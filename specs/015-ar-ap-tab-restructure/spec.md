# Feature Specification: AR/AP Two-Level Tab Restructure

**Feature Branch**: `015-ar-ap-tab-restructure`
**Created**: 2026-02-15
**Status**: Draft
**Input**: Restructure the Invoices page into a two-level tab architecture with Account Receivables (AR) and Account Payables (AP) as top-level tabs. Move relevant sub-features under each section with their own analytics dashboards. Remove the standalone Payables page.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Two-Level Tab Navigation (Priority: P1)

As a finance admin, I want the Invoices page to be organized into Account Receivables and Account Payables top-level tabs, so that I can quickly switch between AR and AP workflows without navigating to separate pages.

**Why this priority**: This is the foundational restructure that all other stories depend on. Without the two-level tab navigation, nothing else works. It delivers immediate value by organizing the currently mixed AR/AP content into a clear, accounting-standard structure.

**Independent Test**: Navigate to the Invoices page. Two top-level tabs (Account Receivables, Account Payables) appear. Clicking each shows different sub-tab groups. URL hash updates and persists across page refreshes.

**Acceptance Scenarios**:

1. **Given** the user is on the Invoices page, **When** the page loads, **Then** two top-level tabs are visible: "Account Receivables" and "Account Payables", with AR selected by default.
2. **Given** the user is on the AR tab, **When** they click "Account Payables", **Then** the sub-tabs switch to AP-specific content and the URL hash updates accordingly.
3. **Given** the user navigates directly to a URL with an AP hash (e.g., `/en/invoices#ap-vendors`), **When** the page loads, **Then** the AP top-level tab and Vendors sub-tab are pre-selected.
4. **Given** the user is on the AP Vendors sub-tab, **When** they refresh the page, **Then** the same AP > Vendors view is restored from the URL hash.

---

### User Story 2 — AR Section with Sub-tabs (Priority: P1)

As a finance admin, I want the Account Receivables section to contain a Dashboard, Sales Invoices, Debtors, and Product Catalog as sub-tabs, so that all outbound/revenue-related workflows are grouped together.

**Why this priority**: AR sub-tabs are a reorganization of existing components that currently live under the Invoices page. No new functionality — just moving Sales Invoices, Debtors, and Catalog under the AR umbrella and adding an AR Dashboard. This is critical because it establishes the AR half of the structure.

**Independent Test**: Select the AR top-level tab. Four sub-tabs appear: Dashboard, Sales Invoices, Debtors, Product Catalog. Each sub-tab loads its existing content correctly.

**Acceptance Scenarios**:

1. **Given** the user selects the AR top-level tab, **When** they see the sub-tabs, **Then** four sub-tabs are visible: "Dashboard", "Sales Invoices", "Debtors", "Product Catalog".
2. **Given** the user clicks "Sales Invoices" under AR, **When** the content loads, **Then** the existing sales invoice list and generation functionality works identically to before.
3. **Given** the user clicks "Debtors" under AR, **When** the content loads, **Then** the existing debtor list, detail view, and statement functionality works identically to before.
4. **Given** the user clicks "Product Catalog" under AR, **When** the content loads, **Then** the existing catalog item manager works identically to before.

---

### User Story 3 — AP Section with Sub-tabs (Priority: P1)

As a finance admin, I want the Account Payables section to contain a Dashboard, Incoming Invoices, Vendors, and Price Intelligence as sub-tabs, so that all inbound/expense-related workflows are grouped together.

**Why this priority**: This moves Incoming Invoices (currently misplaced under the general Invoices tab) and Vendors (currently under a separate Payables page) into their logical AP home. The AP Dashboard (currently on `/en/payables`) also moves here. This completes the AR/AP separation.

**Independent Test**: Select the AP top-level tab. Four sub-tabs appear: Dashboard, Incoming Invoices, Vendors, Price Intelligence. Each sub-tab loads its content correctly.

**Acceptance Scenarios**:

1. **Given** the user selects the AP top-level tab, **When** they see the sub-tabs, **Then** four sub-tabs are visible: "Dashboard", "Incoming Invoices", "Vendors", "Price Intelligence".
2. **Given** the user clicks "Dashboard" under AP, **When** the content loads, **Then** the AP analytics (summary cards, vendor aging, upcoming payments, spend analytics) display correctly — identical to the current `/en/payables` dashboard.
3. **Given** the user clicks "Incoming Invoices" under AP, **When** the content loads, **Then** the existing invoice upload, OCR/DocAI processing, and document list works identically to before.
4. **Given** the user clicks "Vendors" under AP, **When** the content loads, **Then** the vendor list, search, filter, create, edit, deactivate/reactivate all work identically to before.

---

### User Story 4 — AR Dashboard Analytics (Priority: P2)

As a finance admin, I want an AR Dashboard sub-tab that shows receivables analytics, so that I can quickly assess the health of my accounts receivable without drilling into individual debtors.

**Why this priority**: The AP side already has a dashboard (summary cards, aging, spend analytics). The AR side needs equivalent analytics for parity. However, most AR analytics already exist in the Aging Report component — this story is about surfacing key AR metrics in a dashboard format.

**Independent Test**: Click AR > Dashboard. Summary cards show total receivables, overdue amount, and collection metrics. An aging summary is visible.

**Acceptance Scenarios**:

1. **Given** the user is on AR > Dashboard, **When** the data loads, **Then** summary cards display: Total Receivables, Overdue Amount, Due This Week, Due This Month.
2. **Given** the user is on AR > Dashboard, **When** they view the aging summary, **Then** a debtor aging breakdown by bucket (Current, 1-30, 31-60, 61-90, 90+) is visible.
3. **Given** there are no outstanding receivables, **When** the user views AR Dashboard, **Then** summary cards show zero values with appropriate empty state messaging.

---

### User Story 5 — Price Intelligence Tab (Priority: P2)

As a finance admin, I want a Price Intelligence sub-tab under AP that shows vendor price history, price change alerts, and cross-vendor price comparisons, so that I can make informed purchasing decisions and catch price anomalies.

**Why this priority**: The backend for price intelligence is fully built (price history tracking, anomaly detection, cross-vendor comparison). This story adds the UI to surface that data. It's P2 because the core AR/AP restructure (P1) must work first.

**Independent Test**: Click AP > Price Intelligence. A list of recent price observations appears with alert indicators. Users can compare prices across vendors for the same item.

**Acceptance Scenarios**:

1. **Given** the user is on AP > Price Intelligence, **When** price data exists, **Then** a list of tracked items with their latest prices and vendor associations is displayed.
2. **Given** an item's price has increased significantly, **When** the user views the price list, **Then** a visual alert indicator (warning/alert severity) highlights the anomaly.
3. **Given** the user selects an item, **When** they view cross-vendor comparison, **Then** all vendors offering that item are listed with their prices, and the cheapest option is highlighted.
4. **Given** no price history data exists, **When** the user views Price Intelligence, **Then** an empty state explains that price data is automatically captured from incoming invoices.

---

### User Story 6 — Remove Standalone Payables Page and Sidebar Link (Priority: P1)

As a finance admin, I want the standalone Payables page and sidebar link to be removed since all AP content now lives under the Invoices page's AP tab, so that navigation is not confusing with duplicate entry points.

**Why this priority**: Without removing the old routes and sidebar link, users would have two ways to reach AP content, causing confusion. This is P1 because it's part of the core restructure — the old page must be removed when the new structure goes live.

**Independent Test**: Click "Payables" in the sidebar — link should not exist. Navigate to `/en/payables` directly — should redirect to `/en/invoices#ap` or return 404.

**Acceptance Scenarios**:

1. **Given** the user is logged in as finance admin, **When** they view the sidebar, **Then** there is no "Payables" link — only "Invoices" (which now contains both AR and AP).
2. **Given** the user navigates directly to `/en/payables`, **When** the page loads, **Then** they are redirected to `/en/invoices#ap-dashboard`.
3. **Given** any bookmarks or external links point to `/en/payables`, **When** followed, **Then** the redirect preserves the user's intent by landing on the AP section.

---

### Edge Cases

- What happens when the URL hash contains an invalid tab combination (e.g., `#ap-sales-invoices` which doesn't exist under AP)? System falls back to the default sub-tab for that top-level tab.
- What happens when a non-admin user accesses the page? Existing role-based redirect to `/expense-claims` continues to work.
- What happens on mobile where horizontal tab space is limited? Sub-tabs should be horizontally scrollable.
- What happens when switching between AR and AP rapidly? Previously loaded tab content should be preserved (not re-fetched) within the same session.
- What happens if the user navigates to `/en/invoices` with no hash? Defaults to AR > Dashboard (the first sub-tab of the first top-level tab).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display two top-level tabs on the Invoices page: "Account Receivables" and "Account Payables".
- **FR-002**: System MUST display context-appropriate sub-tabs when each top-level tab is selected.
- **FR-003**: AR sub-tabs MUST include: Dashboard, Sales Invoices, Debtors, Product Catalog.
- **FR-004**: AP sub-tabs MUST include: Dashboard, Incoming Invoices, Vendors, Price Intelligence.
- **FR-005**: System MUST persist the active top-level tab and sub-tab selection in the URL hash.
- **FR-006**: System MUST restore the correct tab state when navigating to a URL with a hash (deep linking).
- **FR-007**: All existing functionality (invoice upload, OCR, sales invoice generation, debtor management, vendor CRUD, AP analytics) MUST work identically after the restructure.
- **FR-008**: The standalone `/en/payables` route MUST redirect to `/en/invoices#ap-dashboard`.
- **FR-009**: The "Payables" sidebar navigation link MUST be removed.
- **FR-010**: The AR Dashboard MUST display summary cards for total receivables, overdue amount, amounts due this week and this month.
- **FR-011**: The AR Dashboard MUST display a debtor aging breakdown by time bucket.
- **FR-012**: The Price Intelligence tab MUST display tracked items with latest prices, vendor associations, and price change alert indicators.
- **FR-013**: The Price Intelligence tab MUST support cross-vendor price comparison for individual items.
- **FR-014**: Sub-tab content MUST be lazy-loaded (loaded only when the sub-tab is first selected) to maintain page performance.
- **FR-015**: On mobile viewports, sub-tabs MUST be horizontally scrollable when they exceed the available width.

### Key Entities

- **Top-Level Tab**: Represents an accounting domain (AR or AP). Contains a set of sub-tabs relevant to that domain.
- **Sub-Tab**: Represents a specific workflow or view within a domain (e.g., Dashboard, Sales Invoices, Vendors). Each loads a dedicated component.
- **Price Observation**: A recorded unit price for a specific item from a specific vendor, captured automatically during invoice processing. Has attributes: item description, unit price, vendor, date, confirmation status, alert severity.
- **Price Alert**: A computed indicator when an item's price deviates significantly from historical norms. Severity levels: none, info, warning, alert.

## Assumptions

- The sidebar link text remains "Invoices" (no rename at this time).
- The page header title updates to reflect the selected section (e.g., "Account Receivables" or "Account Payables").
- AR > Dashboard is a new component that leverages existing debtor aging data (from the AR Aging Report) and outstanding invoice data.
- Price Intelligence UI is a new component that consumes existing backend queries (`detectPriceChanges`, `getCrossVendorComparison`, `getVendorPriceHistory`, `getItemPriceHistory`).
- The existing AR Aging Report component remains accessible under AR as part of the Dashboard or as a link/export from the Dashboard — it is not a separate sub-tab to avoid duplication with Dashboard analytics.
- Default landing: AR > Dashboard (first top-level, first sub-tab).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can switch between AR and AP sections in under 1 second (client-side tab switch, no page reload).
- **SC-002**: All existing workflows (invoice upload, OCR, sales invoice generation, debtor management, vendor CRUD, payment recording) function identically after restructure — zero regression.
- **SC-003**: URL deep linking works for all 8 sub-tabs (4 AR + 4 AP) — navigating directly to any hash loads the correct view.
- **SC-004**: The number of sidebar navigation items for finance admins decreases by 1 (Payables link removed), reducing navigation complexity.
- **SC-005**: Finance admins can view AR and AP analytics dashboards without navigating to separate pages — both are accessible within 2 clicks from the sidebar.
- **SC-006**: Price anomalies are surfaced visually in the Price Intelligence tab, enabling users to identify cost increases without manual comparison.
- **SC-007**: Application build succeeds with no errors after restructure.
