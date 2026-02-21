# Component Contracts: Notifications UI

**Feature**: `018-app-email-notif` | **Date**: 2026-02-20

## New Components

### NotificationBell

Bell icon button with unread count badge. Placed in app header.

**Location**: `src/domains/notifications/components/notification-bell.tsx`

```typescript
interface NotificationBellProps {
  businessId: string
}

// Behavior:
// - Subscribes to notifications.getUnreadCount via useQuery (real-time)
// - Shows Bell icon (lucide-react) with Badge showing unread count
// - Badge hidden when count = 0
// - Click opens NotificationPanel (Sheet component)
// - Critical severity: badge uses destructive color accent
```

### NotificationPanel

Side panel displaying notification list with actions.

**Location**: `src/domains/notifications/components/notification-panel.tsx`

```typescript
interface NotificationPanelProps {
  businessId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Behavior:
// - Uses Sheet (side="right") from ui/sheet.tsx
// - Header: "Notifications" title + "Mark all as read" button + Settings gear link
// - Body: Scrollable list of NotificationItem components
// - Empty state: "No notifications yet" message
// - Subscribes to notifications.listForUser via useQuery
// - Infinite scroll or "Load more" for pagination
// - Filter tabs: All | Unread (optional, can be P2 enhancement)
```

### NotificationItem

Individual notification row in the panel.

**Location**: `src/domains/notifications/components/notification-item.tsx`

```typescript
interface NotificationItemProps {
  notification: {
    _id: string
    type: string
    severity: string
    status: string
    title: string
    body: string
    resourceUrl?: string
    createdAt: number
  }
  onMarkAsRead: (id: string) => void
  onDismiss: (id: string) => void
}

// Behavior:
// - Severity indicator: color-coded dot (critical=red, warning=amber, info=blue)
// - Unread: bg-muted/50 highlight; Read: normal bg-card
// - Type icon: approval=CheckCircle, anomaly=AlertTriangle, compliance=Shield, insight=Lightbulb
// - Title (bold if unread) + body (truncated to 2 lines)
// - Relative timestamp ("2 hours ago")
// - Click: navigate to resourceUrl + mark as read
// - Dismiss button (X icon): mark as dismissed
```

### NotificationPreferencesForm

Preferences grid with per-category, per-channel toggles.

**Location**: `src/domains/notifications/components/notification-preferences-form.tsx`

```typescript
interface NotificationPreferencesFormProps {
  // No props needed — fetches preferences via useQuery internally
}

// Behavior:
// - Grid layout: rows = notification categories, columns = In-App | Email
// - Each cell: toggle switch (Checkbox or Switch component)
// - Digest frequency: Select dropdown (Daily / Weekly)
// - Save button: calls notifications.updatePreferences mutation
// - Loading state while fetching current preferences
// - Success toast on save
```

## Modified Components

### HeaderWithUser

**Location**: `src/components/ui/header-with-user.tsx`

**Change**: Add NotificationBell between actions slot and FeedbackButton.

```
Before: [actions] [FeedbackButton] [ThemeToggle] [LanguageSwitcher] [UserButton]
After:  [actions] [NotificationBell] [FeedbackButton] [ThemeToggle] [LanguageSwitcher] [UserButton]
```

### TabbedBusinessSettings (or UserProfileSection)

**Location**: `src/domains/account-management/components/user-profile-section.tsx`

**Change**: Add NotificationPreferencesForm section below existing email preferences.

## New Hooks

### useNotifications

**Location**: `src/domains/notifications/hooks/use-notifications.ts`

```typescript
function useNotifications(businessId: string | null) {
  // Returns:
  // - notifications: Notification[] (real-time via useQuery)
  // - unreadCount: number (real-time via useQuery)
  // - loading: boolean
  // - markAsRead: (id: string) => Promise<void>
  // - markAllAsRead: () => Promise<void>
  // - dismiss: (id: string) => Promise<void>
  // - loadMore: () => void (pagination)
  // - hasMore: boolean
}
```

### useNotificationPreferences

**Location**: `src/domains/notifications/hooks/use-notification-preferences.ts`

```typescript
function useNotificationPreferences() {
  // Returns:
  // - preferences: NotificationPreferences | null
  // - loading: boolean
  // - updatePreferences: (updates: Partial<NotificationPreferences>) => Promise<void>
}
```
