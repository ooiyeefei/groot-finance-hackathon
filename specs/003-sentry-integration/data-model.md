# Data Model: Error Logging & Monitoring

**Branch**: `003-sentry-integration` | **Date**: 2026-01-04

## Overview

This feature does not introduce new database tables. All data is stored externally in Sentry's infrastructure. This document defines the **event structures** and **context shapes** used for error tracking.

## Event Structures (External - Sentry)

### Error Event Context

```typescript
/**
 * User context attached to Sentry events
 * Set via Sentry.setUser() after authentication
 */
interface SentryUserContext {
  id: string;              // Clerk user_id
  business_id?: string;    // Active business context
  role?: 'admin' | 'manager' | 'employee';
}

/**
 * Tags attached to error events for filtering
 */
interface SentryEventTags {
  domain: string;          // e.g., 'invoices', 'expense-claims', 'chat'
  environment: 'development' | 'staging' | 'production';
  task?: string;           // For background jobs: task ID
}

/**
 * Extra context attached to specific errors
 */
interface SentryEventExtra {
  document_id?: string;
  business_id?: string;
  claim_id?: string;
  conversation_id?: string;
  [key: string]: unknown;
}
```

### Webhook Payload (Sentry → FinanSEAL)

```typescript
/**
 * Sentry webhook payload structure (simplified)
 * Full spec: https://docs.sentry.io/product/integrations/integration-platform/webhooks/
 */
interface SentryWebhookPayload {
  action: 'triggered' | 'resolved' | 'assigned' | 'archived';
  data: {
    event: {
      event_id: string;
      title: string;
      message: string;
      level: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
      platform: string;
      timestamp: string;
      tags: Array<{ key: string; value: string }>;
      user?: {
        id?: string;
        email?: string;
        ip_address?: string;
      };
      contexts?: {
        browser?: { name: string; version: string };
        os?: { name: string; version: string };
        device?: { family: string; model: string };
      };
    };
    triggered_rule: string;
  };
  actor?: {
    type: 'application' | 'user';
    id: string;
    name: string;
  };
}
```

### Telegram Message Format

```typescript
/**
 * Message structure sent to Telegram Bot API
 */
interface TelegramAlertMessage {
  chat_id: string;
  text: string;
  parse_mode: 'HTML' | 'Markdown';
  disable_web_page_preview?: boolean;
}

/**
 * Example formatted message:
 *
 * 🚨 <b>Error Alert</b>
 *
 * <b>Type:</b> TypeError
 * <b>Message:</b> Cannot read property 'id' of undefined
 * <b>Page:</b> /dashboard/invoices
 * <b>User:</b> user_abc123 (Admin)
 * <b>Time:</b> 2026-01-04 15:30:00 UTC
 *
 * <a href="https://sentry.io/...">View in Sentry</a>
 */
```

## Configuration Entities (Environment)

### Sentry Configuration

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `NEXT_PUBLIC_SENTRY_DSN` | string | Yes | Public DSN for client SDK |
| `SENTRY_AUTH_TOKEN` | string | Yes (build) | Auth token for source map upload |
| `SENTRY_ORG` | string | Yes | Organization slug |
| `SENTRY_PROJECT` | string | Yes | Project slug |

### Telegram Configuration

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | string | Yes | Bot authentication token |
| `TELEGRAM_CHAT_ID` | string | Yes | Target chat/group ID |

## Validation Rules

### User Context
- `id` must be a valid Clerk user ID (non-empty string)
- `business_id` must be a valid UUID if present
- `role` must be one of: `admin`, `manager`, `employee`

### Webhook Processing
- `X-Sentry-Token` header must match configured secret
- `action` must be `triggered` for new alerts (ignore `resolved`, `archived`)
- `data.event.level` must be `error` or `fatal` for Telegram forwarding

### Telegram Messages
- `chat_id` must be numeric or @channel_username format
- `text` must not exceed 4096 characters
- HTML entities must be properly escaped

## State Transitions

Not applicable - this feature is stateless. All state is managed externally by Sentry.

## Relationships

```
┌─────────────────────┐
│   FinanSEAL App     │
│  (Client + Server)  │
└─────────┬───────────┘
          │ errors/traces
          ▼
┌─────────────────────┐
│      Sentry         │
│  (Error Tracking)   │
└─────────┬───────────┘
          │ webhook
          ▼
┌─────────────────────┐
│  /api/v1/system/    │
│  webhooks/sentry    │
└─────────┬───────────┘
          │ HTTP POST
          ▼
┌─────────────────────┐
│   Telegram Bot      │
│    (Alerts)         │
└─────────────────────┘
```

## Data Retention

- **Sentry**: 90 days (default free tier retention)
- **Telegram**: Messages persist indefinitely in chat history
- **Application**: No persistent storage of error data
