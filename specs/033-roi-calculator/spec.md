# Feature Specification: ROI Calculator for Partner Prospects

**Feature Branch**: `033-roi-calculator`
**Created**: 2026-03-23
**Status**: Draft
**Input**: GitHub Issue #263 — ROI Calculator for partner prospects
**Labels**: enhancement, gtm

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Prospect Calculates ROI (Priority: P1)

A prospective customer visits the ROI calculator page (shared by a partner or found on the website) and enters basic business metrics to see how much time and money they could save by switching to Groot Finance. They see a clear before/after comparison and understand the value proposition immediately.

**Why this priority**: This is the core value of the tool — without the calculation, nothing else matters. A prospect who sees compelling savings numbers is far more likely to convert.

**Independent Test**: Can be fully tested by visiting the calculator URL, entering sample inputs, and verifying that time savings, cost savings, and payback period are displayed correctly.

**Acceptance Scenarios**:

1. **Given** a prospect visits the calculator page, **When** they enter purchase invoices (50/month), sales invoices (30/month), expense receipts (100/month), finance staff (3), and average monthly salary (MYR 4,000), **Then** the calculator displays estimated hours saved per month, annual cost savings, and payback period in a clear before/after format.
2. **Given** a prospect has entered all required inputs, **When** any input value changes, **Then** the results update immediately without page reload.
3. **Given** the calculator page loads, **When** no inputs have been entered, **Then** the calculator shows placeholder/default values or an empty state prompting the user to enter their numbers.
4. **Given** a prospect views results on a mobile device, **When** the screen width is below 768px, **Then** the layout adapts to single-column and remains fully usable.

---

### User Story 2 - Partner Shares Branded Calculator (Priority: P2)

A partner (reseller or referral) shares a calculator link with their partner code embedded in the URL. When the prospect opens the link, they see the partner's name/branding alongside the Groot Finance calculator, creating a co-branded experience.

**Why this priority**: Partner branding builds trust and incentivizes partners to share the tool. Without it, partners have less motivation to distribute the calculator.

**Independent Test**: Can be tested by appending a partner code to the calculator URL (e.g., `?partner=acme`) and verifying the partner name appears on the page.

**Acceptance Scenarios**:

1. **Given** a partner has a valid partner code, **When** a prospect opens the calculator URL with `?partner=<code>`, **Then** the partner's name is displayed on the calculator page (e.g., "Provided by Acme Consulting").
2. **Given** a prospect opens the calculator without a partner code, **When** the page loads, **Then** the calculator displays normally without any partner branding.
3. **Given** a prospect opens the calculator with an invalid partner code, **When** the page loads, **Then** the calculator displays normally without partner branding (graceful fallback, no error).

---

### User Story 3 - Prospect Shares Results (Priority: P3)

After seeing their ROI calculation, the prospect wants to share the results with a colleague or decision-maker. They can copy a shareable link that preserves all inputs and the selected currency, so the recipient sees the exact same calculation.

**Why this priority**: Sharing extends reach beyond the initial prospect — decision-makers often aren't the ones doing initial research. A shareable link is frictionless and requires no backend infrastructure.

**Independent Test**: Can be tested by completing a calculation, copying the share link, opening it in a new browser, and verifying the same inputs, currency, and results appear.

**Acceptance Scenarios**:

1. **Given** a prospect has completed a calculation, **When** they click "Share" or "Copy Link", **Then** a URL is generated that encodes the current inputs and currency selection, and copies to clipboard.
2. **Given** a prospect opens a shared link with encoded inputs, **When** the page loads, **Then** the calculator pre-fills with the shared values (including currency) and displays the corresponding results.

---

### Edge Cases

