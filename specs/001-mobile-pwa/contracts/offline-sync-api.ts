/**
 * Offline Sync API Contracts
 * Branch: 001-mobile-pwa
 *
 * These interfaces define the API contracts for offline sync operations.
 * Note: Most PWA functionality is client-side only. This defines the
 * client-server sync protocol for offline-queued actions.
 */

// =============================================================================
// Sync Request/Response Types
// =============================================================================

/**
 * Request to sync offline-queued expense submission
 * Endpoint: POST /api/v1/expense-claims
 */
export interface SyncExpenseSubmissionRequest {
  /** Client-generated UUID for idempotency */
  clientId: string;

  /** Original timestamp when action was created offline */
  offlineCreatedAt: number;

  /** Expense claim data */
  data: {
    vendor_name: string;
    total_amount: number;
    original_currency: string;
    transaction_date: string;
    description: string;
    business_purpose: string;
    expense_category?: string;
  };

  /** Base64-encoded receipt image (if captured offline) */
  receiptImage?: string;
}

export interface SyncExpenseSubmissionResponse {
  success: boolean;

  /** Server-assigned expense claim ID */
  expenseClaimId?: string;

  /** Processing task ID for AI extraction */
  taskId?: string;

  /** Error details if sync failed */
  error?: {
    code: SyncErrorCode;
    message: string;
    retryable: boolean;
  };
}

/**
 * Request to sync offline-queued expense approval
 * Endpoint: PUT /api/v1/expense-claims/{id}/status
 */
export interface SyncExpenseApprovalRequest {
  /** Client-generated UUID for idempotency */
  clientId: string;

  /** Original timestamp when action was created offline */
  offlineCreatedAt: number;

  /** Target status */
  status: 'approved' | 'rejected';

  /** Rejection reason (required if status is 'rejected') */
  rejectionReason?: string;
}

export interface SyncExpenseApprovalResponse {
  success: boolean;

  /** Updated expense claim status */
  newStatus?: string;

  /** Server error details */
  error?: {
    code: SyncErrorCode;
    message: string;
    retryable: boolean;
  };
}

// =============================================================================
// Sync Error Types
// =============================================================================

export type SyncErrorCode =
  /** Resource no longer exists on server */
  | 'NOT_FOUND'
  /** User no longer has permission */
  | 'FORBIDDEN'
  /** Resource was modified by another user (conflict) */
  | 'CONFLICT'
  /** Request validation failed */
  | 'VALIDATION_ERROR'
  /** Server error, may be retryable */
  | 'SERVER_ERROR'
  /** Network error, retryable */
  | 'NETWORK_ERROR'
  /** Unknown error */
  | 'UNKNOWN';

export interface SyncConflictDetails {
  /** What type of conflict occurred */
  conflictType: 'deleted' | 'modified' | 'status_changed';

  /** Current server state (for user notification) */
  serverState?: {
    status?: string;
    modifiedAt?: string;
    modifiedBy?: string;
  };

  /** Action taken by sync (per spec: server wins) */
  resolution: 'server_wins';

  /** User-friendly message explaining what happened */
  userMessage: string;
}

// =============================================================================
// Sync Batch Types (for bulk sync on reconnect)
// =============================================================================

/**
 * Batch sync request for multiple offline actions
 * Endpoint: POST /api/v1/sync/batch
 */
export interface BatchSyncRequest {
  /** Array of offline actions to sync */
  actions: OfflineSyncAction[];

  /** Client device identifier for debugging */
  deviceId: string;

  /** Client PWA version */
  pwaVersion: string;
}

export interface OfflineSyncAction {
  /** Client-generated action ID */
  clientId: string;

  /** Type of action */
  type: 'expense_submission' | 'expense_approval' | 'expense_rejection' | 'expense_update';

  /** API endpoint for this action */
  endpoint: string;

  /** HTTP method */
  method: 'POST' | 'PUT' | 'DELETE';

  /** Action payload */
  payload: Record<string, unknown>;

  /** When action was created offline */
  offlineCreatedAt: number;
}

export interface BatchSyncResponse {
  /** Overall sync status */
  success: boolean;

  /** Results for each action */
  results: SyncActionResult[];

  /** Server timestamp for sync record */
  syncedAt: string;
}

export interface SyncActionResult {
  /** Client action ID */
  clientId: string;

  /** Whether this specific action succeeded */
  success: boolean;

  /** Server-assigned ID (for creates) */
  serverId?: string;

  /** Error details if failed */
  error?: {
    code: SyncErrorCode;
    message: string;
    retryable: boolean;
    conflictDetails?: SyncConflictDetails;
  };
}

// =============================================================================
// Cache Invalidation Types
// =============================================================================

/**
 * Server-sent events for cache invalidation
 * Endpoint: GET /api/v1/sync/events (SSE)
 */
export interface CacheInvalidationEvent {
  type: 'cache_invalidation';

  /** Which cache keys to invalidate */
  keys: string[];

  /** Reason for invalidation */
  reason: 'data_updated' | 'data_deleted' | 'permissions_changed';

  /** Timestamp of change */
  timestamp: string;
}

/**
 * Connection status event for SSE
 */
export interface ConnectionStatusEvent {
  type: 'connection_status';
  status: 'connected' | 'reconnecting' | 'disconnected';
  timestamp: string;
}
