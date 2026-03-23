# Research: ROI Calculator

## Decision 1: Page Architecture
- **Decision**: Pure client-side React page at `/roi-calculator`, no Convex/backend dependency
- **Rationale**: ROI calculation is deterministic math — no data fetching needed. Zero bandwidth cost. Instant UX.
- **Alternatives**: Server-side calculation (unnecessary network round-trip), Convex action (wastes bandwidth quota)

## Decision 2: Partner Data Storage
- **Decision**: Static TypeScript config file (`src/lib/roi-calculator/partners.ts`)
- **Rationale**: Partner list is small (<50), changes rarely, and doesn't need real-time sync. Adding a partner = edit + redeploy.
- **Alternatives**: Convex table (overkill, bandwidth cost), API endpoint (unnecessary complexity)

## Decision 3: Shareable Link Mechanism
- **Decision**: URL query parameters encoding all inputs + currency
- **Rationale**: No backend state needed. Links are self-contained and never expire. Simple to implement with `URLSearchParams`.
- **Alternatives**: Short URLs with stored state (requires backend), Base64-encoded hash (harder to debug)

## Decision 4: Page Styling Approach
- **Decision**: Reuse existing design system (card, input, select, button) with Groot Finance branding
- **Rationale**: Consistent look with the product. No new UI library needed.
- **Alternatives**: Standalone landing page template (inconsistent branding), Tailwind UI (cost)

## Decision 5: Currency Formatting
- **Decision**: Use existing `formatCurrency()` from `src/lib/utils/format-number.ts`
- **Rationale**: Already supports MYR, SGD, USD. Tested and in production.
- **Alternatives**: Intl.NumberFormat directly (reinventing existing utility)
