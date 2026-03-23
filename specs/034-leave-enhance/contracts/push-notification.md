# Contract: Push Notification Service

## Lambda Function: `finanseal-push-notification`

**Runtime**: Node.js 20, ARM_64, 256MB, 30s timeout

### Input (Lambda event)
```typescript
{
  recipientUserId: string,
  businessId: string,
  title: string,
  body: string,
  data: {
    type: "leave_submitted" | "leave_approved" | "leave_rejected",
    leaveRequestId: string,
    deepLink: string, // e.g., "/en/leave-management?tab=approvals&id=xxx"
  }
}
```

### Output
```typescript
{
  success: boolean,
  sent: number, // number of devices notified
  failed: number,
  errors: Array<{ deviceToken: string, error: string }>,
}
```

### Behavior
1. Query Convex `push_subscriptions.getByUserId` for active tokens
2. For each token, determine platform (ios/android)
3. iOS: Sign JWT with APNs P8 key (from SSM), send via APNs HTTP/2 API
4. Android: Send via FCM HTTP v1 API with service account (from SSM)
5. On failure: return error details (caller handles retry/deactivation logic)

### SSM Parameters
- `/finanseal/prod/apns-private-key` (existing)
- `/finanseal/prod/apns-key-id` (existing)
- `/finanseal/prod/apns-team-id` (existing)
- `/finanseal/prod/fcm-service-account` (new — JSON service account key)

## API Route Extension: `POST /api/v1/leave-management/notifications`

### Extended Request Body
```typescript
{
  // Existing fields...
  notificationType: "approved" | "rejected" | "submitted" | "cancelled",
  recipientEmail: string,
  // ...

  // New fields for push
  recipientUserId?: string, // If provided, also send push notification
  leaveRequestId?: string,  // For deep link construction
}
```

### Behavior
1. Send email notification (existing behavior, unchanged)
2. If `recipientUserId` provided: invoke push Lambda with IAM auth
3. Return combined result
