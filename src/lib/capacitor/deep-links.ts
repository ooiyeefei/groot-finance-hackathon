/**
 * Capacitor Deep Link Handler
 *
 * Handles Universal Links (Associated Domains) on iOS. When the user
 * taps a FinanSEAL URL outside the app (email, Messages, Safari),
 * iOS opens the app and delivers the URL here.
 */

import { App } from '@capacitor/app';
import { isNativePlatform } from './platform';

type DeepLinkHandler = (path: string) => void;

let linkHandler: DeepLinkHandler | null = null;
let listenerRegistered = false;

/**
 * Initialize the deep link listener. Call once on app startup.
 *
 * @param onDeepLink - Called with the URL path when a deep link is received.
 *   The path excludes the origin, e.g. '/en/expense-claims/abc123'.
 */
export function initDeepLinks(onDeepLink: DeepLinkHandler): void {
  if (!isNativePlatform() || listenerRegistered) return;

  linkHandler = onDeepLink;

  App.addListener('appUrlOpen', (event) => {
    const url = event.url;

    // Skip OAuth callback URLs — handled by auth-bridge
    if (url.startsWith('finanseal://')) return;

    // Extract path from Universal Link
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'app.finanseal.com') {
        linkHandler?.(parsed.pathname + parsed.search);
      }
    } catch {
      console.error('[DeepLinks] Failed to parse URL:', url);
    }
  });

  listenerRegistered = true;
}
