/**
 * PWA Provider Component
 * Tasks T031, T037: Integrates PWA components into the app shell
 *
 * Features:
 * - Offline indicator (US2)
 * - PWA install prompt (US3)
 * - Auto-sync initialization
 * - Client-side only rendering
 */

'use client';

import { useEffect } from 'react';
import { OfflineIndicator } from '@/components/ui/offline-indicator';
import { PWAInstallPrompt } from '@/components/ui/pwa-install-prompt';
import { StaleDataWarning } from '@/components/ui/stale-data-warning';
import { useOfflineStatus } from '@/lib/hooks/use-offline-status';
import { initAutoSync, destroyAutoSync } from '@/lib/pwa/offline-queue';
import { initConnectivityMonitor, destroyConnectivityMonitor } from '@/lib/pwa/connectivity-monitor';
import { registerServiceWorker } from '@/lib/pwa/service-worker';

interface PWAProviderProps {
  children: React.ReactNode;
}

function PWAContent() {
  const { isDataStale, lastCacheRefresh, dismissStaleWarning, triggerSync } = useOfflineStatus();

  return (
    <>
      {/* Offline Indicator - shows when offline or pending actions */}
      <OfflineIndicator position="top" showPendingCount />

      {/* PWA Install Prompt - shows install banner for mobile users */}
      <PWAInstallPrompt
        onInstall={() => {
          console.log('[PWA] App installed');
        }}
        onDismiss={() => {
          console.log('[PWA] Install prompt dismissed');
        }}
      />

      {/* Stale Data Warning - shows when data is >24h old */}
      {isDataStale && lastCacheRefresh && (
        <div className="fixed top-12 left-4 right-4 z-30 max-w-lg mx-auto">
          <StaleDataWarning
            lastRefresh={lastCacheRefresh}
            onDismiss={dismissStaleWarning}
            onRefresh={triggerSync}
          />
        </div>
      )}
    </>
  );
}

export function PWAProvider({ children }: PWAProviderProps) {
  // Initialize PWA infrastructure on mount
  useEffect(() => {
    // Initialize connectivity monitoring
    initConnectivityMonitor();

    // Initialize auto-sync for offline queue
    initAutoSync();

    // Register service worker (production only)
    if (process.env.NODE_ENV === 'production') {
      registerServiceWorker()
        .then((result) => {
          if (result.success) {
            console.log('[PWA] Service worker registered successfully');
          }
        })
        .catch((error) => {
          console.error('[PWA] Service worker registration failed:', error);
        });
    }

    return () => {
      destroyConnectivityMonitor();
      destroyAutoSync();
    };
  }, []);

  return (
    <>
      {children}
      <PWAContent />
    </>
  );
}

export default PWAProvider;
