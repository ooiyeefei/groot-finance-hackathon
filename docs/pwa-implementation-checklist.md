# PWA Implementation Checklist

**Project**: FinanSEAL Mobile PWA
**Last Updated**: 2026-01-07
**Status**: Planning Phase

---

## Phase 1: Core PWA Setup

### 1.1 Install Dependencies
- [ ] Install `@serwist/next`: `npm install @serwist/next`
- [ ] Verify Next.js version is 15.4.6+
- [ ] Check TypeScript configuration

### 1.2 Configure `next.config.js`
- [ ] Add `withSerwist` wrapper
- [ ] Set `swSrc: 'app/sw.ts'`
- [ ] Set `swDest: 'public/sw.js'`
- [ ] Enable `disable: process.env.NODE_ENV === 'development'`
- [ ] Test build succeeds: `npm run build`

### 1.3 Create Service Worker Entry
- [ ] Create `app/sw.ts`
- [ ] Import `installSerwist` from `@serwist/sw`
- [ ] Configure `precacheEntries` with `self.__SW_MANIFEST`
- [ ] Set `skipWaiting: true` and `clientsClaim: true`
- [ ] Add basic `runtimeCaching` configuration

### 1.4 Create Web App Manifest
- [ ] Create `public/manifest.json`
- [ ] Set `name: "FinanSEAL Mobile"`
- [ ] Set `short_name: "FinanSEAL"`
- [ ] Set `start_url: "/"`
- [ ] Set `display: "standalone"`
- [ ] Configure `theme_color` and `background_color`
- [ ] Add 192x192 and 512x512 icons to `public/`
- [ ] Reference manifest in root layout `<head>`

### 1.5 Register Service Worker
- [ ] Create service worker registration in root layout
- [ ] Add `useEffect` hook for registration
- [ ] Check `'serviceWorker' in navigator`
- [ ] Call `navigator.serviceWorker.register('/sw.js')`
- [ ] Add registration success/error logging

### 1.6 Testing
- [ ] Run production build: `npm run build`
- [ ] Start production server: `npm start`
- [ ] Open Chrome DevTools → Application → Service Workers
- [ ] Verify service worker is registered
- [ ] Check Cache Storage for precached assets
- [ ] Test offline mode (Network throttling)

---

## Phase 2: Advanced Caching Strategies

### 2.1 Static Asset Caching
- [ ] Add `CacheFirst` strategy for `/_next/static/`
- [ ] Configure `ExpirationPlugin` (maxEntries: 60, maxAge: 30 days)
- [ ] Cache fonts with `CacheFirst`
- [ ] Test in DevTools → Network (check "from ServiceWorker")

### 2.2 API Response Caching
- [ ] Identify public API routes (e.g., `/api/public/*`)
- [ ] Add `StaleWhileRevalidate` for public data
- [ ] Configure expiration (maxEntries: 50, maxAge: 5 minutes)
- [ ] Identify user-specific API routes (e.g., `/api/user/*`)
- [ ] Add `NetworkFirst` for user data
- [ ] Configure expiration (maxEntries: 20, maxAge: 1 hour)

### 2.3 Image Caching
- [ ] Add `StaleWhileRevalidate` for all image destinations
- [ ] Configure expiration (maxEntries: 100, maxAge: 7 days)
- [ ] Test with receipt/invoice images
- [ ] Monitor cache size in DevTools

### 2.4 Offline Fallback
- [ ] Create `app/offline/page.tsx` with offline UI
- [ ] Configure `offlineFallback` with `/offline` route
- [ ] Add offline placeholder image (`public/images/offline.png`)
- [ ] Test by disabling network in DevTools

### 2.5 Testing
- [ ] Test each cache strategy with DevTools → Network
- [ ] Verify "from ServiceWorker" label on cached requests
- [ ] Test offline mode for each content type
- [ ] Check Cache Storage sizes
- [ ] Verify cache eviction works (exceed maxEntries)

---

## Phase 3: Image Optimization

### 3.1 Install Dependencies
- [ ] Install `browser-image-compression`: `npm install browser-image-compression`
- [ ] Verify TypeScript types are available

