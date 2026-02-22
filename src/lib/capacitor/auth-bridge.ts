/**
 * Capacitor Auth Bridge
 *
 * Intercepts OAuth sign-in attempts in the Capacitor native shell and routes
 * them through SFSafariViewController (via @capacitor/browser) to avoid
 * Google's WebView blocking policy. Email/password auth works directly
 * in the WebView and doesn't need bridging.
 */

import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { isNativePlatform } from './platform';

/** Callback to handle the parsed auth token from the OAuth redirect. */
type AuthCallback = (url: string) => void;

let authCallback: AuthCallback | null = null;
let listenerRegistered = false;

/**
 * Register the deep link listener for OAuth callbacks.
 * Must be called once on app startup when running in Capacitor.
 */
export function initAuthBridge(): void {
  if (!isNativePlatform() || listenerRegistered) return;

  App.addListener('appUrlOpen', async (event) => {
    const url = event.url;

    // Handle finanseal:// callback URLs from OAuth redirects
    if (url.startsWith('finanseal://')) {
      await Browser.close();
      authCallback?.(url);
      authCallback = null;
    }
  });

  listenerRegistered = true;
}

/**
 * Open an OAuth URL in the system browser (SFSafariViewController on iOS).
 * Returns a promise that resolves with the callback URL when the OAuth
 * flow completes and redirects back to the app.
 */
export function openOAuthInSystemBrowser(oauthUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!isNativePlatform()) {
      reject(new Error('openOAuthInSystemBrowser called outside Capacitor'));
      return;
    }

    authCallback = (callbackUrl: string) => {
      resolve(callbackUrl);
    };

    // Open in SFSafariViewController (iOS) / Chrome Custom Tab (Android)
    Browser.open({ url: oauthUrl, windowName: '_self' }).catch((err) => {
      authCallback = null;
      reject(err);
    });
  });
}
