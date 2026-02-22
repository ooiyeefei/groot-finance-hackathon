'use client';

/**
 * Push Token Sync Hook
 *
 * Registers the device push token with Convex once the business context
 * is available. Called from within BusinessContextProvider's tree.
 */

import { useEffect, useRef } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { isNativePlatform, getPlatform } from './platform';

/**
 * Syncs the stored push token to Convex with the active business ID.
 * Must be rendered inside both ConvexClientProvider and BusinessContextProvider.
 */
export function usePushTokenSync(businessId: string | null | undefined) {
  const registerPush = useMutation(api.functions.pushSubscriptions.register);
  const syncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isNativePlatform() || !businessId) return;

    const token = typeof window !== 'undefined'
      ? sessionStorage.getItem('capacitor_push_token')
      : null;

    if (!token) return;

    // Avoid re-registering the same token+business combo
    const syncKey = `${token}:${businessId}`;
    if (syncedRef.current === syncKey) return;

    const platform = getPlatform() as 'ios' | 'android';

    registerPush({
      businessId: businessId as never, // Convex ID type
      platform,
      deviceToken: token,
    })
      .then(() => {
        syncedRef.current = syncKey;
        console.log('[PushSync] Token registered with business:', businessId);
      })
      .catch((err) => {
        console.error('[PushSync] Registration failed:', err);
      });
  }, [businessId, registerPush]);
}
