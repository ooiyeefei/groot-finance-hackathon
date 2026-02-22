# Research: Waitlist Management

**Branch**: `001-waitlist-management` | **Date**: 2026-02-22

---

## Decision 1: Shared Database via Supabase Migrations

**Decision**: All schema changes go in a single Supabase migration file in `groot-admin/supabase/migrations/`. Both apps (`groot-admin` via Supabase JS client, `groot-reservation` via Prisma) point at the same Postgres instance.

**Rationale**: This is the existing pattern. The migration naming convention is `YYYYMMDD_description.sql`. Prisma schema in `groot-reservation/prisma/schema.prisma` must be updated to reflect the new table so the customer app's ORM stays in sync. No separate migration tooling is used in groot-reservation — Prisma introspects the existing Supabase schema.

**Alternatives considered**: Separate migrations per app — rejected because there is one shared Postgres instance; duplicate migrations would conflict.

---

## Decision 2: No Existing Cron Infrastructure in groot-admin

**Decision**: Cron jobs must be created from scratch in `groot-admin/app/api/cron/`. Vercel Cron is the target scheduler (configured in `vercel.json`). Auth via `CRON_SECRET` header check (Bearer token).

**Rationale**: No `/api/cron/` directory currently exists in groot-admin. The pattern from the customer app (`groot-reservation/src/app/api/cron/`) shows how Vercel cron routes work: `GET` handler with `Authorization: Bearer ${CRON_SECRET}` header validation.

**Alternatives considered**: Database triggers (pg_cron) — rejected because claim window advancement requires email sending (application-layer concern); Supabase Edge Functions — rejected for consistency with existing Node.js architecture.

---

## Decision 3: Waitlist MAC Auth Pattern

**Decision**: Reuse the existing `generateReservationMAC(code, email)` HMAC-SHA256 pattern from `lib/utils/reservation-auth.ts` (both repos). For waitlist entries, generate a `cancellation_code` (nanoid, 8 chars) at entry creation time, then produce:
- Cancellation link: `/waitlist/{cancellation_code}/{mac}` (customer app)
- Claim link: `/waitlist/claim/{cancellation_code}/{mac}` (customer app)

MAC input: `${cancellation_code}:${customer_email}` — consistent with reservation MAC pattern.

**Rationale**: The stateless MAC pattern is already established in both codebases and is how all customer-facing secure links work. No new security approach is needed.

**Alternatives considered**: Signed JWTs — rejected (adds dependency, overkill for short-lived claim links); opaque tokens stored in DB — rejected (adds DB lookup on every click, existing pattern avoids this).

---

## Decision 4: Cancellation Hook Location

**Decision**: The waitlist notification trigger is inserted in `groot-admin/lib/modules/reservations/api/reservation-service.ts` immediately after the status update succeeds at line ~2323 (after confirming `updatedReservation` is not null), before sending the cancellation email.

**Rationale**: This is the single authoritative cancellation path. The trigger must be async but non-blocking — waitlist notification failure must not roll back the cancellation itself.

**Alternatives considered**: Supabase database trigger — rejected because notification requires sending email (application layer); separate webhook — rejected as overcomplicated for a monorepo service.

---

## Decision 5: Queue Depth Returned from Availability Check

**Decision**: Extend `validateSlotAvailability` in `groot-reservation/src/lib/actions/reservation.ts` to return `queueDepth?: number` when `error.code === 'NO_TABLES_AVAILABLE'`. This value is fetched from a new `getWaitlistQueueDepth` call within the same server action.

**Rationale**: The time slot display (`TimeSlotButton`) needs queue depth at render time to show "X people ahead". Bundling it into the existing availability check avoids an extra round-trip.

**Alternatives considered**: Separate client-side fetch on slot selection — rejected (adds latency, an extra network call per slot selection); include in the time slot list API — feasible but requires refactoring the time slot list endpoint scope.

---

## Decision 6: Smart Alternatives Algorithm

**Decision**: Implement `getAlternativeSlots(businessId, date, timeslotStart, partySize)` as a server action in `groot-reservation/src/lib/actions/waitlist.ts`. It makes two separate availability queries:
1. All other timeslots on the same date → return the nearest bookable one
2. Same timeslot across the next 30 days → return the nearest bookable date

Both reuse the existing `validateSlotAvailability` logic iterated over the schedule.

**Rationale**: The availability logic already exists and is testable. Reusing it for alternative suggestions avoids duplicating complex table allocation logic.

**Alternatives considered**: AI-based recommendation — rejected as overkill; simple "show all available slots on date" — simpler but less targeted UX.

---

## Decision 7: Staff Waitlist Panel — Inline in Reservations Page

**Decision**: Add a "Waitlist" tab or collapsible panel to the existing reservations dashboard page (`app/dashboard/reservations/`) rather than creating a new top-level route.

**Rationale**: Staff switch between reservations and waitlist for the same date constantly — having them in the same view reduces navigation. The existing reservation list already filters by date. This mirrors how TableCheck and SevenRooms implement waitlist management (same-screen panel).

**Alternatives considered**: Separate `/dashboard/waitlist` route — rejected as it forces staff to context-switch between routes for the same date.

---

## Decision 8: Notification Retry Logic Location

**Decision**: Retry logic lives in the cron job `GET /api/cron/process-waitlist`. The cron runs every 2 minutes. It queries for entries with `status = 'notified'` where `notification_attempt_count < 3` and `notified_at < NOW() - INTERVAL '2 minutes'`, and retries sending. On third failure, it marks the entry `notified_failed` and advances the queue.

**Rationale**: A 2-minute cron cadence handles the exponential backoff requirement (retry 1 at ~2m, retry 2 at ~4m, retry 3 at ~6m from first attempt) while keeping infrastructure simple. The 5-minute notification SLA (SC-002) applies to first attempt; retries happen within a reasonable window after.

**Alternatives considered**: Immediate retry in the same request — rejected (synchronous, would delay cancellation response); Resend built-in retry — rejected (Resend retries are for delivery failures post-acceptance, not API errors).
