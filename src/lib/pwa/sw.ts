/// <reference lib="webworker" />
/**
 * Service Worker Entry Point
 * Task T005: Service worker for PWA with @serwist/next
 *
 * Handles:
 * - Precaching of static assets
 * - Runtime caching strategies (defaultCache)
 * - Offline fallback for navigation requests
 */

import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

// Declare the injection point for the precache manifest
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Offline fallback page URL
const OFFLINE_FALLBACK_PAGE = '/offline.html';

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Next.js optimized cache strategies
  runtimeCaching: defaultCache,
  // Offline fallback configuration
  fallbacks: {
    entries: [
      {
        url: OFFLINE_FALLBACK_PAGE,
        matcher: ({ request }) => request.mode === 'navigate',
      },
    ],
  },
});

serwist.addEventListeners();

// Precache the offline fallback page during install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('offline-fallback-v1').then((cache) => {
      return cache.add(OFFLINE_FALLBACK_PAGE);
    })
  );
});
