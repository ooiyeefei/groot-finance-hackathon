# Feature Specification: UX/UI Theme Consistency & Layout Shift Prevention

**Feature Branch**: `005-uiux-theme-cls`
**Created**: 2026-01-07
**Status**: Draft
**Input**: GitHub Issue #114 - UX/UI Theme Inconsistency & Layout Shift
**Priority**: P0 (Pre-Launch Critical)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent Visual Experience Across Themes (Priority: P1)

As a user, I want the application to look visually consistent and professional in both light and dark modes, so that I can use my preferred theme without encountering visual glitches, unreadable text, or broken layouts.

**Why this priority**: Theme consistency directly impacts user trust and professionalism perception. Visual bugs in financial software undermine credibility - users expect polished, cohesive UI in tools handling their business finances.

**Independent Test**: Can be fully tested by switching between light and dark themes on any page and verifying all text is readable, backgrounds are appropriate, and no visual anomalies appear.

**Acceptance Scenarios**:

1. **Given** a user is on the expense claims dashboard in light mode, **When** they switch to dark mode, **Then** all text remains readable (proper contrast), backgrounds adapt appropriately, and no elements appear broken or miscolored.

2. **Given** a user views the analytics dashboard in dark mode, **When** they examine charts, cards, and metrics, **Then** all elements use consistent styling that matches the dark theme aesthetic without bright/jarring elements.

3. **Given** a user opens any modal or dropdown menu, **When** viewing in either theme, **Then** the component's colors match the overall theme (no white modals in dark mode, no dark dropdowns in light mode).

---

### User Story 2 - Stable Page Layout During Loading (Priority: P2)

As a user, I want pages to maintain stable layouts while content loads, so that I don't experience jarring visual shifts that make the interface feel unstable or cause me to accidentally click wrong elements.

**Why this priority**: Cumulative Layout Shift (CLS) directly impacts usability and is a Core Web Vital metric that affects both user experience and SEO. Shifting layouts can cause users to click wrong buttons or lose their place while reading.

**Independent Test**: Can be fully tested by loading any major page (dashboard, expense list, invoices) and observing that the layout structure appears immediately without content jumping around as data loads.

**Acceptance Scenarios**:

1. **Given** a user navigates to the financial dashboard, **When** the page is loading, **Then** placeholder elements (skeletons) occupy the same space as final content, preventing any visible layout shift.

2. **Given** a user views the expense claims list while data is fetching, **When** the data finishes loading, **Then** content replaces placeholders without changing the page layout or scroll position.

3. **Given** a user opens the invoice processing page, **When** document previews and transaction details load, **Then** the final layout matches the loading state layout with no visual jumps.

---

### User Story 3 - Shared UI Component Consistency (Priority: P1)

As a user navigating between different sections of the app, I want buttons, badges, cards, and other common elements to look and behave consistently, so that I can develop reliable expectations for how the interface works.

**Why this priority**: Shared UI components appear throughout the entire application. Fixing them once provides maximum impact across all features and establishes the foundation for consistent domain-specific fixes.

**Independent Test**: Can be fully tested by using shared components (buttons, badges, cards) across multiple pages and verifying they appear identical in both themes.

**Acceptance Scenarios**:

1. **Given** a user views action buttons across different pages (expense claims, invoices, settings), **When** comparing them in the same theme, **Then** all primary buttons have identical styling, all secondary buttons have identical styling, etc.

2. **Given** a user sees status badges throughout the app (approved, pending, rejected), **When** viewing them in light mode and dark mode, **Then** badges use consistent color patterns that maintain readability and visual hierarchy in both themes.

3. **Given** a user interacts with cards across the app, **When** viewing nested content (cards within cards), **Then** proper visual elevation is maintained through consistent background layering.

---

### User Story 4 - Domain-Specific Page Polish (Priority: P2)

As a user working in specific feature areas (expense claims, analytics, account settings), I want those pages to look polished and consistent with the overall design system, so that the entire application feels like a cohesive product.

**Why this priority**: After shared components are fixed, domain-specific components need alignment. These are the actual pages users interact with daily - inconsistencies here create the perception of an unfinished product.

**Independent Test**: Can be fully tested by navigating through each domain's primary pages and verifying no hardcoded colors break the theme.

**Acceptance Scenarios**:

1. **Given** a user is on the expense claims management page, **When** viewing in either theme, **Then** all form fields, status indicators, approval buttons, and expense cards follow the semantic design system.

