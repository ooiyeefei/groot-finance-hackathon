# Admin API Contracts (groot-admin)

**Type**: Next.js Route Handlers (REST)
**Auth**: Clerk JWT (all endpoints require authenticated business user)
**Base path**: `/api/waitlist`

---

## GET `/api/waitlist`

**Purpose**: List all waitlist entries for a restaurant on a given date.

**Query params**:
```
businessId: string  (required)
date:       string  YYYY-MM-DD (required)
timeslot:   string  HH:MM (optional filter)
status:     string  comma-separated status values (optional filter)
```

**Response 200**:
```typescript
{
  entries: Array<{
    id: string;
    date: string;
    timeslotStart: string;
    timeslotEnd: string;
    partySize: number;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    queuePosition: number;
    status: WaitlistStatus;
    notificationAttemptCount: number;
    notifiedAt: string | null;
    claimWindowExpiresAt: string | null;
    createdAt: string;
  }>;
  total: number;
}
```

---

## POST `/api/waitlist`

**Purpose**: Staff adds a walk-in guest directly to the waitlist.

**Request body**:
```typescript
{
  businessId: string;
  date: string;          // YYYY-MM-DD
  timeslotStart: string; // HH:MM
  timeslotEnd: string;   // HH:MM
  partySize: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;  // optional for walk-ins
}
```

**Behaviour**: Inserts at the end of the queue (MAX position + 1). No confirmation email sent (walk-in physical contact). Returns created entry.

**Response 201**:
```typescript
{
  entry: WaitlistEntry;
}
```

---

## PATCH `/api/waitlist/[id]`

**Purpose**: Update a waitlist entry — reorder queue position or update status.

**Request body** (partial, any combination):
```typescript
{
  queuePosition?: number;  // triggers repack of affected entries in same slot
}
```

**Behaviour for `queuePosition` change**:
1. Validate new position is ≥ 1 and ≤ total active entries in slot
2. Shift all entries between old and new position by ±1 to maintain contiguous ordering
3. Set entry's position to new value

**Response 200**: Updated `WaitlistEntry`

---

## DELETE `/api/waitlist/[id]`

**Purpose**: Staff removes a waitlist entry.

**Behaviour**:
1. Set status to `cancelled`
2. Repack queue: decrement position of all active entries ranked below the deleted entry

**Response 204**: No content

---

## POST `/api/waitlist/[id]/notify`

**Purpose**: Staff manually triggers a slot-available notification to a specific waitlist entry.

**Request body**:
```typescript
{
  businessId: string;  // for ownership verification
}
```

**Behaviour**:
1. Verify entry is in `active` status
2. Verify a slot is actually available for the entry's party size (calls availability check)
3. Generate claim link (MAC-secured)
4. Send slot-available email via `sendWaitlistNotificationEmail`
5. Update entry: `status = 'notified'`, `notified_at = NOW()`, `claim_window_expires_at = NOW() + 30min`, `notification_attempt_count += 1`

**Response 200**:
```typescript
{
  success: true;
  notifiedAt: string;
  claimWindowExpiresAt: string;
}
```

**Response 409** (if no slot available):
```typescript
{
  error: 'NO_SLOT_AVAILABLE';
  message: string;
}
```

---

## POST `/api/waitlist/[id]/convert`

**Purpose**: Staff converts a waitlist entry directly into a confirmed reservation, bypassing the customer claim flow.

**Request body**:
```typescript
{
  businessId: string;
}
```

**Behaviour**:
1. Verify entry is `active` or `notified`
2. Run full availability check for the entry's slot + party size
3. Create reservation using existing reservation creation logic (same as manual booking by staff)
4. Update entry: `status = 'claimed'`
5. Send reservation confirmation email to the customer
6. Advance queue for remaining active entries

**Response 201**:
```typescript
{
  reservation: {
    confirmationCode: string;
    reservationLink: string;
  };
}
```

**Response 409** (if slot no longer available):
```typescript
{
  error: 'SLOT_NO_LONGER_AVAILABLE';
  message: string;
}
```

---

## Cron Endpoints

### GET `/api/cron/process-waitlist`

**Auth**: `Authorization: Bearer ${CRON_SECRET}`
**Schedule**: Every 2 minutes (`"*/2 * * * *"` in vercel.json)

**Purpose**: Two jobs in one route:

**Job A — Advance expired claim windows**:
```sql
SELECT * FROM waitlist_entries
WHERE status = 'notified'
  AND claim_window_expires_at < NOW()
```
For each: set `status = 'expired'`, then find and notify next eligible guest in queue for same slot.

**Job B — Retry failed notifications**:
```sql
SELECT * FROM waitlist_entries
WHERE (status = 'notified' OR status = 'notified_failed')
  AND notification_attempt_count < 3
  AND notified_at < NOW() - INTERVAL '2 minutes'
```
For each: retry sending notification email. On success: reset `status = 'notified'`. On 3rd failure: `status = 'notified_failed'`, advance queue.

---

### GET `/api/cron/expire-waitlist`

**Auth**: `Authorization: Bearer ${CRON_SECRET}`
**Schedule**: Once daily (`"0 1 * * *"` — 1 AM restaurant timezone)

**Purpose**: Expire all waitlist entries for dates that have passed.

```sql
UPDATE waitlist_entries
SET status = 'expired', updated_at = NOW()
WHERE date < CURRENT_DATE
  AND status IN ('active', 'notified')
```

No notification sent to guests (silent expiry per spec).
