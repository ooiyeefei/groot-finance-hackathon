/**
 * Offline Queue with IndexedDB
 * Task T010: IndexedDB database schema for offline action queue
 *
 * Implements:
 * - finanseal_pwa database
 * - offlineActions object store with indexes
 * - Queue management (add, process, clear)
 * - Server-wins conflict resolution per spec
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

// ============================================================================
// Types
// ============================================================================

export type OfflineActionStatus = 'pending' | 'processing' | 'failed' | 'completed';

export type OfflineActionType =
  | 'create_expense'
  | 'update_expense'
  | 'submit_expense'
  | 'approve_expense'
  | 'reject_expense';

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  payload: Record<string, unknown>;
  status: OfflineActionStatus;
  createdAt: number;
  retryCount: number;
  lastError?: string;
  completedAt?: number;
}

export interface SyncResult {
  actionId: string;
  success: boolean;
  error?: string;
  conflictResolved?: boolean;
}

// ============================================================================
// Database Schema
// ============================================================================

interface FinanSealPWADB extends DBSchema {
  offlineActions: {
    key: string;
    value: OfflineAction;
    indexes: {
      'by_status': OfflineActionStatus;
      'by_created': number;
      'by_type': OfflineActionType;
    };
  };
}

const DB_NAME = 'finanseal_pwa';
const DB_VERSION = 1;
const MAX_RETRY_ATTEMPTS = 3;

let dbInstance: IDBPDatabase<FinanSealPWADB> | null = null;

// ============================================================================
// Database Initialization
// ============================================================================

/**
 * Get or create database instance
 */
async function getDB(): Promise<IDBPDatabase<FinanSealPWADB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<FinanSealPWADB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create offlineActions store if it doesn't exist
      if (!db.objectStoreNames.contains('offlineActions')) {
        const store = db.createObjectStore('offlineActions', { keyPath: 'id' });
        store.createIndex('by_status', 'status');
        store.createIndex('by_created', 'createdAt');
        store.createIndex('by_type', 'type');
      }
    },
    blocked() {
      console.warn('[OfflineQueue] Database upgrade blocked by other tabs');
    },
    blocking() {
      console.warn('[OfflineQueue] This tab is blocking database upgrade');
      dbInstance?.close();
      dbInstance = null;
    },
  });

  return dbInstance;
}

// ============================================================================
// Queue Operations
// ============================================================================

/**
 * Queue an action for offline processing
 * Task T023: Implement queueOfflineAction function
 */
export async function queueOfflineAction(
  action: Omit<OfflineAction, 'id' | 'createdAt' | 'status' | 'retryCount'>
): Promise<string> {
  const db = await getDB();
  const id = crypto.randomUUID();

  const fullAction: OfflineAction = {
    ...action,
    id,
    createdAt: Date.now(),
    status: 'pending',
    retryCount: 0,
  };

  await db.put('offlineActions', fullAction);
  console.log('[OfflineQueue] Action queued:', id, action.type);

  return id;
}

/**
 * Get all pending actions in FIFO order
 */
