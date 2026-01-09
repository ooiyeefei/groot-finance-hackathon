# Research: Mobile-First Testing & PWA Enhancements

**Branch**: `001-mobile-pwa` | **Date**: 2026-01-07 | **Phase**: 0

## Summary

This document captures research findings for implementing PWA capabilities in FinanSEAL's Next.js 15 App Router application.

---

## 1. PWA Plugin for Next.js 15

### Decision
**Use `@serwist/next`** as the PWA plugin.

### Rationale
- Actively maintained successor to deprecated `next-pwa`
- Native Next.js 15 App Router compatibility
- Built on Workbox with full TypeScript support
- Simple configuration with advanced customization options

### Alternatives Considered
| Option | Pros | Cons | Decision |
| ------ | ---- | ---- | -------- |
| `next-pwa` | Familiar, lots of tutorials | Unmaintained, Next.js 15 issues | Rejected |
| Manual Workbox | Maximum control | High complexity, maintenance burden | Rejected |
| `@serwist/next` | Active, App Router native, TypeScript | Newer, fewer tutorials | **Selected** |

### Implementation Notes
```bash
npm install @serwist/next
```
- Configure via `withSerwist()` wrapper in `next.config.ts`
- Service worker entry at `app/sw.ts`
- Disable in development mode to avoid caching issues

---

## 2. iOS Safari PWA Limitations

### Decision
**Design for graceful degradation** with clear user guidance.

### Rationale
iOS Safari has improved (Web Push in iOS 16.4+) but still lacks key features. Graceful degradation ensures functional experience without broken features.

### Key Limitations

| Feature | iOS Status | Workaround |
| ------- | ---------- | ---------- |
| Push Notifications | iOS 16.4+ only, requires home screen | Manual instructions for installation |
| Background Sync | Not supported | IndexedDB + foreground sync |
| `beforeinstallprompt` | Not supported | Manual "Add to Home Screen" UI |
| Storage Limit | 50MB (non-installed) | Cache expiration, prioritize critical assets |
| App Badge API | Not supported | In-app notification indicators |
| Web Share Target | Not supported | Standard share buttons |

### Implementation Notes
- Always use feature detection before using PWA APIs
- Provide clear installation instructions for iOS users
- Test on real iOS devices, not just simulators

---

## 3. Workbox Cache Strategies

### Decision
**Multi-strategy caching** tailored to content type.

### Rationale
Different content requires different strategies. One-size-fits-all compromises performance or freshness.

### Strategy Matrix

| Content Type | Strategy | Cache Duration | Max Entries |
| ------------ | -------- | -------------- | ----------- |
| Static Assets (JS/CSS) | CacheFirst | 30 days | 60 |
| Fonts | CacheFirst | 365 days | 30 |
| Dashboard API | StaleWhileRevalidate | 24h stale warning | 50 |
| User API | NetworkFirst | 1 hour | 20 |
| Images | StaleWhileRevalidate | 7 days | 100 |
| Navigation (offline) | Offline fallback | - | - |

### Implementation Notes
- Use `ExpirationPlugin` for automatic cache cleanup
- Implement offline fallback page for navigation requests
- Monitor cache sizes to respect iOS 50MB limit for non-installed PWAs

---

## 4. Image Compression Library

### Decision
**Use `browser-image-compression`** for client-side compression.

### Rationale
Well-maintained, Web Worker support, automatic EXIF handling, simple API. Reduces upload bandwidth by 70-90%.

### Alternatives Considered
| Option | Pros | Cons | Decision |
| ------ | ---- | ---- | -------- |
| Manual Canvas | Maximum control | Complex implementation, EXIF issues | Rejected |
| Server-side only | Simpler | Large uploads still go to server | Complement only |
| `browser-image-compression` | Simple, Web Worker, EXIF handling | Bundle size (~50KB) | **Selected** |

### Configuration for FinanSEAL
```typescript
const options = {
  maxSizeMB: 2,              // Per spec clarification
  maxWidthOrHeight: 1920,    // Good for receipts
  useWebWorker: true,        // Non-blocking
  initialQuality: 0.85,      // Preserve OCR readability
}
```

### Performance Benchmarks
- Compression time: 1-3 seconds
- File size reduction: 70-90%
- Visual quality: Minimal degradation
- OCR readability: Preserved at 0.85 quality

---

## 5. BrowserStack + Playwright Integration

### Decision
**Integrate BrowserStack with Playwright** for CI/CD mobile testing.

### Rationale
Emulators can't replicate real device nuances. BrowserStack provides scalable cloud access to real devices critical for PWA validation in SEA market.

### Device Matrix (SEA Market Priority)

| Device | OS Version | Browser | Priority |
| ------ | ---------- | ------- | -------- |
| iPhone SE (3rd gen) | iOS 17 | Safari | P1 (small screen baseline) |
| iPhone 14 | iOS 17 | Safari | P1 |
| Samsung Galaxy A14 | Android 13 | Chrome | P1 (SEA mid-range baseline) |
| Pixel 7 | Android 14 | Chrome | P2 |
| iPhone 13 | iOS 16 | Safari | P2 |

### CI/CD Integration
- Use GitHub Actions with BrowserStack Local for localhost testing
- Set `workers: 4` for parallel execution
- Cache node_modules and Playwright browsers
- Run full device matrix on main branch only

### Cost Optimization
- Targeted device matrix (5 devices vs exhaustive)
- Local-first testing before CI
- Efficient test design (avoid unnecessary waits)

---

## 6. Offline Queue Implementation

### Decision
**Use IndexedDB via `idb` wrapper** for offline action queue.

### Rationale
IndexedDB is the standard for structured client-side storage. `idb` provides Promise-based API that's easier to use than raw IndexedDB.

### Queue Schema
```typescript
interface OfflineAction {
  id: string;                    // UUID
  type: 'expense_submission' | 'expense_approval' | 'sync_dashboard';
  payload: Record<string, unknown>;
  createdAt: number;             // Timestamp
  retryCount: number;
  lastError?: string;
  status: 'pending' | 'syncing' | 'failed';
}
```

### Sync Strategy
1. On connectivity restore, process queue in FIFO order
2. Server-wins conflict resolution (per spec clarification)
3. Notify user of sync success/failure
4. Retry failed actions up to 3 times with exponential backoff

---

## Summary of Research Decisions

| Question | Decision | Confidence |
| -------- | -------- | ---------- |
| PWA Plugin | `@serwist/next` | High |
| iOS Handling | Graceful degradation with user guidance | High |
| Cache Strategy | Multi-strategy (CacheFirst, StaleWhileRevalidate, NetworkFirst) | High |
| Image Compression | `browser-image-compression` | High |
| Mobile Testing | BrowserStack + Playwright | High |
| Offline Storage | IndexedDB via `idb` | High |

---

*Next step: Generate data-model.md via Phase 1 workflow*
