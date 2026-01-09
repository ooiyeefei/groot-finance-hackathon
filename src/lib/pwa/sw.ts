/// <reference lib="webworker" />
/**
 * Service Worker Entry Point
 * Task T005: Service worker for PWA with @serwist/next
 *
 * Handles:
 * - Precaching of static assets
 * - Runtime caching strategies (defaultCache)
 * - Offline fallback
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

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Next.js optimized cache strategies
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
