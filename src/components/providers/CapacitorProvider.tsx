'use client';

/**
 * Capacitor Provider
 *
 * Initializes all Capacitor native modules when running inside the iOS shell.
 * On web, this component is a no-op passthrough.
 *
 * Initialization order:
 * 1. Auth bridge (must be first — listens for OAuth callbacks)
 * 2. Deep links (listens for Universal Links)
 * 3. Push notifications (registers device token, sends to Convex)
 * 4. Update checker (queries Convex for version info)
 * 5. Sentry (stub — deferred due to version compat)
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { isNativePlatform, getPlatform } from '@/lib/capacitor/platform';
import { initAuthBridge } from '@/lib/capacitor/auth-bridge';
import { initDeepLinks } from '@/lib/capacitor/deep-links';
import { initPushNotifications, unregisterPushNotifications } from '@/lib/capacitor/push-notifications';
import { usePushTokenSync } from '@/lib/capacitor/use-push-token-sync';
import { checkForUpdate, type UpdateCheckResult } from '@/lib/capacitor/update-checker';
import { initNativeSentry } from '@/lib/capacitor/sentry-init';
import { ForceUpdatePrompt, SoftUpdateBanner } from '@/components/ui/app-update-prompt';
import { useActiveBusiness } from '@/contexts/business-context';

interface CapacitorProviderProps {
  children: React.ReactNode;
}

export function CapacitorProvider({ children }: CapacitorProviderProps) {
  const router = useRouter();
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const initRef = useRef(false);
  const pushInitRef = useRef(false);

  // Convex hooks — only active when authenticated
  const registerPushToken = useMutation(api.functions.pushSubscriptions.register);
  const unregisterPush = useMutation(api.functions.pushSubscriptions.unregister);

  // Sync push token to Convex once business context is available
  const { businessId } = useActiveBusiness();
  usePushTokenSync(businessId);

  // Query app version from Convex (returns defaults if no record exists)
  const platform = isNativePlatform() ? (getPlatform() as 'ios' | 'android') : 'ios';
  const appVersion = useQuery(
    api.functions.appVersions.getAppVersion,
    isNativePlatform() ? { platform } : 'skip'
  );

  // --- Module Initialization (runs once) ---
  useEffect(() => {
    if (!isNativePlatform() || initRef.current) return;
    initRef.current = true;

    // 1. Auth bridge — listens for finanseal:// OAuth callbacks
    initAuthBridge();

    // 2. Deep links — routes Universal Links to Next.js pages
    initDeepLinks((path: string) => {
      router.push(path);
    });

    // 5. Sentry native crash reporting (stub)
    initNativeSentry();
  }, [router]);

  // --- Push Notification Registration (after auth) ---
  useEffect(() => {
    if (!isNativePlatform() || !authLoaded || pushInitRef.current) return;

    if (isSignedIn) {
      pushInitRef.current = true;

      initPushNotifications(
        // onToken — register device token with Convex
        async (token: string) => {
          try {
            // We need a businessId for registration. Use a placeholder approach:
            // the actual businessId will be set when the business context loads.
            // For now, we store the token and it will be updated on business switch.
            console.log('[Capacitor] Push token received, length:', token.length);
            // Token registration happens in the push-token-sync effect below
            // Store token in sessionStorage for the sync effect to pick up
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('capacitor_push_token', token);
            }
          } catch (err) {
            console.error('[Capacitor] Failed to process push token:', err);
          }
        },
        // onNotificationTap — navigate to the notification's resource
        (resourceUrl: string) => {
          router.push(resourceUrl);
        }
      );
    } else if (!isSignedIn && pushInitRef.current) {
      // User signed out — unregister push notifications
      const storedToken = typeof window !== 'undefined'
        ? sessionStorage.getItem('capacitor_push_token')
        : null;

      if (storedToken) {
        unregisterPush({ deviceToken: storedToken }).catch(() => {});
        sessionStorage.removeItem('capacitor_push_token');
      }

      unregisterPushNotifications();
      pushInitRef.current = false;
    }
  }, [authLoaded, isSignedIn, router, unregisterPush]);

  // --- Update Check (after version data loads) ---
  useEffect(() => {
    if (!isNativePlatform() || !appVersion) return;

    checkForUpdate(
      appVersion.minimumVersion,
      appVersion.latestVersion,
      appVersion.forceUpdateMessage,
      appVersion.softUpdateMessage
    ).then(setUpdateResult).catch((err) => {
      console.error('[Capacitor] Update check failed:', err);
    });
  }, [appVersion]);

  // Force update blocks the entire UI
  if (updateResult?.status === 'force') {
    return (
      <ForceUpdatePrompt
        message={updateResult.message}
        currentVersion={updateResult.currentVersion}
      />
    );
  }

  return (
    <>
      {updateResult?.status === 'soft' && (
        <SoftUpdateBanner
          message={updateResult.message}
          currentVersion={updateResult.currentVersion}
        />
      )}
      {children}
    </>
  );
}
