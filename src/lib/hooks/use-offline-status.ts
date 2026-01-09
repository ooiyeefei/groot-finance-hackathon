/**
 * useOfflineStatus Hook
 * Task T021: Offline status management for PWA
 *
 * Features:
 * - Tracks online/offline connectivity state
 * - Reports pending offline actions count
 * - Monitors sync status
 * - Detects stale data (>24 hours old)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  subscribeToConnectivity,
  isOnline as checkOnline,
  initConnectivityMonitor,
  destroyConnectivityMonitor,
} from '@/lib/pwa/connectivity-monitor';
import {
  getPendingCount,
  processOfflineQueue,
} from '@/lib/pwa/offline-queue';
import {
  getCacheMetadata,
  checkFreshness,
} from '@/lib/pwa/cache-manager';

// Interface from specs/001-mobile-pwa/contracts/pwa-hooks.ts
export interface OfflineStatusState {
  /** Whether the browser reports online connectivity */
  isOnline: boolean;
  /** Number of actions waiting to be synced */
  pendingActionsCount: number;
  /** Whether a sync operation is currently in progress */
  isSyncing: boolean;
  /** Timestamp of last successful sync (ms) */
  lastSyncAt: number | null;
  /** Error message from last sync attempt, if any */
  lastSyncError: string | null;
  /** Whether cached data is stale (>24 hours old) */
  isDataStale: boolean;
  /** Timestamp when cache was last refreshed */
  lastCacheRefresh: number | null;
}

export interface UseOfflineStatusReturn extends OfflineStatusState {
  /** Manually trigger a sync of pending actions */
  triggerSync: () => Promise<void>;
  /** Dismiss the stale data warning for this session */
  dismissStaleWarning: () => void;
}

// Session storage key for dismissed warnings
const STALE_WARNING_DISMISSED_KEY = 'pwa-stale-warning-dismissed';

export function useOfflineStatus(): UseOfflineStatusReturn {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingActionsCount, setPendingActionsCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [isDataStale, setIsDataStale] = useState(false);
  const [lastCacheRefresh, setLastCacheRefresh] = useState<number | null>(null);
  const [staleWarningDismissed, setStaleWarningDismissed] = useState(false);

  // Initialize connectivity monitoring
  useEffect(() => {
    // Initialize on mount
    initConnectivityMonitor();
    setIsOnline(checkOnline());

    // Subscribe to connectivity changes
    const unsubscribe = subscribeToConnectivity((event) => {
      const online = event.status === 'online';
      setIsOnline(online);

      // Auto-sync when coming back online
      if (online && event.wasOfflineDuration && event.wasOfflineDuration > 0) {
        console.log('[Offline Status] Back online, triggering sync');
        // Will be handled by triggerSync
      }
    });

    // Check if stale warning was already dismissed this session
    if (typeof sessionStorage !== 'undefined') {
      const dismissed = sessionStorage.getItem(STALE_WARNING_DISMISSED_KEY);
      if (dismissed === 'true') {
        setStaleWarningDismissed(true);
      }
    }

    return () => {
      unsubscribe();
      destroyConnectivityMonitor();
    };
  }, []);

  // Poll for pending actions count and cache freshness
  useEffect(() => {
    const updateStatus = async () => {
      try {
        // Get pending actions count
        const count = await getPendingCount();
        setPendingActionsCount(count);

        // Check cache freshness
        const cacheMetadata = await getCacheMetadata('global');
        const lastSync = cacheMetadata ? cacheMetadata.cachedAt : null;
        setLastSyncAt(lastSync);
        setLastCacheRefresh(lastSync);

        // Check if data is stale (only show warning if not dismissed)
        if (!staleWarningDismissed) {
          const freshness = checkFreshness(cacheMetadata);
          setIsDataStale(freshness === 'stale' || freshness === 'expired');
        }
      } catch (error) {
        console.error('[Offline Status] Failed to update status:', error);
      }
    };

    // Update immediately
    updateStatus();

    // Poll every 5 seconds
    const interval = setInterval(updateStatus, 5000);

    return () => clearInterval(interval);
  }, [staleWarningDismissed]);

  // Trigger manual sync
  const triggerSync = useCallback(async () => {
    if (isSyncing || !isOnline) {
      console.log('[Offline Status] Sync skipped:', isSyncing ? 'already syncing' : 'offline');
      return;
    }

    setIsSyncing(true);
    setLastSyncError(null);

    try {
      const result = await processOfflineQueue();

      if (result.success) {
        setLastSyncAt(Date.now());
        setPendingActionsCount(0);
        console.log(`[Offline Status] Sync completed: ${result.processed} actions processed`);
      } else {
        setLastSyncError(result.error || 'Sync failed');
        console.error('[Offline Status] Sync failed:', result.error);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setLastSyncError(errorMessage);
      console.error('[Offline Status] Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, isOnline]);

  // Dismiss stale data warning for this session
  const dismissStaleWarning = useCallback(() => {
    setIsDataStale(false);
    setStaleWarningDismissed(true);

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STALE_WARNING_DISMISSED_KEY, 'true');
    }

    console.log('[Offline Status] Stale warning dismissed for session');
  }, []);

  return {
    isOnline,
    pendingActionsCount,
    isSyncing,
    lastSyncAt,
    lastSyncError,
    isDataStale,
    lastCacheRefresh,
    triggerSync,
    dismissStaleWarning,
  };
}
