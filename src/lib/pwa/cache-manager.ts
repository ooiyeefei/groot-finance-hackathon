/**
 * Cache Manager
 * Task T011: Cache metadata store for freshness tracking
 *
 * Implements:
 * - CacheMetadata interface per data-model.md
 * - 7-day max retention
 * - 24-hour stale warning threshold
 * - Cache invalidation utilities
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

// ============================================================================
// Types (per data-model.md)
// ============================================================================

export interface CacheMetadata {
  key: string;
  cachedAt: number;
  expiresAt: number;
  dataHash: string;
  sizeBytes: number;
}

export type CacheFreshness = 'fresh' | 'stale' | 'expired';

// ============================================================================
// Constants
// ============================================================================

const DB_NAME = 'finanseal_pwa';
const DB_VERSION = 2; // Increment for cache store
const STORE_NAME = 'cacheMetadata';

// Freshness rules per spec
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ============================================================================
// Database Schema
// ============================================================================

interface CacheDB extends DBSchema {
  cacheMetadata: {
    key: string;
    value: CacheMetadata;
    indexes: {
      'by_cached_at': number;
      'by_expires_at': number;
    };
  };
}

let dbInstance: IDBPDatabase<CacheDB> | null = null;

/**
 * Get or create database instance
 */
async function getDB(): Promise<IDBPDatabase<CacheDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<CacheDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Create cacheMetadata store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('by_cached_at', 'cachedAt');
        store.createIndex('by_expires_at', 'expiresAt');
      }
    },
    blocked() {
      console.warn('[CacheManager] Database upgrade blocked');
    },
    blocking() {
      dbInstance?.close();
      dbInstance = null;
    },
  });

  return dbInstance;
}

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Record cache metadata for a resource
 */
export async function recordCache(
  key: string,
  dataHash: string,
  sizeBytes: number
): Promise<CacheMetadata> {
  const db = await getDB();
  const now = Date.now();

  const metadata: CacheMetadata = {
    key,
    cachedAt: now,
    expiresAt: now + MAX_RETENTION_MS,
    dataHash,
    sizeBytes,
  };

  await db.put(STORE_NAME, metadata);
  console.log('[CacheManager] Recorded cache:', key);

  return metadata;
}

/**
 * Get cache metadata for a resource
 */
export async function getCacheMetadata(key: string): Promise<CacheMetadata | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, key);
}

/**
 * Check freshness of cached data
 * Task T027: Implement stale data warning (24h threshold)
 */
export function checkFreshness(metadata: CacheMetadata | undefined): CacheFreshness {
  if (!metadata) return 'expired';

  const now = Date.now();
  const age = now - metadata.cachedAt;

  // Expired if past retention period
  if (now > metadata.expiresAt) {
    return 'expired';
  }

  // Stale if older than 24 hours
  if (age > STALE_THRESHOLD_MS) {
    return 'stale';
  }

  return 'fresh';
}

/**
 * Get last synced timestamp for display
 */
export async function getLastSyncedTime(key: string): Promise<Date | null> {
  const metadata = await getCacheMetadata(key);
  return metadata ? new Date(metadata.cachedAt) : null;
}

/**
 * Format last synced for display
 */
export function formatLastSynced(cachedAt: number | null): string {
  if (!cachedAt) return 'Never synced';

  const now = Date.now();
  const diffMs = now - cachedAt;
  const diffMins = Math.floor(diffMs / (60 * 1000));
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

/**
 * Invalidate cache entry
 */
export async function invalidateCache(key: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, key);
  console.log('[CacheManager] Invalidated cache:', key);
}

/**
 * Clean up expired cache entries
 */
export async function cleanExpiredCache(): Promise<number> {
  const db = await getDB();
  const now = Date.now();
  const allMetadata = await db.getAll(STORE_NAME);

  let cleaned = 0;
  for (const metadata of allMetadata) {
    if (now > metadata.expiresAt) {
      await db.delete(STORE_NAME, metadata.key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log('[CacheManager] Cleaned', cleaned, 'expired entries');
  }

  return cleaned;
}

/**
 * Get total cache size
 */
export async function getTotalCacheSize(): Promise<number> {
  const db = await getDB();
  const allMetadata = await db.getAll(STORE_NAME);
  return allMetadata.reduce((total, m) => total + m.sizeBytes, 0);
}

/**
 * Clear all cache metadata (for testing/reset)
 */
export async function clearAllCacheMetadata(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
  console.log('[CacheManager] Cleared all cache metadata');
}
