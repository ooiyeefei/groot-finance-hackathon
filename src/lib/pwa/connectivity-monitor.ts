/**
 * Connectivity Monitor
 * Task T012: Monitor online/offline status with event listeners
 *
 * Features:
 * - Real-time connectivity status
 * - Event listeners for status changes
 * - Auto-sync trigger on reconnect (Task T025)
 */

// ============================================================================
// Types
// ============================================================================

export type ConnectivityStatus = 'online' | 'offline';

export interface ConnectivityEvent {
  status: ConnectivityStatus;
  timestamp: number;
  wasOfflineDuration?: number;
}

export type ConnectivityListener = (event: ConnectivityEvent) => void;

// ============================================================================
// State
// ============================================================================

let currentStatus: ConnectivityStatus = 'online';
let offlineSince: number | null = null;
const listeners: Set<ConnectivityListener> = new Set();

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Initialize connectivity monitoring
 * Should be called once on app startup
 */
export function initConnectivityMonitor(): void {
  if (typeof window === 'undefined') return;

  // Set initial status
  currentStatus = navigator.onLine ? 'online' : 'offline';
  if (currentStatus === 'offline') {
    offlineSince = Date.now();
  }

  // Add event listeners
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  console.log('[Connectivity] Monitor initialized, status:', currentStatus);
}

/**
 * Clean up connectivity monitoring
 */
export function destroyConnectivityMonitor(): void {
  if (typeof window === 'undefined') return;

  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  listeners.clear();

  console.log('[Connectivity] Monitor destroyed');
}

/**
 * Get current connectivity status
 */
export function getConnectivityStatus(): ConnectivityStatus {
  if (typeof navigator !== 'undefined') {
    return navigator.onLine ? 'online' : 'offline';
  }
  return currentStatus;
}

/**
 * Check if currently online
 */
export function isOnline(): boolean {
  return getConnectivityStatus() === 'online';
}

/**
 * Subscribe to connectivity changes
 */
export function subscribeToConnectivity(listener: ConnectivityListener): () => void {
  listeners.add(listener);

  // Return unsubscribe function
  return () => {
    listeners.delete(listener);
  };
}

// ============================================================================
// Event Handlers
// ============================================================================

function handleOnline(): void {
  const wasOfflineDuration = offlineSince ? Date.now() - offlineSince : undefined;
  currentStatus = 'online';
  offlineSince = null;

  const event: ConnectivityEvent = {
    status: 'online',
    timestamp: Date.now(),
    wasOfflineDuration,
  };

  console.log('[Connectivity] Back online', wasOfflineDuration ? `after ${Math.round(wasOfflineDuration / 1000)}s` : '');

  // Notify all listeners
  notifyListeners(event);

  // Dispatch custom event for auto-sync (Task T025)
  window.dispatchEvent(new CustomEvent('connectivity-restored', { detail: event }));
}

function handleOffline(): void {
  currentStatus = 'offline';
  offlineSince = Date.now();

  const event: ConnectivityEvent = {
    status: 'offline',
    timestamp: Date.now(),
  };

  console.log('[Connectivity] Gone offline');

  // Notify all listeners
  notifyListeners(event);

  // Dispatch custom event
  window.dispatchEvent(new CustomEvent('connectivity-lost', { detail: event }));
}

function notifyListeners(event: ConnectivityEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      console.error('[Connectivity] Listener error:', error);
    }
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get how long we've been offline (in ms)
 */
export function getOfflineDuration(): number | null {
  if (offlineSince === null) return null;
  return Date.now() - offlineSince;
}

/**
 * Perform an action only when online, queue otherwise
 */
export async function whenOnline<T>(
  action: () => Promise<T>,
  fallback?: () => T
): Promise<T | undefined> {
  if (isOnline()) {
    return action();
  }

  if (fallback) {
    return fallback();
  }

  console.log('[Connectivity] Action skipped - offline');
  return undefined;
}
