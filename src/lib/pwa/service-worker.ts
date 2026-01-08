/**
 * Service Worker Registration
 * Task T007: Client-side service worker registration utility
 *
 * Handles:
 * - Registration of service worker
 * - Update detection
 * - Error handling
 */

export interface ServiceWorkerRegistrationResult {
  success: boolean;
  registration?: ServiceWorkerRegistration;
  error?: Error;
}

/**
 * Register the service worker
 * Should be called once on app initialization
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistrationResult> {
  // Skip registration during SSR or if service worker not supported
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return {
      success: false,
      error: new Error('Service worker not supported'),
    };
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    console.log('[PWA] Service worker registered:', registration.scope);

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New content is available, prompt user to refresh
            console.log('[PWA] New content available, refresh to update');
            // Could dispatch a custom event here for UI to handle
            window.dispatchEvent(new CustomEvent('sw-update-available'));
          }
        });
      }
    });

    return { success: true, registration };
  } catch (error) {
    console.error('[PWA] Service worker registration failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Unregister all service workers
 * Useful for debugging or forced cleanup
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((reg) => reg.unregister()));
    console.log('[PWA] All service workers unregistered');
    return true;
  } catch (error) {
    console.error('[PWA] Failed to unregister service workers:', error);
    return false;
  }
}

/**
 * Check if app is running as installed PWA
 */
export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    ('standalone' in window.navigator && (window.navigator as unknown as { standalone: boolean }).standalone === true)
  );
}