### 3.2 Create Compression Utility
- [ ] Create `src/lib/image-compression.ts`
- [ ] Export `compressImage` function with default options
- [ ] Configure maxSizeMB: 1, maxWidthOrHeight: 1920
- [ ] Set `useWebWorker: true`
- [ ] Add error handling and fallback

### 3.3 Integrate with Receipt Upload
- [ ] Locate receipt upload component
- [ ] Add compression before upload
- [ ] Show loading spinner during compression
- [ ] Display compression results (file size reduction)
- [ ] Handle compression errors gracefully

### 3.4 Integrate with Invoice Upload
- [ ] Locate invoice upload component
- [ ] Add compression before upload
- [ ] Show loading spinner during compression
- [ ] Display compression results
- [ ] Handle compression errors gracefully

### 3.5 Testing
- [ ] Test with various image sizes (1MB, 5MB, 10MB)
- [ ] Test with different formats (JPEG, PNG, HEIC)
- [ ] Measure compression time on mobile devices
- [ ] Verify EXIF orientation is preserved
- [ ] Test error handling (corrupted images)

---

## Phase 4: Mobile Testing with BrowserStack

### 4.1 BrowserStack Setup
- [ ] Create BrowserStack account
- [ ] Note `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY`
- [ ] Install Playwright: `npm install @playwright/test`
- [ ] Install BrowserStack SDK: `npm install @browserstack/playwright-sdk`

### 4.2 Configure Playwright
- [ ] Create `playwright.config.ts`
- [ ] Add local projects (chromium, webkit)
- [ ] Add iOS Safari 17 project (iPhone 14)
- [ ] Add Android Chrome project (Pixel 7)
- [ ] Configure BrowserStack capabilities
- [ ] Set `browserstack.local: 'true'` for localhost testing

### 4.3 Write PWA Test Cases
- [ ] Create `tests/pwa/installation.spec.ts`
  - [ ] Test manifest.json is accessible
  - [ ] Test service worker registration
- [ ] Create `tests/pwa/offline.spec.ts`
  - [ ] Test offline page loads
  - [ ] Test cached assets load offline
- [ ] Create `tests/pwa/caching.spec.ts`
  - [ ] Test static assets are cached
  - [ ] Test API responses are cached
- [ ] Create `tests/pwa/image-upload.spec.ts`
  - [ ] Test image compression works
  - [ ] Test upload succeeds

### 4.4 CI/CD Integration
- [ ] Add `BROWSERSTACK_USERNAME` to GitHub secrets
- [ ] Add `BROWSERSTACK_ACCESS_KEY` to GitHub secrets
- [ ] Create `.github/workflows/e2e-tests.yml`
- [ ] Configure job to run on push to main
- [ ] Add build step
- [ ] Add start server step
- [ ] Add Playwright test step
- [ ] Upload test results as artifact

### 4.5 Testing
- [ ] Run tests locally: `npx playwright test`
- [ ] Run BrowserStack tests: `npx playwright test --project=ios-safari-17`
- [ ] Verify tests pass in CI/CD
- [ ] Check BrowserStack dashboard for test results
- [ ] Review test videos and logs

---

## Phase 5: iOS Optimization

### 5.1 iOS Testing
- [ ] Borrow/purchase iPhone 14 or newer (iOS 17+)
- [ ] Deploy PWA to production/staging
- [ ] Open in Safari browser
- [ ] Tap Share → "Add to Home Screen"
- [ ] Launch PWA from home screen
- [ ] Test all core features

### 5.2 iOS-Specific Features
- [ ] Test push notifications (iOS 16.4+ only)
- [ ] Verify no `beforeinstallprompt` event
- [ ] Test storage limits (50MB for non-installed)
- [ ] Test media autoplay (requires user interaction)
- [ ] Verify EXIF orientation handling

### 5.3 User Guidance
- [ ] Create "Add to Home Screen" instructions
- [ ] Add iOS detection: `const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)`
- [ ] Show installation prompt for iOS users
- [ ] Add screenshots of iOS installation process
- [ ] Link to instructions in settings/help

