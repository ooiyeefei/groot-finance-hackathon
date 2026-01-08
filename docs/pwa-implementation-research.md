# PWA Implementation Research for Next.js 15 App Router

**Last Updated**: 2026-01-07
**Status**: Research Phase
**Target Platform**: FinanSEAL Mobile PWA

---

## 1. PWA Plugin for Next.js 15

### Decision
**Use `@serwist/next`** as the PWA plugin for Next.js 15 App Router.

### Rationale
`@serwist/next` is the actively maintained successor to `next-pwa`, specifically designed for modern Next.js versions (including Next.js 15 App Router) and built on top of Workbox. It offers:

- **Active Maintenance**: Direct fork with ongoing development for Next.js 15+
- **App Router Support**: Native compatibility with Next.js 15 App Router
- **Workbox Foundation**: Leverages industry-standard Workbox for service worker management
- **TypeScript Support**: Full type definitions for configurations and APIs
- **Developer Experience**: Abstracts complexity while allowing advanced customization
- **Bundle Impact**: Minimal overhead beyond Workbox runtime (~few hundred KB)

### Alternatives

#### `next-pwa` (Not Recommended)
- **Status**: Reduced maintenance for newer Next.js versions
- **Trade-offs**:
  - Questionable compatibility with Next.js 15
  - Slower adoption of Workbox updates
  - Lack of active maintenance for new features
- **When to Use**: Only for legacy projects already using it

#### Manual Workbox Integration
- **Trade-offs**:
  - Maximum flexibility and control
  - Significantly higher setup complexity
  - Deep understanding of Workbox + Next.js build processes required
  - Higher maintenance burden
- **When to Use**: Only for highly custom PWA requirements that can't be met by `@serwist/next` configuration

### Implementation Steps

1. **Installation**
   ```bash
   npm install @serwist/next
   ```

2. **Configure `next.config.js`**
   ```javascript
   const withSerwist = require('@serwist/next').default({
     swSrc: 'app/sw.ts',           // Service worker entry file
     swDest: 'public/sw.js',        // Output path
     disable: process.env.NODE_ENV === 'development', // Disable in dev
     // Optional: maximumFileSizeToCacheInBytes, cacheStartUrl
   });

   /** @type {import('next').NextConfig} */
   const nextConfig = {
     // Your existing Next.js config
   };

   module.exports = withSerwist(nextConfig);
   ```

3. **Create Service Worker Entry (`app/sw.ts`)**
   ```typescript
   import { defaultCache } from '@serwist/next/worker';
   import type { PrecacheEntry } from '@serwist/precaching';
   import { installSerwist } from '@serwist/sw';

   declare const self: ServiceWorkerGlobalScope & {
     __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
   };

   installSerwist({
     precacheEntries: self.__SW_MANIFEST,
     skipWaiting: true,
     clientsClaim: true,
     runtimeCaching: defaultCache,
   });
   ```

4. **Create `manifest.json` in `public/`**
   ```json
   {
     "name": "FinanSEAL Mobile",
     "short_name": "FinanSEAL",
     "start_url": "/",
     "display": "standalone",
     "background_color": "#ffffff",
     "theme_color": "#1976d2",
     "icons": [
       {
         "src": "/icon-192.png",
         "sizes": "192x192",
         "type": "image/png"
       },
       {
         "src": "/icon-512.png",
         "sizes": "512x512",
         "type": "image/png"
       }
     ]
   }
   ```

5. **Register Service Worker (Root Layout)**
   ```typescript
   'use client';

   import { useEffect } from 'react';

   export default function RootLayout({ children }: { children: React.ReactNode }) {
     useEffect(() => {
       if ('serviceWorker' in navigator) {
         navigator.serviceWorker
           .register('/sw.js')
           .then((registration) => console.log('SW registered:', registration))
           .catch((error) => console.error('SW registration failed:', error));
       }
     }, []);

     return (
       <html lang="en">
         <body>{children}</body>
       </html>
     );
   }
   ```

### Key Considerations
- **Development Experience**: Always disable PWA in development mode to avoid service worker caching issues
- **Cache Invalidation**: Service worker updates automatically on new deployments due to content hashing
- **Testing**: Test service worker registration in production builds (`npm run build && npm start`)

---

## 2. iOS Safari PWA Limitations

### Decision
**Design for graceful degradation** with clear user guidance for iOS-specific PWA behaviors.

### Rationale
While iOS Safari has improved PWA support (Web Push in iOS 16.4+), significant limitations persist. Acknowledging these differences and designing for graceful degradation ensures a consistent, functional experience rather than broken features.

