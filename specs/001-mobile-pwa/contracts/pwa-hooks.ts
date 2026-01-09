/**
 * PWA Hooks API Contracts
 * Branch: 001-mobile-pwa
 *
 * These interfaces define the public API for PWA-related React hooks.
 */

// =============================================================================
// useOfflineStatus Hook
// =============================================================================

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

// =============================================================================
// usePWAInstall Hook
// =============================================================================

export interface PWAInstallState {
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

// =============================================================================
// useOfflineQueue Hook
// =============================================================================

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  endpoint: string;
  method: 'POST' | 'PUT' | 'DELETE';
  payload: Record<string, unknown>;
  createdAt: number;
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  retryCount: number;
  lastError?: string;
}

export type OfflineActionType =
  | 'expense_submission'
  | 'expense_approval'
  | 'expense_rejection'
  | 'expense_update';

export interface UseOfflineQueueReturn {
  /** All pending actions in the queue */
  pendingActions: OfflineAction[];

  /** Add an action to the offline queue */
  queueAction: (action: Omit<OfflineAction, 'id' | 'createdAt' | 'status' | 'retryCount'>) => Promise<string>;

  /** Remove a specific action from the queue */
  removeAction: (id: string) => Promise<void>;

  /** Clear all failed actions */
  clearFailedActions: () => Promise<void>;

  /** Retry all failed actions */
  retryFailedActions: () => Promise<void>;
}

// =============================================================================
// Component Props Contracts
// =============================================================================

export interface OfflineIndicatorProps {
  /** Position of the indicator */
  position?: 'top' | 'bottom';

  /** Whether to show pending action count */
  showPendingCount?: boolean;

  /** Custom class name */
  className?: string;
}

export interface PWAInstallPromptProps {
  /** Callback when user installs the PWA */
  onInstall?: () => void;

  /** Callback when user dismisses the prompt */
  onDismiss?: () => void;

  /** Custom class name */
  className?: string;
}

export interface BottomNavProps {
  /** Currently active route */
  activeRoute: string;

  /** Callback when a nav item is clicked */
  onNavigate?: (route: string) => void;

  /** Whether to show notification badges */
  showBadges?: boolean;

  /** Custom class name */
  className?: string;
}

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