### 5.4 Graceful Degradation
- [ ] Check for push notification support
- [ ] Disable/hide unsupported features on iOS
- [ ] Add fallbacks for Background Sync
- [ ] Add fallbacks for File System Access
- [ ] Test all fallbacks on iOS device

### 5.5 Testing
- [ ] Test on iPhone 13 (iOS 16)
- [ ] Test on iPhone 14 (iOS 17)
- [ ] Test on iPhone SE (3rd gen)
- [ ] Verify all features work or degrade gracefully
- [ ] Document any iOS-specific issues

---

## Performance Validation

### Lighthouse Audit
- [ ] Run Lighthouse in Chrome DevTools
- [ ] Verify PWA score ≥ 90
- [ ] Verify Performance score ≥ 90
- [ ] Check "Installable" passes
- [ ] Check "Service worker registered" passes
- [ ] Check "Offline start_url" passes

### Cache Metrics
- [ ] Monitor cache hit rate in analytics
- [ ] Track average cache size per user
- [ ] Measure offline availability percentage
- [ ] Track service worker update frequency

### Image Compression Metrics
- [ ] Track average file size reduction
- [ ] Monitor compression time (should be < 3s)
- [ ] Track upload success rate
- [ ] Measure bandwidth savings

---

## Documentation

### User Documentation
- [ ] Create "Installing FinanSEAL PWA" guide
- [ ] Add iOS installation instructions
- [ ] Add Android installation instructions
- [ ] Document offline capabilities
- [ ] Create troubleshooting FAQ

### Developer Documentation
- [ ] Document service worker architecture
- [ ] Document caching strategies
- [ ] Document image compression flow
- [ ] Add BrowserStack testing guide
- [ ] Document iOS-specific behaviors

---

## Deployment Checklist

### Pre-Deployment
- [ ] Test PWA in production build locally
- [ ] Run all Playwright tests
- [ ] Run Lighthouse audit
- [ ] Test on real iOS device
- [ ] Test on real Android device

### Deployment
- [ ] Deploy to staging environment
- [ ] Test PWA installation on staging
- [ ] Run smoke tests
- [ ] Monitor Sentry for errors
- [ ] Deploy to production

### Post-Deployment
- [ ] Monitor service worker registration rate
- [ ] Monitor cache hit rate
- [ ] Track PWA installation rate
- [ ] Monitor error logs
- [ ] Collect user feedback

---

## Maintenance

### Weekly
- [ ] Check BrowserStack test results
- [ ] Monitor cache sizes
- [ ] Review error logs
- [ ] Check service worker update rate

### Monthly
- [ ] Review Lighthouse scores
- [ ] Update service worker if needed
- [ ] Review and update cached assets
- [ ] Update test device matrix

### Quarterly
- [ ] Review iOS/Android PWA changes
- [ ] Update `@serwist/next` to latest version
- [ ] Update Playwright to latest version
- [ ] Review and update caching strategies
- [ ] Re-run full device matrix tests

---

## Success Criteria

### Phase 1 Complete
- [x] Service worker registered and active
- [x] PWA installable on desktop
- [x] Basic offline functionality works
- [x] Lighthouse PWA score ≥ 80

### Phase 2 Complete
- [x] All static assets cached
- [x] API responses cached appropriately
- [x] Images cached with expiration
- [x] Offline fallback page works
- [x] Lighthouse Performance score ≥ 85

### Phase 3 Complete
- [x] Image compression reduces file size by 70%+
- [x] Compression time < 3 seconds on mobile
- [x] Upload bandwidth reduced significantly
- [x] No image quality degradation visible

### Phase 4 Complete
- [x] Playwright tests run on iOS Safari
- [x] Playwright tests run on Android Chrome
- [x] Tests integrated with CI/CD
- [x] Test pass rate ≥ 95%

### Phase 5 Complete
- [x] PWA tested on real iOS devices
- [x] Installation instructions published
- [x] iOS-specific limitations documented
- [x] Graceful degradation implemented
- [x] User guidance for iOS added

---

**Next Steps**: Begin Phase 1 implementation after stakeholder approval.
