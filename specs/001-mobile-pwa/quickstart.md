# Quickstart: Mobile-First Testing & PWA Enhancements

**Branch**: `001-mobile-pwa` | **Date**: 2026-01-07

This guide provides quick-reference instructions for implementing PWA features.

---

## Prerequisites

- Node.js 20+
- Next.js 15.4.6
- BrowserStack account (for mobile testing)

---

## Phase 1: Core PWA Setup

### 1.1 Install Dependencies

```bash
npm install @serwist/next browser-image-compression idb
npm install -D @playwright/test
```

### 1.2 Configure Next.js

```typescript
// next.config.ts
import withSerwist from '@serwist/next';

const nextConfig = {
  // ... existing config
};

export default withSerwist({
  swSrc: 'src/lib/pwa/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
})(nextConfig);
```

### 1.3 Create Service Worker

```typescript
// src/lib/pwa/sw.ts
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

### 1.4 Create Web App Manifest

```json
// public/manifest.json
{
  "name": "FinanSEAL - Financial Co-Pilot",
  "short_name": "FinanSEAL",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3b82f6",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 1.5 Register Service Worker

```typescript
// src/lib/pwa/service-worker.ts
export function registerServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('SW registered:', registration.scope);
      } catch (error) {
        console.error('SW registration failed:', error);
      }
    });
  }
}
```

---

## Phase 2: Offline Queue

### 2.1 Initialize IndexedDB

```typescript
// src/lib/pwa/offline-queue.ts
import { openDB, DBSchema } from 'idb';

interface FinanSealDB extends DBSchema {
  offlineActions: {
    key: string;
    value: OfflineAction;
    indexes: { 'by_status': string; 'by_created': number };
  };
}

const dbPromise = openDB<FinanSealDB>('finanseal_pwa', 1, {
  upgrade(db) {
    const store = db.createObjectStore('offlineActions', { keyPath: 'id' });
    store.createIndex('by_status', 'status');
    store.createIndex('by_created', 'createdAt');
  },
});
```

### 2.2 Queue Offline Actions

```typescript
export async function queueOfflineAction(action: Omit<OfflineAction, 'id' | 'createdAt' | 'status' | 'retryCount'>) {
  const db = await dbPromise;
  const id = crypto.randomUUID();
  const fullAction: OfflineAction = {
    ...action,
    id,
    createdAt: Date.now(),
    status: 'pending',
    retryCount: 0,
  };
  await db.put('offlineActions', fullAction);
  return id;
}
```

---

## Phase 3: Image Compression

### 3.1 Compress Before Upload

```typescript
// src/lib/pwa/image-compression.ts
import imageCompression from 'browser-image-compression';

const COMPRESSION_OPTIONS = {
  maxSizeMB: 2,              // Per spec clarification
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  initialQuality: 0.85,
};

export async function compressReceiptImage(file: File): Promise<File> {
  if (file.size <= 2 * 1024 * 1024) {
    return file; // Already under 2MB
  }
  return imageCompression(file, COMPRESSION_OPTIONS);
}
```

---

## Phase 4: React Hooks

### 4.1 useOfflineStatus Hook

```typescript
// src/lib/hooks/use-offline-status.ts
import { useState, useEffect } from 'react';

export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline };
}
```

### 4.2 usePWAInstall Hook

```typescript
// src/lib/hooks/use-pwa-install.ts
import { useState, useEffect } from 'react';

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Capture install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const promptInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setIsInstalled(true);
    }
    setInstallPrompt(null);
  };

  return { isInstalled, canInstall: !!installPrompt, promptInstall };
}
```

---

## Phase 5: Testing Setup

### 5.1 BrowserStack Configuration

```typescript
// playwright.config.ts (add to projects array)
{
  name: 'ios-safari',
  use: {
    browserName: 'webkit',
    connectOptions: {
      wsEndpoint: `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify({
        browser: 'safari',
        os: 'ios',
        os_version: '17',
        device: 'iPhone 14',
        'browserstack.username': process.env.BROWSERSTACK_USERNAME,
        'browserstack.accessKey': process.env.BROWSERSTACK_ACCESS_KEY,
      }))}`,
    },
  },
},
```

### 5.2 Example PWA Test

```typescript
// tests/e2e/mobile/pwa-install.spec.ts
import { test, expect } from '@playwright/test';

test('PWA shows install prompt on eligible device', async ({ page }) => {
  await page.goto('/');

  // Wait for second visit (prompt triggers on subsequent visits)
  await page.reload();

  // Check for install prompt (Android only - iOS requires manual)
  const installPrompt = page.locator('[data-testid="pwa-install-prompt"]');
  await expect(installPrompt).toBeVisible({ timeout: 5000 });
});

test('dashboard loads from cache when offline', async ({ page, context }) => {
  // First visit - cache dashboard
  await page.goto('/dashboard');
  await expect(page.locator('[data-testid="dashboard-metrics"]')).toBeVisible();

  // Go offline
  await context.setOffline(true);

  // Reload - should show cached data
  await page.reload();
  await expect(page.locator('[data-testid="dashboard-metrics"]')).toBeVisible();
  await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible();
});
```

---

## Validation Checklist

- [ ] PWA passes Lighthouse audit (score 80+)
- [ ] App installable on iOS Safari and Android Chrome
- [ ] Dashboard loads from cache when offline
- [ ] Offline actions queue and sync on reconnect
- [ ] Images compress to <2MB before upload
- [ ] All tests pass on iPhone SE and Samsung A14

---

## Key Files Reference

| File | Purpose |
| ---- | ------- |
| `src/lib/pwa/sw.ts` | Service worker entry |
| `src/lib/pwa/offline-queue.ts` | IndexedDB queue management |
| `src/lib/pwa/cache-manager.ts` | Cache freshness logic |
| `src/lib/hooks/use-offline-status.ts` | Connectivity hook |
| `src/lib/hooks/use-pwa-install.ts` | Install prompt hook |
| `src/components/ui/offline-indicator.tsx` | Offline UI banner |
| `src/components/ui/pwa-install-prompt.tsx` | Install prompt UI |
| `public/manifest.json` | Web app manifest |
| `tests/e2e/mobile/*.spec.ts` | Mobile E2E tests |

---

*See [research.md](./research.md) for detailed technical decisions.*
