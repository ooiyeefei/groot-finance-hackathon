/**
 * PWA Module Exports
 * Central export point for all PWA utilities
 */

// Service Worker
export {
  registerServiceWorker,
  unregisterServiceWorker,
  isStandaloneMode,
  type ServiceWorkerRegistrationResult,
} from './service-worker';

// Offline Queue
export {
  queueOfflineAction,
  getPendingActions,
  getPendingCount,
  processOfflineQueue,
  clearCompletedActions,
  clearAllActions,
  getAction,
  initAutoSync,
  destroyAutoSync,
  type OfflineAction,
  type OfflineActionStatus,
  type OfflineActionType,
  type SyncResult,
} from './offline-queue';

// Cache Manager
export {
  recordCache,
  getCacheMetadata,
  checkFreshness,
  getLastSyncedTime,
  formatLastSynced,
  invalidateCache,
  cleanExpiredCache,
  getTotalCacheSize,
  clearAllCacheMetadata,
  type CacheMetadata,
  type CacheFreshness,
} from './cache-manager';

// Connectivity Monitor
export {
  initConnectivityMonitor,
  destroyConnectivityMonitor,
  getConnectivityStatus,
  isOnline,
  subscribeToConnectivity,
  getOfflineDuration,
  whenOnline,
  type ConnectivityStatus,
  type ConnectivityEvent,
  type ConnectivityListener,
} from './connectivity-monitor';

// Image Compression
export {
  compressReceiptImage,
  estimateCompressedSize,
  shouldCompressImage,
  type CompressionProgressCallback,
} from './image-compression';