- What happens when a user enters 0 for all inputs? → Show a meaningful message (e.g., "Enter your business metrics to see potential savings").
- What happens when a user enters extremely large numbers (e.g., 999,999 invoices/month)? → Cap inputs at reasonable maximums or display results without error.
- What happens when a user enters non-numeric values? → Input fields should only accept numeric values (input validation).
- What happens when a user enters decimals for team size? → Round to nearest whole number or accept decimals for fractional team members.
- How does the calculator handle different currencies? → User selects currency from a dropdown (MYR, SGD, USD). The selected currency is used for the hourly cost input label and all output formatting. Currency selection is preserved in shared links.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The calculator MUST be accessible via a public URL without authentication.
- **FR-002**: The calculator MUST accept exactly 5 inputs: purchase invoices per month, sales invoices per month, expense receipts per month, number of finance/admin staff, and average monthly salary per staff member.
- **FR-003**: The number of finance/admin staff input represents the total headcount involved in finance tasks (not broken down by role), since SME staff typically handle multiple responsibilities.
- **FR-004**: The calculator MUST display three output metrics: estimated hours saved per month, estimated cost savings per year, and payback period.
- **FR-005**: The calculator MUST show a clear before/after comparison of the prospect's current state vs. using Groot Finance.
- **FR-006**: Results MUST update in real-time as the user modifies inputs (no submit button required for calculation).
- **FR-007**: The calculator MUST be fully responsive and usable on mobile devices (minimum 320px width).
- **FR-008**: The calculator MUST support partner branding via a URL parameter (e.g., `?partner=<code>`), displaying the partner's name on the page.
- **FR-009**: The calculator MUST gracefully handle missing or invalid partner codes by showing the default (unbranded) experience.
- **FR-010**: The calculator MUST provide a shareable link that encodes the current inputs so recipients see the same calculation.
- **FR-011**: All input fields MUST validate for numeric values and reasonable ranges.
- **FR-012**: The calculator MUST display formatted numbers (thousands separators, currency symbols) for readability.
- **FR-013**: The calculator MUST provide a currency selector dropdown with MYR, SGD, and USD options. The selected currency affects the hourly cost input label and all output formatting.
- **FR-014**: The selected currency MUST be included in shareable links so recipients see results in the same currency.
- **FR-015**: The calculator MUST display a "Get Started" call-to-action button that links to the Groot Finance sign-up page, visible after results are calculated.
- **FR-016**: When a valid partner code is present, the calculator MUST additionally display a "Talk to [Partner Name]" button that links to the partner's contact method (e.g., email or booking link, as configured per partner).

### Key Entities

- **Calculation Input**: The set of business metrics provided by the prospect (purchase invoices/month, sales invoices/month, expense receipts/month, number of finance/admin staff, average monthly salary). Not persisted — lives only in the URL and client state.
- **Calculation Result**: The computed output metrics (hours saved/month, cost savings/year, payback period) derived from the inputs using Groot Finance's productivity assumptions.
- **Partner**: An approved reseller or referral partner identified by a unique code, whose name and contact method (email or booking link) appear on the branded calculator.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor can complete a calculation within 60 seconds of landing on the page.
- **SC-002**: The calculator renders correctly and is fully functional on mobile devices (iOS Safari, Android Chrome).
- **SC-003**: Partners can share a branded calculator link that displays their name to 100% of recipients who open the link.
- **SC-004**: Shared result links accurately reproduce the original calculation for recipients.
- **SC-005**: At least 10% of calculator users engage with the share link feature (measured after launch).
- **SC-006**: The calculator loads within 2 seconds on a standard mobile connection.

## Clarifications

### Session 2026-03-23

- Q: Default currency for results display? → A: User-selectable dropdown with MYR, SGD, and USD options.
- Q: Post-calculation call-to-action? → A: "Get Started" button (links to sign-up page) always visible, plus conditional "Talk to [Partner Name]" button when a partner code is present.
- Q: Email results feature scope? → A: Drop email sending (FR-011). Shareable link (FR-010) already covers sharing with decision-makers. Simplifies build, eliminates public email abuse vector.
- Q: ROI calculation input parameters? → A: 5 inputs — purchase invoices/month, sales invoices/month, expense receipts/month, number of finance/admin staff (total, not per-role), average monthly salary per staff member. Document volumes drive time savings; staff count + salary drive cost savings. Monthly salary preferred over hourly rate (more intuitive for SE Asian SMEs).

## Assumptions

- **Productivity assumptions**: The calculation model uses Groot Finance's internal benchmarks for time savings per document type (e.g., ~8 min saved per purchase invoice, ~6 min per sales invoice, ~4 min per expense receipt). Hourly cost is derived internally from monthly salary / 176 working hours. These assumptions will be configurable by the product team without code changes.
- **Pricing**: The payback period calculation uses Groot Finance's standard pricing tier. If pricing changes, the calculator assumptions should be updatable.
- **Partner codes**: Partner codes are simple string identifiers. The initial version will use a lightweight lookup (static list or simple database query) to resolve partner codes to display names.
- **Currency**: Users select from MYR, SGD, or USD via a dropdown. MYR is the default selection (primary market). No exchange rate conversion — currency only affects display formatting and symbols.
- **No email sending**: Email results feature was dropped in favor of shareable links. No backend email infrastructure needed for this feature.
- **No login required**: The calculator is fully public — no authentication, no data persistence beyond the URL parameters.

## Out of Scope

- Google Sheets downloadable version (mentioned in issue as alternative — web calculator is the chosen approach).
- Custom partner logos or full co-branding (only partner name text in initial version).
- Email results delivery (shareable link covers this use case without backend complexity).
- Lead capture form or CRM integration.
- Multi-language support.
- A/B testing different calculator layouts.
- Detailed industry-specific calculations (single generic model for all prospects).
