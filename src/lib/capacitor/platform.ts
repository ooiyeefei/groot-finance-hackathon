/**
 * Capacitor Platform Detection Utilities
 *
 * Detects whether the app is running inside a Capacitor native shell
 * or in a standard web browser. Safe to call on both client and server.
 */

import { Capacitor } from '@capacitor/core';

/** Returns true when running inside a Capacitor native shell (iOS/Android). */
export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return Capacitor.isNativePlatform();
}

/** Returns the current platform: 'ios', 'android', or 'web'. */
export function getPlatform(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web';
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
}

/** Returns true when running on iOS (native). */
export function isIOS(): boolean {
  return getPlatform() === 'ios';
}
