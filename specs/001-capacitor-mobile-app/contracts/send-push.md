# API Contract: Send Push Notification

**Next.js API Route** (called from Convex internalAction)

## POST /api/v1/notifications/send-push

Sends a push notification to an iOS device via APNs HTTP/2.

**Authentication**: Internal only — called by Convex `internalAction` with a shared secret. Not exposed to public clients.

**Request**:
```typescript
{
  deviceToken: string        // APNs device token (64-char hex)
  title: string              // Notification title (e.g., "Expense claim from John")
  body: string               // Notification body (e.g., "Office supplies — $234.56")
  data: {                    // Custom payload for deep linking
    resourceUrl: string      // In-app path (e.g., "/en/expense-claims?claim=abc123")
    notificationType: string // Type identifier (e.g., "approval")
  }
  badge?: number             // App icon badge count (optional)
}
```

**Behavior**:
1. Validates request payload
2. Retrieves APNs credentials from AWS SSM Parameter Store (cached)
3. Signs JWT with APNs authentication key (ES256)
4. Sends HTTP/2 POST to `api.push.apple.com` (production) or `api.sandbox.push.apple.com` (development)
5. Returns APNs response

**APNs Payload Sent**:
```json
{
  "aps": {
    "alert": { "title": "...", "body": "..." },
    "badge": 3,
    "sound": "default",
    "category": "APPROVAL_REQUEST"
  },
  "resourceUrl": "/en/expense-claims?claim=abc123",
  "notificationType": "approval"
}
```

**Response**:
```typescript
// Success
{ success: true, apnsId: string }

// Failure
{ success: false, reason: string, statusCode: number }
```

**APNs Error Handling**:
- `410 Unregistered`: Device token is no longer valid → deactivate the subscription
- `400 BadDeviceToken`: Token format is wrong → deactivate the subscription
- `429 TooManyRequests`: Rate limited → retry with exponential backoff
- `500/503`: APNs server error → retry with exponential backoff

**SSM Parameters Required**:
```
/finanseal/prod/apns-private-key   → P8 key contents (SecureString)
/finanseal/prod/apns-key-id        → Key ID (String)
/finanseal/prod/apns-team-id       → Team ID (String)
```