### iOS-Specific Limitations

#### Push Notifications
- **Status (2025)**: Supported on iOS 16.4+ for home screen PWAs
- **Limitations**:
  - Requires explicit "Add to Home Screen" action
  - No `beforeinstallprompt` event for installation prompting
  - No Badge API support
- **Implementation**:
  - Use VAPID-based Web Push
  - Provide clear UI instructions for "Add to Home Screen"
  - Guide users through notification permission flow

#### Background Sync
- **Status**: No support for `Background Sync API` or `Periodic Background Sync`
- **Workaround**:
  - Use IndexedDB for offline data persistence
  - Implement manual sync when app is foregrounded
  - Detect network connectivity changes for automatic sync

#### File System Access
- **Status**: Limited `File System Access API` support
- **Workaround**:
  - Stick to traditional `<input type="file">` for uploads
  - Use `<a download>` for downloads
  - Avoid advanced file system interactions

#### Media Handling
- **Limitations**:
  - Stricter autoplay policies (requires user interaction)
  - Codec support may vary
- **Implementation**:
  - Always provide user controls for media
  - Use widely supported codecs (H.264 video, AAC audio)
  - Test media playback thoroughly on iOS devices

#### Storage Limits
- **Non-installed PWAs**: 50MB per-origin limit (Cache API + IndexedDB)
- **Installed PWAs**: Higher limit but subject to eviction under low disk space
- **Implementation**:
  - Use Workbox `ExpirationPlugin` for cache management
  - Prioritize critical assets
  - Monitor cache sizes in dev tools

#### Other Restrictions
| Feature | Status | Notes |
|---------|--------|-------|
| `beforeinstallprompt` | Not supported | No programmatic install prompts |
| Web Share Target API | Not supported | Can't receive shared content |
| `display_override` | Limited | Minimal support |
| `shortcuts` | Not supported | No app shortcuts in manifest |
| Splash Screens | Generated from icons | Use high-resolution icons |
| App Badge API | Not supported | No badge counts |
| Payment Request API | Limited | Non-functional in standalone mode |
| `window-controls-overlay` | Not supported | Can't customize title bar |

### Best Practices
1. **Feature Detection**: Always check for feature availability before using
2. **User Guidance**: Provide clear instructions for iOS installation process
3. **Progressive Enhancement**: Core functionality should work without advanced features
4. **Testing**: Test on real iOS devices, not just simulators

---

## 3. Workbox Cache Strategies

### Decision
**Implement tailored, multi-strategy caching** using Workbox's `RuntimeCaching` rules for optimal performance and offline capability.

### Rationale
Different content types require different caching strategies. A one-size-fits-all approach compromises performance, data freshness, or offline reliability. Workbox provides robust strategies that deliver optimal user experience when properly combined.

### Cache Strategy Matrix

#### 1. App Shell (HTML, CSS, JS bundles)
**Strategy**: `CacheFirst`

**Rationale**: Core UI assets should load instantly from cache. Next.js assets have content hashes, making them immutable.

**Implementation**:
```typescript
import { registerRoute } from 'serwist';
import { CacheFirst } from 'serwist/strategies';
import { ExpirationPlugin } from 'serwist/plugins';

// Cache Next.js static assets
registerRoute(
  ({ request, url }) =>
    url.pathname.startsWith('/_next/static/') ||
    request.destination === 'font',
  new CacheFirst({
    cacheName: 'next-static-assets',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  }),
);
```

#### 2. API Response Caching
**Strategy**: `StaleWhileRevalidate` for public data, `NetworkFirst` for critical data

**Rationale**:
- `StaleWhileRevalidate`: Immediate feedback from cache while updating in background
- `NetworkFirst`: Ensures freshest data for user-specific or transactional content

**Implementation**:
```typescript
import { StaleWhileRevalidate, NetworkFirst } from 'serwist/strategies';

// Public API data (e.g., product listings, news feeds)
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/public/'),
  new StaleWhileRevalidate({
    cacheName: 'api-public-data',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 5 * 60, // 5 minutes
      }),
    ],
  }),
);

// User-specific API data (e.g., profile, cart)
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/user/'),
  new NetworkFirst({
    cacheName: 'api-user-data',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 60 * 60, // 1 hour
      }),
    ],
  }),
);
```

#### 3. Image Caching
**Strategy**: `StaleWhileRevalidate` for dynamic images, `CacheFirst` for static images

