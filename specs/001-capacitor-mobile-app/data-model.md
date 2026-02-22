# Data Model: Capacitor Mobile App (iOS)

**Branch**: `001-capacitor-mobile-app` | **Date**: 2026-02-21

## New Entities

### push_subscriptions

Stores device push notification tokens, linking users to their iOS devices for APNs delivery.

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| userId | Reference (users) | The authenticated user who owns this device | Required, indexed |
| businessId | Reference (businesses) | The business context for multi-tenant scoping | Required |
| platform | Literal ("ios") | Device platform. Phase 1: iOS only. Phase 2 adds "android" | Required |
| deviceToken | String | APNs device token (64-char hex string) | Required, unique per platform, indexed |
| isActive | Boolean | Whether this subscription is actively receiving notifications | Required, default: true |
| createdAt | Number | Unix timestamp of registration | Required |
| updatedAt | Number | Unix timestamp of last update (re-registration, deactivation) | Required |

**Indexes**:
- `by_userId` — Look up all devices for a user (for sending notifications)
- `by_deviceToken` — Deduplicate registrations (same device re-registering)
- `by_userId_platform` — Look up devices for a user on a specific platform

**Lifecycle**:
1. **Created**: When user grants notification permission and device registers with APNs
2. **Updated**: When device token changes (app reinstall, OS upgrade), `deviceToken` and `updatedAt` are updated
3. **Deactivated**: When user revokes notification permission or logs out, `isActive` set to `false`
4. **Reactivated**: When user re-grants permission, `isActive` set back to `true`
5. **Deleted**: When user uninstalls the app (detected via APNs feedback, or manual cleanup)

**Validation rules**:
- `deviceToken` must be a valid hex string (64 characters for APNs)
- One active subscription per `(userId, platform, deviceToken)` tuple
- A user may have multiple active devices (e.g., iPhone + iPad)

### app_versions (for update mechanism — FR-014)

Stores minimum required and latest recommended app versions for the force/soft update mechanism.

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| platform | Literal ("ios") | Target platform. Phase 2 adds "android" | Required |
| minimumVersion | String | Minimum app version required (force update below this) | Required, semver format |
| latestVersion | String | Latest available version (soft prompt if user is below this) | Required, semver format |
| forceUpdateMessage | String | Message shown when force update is required | Required |
| softUpdateMessage | String | Message shown for soft update prompt | Required |
| updatedAt | Number | Unix timestamp of last change | Required |
| updatedBy | Reference (users) | Admin who updated the version config | Required |

**Indexes**:
- `by_platform` — Look up version config for a specific platform

**Lifecycle**:
1. **Created**: Once during initial App Store submission setup
2. **Updated**: When a new app version is released (update `latestVersion`) or when a critical update requires bumping `minimumVersion`

## Existing Entities Modified

### notifications (existing table — extend trigger logic only)

No schema changes. The existing `notifications.create` mutation will be extended to also schedule a `sendPushNotification` internalAction when the notification type is `approval` and the recipient has active push subscriptions.

## Entity Relationships

```
users (existing)
  ├── 1:N → push_subscriptions (a user can have multiple devices)
  └── via notifications.create → triggers push to all active subscriptions

businesses (existing)
  └── 1:N → push_subscriptions (scoped to business for multi-tenant isolation)

app_versions
  └── standalone config entity, queried by the mobile app on launch
```
