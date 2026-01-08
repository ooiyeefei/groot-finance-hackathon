# Data Model: Mobile-First Testing & PWA Enhancements

**Branch**: `001-mobile-pwa` | **Date**: 2026-01-07 | **Phase**: 1

## Overview

This feature primarily introduces client-side data structures for PWA functionality. No new server-side database tables are required - the feature uses browser APIs (IndexedDB, Cache Storage) for offline capabilities.

---

## Client-Side Entities

### 1. OfflineAction (IndexedDB)

**Purpose**: Queue of user actions performed while offline, pending sync when connectivity returns.

```typescript
interface OfflineAction {
  // Identity
  id: string;                    // UUID v4, generated client-side

  // Action Details
  type: OfflineActionType;       // Type of action to sync
  endpoint: string;              // API endpoint to call on sync
  method: 'POST' | 'PUT' | 'DELETE';
  payload: Record<string, unknown>; // Action payload (expense data, etc.)

  // Metadata
  createdAt: number;             // Unix timestamp (ms)
  userId: string;                // Clerk user ID for ownership
  businessId: string;            // Business context

  // Sync State
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  retryCount: number;            // Number of sync attempts
  lastAttemptAt?: number;        // Last sync attempt timestamp
  lastError?: string;            // Error message from last attempt
  completedAt?: number;          // Successful sync timestamp
}

type OfflineActionType =
  | 'expense_submission'
  | 'expense_approval'
  | 'expense_rejection'
  | 'expense_update';
```

**Validation Rules**:
- `id` must be unique
- `payload` must be valid JSON
- `retryCount` max 3 before marking as `failed`
- Actions older than 7 days are auto-deleted (per cache retention policy)

**State Transitions**:
```
pending → syncing → completed
              ↓
           failed (after 3 retries)
```

---

### 2. CacheMetadata (IndexedDB)

**Purpose**: Track cache freshness for displaying "stale data" warnings.

```typescript
interface CacheMetadata {
  // Identity
  key: string;                   // Cache key (e.g., 'dashboard_data')

  // Freshness Tracking
  cachedAt: number;              // When data was cached (Unix timestamp ms)
  lastRefreshedAt: number;       // Last successful API refresh
  dataHash: string;              // Hash of cached data for change detection

  // Display
  staleWarningShown: boolean;    // Whether user dismissed stale warning

  // Retention
  expiresAt: number;             // Auto-delete after this time (7 days)
}
```

**Freshness Rules** (per spec clarification):
- **Fresh**: `lastRefreshedAt` within 24 hours
- **Stale**: `lastRefreshedAt` between 24 hours and 7 days - show warning
- **Expired**: `lastRefreshedAt` > 7 days - delete and require online refresh

---

### 3. PWAInstallState (LocalStorage)

**Purpose**: Track PWA installation prompt state.

```typescript
interface PWAInstallState {
  // Prompt Tracking
  installPromptDismissed: boolean;
  dismissedAt?: number;          // Don't re-prompt for 7 days

  // Installation
  isInstalled: boolean;          // Detected via display-mode: standalone
  installedAt?: number;

  // iOS Specific
  iosInstructionsShown: boolean; // Manual installation guide shown
}
```

---

### 4. ConnectivityState (Memory/React State)

**Purpose**: Real-time connectivity status for UI indicators.

```typescript
interface ConnectivityState {
  isOnline: boolean;             // navigator.onLine state
  lastOnlineAt?: number;         // Last time we had connectivity
  lastOfflineAt?: number;        // When we went offline

  // Sync Status
  pendingActionCount: number;    // Actions waiting to sync
  isSyncing: boolean;            // Currently syncing queue
  lastSyncAt?: number;           // Last successful sync
  lastSyncError?: string;        // Error from last sync attempt
}
```

---

## IndexedDB Schema

### Database: `finanseal_pwa`

```typescript
const DB_NAME = 'finanseal_pwa';
const DB_VERSION = 1;

const stores = {
  // Offline action queue
  offlineActions: {
    keyPath: 'id',
    indexes: [
      { name: 'by_status', keyPath: 'status' },
      { name: 'by_user', keyPath: 'userId' },
      { name: 'by_created', keyPath: 'createdAt' },
    ],
  },

  // Cache freshness metadata
  cacheMetadata: {
    keyPath: 'key',
    indexes: [
      { name: 'by_expires', keyPath: 'expiresAt' },
    ],
  },
};
```

---

## Cache Storage Schema

### Cache: `finanseal-api-cache`

**Purpose**: Cache API responses for offline access.

**Cached Endpoints**:
| Endpoint Pattern | Strategy | Max Age | Notes |
| ---------------- | -------- | ------- | ----- |
| `/api/v1/dashboard/*` | StaleWhileRevalidate | 24h fresh, 7d max | Primary offline data |
| `/api/v1/expense-claims` (GET) | NetworkFirst | 1h | User-specific, prefer fresh |
| `/api/v1/expense-claims/categories` | CacheFirst | 30 days | Rarely changes |
| `/api/v1/businesses/*` | StaleWhileRevalidate | 24h | Business context |

### Cache: `finanseal-static-cache`

**Purpose**: Cache static assets (app shell).

**Cached Resources**:
- `/_next/static/**` - Next.js bundles (immutable, content-hashed)
- `/fonts/**` - Web fonts
- `/icons/**` - PWA icons
- `/offline` - Offline fallback page

---

## Web App Manifest Schema

### `public/manifest.json`

```json
{
  "name": "FinanSEAL - Financial Co-Pilot",
  "short_name": "FinanSEAL",
  "description": "Financial Co-Pilot for Southeast Asian SMEs",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#3b82f6",
  "categories": ["finance", "business", "productivity"],
  "lang": "en",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-maskable-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

---

## Entity Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser Storage                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  IndexedDB: finanseal_pwa                                   │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │ offlineActions  │    │ cacheMetadata   │                │
│  │                 │    │                 │                │
│  │ • id            │    │ • key           │                │
│  │ • type          │    │ • cachedAt      │                │
│  │ • payload ──────┼────┼─→ Relates to    │                │
│  │ • status        │    │   cached data   │                │
│  └─────────────────┘    └─────────────────┘                │
│                                                             │
│  Cache Storage                                              │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │ api-cache       │    │ static-cache    │                │
│  │                 │    │                 │                │
│  │ • API responses │    │ • JS/CSS        │                │
│  │ • Dashboard data│    │ • Fonts         │                │
│  └─────────────────┘    │ • Icons         │                │
│                         └─────────────────┘                │
│                                                             │
│  LocalStorage                                               │
│  ┌─────────────────┐                                       │
│  │ pwa_install     │                                       │
│  │ state           │                                       │
│  └─────────────────┘                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Migration Notes

No database migrations required. All data structures are client-side:
- IndexedDB stores created on first PWA use
- Cache Storage managed by service worker
- LocalStorage keys set by PWA hooks

---

*Next step: Generate contracts/ via Phase 1 workflow*
