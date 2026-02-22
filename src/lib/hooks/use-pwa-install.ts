/**
 * usePWAInstall Hook
 * Task T032: PWA installation prompt management
 *
 * Features:
 * - Captures beforeinstallprompt event (Android/Chrome)
 * - Detects iOS for manual installation instructions
 * - Implements prompt timing logic (show on second visit)
 * - 7-day dismissal cooldown persistence
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { isNativePlatform } from '@/lib/capacitor/platform';

// PWA Install State Interface (from specs/001-mobile-pwa/contracts/pwa-hooks.ts)
interface PWAInstallState {
  /** Whether the PWA is already installed */
  isInstalled: boolean;
  /** Whether the browser supports PWA installation */
  isInstallable: boolean;
  /** Whether the install prompt is currently showing */
  isPromptShowing: boolean;
  /** Whether the user has dismissed the install prompt */
  hasUserDismissed: boolean;
  /** Whether we're on iOS (requires manual installation instructions) */
  isIOS: boolean;
  /** Whether we're on a mobile device */
  isMobile: boolean;
  /** Whether to show iOS installation instructions */
  shouldShowIOSInstructions: boolean;
}

export interface UsePWAInstallReturn extends PWAInstallState {
  /** Trigger the browser's install prompt (Android/Chrome) */
  promptInstall: () => Promise<void>;
  /** Mark the install prompt as dismissed */
  dismissPrompt: () => void;
  /** Show iOS-specific installation instructions */
  showIOSInstructions: () => void;
  /** Hide iOS installation instructions */
  hideIOSInstructions: () => void;
}

// Storage keys
const STORAGE_KEY_DISMISSED = 'pwa-install-dismissed';
const STORAGE_KEY_VISIT_COUNT = 'pwa-visit-count';
const DISMISS_COOLDOWN_DAYS = 7;

// Type for beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Detect if running on iOS
 */
function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}

/**
 * Detect if running on a mobile device
 * Uses combination of: user agent, screen width, and touch capability
 */
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent.toLowerCase();

  // User agent detection for common mobile devices
  const mobileUserAgent = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/.test(userAgent);

  // Screen width check (< 768px is typically mobile/tablet)
  const smallScreen = window.innerWidth < 768;

  // Touch capability check
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Consider mobile if: (mobile user agent) OR (small screen AND touch capable)
  return mobileUserAgent || (smallScreen && hasTouch);
}

/**
 * Detect if running in standalone mode (already installed)
 */
function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator &&
      (window.navigator as unknown as { standalone: boolean }).standalone === true)
  );
}

/**
 * Check if dismiss cooldown has expired
 */
function isDismissExpired(): boolean {
  if (typeof localStorage === 'undefined') return true;

  const dismissedAt = localStorage.getItem(STORAGE_KEY_DISMISSED);
  if (!dismissedAt) return true;

  const dismissedTime = parseInt(dismissedAt, 10);
  const cooldownMs = DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

  return Date.now() - dismissedTime > cooldownMs;
}

/**
 * Get and increment visit count
 */
function getVisitCount(): number {
  if (typeof localStorage === 'undefined') return 1;

  const count = parseInt(localStorage.getItem(STORAGE_KEY_VISIT_COUNT) || '0', 10);
  return count;
}

function incrementVisitCount(): void {
  if (typeof localStorage === 'undefined') return;

  const count = getVisitCount();
  localStorage.setItem(STORAGE_KEY_VISIT_COUNT, String(count + 1));
}

export function usePWAInstall(): UsePWAInstallReturn {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isPromptShowing, setIsPromptShowing] = useState(false);
  const [hasUserDismissed, setHasUserDismissed] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  // Skip all PWA install logic inside Capacitor — user already has the native app
  const isCapacitorNative = typeof window !== 'undefined' && isNativePlatform();

  const isIOS = typeof window !== 'undefined' && isIOSDevice();
  const isMobile = typeof window !== 'undefined' && isMobileDevice();
  const isInstallable = deferredPrompt !== null;

  // Task T035: Show on second visit
  const visitCount = typeof window !== 'undefined' ? getVisitCount() : 0;
  const isSecondVisit = visitCount >= 1;

  // Should show iOS instructions (second visit, not installed, not dismissed, iOS device, MOBILE ONLY)
  const shouldShowIOSInstructions =
    isMobile && isIOS && isSecondVisit && !isInstalled && !hasUserDismissed && isDismissExpired();

  useEffect(() => {
    // Skip all PWA logic inside Capacitor native shell
    if (isCapacitorNative) {
      setIsInstalled(true);
      return;
    }

    // Check if already installed
    if (isStandaloneMode()) {
      setIsInstalled(true);
      return;
    }

    // Check if previously dismissed within cooldown
    if (!isDismissExpired()) {
      setHasUserDismissed(true);
    }

    // Increment visit count on mount
    incrementVisitCount();

    // Listen for the beforeinstallprompt event (Android/Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      // Only prevent default on mobile where we show our custom prompt
      // On desktop, let Chrome show its native install icon in address bar
      if (isMobileDevice()) {
        e.preventDefault();
      }
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // Listen for successful installation
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      console.log('[PWA] App installed successfully');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isCapacitorNative]);

  // Task T032: Trigger browser install prompt
  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) {
      console.warn('[PWA] No deferred prompt available');
      return;
    }

    setIsPromptShowing(true);

    try {
      // Show the install prompt
      await deferredPrompt.prompt();

      // Wait for the user's response
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        console.log('[PWA] User accepted the install prompt');
        setIsInstalled(true);
      } else {
        console.log('[PWA] User dismissed the install prompt');
        setHasUserDismissed(true);
        // Store dismiss timestamp for cooldown
        localStorage.setItem(STORAGE_KEY_DISMISSED, String(Date.now()));
      }
    } catch (error) {
      console.error('[PWA] Error during install prompt:', error);
    } finally {
      setIsPromptShowing(false);
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  // Task T036: Dismiss with 7-day cooldown
  const dismissPrompt = useCallback(() => {
    setHasUserDismissed(true);
    localStorage.setItem(STORAGE_KEY_DISMISSED, String(Date.now()));
    console.log('[PWA] User dismissed prompt, cooldown for 7 days');
  }, []);

  // Show iOS installation instructions
  const handleShowIOSInstructions = useCallback(() => {
    setShowIOSInstructions(true);
  }, []);

  // Hide iOS installation instructions
  const hideIOSInstructions = useCallback(() => {
    setShowIOSInstructions(false);
  }, []);

  return {
    isInstalled,
    isInstallable,
    isPromptShowing,
    hasUserDismissed,
    isIOS,
    isMobile,
    shouldShowIOSInstructions,
    promptInstall,
    dismissPrompt,
    showIOSInstructions: handleShowIOSInstructions,
    hideIOSInstructions,
  };
}
