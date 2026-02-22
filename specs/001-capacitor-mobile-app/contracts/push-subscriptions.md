# API Contract: Push Subscriptions

**Convex Mutations & Queries** (called from the Capacitor client)

## register (public mutation)

Registers or re-registers a device for push notifications.

**Input**:
```typescript
{
  deviceToken: string       // APNs device token (64-char hex)
  platform: "ios"           // Platform identifier
}
```

**Behavior**:
- Authenticated user context (Clerk session via Convex auth)
- Business context derived from authenticated user
- If `deviceToken` already exists for this user+platform: update `updatedAt`, set `isActive: true`
- If new: create new `push_subscriptions` record
- Deduplicates by `(userId, platform, deviceToken)` tuple

**Output**: `{ success: true }`

**Errors**:
- 401: Not authenticated
- 400: Invalid device token format

---

## unregister (public mutation)

Deactivates a device push subscription (e.g., on logout or permission revocation).

**Input**:
```typescript
{
  deviceToken: string       // APNs device token to deactivate
}
```

**Behavior**:
- Sets `isActive: false` on the matching subscription
- Does NOT delete the record (allows reactivation)

**Output**: `{ success: true }`

**Errors**:
- 401: Not authenticated
- 404: No matching subscription found

---

## getAppVersion (public query)

Returns the current version requirements for update checking.

**Input**:
```typescript
{
  platform: "ios"
}
```

**Output**:
```typescript
{
  minimumVersion: string     // e.g., "1.0.0"
  latestVersion: string      // e.g., "1.2.0"
  forceUpdateMessage: string
  softUpdateMessage: string
} | null
```

**Behavior**:
- Returns the `app_versions` record for the given platform
- Returns `null` if no version config exists (app should not enforce updates)
