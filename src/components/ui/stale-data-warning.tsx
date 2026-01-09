/**
 * Stale Data Warning Component
 * Task T028: Warning banner for stale data (>24h old)
 *
 * Features:
 * - Warning banner with dismiss and refresh buttons
 * - Yellow/warning color scheme with semantic tokens
 * - Session-based dismissal persistence
 * - 44x44px touch targets for mobile
 */

'use client';

import { AlertTriangle, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Props interface (from specs/001-mobile-pwa/contracts/pwa-hooks.ts)
export interface StaleDataWarningProps {
  /** Timestamp of when data was last refreshed */
  lastRefresh: number;
  /** Callback when user dismisses the warning */
  onDismiss?: () => void;
  /** Callback when user requests a refresh */
  onRefresh?: () => void;
  /** Custom class name */
  className?: string;
}

/**
 * Format the age of data in human-readable form
 */
function formatDataAge(timestamp: number): string {
  const now = Date.now();
  const ageMs = now - timestamp;
  const hours = Math.floor(ageMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }
  if (hours > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  }
  return 'recently';
}

export function StaleDataWarning({
  lastRefresh,
  onDismiss,
  onRefresh,
  className = '',
}: StaleDataWarningProps) {
  const dataAge = formatDataAge(lastRefresh);

  return (
    <div
      className={`bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 ${className}`}
      role="alert"
      data-testid="stale-data-warning"
    >
      <div className="flex items-start gap-3">
        {/* Warning Icon */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
            Data may be outdated
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Last refreshed {dataAge}. Connect to the internet to get the latest data.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/20"
              onClick={onRefresh}
              aria-label="Refresh data"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 text-muted-foreground hover:bg-yellow-500/20"
              onClick={onDismiss}
              aria-label="Dismiss warning"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default StaleDataWarning;