export async function getPendingActions(): Promise<OfflineAction[]> {
  const db = await getDB();
  const actions = await db.getAllFromIndex('offlineActions', 'by_status', 'pending');
  // Sort by creation time (FIFO)
  return actions.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Get count of pending actions
 */
export async function getPendingCount(): Promise<number> {
  const db = await getDB();
  return db.countFromIndex('offlineActions', 'by_status', 'pending');
}

/**
 * Update action status
 */
export async function updateActionStatus(
  id: string,
  status: OfflineActionStatus,
  error?: string
): Promise<void> {
  const db = await getDB();
  const action = await db.get('offlineActions', id);

  if (!action) {
    console.warn('[OfflineQueue] Action not found:', id);
    return;
  }

  const updated: OfflineAction = {
    ...action,
    status,
    lastError: error,
    ...(status === 'completed' && { completedAt: Date.now() }),
    ...(status === 'failed' && { retryCount: action.retryCount + 1 }),
  };

  await db.put('offlineActions', updated);
}

/**
 * Clear completed actions (cleanup)
 */
export async function clearCompletedActions(): Promise<number> {
  const db = await getDB();
  const completed = await db.getAllFromIndex('offlineActions', 'by_status', 'completed');

  for (const action of completed) {
    await db.delete('offlineActions', action.id);
  }

  console.log('[OfflineQueue] Cleared', completed.length, 'completed actions');
  return completed.length;
}

/**
 * Clear all actions (for testing/reset)
 */
export async function clearAllActions(): Promise<void> {
  const db = await getDB();
  await db.clear('offlineActions');
  console.log('[OfflineQueue] Cleared all actions');
}

/**
 * Get action by ID
 */
export async function getAction(id: string): Promise<OfflineAction | undefined> {
  const db = await getDB();
  return db.get('offlineActions', id);
}

// ============================================================================
// Auto-Sync on Connectivity Restore (Task T025)
// ============================================================================

let autoSyncInitialized = false;

/**
 * Default action processor for sync
 * This makes API calls to sync offline actions with the server
 */
async function defaultActionProcessor(
  action: OfflineAction
): Promise<{ success: boolean; conflict?: boolean; error?: string }> {
  // Map action types to API endpoints
  const endpointMap: Record<OfflineActionType, { method: string; url: string }> = {
    create_expense: { method: 'POST', url: '/api/expense-claims' },
    update_expense: { method: 'PUT', url: '/api/expense-claims' },
    submit_expense: { method: 'POST', url: '/api/expense-claims/submit' },
    approve_expense: { method: 'POST', url: '/api/expense-claims/approve' },
    reject_expense: { method: 'POST', url: '/api/expense-claims/reject' },
  };

  const endpoint = endpointMap[action.type];
  if (!endpoint) {
    return { success: false, error: `Unknown action type: ${action.type}` };
  }

  try {
    const response = await fetch(endpoint.url, {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(action.payload),
    });

    if (response.ok) {
      return { success: true };
    }

    // Handle conflict (409)
    if (response.status === 409) {
      return { success: false, conflict: true, error: 'Server conflict detected' };
    }

    // Handle other errors
    const errorText = await response.text();
    return { success: false, error: `API error: ${response.status} - ${errorText}` };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Process the offline queue with the default processor
 * Returns a simple result for UI consumption
 */
export async function processOfflineQueue(): Promise<{
  success: boolean;
  processed: number;
  failed: number;
  error?: string;
}>;

/**
 * Process the offline queue with a custom processor
 */
export async function processOfflineQueue(
  processor: (action: OfflineAction) => Promise<{ success: boolean; conflict?: boolean; error?: string }>
): Promise<SyncResult[]>;

/**
 * Implementation
 */
export async function processOfflineQueue(
  processor?: (action: OfflineAction) => Promise<{ success: boolean; conflict?: boolean; error?: string }>
): Promise<SyncResult[] | { success: boolean; processed: number; failed: number; error?: string }> {
  const pendingActions = await getPendingActions();

  if (pendingActions.length === 0) {
    if (processor) {
      return [];
    }
    return { success: true, processed: 0, failed: 0 };
  }

  console.log('[OfflineQueue] Processing', pendingActions.length, 'pending actions');

  const results: SyncResult[] = [];
  const actualProcessor = processor || defaultActionProcessor;

  for (const action of pendingActions) {
    // Skip if max retries exceeded
    if (action.retryCount >= MAX_RETRY_ATTEMPTS) {
      console.warn('[OfflineQueue] Max retries exceeded for action:', action.id);
      await updateActionStatus(action.id, 'failed', 'Max retry attempts exceeded');
      results.push({ actionId: action.id, success: false, error: 'Max retry attempts exceeded' });
      continue;
    }

    // Mark as processing
    await updateActionStatus(action.id, 'processing');

    try {
      const result = await actualProcessor(action);

      if (result.success) {
        await updateActionStatus(action.id, 'completed');
        results.push({
          actionId: action.id,
          success: true,
          conflictResolved: result.conflict,
        });
      } else if (result.conflict) {
        // Server-wins conflict resolution (FR-019)
        console.log('[OfflineQueue] Conflict detected, discarding action (server-wins):', action.id);
        await updateActionStatus(action.id, 'completed', 'Discarded due to conflict (server-wins)');
        results.push({
          actionId: action.id,
          success: false,
          error: result.error || 'Action discarded due to server conflict',
          conflictResolved: true,
        });
      } else {
        // Retry later
        await updateActionStatus(action.id, 'pending', result.error);
        results.push({ actionId: action.id, success: false, error: result.error });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await updateActionStatus(action.id, 'pending', errorMessage);
      results.push({ actionId: action.id, success: false, error: errorMessage });
    }
  }

  // If using default processor, return simplified result
  if (!processor) {
    const processed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const hasErrors = failed > 0;

    return {
      success: !hasErrors || processed > 0,
      processed,
      failed,
      error: hasErrors ? `${failed} action(s) failed to sync` : undefined,
    };
  }

  return results;
}

/**
 * Initialize auto-sync on connectivity restore
 * Task T025: Listen for 'connectivity-restored' event and trigger sync
 */
export function initAutoSync(): void {
  if (typeof window === 'undefined' || autoSyncInitialized) return;

  window.addEventListener('connectivity-restored', async () => {
    console.log('[OfflineQueue] Connectivity restored, starting auto-sync');

    try {
      const result = await processOfflineQueue();

      if ('processed' in result) {
        console.log('[OfflineQueue] Auto-sync completed:', result.processed, 'processed,', result.failed, 'failed');

        // Dispatch sync complete event
        window.dispatchEvent(new CustomEvent('offline-sync-complete', {
          detail: result,
        }));
      }
    } catch (error) {
      console.error('[OfflineQueue] Auto-sync failed:', error);
    }
  });

  autoSyncInitialized = true;
  console.log('[OfflineQueue] Auto-sync initialized');
}

/**
 * Clean up auto-sync listener
 */
export function destroyAutoSync(): void {
  autoSyncInitialized = false;
}
