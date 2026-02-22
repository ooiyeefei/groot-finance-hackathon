/**
 * Capacitor Sentry Initialization
 *
 * Conditionally initializes Sentry for the native mobile app context.
 * On web, Sentry is already initialized by @sentry/nextjs (see sentry.client.config.ts).
 * On native, we would use @sentry/capacitor — but due to version compatibility
 * issues with @sentry/nextjs@^9.47.1, native crash reporting is deferred.
 *
 * This file provides the initialization hook that can be wired up once
 * the Sentry Capacitor version compatibility is resolved.
 */

import { isNativePlatform } from './platform';

/**
 * Initialize Sentry for the Capacitor native context.
 * Currently a no-op stub — @sentry/capacitor@^2.4.1 requires
 * @sentry/nextjs@9.46.0 exactly, which conflicts with the installed ^9.47.1.
 *
 * TODO: Re-enable when @sentry/capacitor releases a version compatible
 * with @sentry/nextjs@^9.47.1, or when we upgrade to @sentry/nextjs@^10.
 */
export function initNativeSentry(): void {
  if (!isNativePlatform()) return;

  // Placeholder — will use @sentry/capacitor once version compat is resolved:
  // import * as SentryCapacitor from '@sentry/capacitor';
  // import * as SentryBrowser from '@sentry/browser';
  //
  // SentryCapacitor.init({
  //   dsn: process.env.NEXT_PUBLIC_SENTRY_MOBILE_DSN,
  //   release: 'com.hellogroot.finanseal@1.0.0',
  // }, SentryBrowser.init);

  console.log('[Sentry] Native crash reporting initialization deferred — version compat pending');
}
