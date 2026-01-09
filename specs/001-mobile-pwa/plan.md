# Implementation Plan: Mobile-First Testing & PWA Enhancements

**Branch**: `001-mobile-pwa` | **Date**: 2026-01-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-mobile-pwa/spec.md`
**GitHub Reference**: grootdev-ai/finanseal-mvp#84

## Summary

Add Progressive Web App (PWA) capabilities and mobile-first testing infrastructure to FinanSEAL, enabling offline access, home screen installation, and validated mobile UX across SEA market devices. This involves adding a service worker, web app manifest, offline data caching with IndexedDB, and establishing mobile testing automation via BrowserStack.

## Technical Context

**Language/Version**: TypeScript 5.9+ with Next.js 15.4.6
**Primary Dependencies**: next-pwa (or @serwist/next), workbox, idb (IndexedDB wrapper)
**Storage**: IndexedDB (offline queue), Cache Storage (assets), Convex (server)
**Testing**: Vitest (unit), Playwright (E2E), BrowserStack (mobile devices)
**Target Platform**: PWA - iOS Safari 15+, Android Chrome 90+, Mobile-first
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Lighthouse mobile score 80+, offline load <3s, camera init <2s
**Constraints**: 2MB max image upload, 7-day cache retention, 320px min viewport
**Scale/Scope**: SEA SME market, iPhone SE/Samsung A14 baseline devices

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Note**: Project constitution is in template form. Applying sensible defaults based on codebase patterns:

| Principle | Status | Notes |
| --------- | ------ | ----- |
| Test-First | PASS | Vitest + Playwright already configured |
| Observability | PASS | Sentry already integrated |
| Simplicity | PASS | PWA is additive, not replacing existing patterns |
| Domain-Driven | PASS | No new domain needed, enhances existing |

**No violations requiring justification.**

## Project Structure

### Documentation (this feature)

```text
specs/001-mobile-pwa/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
# PWA Infrastructure (new files)
public/
├── manifest.json              # Web app manifest
├── sw.js                      # Generated service worker (output)
├── icon-192.png               # PWA icon (192x192)
├── icon-512.png               # PWA icon (512x512)
├── icon-maskable-192.png      # Maskable icon for Android
└── icon-maskable-512.png      # Maskable icon for Android

src/
├── app/
│   └── manifest.ts            # Next.js 15 metadata export (alternative to JSON)
├── lib/
│   ├── pwa/
│   │   ├── service-worker.ts       # SW registration and update handling
│   │   ├── offline-queue.ts        # IndexedDB queue for offline actions
│   │   ├── cache-manager.ts        # Cache retention and stale data logic
│   │   └── connectivity-monitor.ts # Online/offline state detection
│   └── hooks/
│       ├── use-offline-status.ts   # Hook for offline UI indicators
│       └── use-pwa-install.ts      # Hook for install prompt handling
├── components/
│   └── ui/
│       ├── offline-indicator.tsx   # Global offline status banner
│       ├── pwa-install-prompt.tsx  # "Add to Home Screen" prompt
│       └── bottom-nav.tsx          # Mobile bottom navigation bar
└── domains/
    └── expense-claims/
        └── components/
            └── mobile-camera-capture.tsx  # (existing - enhance with compression)

# Testing Infrastructure
tests/
├── e2e/
│   └── mobile/
│       ├── pwa-install.spec.ts        # PWA installation tests
│       ├── offline-dashboard.spec.ts  # Offline access tests
│       └── camera-capture.spec.ts     # Mobile camera tests
└── integration/
    └── pwa/
        ├── service-worker.test.ts     # SW registration tests
        └── offline-queue.test.ts      # Queue sync tests

# Configuration
next.config.ts           # (modify) Add PWA plugin
playwright.config.ts     # (modify) Add BrowserStack config
```

**Structure Decision**: Web application structure maintained. PWA functionality added as cross-cutting concern in `src/lib/pwa/` with UI components in `src/components/ui/`. No new domains created - this is infrastructure enhancement.

## Complexity Tracking

> No violations requiring justification.

## Phase Summary

| Phase | Deliverable | Status |
| ----- | ----------- | ------ |
| 0 | research.md | Pending |
| 1 | data-model.md, contracts/, quickstart.md | Pending |
| 2 | tasks.md | Via /speckit.tasks |

## Research Questions (Phase 0)

1. **PWA Plugin Choice**: next-pwa vs @serwist/next vs manual Workbox setup for Next.js 15
2. **IndexedDB Schema**: Structure for offline queue (expense submissions, sync state)
3. **iOS PWA Limitations**: Known constraints for Safari PWA (background sync, push)
4. **BrowserStack Integration**: Playwright + BrowserStack setup for CI mobile testing
5. **Image Compression**: Client-side compression libraries (browser-image-compression vs canvas)
6. **Cache Strategy**: Workbox strategies for API responses vs static assets

## Design Decisions (Phase 1)

1. **Data Model**: Offline queue schema, cache metadata structure
2. **API Contracts**: Sync endpoint for queued actions, cache invalidation signals
3. **Component Interfaces**: PWA hooks, offline indicator props, install prompt API

---

*Next step: Generate research.md via Phase 0 workflow*