**Rationale**: Images benefit greatly from caching. `StaleWhileRevalidate` balances speed and freshness.

**Implementation**:
```typescript
// Cache all images
registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: 'images',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
      }),
    ],
  }),
);
```

#### 4. Offline Fallback
**Strategy**: Offline page for navigation, placeholder for images

**Implementation**:
```typescript
import { offlineFallback } from 'serwist/integrations';

// Serve generic offline page for navigation requests
offlineFallback({
  precacheEntries: ['/offline'], // Must be precached
  fallbackRoutes: [
    {
      url: '/offline',
      matchCallback: ({ request }) => request.mode === 'navigate',
    },
  ],
});

// Optional: Image placeholder
offlineFallback({
  precacheEntries: ['/images/offline.png'],
  fallbackRoutes: [
    {
      url: '/images/offline.png',
      matchCallback: ({ request }) => request.destination === 'image',
    },
  ],
});
```

### Cache Size Management

**Key Considerations**:
- Use `ExpirationPlugin` with `maxEntries` and `maxAgeSeconds` for automatic cleanup
- Monitor cache sizes using browser dev tools
- Be aware of Safari's 50MB limit for non-installed PWAs
- Prioritize critical assets for longer retention

### Strategy Selection Guide

| Content Type | Strategy | Cache Duration | Max Entries |
|--------------|----------|----------------|-------------|
| App Shell (JS/CSS) | CacheFirst | 30 days | 60 |
| Fonts | CacheFirst | 365 days | 30 |
| Public API | StaleWhileRevalidate | 5 minutes | 50 |
| User API | NetworkFirst | 1 hour | 20 |
| Images | StaleWhileRevalidate | 7 days | 100 |
| Videos | NetworkOnly | N/A | N/A |

---

## 4. Client-Side Image Compression

### Decision
**Use `browser-image-compression`** for client-side image optimization before upload.

### Rationale
`browser-image-compression` is a well-maintained, performant library that simplifies client-side image processing. It handles resizing, quality adjustment, EXIF orientation, and uses Web Workers for non-blocking operations. This reduces upload bandwidth, server storage, and processing load.

### Alternatives

#### Canvas-Based Manual Approach
- **Trade-offs**:
  - Requires manual implementation of EXIF handling, Web Workers, error handling
  - Increases development time and maintenance overhead
  - Only viable for highly specific, niche requirements
- **When to Use**: Never, unless `browser-image-compression` can't meet a critical requirement

#### Server-Side Only Compression
- **Trade-offs**:
  - Doesn't address large upload bandwidth
  - Server stores unoptimized images initially
- **When to Use**: As a complement, not replacement, for client-side compression

### Implementation

#### Installation
```bash
npm install browser-image-compression
```

#### Basic Usage
```typescript
import imageCompression from 'browser-image-compression';

async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
  const imageFile = event.target.files?.[0];
  if (!imageFile) return;

  console.log('Original size:', imageFile.size / 1024 / 1024, 'MB');

  const options = {
    maxSizeMB: 1,              // Target file size (1MB)
    maxWidthOrHeight: 1920,    // Max dimension
    useWebWorker: true,        // Non-blocking (RECOMMENDED)
    initialQuality: 0.8,       // JPEG quality (0-1)
  };

  try {
    const compressedFile = await imageCompression(imageFile, options);
    console.log('Compressed size:', compressedFile.size / 1024 / 1024, 'MB');

    // Upload compressed file
    const formData = new FormData();
    formData.append('image', compressedFile);
    await fetch('/api/upload', { method: 'POST', body: formData });

  } catch (error) {
    console.error('Compression failed:', error);
    // Fallback: upload original or show error
  }
}
```

#### React Component Example
```typescript
'use client';

import { useState } from 'react';
import imageCompression from 'browser-image-compression';

export default function ImageUpload() {
  const [isCompressing, setIsCompressing] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);

    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });

      // Upload logic here
      console.log('Reduction:',
        ((file.size - compressed.size) / file.size * 100).toFixed(1), '%'
      );

    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsCompressing(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={handleUpload}
        disabled={isCompressing}
      />
      {isCompressing && <p>Compressing image...</p>}
    </div>
  );
}
```

### Configuration Guidelines

| Option | Recommended Value | Notes |
|--------|-------------------|-------|
| `maxSizeMB` | 1-2 MB | Balance quality and file size |
| `maxWidthOrHeight` | 1920-2560 px | For high-resolution displays |
| `initialQuality` | 0.8-0.9 | JPEG quality (0 = worst, 1 = best) |
| `useWebWorker` | `true` | Always enable for performance |