2. **Given** a user views the analytics dashboard, **When** examining financial metrics and charts, **Then** all visual elements adapt appropriately to the current theme without hardcoded colors.

3. **Given** a user configures business settings, **When** viewing category management and team settings, **Then** all configuration UI elements use semantic tokens for proper theme adaptation.

---

### Edge Cases

- What happens when a component uses a mix of semantic tokens and hardcoded colors? Each hardcoded pattern should be individually converted.
- How does the system handle rapid theme switching while content is loading? Theme changes should apply immediately to skeletons as well as loaded content.
- What if a skeleton loader has different dimensions than final content due to dynamic data? Skeleton heights should match typical content heights; dynamic overflow is acceptable.
- How do third-party components or embedded content behave with theme changes? Document as known exceptions if they cannot be styled.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST use semantic design tokens (bg-card, text-foreground, border-border) instead of hardcoded Tailwind color classes (bg-gray-700, text-white, border-gray-600) across all UI components.

- **FR-002**: System MUST provide skeleton loaders that match the approximate dimensions of final content for all major loading states (dashboards, lists, modals).

- **FR-003**: Shared UI components (Button, Badge, Card, ActionButton, RoleBadge, Sidebar) MUST follow the Layer 1-2-3 semantic design system defined in the component documentation.

- **FR-004**: Badge components MUST use the light/dark mode pattern: `bg-{color}-500/10 text-{color}-600 dark:text-{color}-400 border border-{color}-500/30`.

- **FR-005**: System MUST maintain WCAG AA compliant contrast ratios (4.5:1 minimum) in both light and dark themes.

- **FR-006**: All domain components (expense-claims, analytics, account-management) MUST be converted from hardcoded colors to semantic tokens.

- **FR-007**: Card components MUST follow proper elevation hierarchy: `bg-background` → `bg-surface` → `bg-card` → `bg-muted` for nested content.

- **FR-008**: System MUST display placeholder content immediately upon page load for data-dependent sections to prevent layout shift.

### Key Entities

- **Semantic Token**: A CSS variable (e.g., --foreground, --background, --card) that maps to different color values based on the active theme, enabling automatic light/dark mode adaptation.

- **Skeleton Loader**: A placeholder UI element that mimics the shape and size of content that will appear once loaded, preventing cumulative layout shift.

- **Component Variant**: A pre-defined styling configuration (via CVA - Class Variance Authority) that encapsulates semantic tokens for consistent component appearance.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 80+ identified components with hardcoded colors are converted to semantic tokens (0 hardcoded color patterns remain in scanned files).

- **SC-002**: Lighthouse CLS score is below 0.1 (Good rating) on all core pages (dashboard, expense claims, invoices, settings).

- **SC-003**: Manual theme switching test passes on 100% of pages - no unreadable text, miscolored backgrounds, or broken visual elements in either theme.

- **SC-004**: All 5 shared UI components (Badge, Button, ActionButton, RoleBadge, Sidebar notification badge) pass visual consistency check in both themes.

- **SC-005**: All major loading states (identified 9 components) display skeleton placeholders that match final content dimensions.

- **SC-006**: First Contentful Paint (FCP) remains under 1.8 seconds after skeleton loader implementation.

## Assumptions

- The existing semantic token system in `globals.css` provides all necessary color variables for the conversion.
- The Layer 1-2-3 design system documented in `src/components/ui/CLAUDE.md` is the authoritative reference for component styling.
- Third-party components (if any) that cannot use semantic tokens will be documented as exceptions.
- The fix can be applied incrementally across multiple PRs without breaking functionality.

## Scope Boundaries

### In Scope

- Converting hardcoded Tailwind colors to semantic tokens in all identified files
- Adding skeleton loaders for major loading states
- Fixing shared UI components (highest impact)
- Fixing expense-claims domain components
- Fixing analytics domain components
- Fixing account-management domain components
- Testing light/dark mode compatibility
- Lighthouse CLS validation

### Out of Scope

- Redesigning the overall visual language or creating new design tokens
- Performance optimization beyond CLS prevention
- Adding new UI components or features
- Mobile-specific responsive design changes (unless directly related to CLS)
- Accessibility improvements beyond contrast ratios (e.g., screen reader support)

## Dependencies

- Access to `src/app/globals.css` semantic token definitions
- Design system documentation in `src/components/ui/CLAUDE.md`
- Existing Skeleton component (used in `accounting-entries-skeleton.tsx`)
- Tailwind CSS configuration for custom classes
