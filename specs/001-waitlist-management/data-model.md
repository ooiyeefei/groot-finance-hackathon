# Data Model: Waitlist Management

**Branch**: `001-waitlist-management` | **Date**: 2026-02-22

---

## New Table: `waitlist_entries`

### Supabase Migration

**File**: `groot-admin/supabase/migrations/20260222_create_waitlist_entries.sql`

```sql
-- ============================================================
-- Waitlist Entries
-- Stores customer requests to be notified when a booked slot
-- becomes available. One entry per customer per slot per date.
-- ============================================================

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id                 UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,

  -- Slot identity (matches reservations.date / timeslot_start / timeslot_end format)
  date                        DATE NOT NULL,
  timeslot_start              VARCHAR(5) NOT NULL,   -- HH:MM
  timeslot_end                VARCHAR(5) NOT NULL,   -- HH:MM

  -- Guest details (denormalised, no user account required)
  party_size                  INTEGER NOT NULL CHECK (party_size > 0),
  customer_name               TEXT NOT NULL,
  customer_email              TEXT NOT NULL,
  customer_phone              TEXT NOT NULL,

  -- Queue management
  queue_position              INTEGER NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'active'
                                CHECK (status IN (
                                  'active',           -- waiting in queue
                                  'notified',         -- notification sent, claim window open
                                  'notified_failed',  -- all retries exhausted, skipped
                                  'claimed',          -- guest completed booking via claim link
                                  'expired',          -- claim window lapsed or date passed
                                  'cancelled'         -- guest self-cancelled or staff removed
                                )),

  -- Notification tracking
  notification_attempt_count  INTEGER NOT NULL DEFAULT 0,
  cancellation_code           TEXT UNIQUE NOT NULL,  -- nanoid(8) for MAC-secured links
  notified_at                 TIMESTAMPTZ,
  claim_window_expires_at     TIMESTAMPTZ,           -- notified_at + 30 minutes

  -- Timestamps
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────

-- Primary lookup: all active entries for a slot (notification chain)
CREATE INDEX idx_waitlist_entries_slot_active
  ON waitlist_entries (business_id, date, timeslot_start, queue_position)
  WHERE status = 'active';

-- Queue depth count per slot (customer-facing display)
CREATE INDEX idx_waitlist_entries_slot_all
  ON waitlist_entries (business_id, date, timeslot_start, status);

-- Claim window expiry processing (cron: advance queue)
CREATE INDEX idx_waitlist_entries_claim_expiry
  ON waitlist_entries (claim_window_expires_at)
  WHERE status = 'notified';

-- Retry processing (cron: retry failed notifications)
CREATE INDEX idx_waitlist_entries_retry
  ON waitlist_entries (business_id, notified_at, notification_attempt_count)
  WHERE status = 'notified' OR status = 'notified_failed';

-- Duplicate prevention (one active entry per email per slot per date)
CREATE UNIQUE INDEX idx_waitlist_entries_unique_active
  ON waitlist_entries (business_id, date, timeslot_start, customer_email)
  WHERE status = 'active' OR status = 'notified';

-- Date expiry (cron: expire past-date entries)
CREATE INDEX idx_waitlist_entries_date_expiry
  ON waitlist_entries (date)
  WHERE status IN ('active', 'notified');

-- ── Row Level Security ────────────────────────────────────────

ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

-- Public SELECT: needed for queue depth display and claim/cancel page loads
CREATE POLICY "waitlist_entries_select_public"
  ON waitlist_entries FOR SELECT
  USING (true);

-- Public INSERT: customers join waitlist without authentication
CREATE POLICY "waitlist_entries_insert_public"
  ON waitlist_entries FOR INSERT
  WITH CHECK (true);

-- Authenticated UPDATE: admin staff manage entries (Clerk JWT)
CREATE POLICY "waitlist_entries_update_authenticated"
  ON waitlist_entries FOR UPDATE
  USING (
    business_id IN (
      SELECT business_id
      FROM users
      WHERE clerk_id = auth.jwt() ->> 'sub'
        AND business_id = ANY(business_id_for_staff)
    )
  );

-- Authenticated DELETE: admin staff remove entries
CREATE POLICY "waitlist_entries_delete_authenticated"
  ON waitlist_entries FOR DELETE
  USING (
    business_id IN (
      SELECT business_id
      FROM users
      WHERE clerk_id = auth.jwt() ->> 'sub'
        AND business_id = ANY(business_id_for_staff)
    )
  );

-- ── Updated-at trigger (matches existing pattern) ─────────────

CREATE OR REPLACE FUNCTION update_waitlist_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER waitlist_entries_updated_at
  BEFORE UPDATE ON waitlist_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_waitlist_entries_updated_at();
```