### Performance Benchmarks

**Typical Results** (4MB JPEG image, 4032x3024):
- **Compression Time**: 1-3 seconds
- **File Size Reduction**: 75-90%
- **Output Size**: 300-800 KB
- **Visual Quality**: Minimal degradation

### Best Practices

1. **User Feedback**: Show loading spinner during compression
2. **Error Handling**: Implement fallback to original file upload
3. **EXIF Handling**: Library automatically handles orientation
4. **Mobile Testing**: Test on actual devices for performance validation
5. **Progressive Enhancement**: Support raw upload if compression fails

---

## 5. BrowserStack + Playwright Mobile Testing

### Decision
**Integrate BrowserStack with Playwright** for comprehensive real-device mobile PWA testing in CI/CD.

### Rationale
Emulators/simulators can't fully replicate real device nuances: performance, touch interactions, browser quirks (especially iOS Safari). BrowserStack provides scalable cloud access to real devices, critical for production-ready PWA validation.

### Alternatives

#### Manual Testing on Physical Devices
- **Trade-offs**: Time-consuming, not scalable, can't integrate with CI/CD
- **When to Use**: Initial validation, ad-hoc testing

#### Emulators/Simulators
- **Trade-offs**:
  - Don't represent real-world performance or memory constraints
  - iOS Simulator uses WebKit, but not exact iOS Safari behavior
  - Miss device-specific bugs
- **When to Use**: Local development, quick checks

#### Other Cloud Platforms (Sauce Labs, LambdaTest)
- **Trade-offs**: Evaluate based on pricing, device availability, Playwright integration
- **When to Use**: Based on team's specific needs and budget

### Implementation

#### 1. Installation
```bash
npm install @playwright/test
npm install @browserstack/playwright-sdk
```

#### 2. Configure `playwright.config.ts`
```typescript
import { defineConfig, devices } from '@playwright/test';

const BS_USERNAME = process.env.BROWSERSTACK_USERNAME;
const BS_ACCESS_KEY = process.env.BROWSERSTACK_ACCESS_KEY;
const BS_BUILD_NAME = process.env.BROWSERSTACK_BUILD_NAME ||
  `PWA_Build_${new Date().toISOString()}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'https://finanseal.com', // Or localhost with BrowserStack Local
    trace: 'on-first-retry',
  },

  projects: [
    // Local development tests
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // BrowserStack iOS Safari 17
    {
      name: 'ios-safari-17',
      use: {
        ...devices['iPhone 14'],
        browserName: 'webkit',
        connectOptions: {
          wsEndpoint: `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify({
            browser: 'safari',
            os: 'ios',
            os_version: '17',
            device: 'iPhone 14',
            'browserstack.username': BS_USERNAME,
            'browserstack.accessKey': BS_ACCESS_KEY,
            'browserstack.local': 'true', // For localhost testing
            'browserstack.networkLogs': 'true',
            'browserstack.consoleLogs': 'verbose',
            'browserstack.build': BS_BUILD_NAME,
            'browserstack.projectName': 'FinanSEAL PWA',
            'browserstack.debug': 'true',
          }))}`,
        },
      },
    },

    // BrowserStack Android Chrome
    {
      name: 'android-chrome-120',
      use: {
        ...devices['Pixel 7'],
        browserName: 'chromium',
        connectOptions: {
          wsEndpoint: `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify({
            browser: 'chrome',
            os: 'android',
            os_version: '14.0',
            device: 'Google Pixel 7',
            'browserstack.username': BS_USERNAME,
            'browserstack.accessKey': BS_ACCESS_KEY,
            'browserstack.local': 'true',
            'browserstack.networkLogs': 'true',
            'browserstack.consoleLogs': 'verbose',
            'browserstack.build': BS_BUILD_NAME,
            'browserstack.projectName': 'FinanSEAL PWA',
            'browserstack.debug': 'true',
          }))}`,
        },
      },
    },
  ],
});
```

#### 3. CI/CD Pipeline (GitHub Actions Example)
```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build

      - name: Start production server
        run: npm start &
        env:
          PORT: 3000

      - name: Wait for server
        run: npx wait-on http://localhost:3000

      - name: Run Playwright tests
        run: npx playwright test --project=ios-safari-17 --project=android-chrome-120
        env:
          BROWSERSTACK_USERNAME: ${{ secrets.BROWSERSTACK_USERNAME }}
          BROWSERSTACK_ACCESS_KEY: ${{ secrets.BROWSERSTACK_ACCESS_KEY }}
          BROWSERSTACK_BUILD_NAME: ${{ github.run_id }}

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
```

### Mobile Device Matrix

**Recommended Starter Matrix**:
| Device | OS Version | Browser | Priority |
|--------|------------|---------|----------|
| iPhone 14 | iOS 17 | Safari | High |
| iPhone 13 | iOS 16 | Safari | High |
| Pixel 7 | Android 14 | Chrome 120+ | High |
| Samsung Galaxy S23 | Android 13 | Chrome 120+ | Medium |
| iPhone SE (3rd gen) | iOS 17 | Safari | Medium |

**Expansion Criteria**:
- Target audience analytics
- Market share data
- Known PWA compatibility issues

### Cost Optimization Strategies

1. **Parallelization**: Maximize parallel test execution (set `workers: 4` in CI)
2. **Targeted Matrix**: Focus on high-impact devices, avoid exhaustive testing
3. **Local First**: Run majority of tests locally before CI/CD
4. **Test Efficiency**: Write concise tests, avoid unnecessary waits
5. **Caching**: Cache `node_modules` and Playwright browsers in CI
6. **Strategic Scheduling**: Run full device matrix on main branch only

### BrowserStack Local Setup

**For Testing Localhost in CI**:
```yaml
- name: Start BrowserStack Local
  run: |
    wget "https://www.browserstack.com/browserstack-local/BrowserStackLocal-linux-x64.zip"
    unzip BrowserStackLocal-linux-x64.zip
    ./BrowserStackLocal --key ${{ secrets.BROWSERSTACK_ACCESS_KEY }} &

