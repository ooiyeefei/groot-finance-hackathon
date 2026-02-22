/**
 * Offline Indicator Component
 * Task T022, T026: Shows offline status and pending action count
 *
 * Features:
 * - Shows offline badge when disconnected
 * - Displays pending action count
 * - Shows last synced timestamp
 * - Responsive with 44x44px touch targets
 * - Uses semantic tokens for theming
 */

'use client';

import { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, Clock } from 'lucide-react';
import { useOfflineStatus } from '@/lib/hooks/use-offline-status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatLastSynced } from '@/lib/pwa/cache-manager';

// Props interface (from specs/001-mobile-pwa/contracts/pwa-hooks.ts)
export interface OfflineIndicatorProps {
  /** Position of the indicator */
  position?: 'top' | 'bottom';
  /** Whether to show pending action count */
  showPendingCount?: boolean;
  /** Custom class name */
  className?: string;
}

export function OfflineIndicator({
  position = 'top',
  showPendingCount = true,
  className = '',
}: OfflineIndicatorProps) {
  const {
    isOnline,
    pendingActionsCount,
    isSyncing,
    lastSyncAt,
    triggerSync,
  } = useOfflineStatus();

  // Hydration-safe: compute time-relative text only after mount
  const [lastSyncedText, setLastSyncedText] = useState<string | null>(null);

  useEffect(() => {
    setLastSyncedText(formatLastSynced(lastSyncAt));
    const interval = setInterval(() => setLastSyncedText(formatLastSynced(lastSyncAt)), 60_000);
    return () => clearInterval(interval);
  }, [lastSyncAt]);

  // Don't show if online and no pending actions
  if (isOnline && pendingActionsCount === 0) {
    return null;
  }

  const positionClasses = position === 'top' ? 'top-0' : 'bottom-0';

  return (
    <div
      className={`fixed left-0 right-0 z-40 ${positionClasses} ${className}`}
      data-testid="offline-indicator"
    >
      <div className="bg-card/95 backdrop-blur-sm border-b border-border px-4 py-2 shadow-sm">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          {/* Status Badge */}
          <div className="flex items-center gap-2 min-w-0">
            {!isOnline ? (
              <Badge
                variant="outline"
                className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30 flex items-center gap-1.5 px-2 py-1"
              >
                <WifiOff className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">Offline</span>
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 flex items-center gap-1.5 px-2 py-1"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="text-xs font-medium">
                  {isSyncing ? 'Syncing...' : 'Pending'}
                </span>
              </Badge>
            )}

            {/* Pending Count */}
            {showPendingCount && pendingActionsCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {pendingActionsCount} action{pendingActionsCount !== 1 ? 's' : ''} pending
              </span>
            )}
          </div>

          {/* Right Side: Last Synced + Sync Button */}
          <div className="flex items-center gap-2">
            {/* Last Synced */}
            {lastSyncedText && (
              <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{lastSyncedText}</span>
              </div>
            )}

            {/* Sync Button */}
            {isOnline && pendingActionsCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 text-xs"
                onClick={triggerSync}
                disabled={isSyncing}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing' : 'Sync Now'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default OfflineIndicator;