---

### Prisma Schema Addition

**File**: `groot-reservation/prisma/schema.prisma` — append after the `reservations` model

```prisma
model waitlist_entries {
  id                         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  business_id                String    @db.Uuid
  date                       DateTime  @db.Date
  timeslot_start             String    @db.VarChar(5)
  timeslot_end               String    @db.VarChar(5)
  party_size                 Int
  customer_name              String
  customer_email             String
  customer_phone             String
  queue_position             Int
  status                     String    @default("active")
  notification_attempt_count Int       @default(0)
  cancellation_code          String    @unique
  notified_at                DateTime? @db.Timestamptz(6)
  claim_window_expires_at    DateTime? @db.Timestamptz(6)
  created_at                 DateTime  @default(now()) @db.Timestamptz(6)
  updated_at                 DateTime  @default(now()) @db.Timestamptz(6)

  business_profiles business_profiles @relation(fields: [business_id], references: [id], onDelete: Cascade)

  @@index([business_id, date, timeslot_start, status])
  @@index([business_id, date, timeslot_start, queue_position])
}
```

---

## State Transition Diagram

```
                  ┌─────────────────────────────────────────┐
                  │              waitlist_entries             │
                  └─────────────────────────────────────────┘

  join waitlist
  ──────────────►  active
                     │
                     │ slot opens (cancellation detected)
                     ▼
                  notified ──────────────────────────────────► claimed
                     │                                    guest completes
                     │ claim window (30 min) expires             booking
                     ▼
                  active (next eligible guest)
                     │
                     │ all retries exhausted (3x)
                     ▼
               notified_failed ──────────────────────────────► active (next)
                     │
                     │ (any status)
                     ▼
                  expired ◄──── date/time passes (cron cleanup)
                     │
                     │ (any active/notified status)
                     ▼
                 cancelled ◄──── customer self-cancels or staff removes
```

---

## Entity Relationships

```
business_profiles (1) ──── (many) waitlist_entries
                                         │
                           Shares date + timeslot_start/end
                           with reservations table
                           (no FK to reservations — independent)
```

---

## TypeScript Types

**Shared type definitions** — to be added to both codebases:

```typescript
// lib/types/waitlist.ts (both repos)

export type WaitlistStatus =
  | 'active'
  | 'notified'
  | 'notified_failed'
  | 'claimed'
  | 'expired'
  | 'cancelled';

export interface WaitlistEntry {
  id: string;
  businessId: string;
  date: string;               // ISO date string YYYY-MM-DD
  timeslotStart: string;      // HH:MM
  timeslotEnd: string;        // HH:MM
  partySize: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  queuePosition: number;
  status: WaitlistStatus;
  notificationAttemptCount: number;
  cancellationCode: string;
  notifiedAt: string | null;
  claimWindowExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JoinWaitlistInput {
  businessId: string;
  date: string;               // YYYY-MM-DD
  timeslotStart: string;      // HH:MM
  timeslotEnd: string;        // HH:MM
  partySize: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}

export interface WaitlistQueueDepth {
  count: number;              // number of active entries ahead in queue
}

export interface AlternativeSlot {
  date: string;               // YYYY-MM-DD
  timeslotStart: string;      // HH:MM
  timeslotEnd: string;        // HH:MM
  type: 'same_date' | 'same_time_other_date';
}
```