- name: Run tests
  run: npx playwright test
  env:
    BROWSERSTACK_USERNAME: ${{ secrets.BROWSERSTACK_USERNAME }}
    BROWSERSTACK_ACCESS_KEY: ${{ secrets.BROWSERSTACK_ACCESS_KEY }}
```

### Best Practices

1. **Environment Variables**: Always use CI secrets for credentials
2. **Build Names**: Use unique build identifiers (`github.run_id`)
3. **Network Logs**: Enable for debugging failed tests
4. **Retry Logic**: Set `retries: 2` in CI for flaky tests
5. **Test Isolation**: Each test should be independent
6. **Real Devices Only**: Don't test on BrowserStack emulators (defeats purpose)

---

## Summary & Next Steps

### Implementation Priority

1. **Phase 1: Core PWA Setup** (Week 1)
   - Install and configure `@serwist/next`
   - Create basic service worker with `CacheFirst` for static assets
   - Add `manifest.json` and register service worker
   - Test on desktop browsers

2. **Phase 2: Advanced Caching** (Week 2)
   - Implement `StaleWhileRevalidate` for API responses
   - Add image caching with `ExpirationPlugin`
   - Create offline fallback page
   - Test cache strategies with DevTools

3. **Phase 3: Image Optimization** (Week 3)
   - Integrate `browser-image-compression`
   - Add compression to receipt/invoice upload flows
   - Implement user feedback during compression
   - Measure file size reduction metrics

4. **Phase 4: Mobile Testing** (Week 4)
   - Set up BrowserStack account
   - Configure Playwright with BrowserStack projects
   - Write PWA-specific test cases (offline mode, installation)
   - Integrate with CI/CD pipeline

5. **Phase 5: iOS Optimization** (Week 5)
   - Test PWA on real iOS devices
   - Document iOS-specific limitations
   - Add user guidance for "Add to Home Screen"
   - Implement fallbacks for unsupported features

### Key Metrics to Track

- **Performance**: First Contentful Paint (FCP), Largest Contentful Paint (LCP)
- **Cache Hit Rate**: Percentage of requests served from cache
- **Image Compression**: Average file size reduction percentage
- **Offline Capability**: Percentage of app functional offline
- **iOS Adoption**: Percentage of iOS users adding to home screen

### Resources

- **@serwist/next Documentation**: https://serwist.pages.dev/docs/next
- **Workbox Strategies**: https://developers.google.com/web/tools/workbox/modules/workbox-strategies
- **browser-image-compression**: https://github.com/Donaldcwl/browser-image-compression
- **BrowserStack + Playwright**: https://www.browserstack.com/docs/automate/playwright
- **iOS Safari PWA Support**: https://webkit.org/blog/category/progressive-web-apps/

---

**Document Owner**: FinanSEAL Engineering Team
**Review Cycle**: Quarterly or when Next.js/iOS updates release
