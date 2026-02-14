# Implementation Plan: Stripe Product Catalog Sync

**Branch**: `014-stripe-catalog-sync` | **Date**: 2026-02-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-stripe-catalog-sync/spec.md`

## Summary

Enable FinanSEAL businesses to connect their Stripe account and sync their product catalog into the existing catalog system. The sync is one-way (Stripe → FinanSEAL), triggered manually, and uses Convex actions to call the Stripe Node.js SDK server-side. Per-business Stripe secret keys are stored in a dedicated Convex table with restricted access. Synced catalog items are matched by Stripe product ID, with local-only fields (SKU, tax rate, category) preserved across re-syncs and user-initiated deactivations respected.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, Stripe SDK 20.1.0 (already installed), React 19.1.2, Clerk 6.30.0
**Storage**: Convex (document database with real-time subscriptions)
**Testing**: Manual testing via Stripe test-mode keys (`sk_test_...`)
**Target Platform**: Web application (desktop + mobile responsive)
**Project Type**: Web (Next.js frontend + Convex backend)
**Performance Goals**: Sync 100 products within 30 seconds (SC-003)
**Constraints**: Stripe API rate limit ~100 reads/sec (unlikely to be hit); Convex action timeout ~10 min
**Scale/Scope**: Typical business has 10-200 products; edge case up to 1,000+

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is not configured (template only). No gates to evaluate. Proceeding with standard project conventions from CLAUDE.md:
- Use semantic design tokens (not hardcoded colors)
- Action buttons: `bg-primary hover:bg-primary/90 text-primary-foreground`
- Prefer modifying existing files over creating new ones
- Build must pass before task completion
- Convex deploy after schema/function changes

## Project Structure

### Documentation (this feature)

```text
specs/014-stripe-catalog-sync/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: Technology decisions
├── data-model.md        # Phase 1: Schema design
├── quickstart.md        # Phase 1: Implementation guide
├── contracts/
│   └── convex-functions.md  # Phase 1: Convex function signatures
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
convex/
├── schema.ts                          # MODIFY: Add stripe_integrations, sync_logs tables + extend catalog_items
├── functions/
│   ├── stripeIntegrations.ts          # NEW: Connection management (connect/disconnect/getConnection)
│   ├── catalogItems.ts                # MODIFY: Add syncFromStripe action, getSyncProgress, restoreFromStripe, extend list/deactivate
│   └── syncLogs.ts                    # NEW (optional P2): Sync history queries

src/
├── domains/
│   ├── sales-invoices/
│   │   ├── hooks/
│   │   │   ├── use-catalog-items.ts           # MODIFY: Add source filter param
│   │   │   └── use-stripe-integration.ts      # NEW: Hooks for connection, sync, progress
│   │   └── components/
│   │       ├── catalog-item-manager.tsx        # MODIFY: Add sync button, source badges, source filter
│   │       └── stripe-sync-button.tsx          # NEW: Sync button with progress indicator
│   └── account-management/
│       └── components/
│           ├── tabbed-business-settings.tsx    # MODIFY: Add "Integrations" tab
│           └── stripe-integration-card.tsx     # NEW: Connect/disconnect UI card
```

**Structure Decision**: Follows existing domain-driven layout. Stripe integration settings live under `account-management` (alongside other business settings). Sync UI lives under `sales-invoices` (alongside existing catalog components). Backend functions follow existing Convex module conventions.

## Complexity Tracking

No constitution violations to justify. All changes follow existing patterns:
- New Convex tables follow existing conventions (businesses, mcp_api_keys)
- New Convex action follows existing patterns (webhooks.ts, actionCenterJobs.ts)
- New settings tab follows existing tabbed-business-settings pattern
- Catalog UI extensions modify existing components rather than creating parallel systems
