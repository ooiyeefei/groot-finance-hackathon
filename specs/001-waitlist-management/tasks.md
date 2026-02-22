# Tasks: Waitlist Management

**Input**: Design documents from `/specs/001-waitlist-management/`
**Prerequisites**: plan.md ✓ spec.md ✓ research.md ✓ data-model.md ✓ contracts/ ✓ quickstart.md ✓
**Tests**: Not requested — no test tasks generated.
**Repos**: `groot-admin` = `/home/fei/fei/code/groot-admin/groot-admin`, `groot-reservation` = `/home/fei/fei/code/groot-reservation/groot-reservation`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: User story this task belongs to (US1–US6)
- Exact file paths in all descriptions

---

## Phase 1: Setup (Database Foundation)

**Purpose**: Create and apply the shared Supabase schema. Both apps depend on this table. No user story work can begin until T001–T003 are complete.

**⚠️ CRITICAL**: Must complete before ANY other phase.

- [X] T001 Write Supabase migration file `groot-admin/supabase/migrations/20260222_create_waitlist_entries.sql` — full DDL per `data-model.md`: table, all 6 indexes, 4 RLS policies, `updated_at` trigger
- [X] T002 Apply migration to Supabase: run `npx supabase db push` from `groot-admin/groot-admin/` and verify table exists with `SELECT COUNT(*) FROM waitlist_entries`
- [X] T003 Add `waitlist_entries` Prisma model to `groot-reservation/prisma/schema.prisma` per `data-model.md`, then run `npx prisma generate` from `groot-reservation/groot-reservation/` to regenerate the client

**Checkpoint**: `waitlist_entries` table exists in Supabase; Prisma client exposes `prisma.waitlist_entries`

---

## Phase 2: Foundational (Shared Utilities)

**Purpose**: MAC auth utilities and shared TypeScript types used by every user story. No user story work can begin until T004–T005 are complete.

**⚠️ CRITICAL**: Blocks all customer-facing and admin user stories.

- [X] T004 Create `groot-reservation/src/lib/utils/waitlist-auth.ts` — export `generateWaitlistMAC(cancellationCode, email)`, `verifyWaitlistMAC(cancellationCode, email, mac)`, `generateWaitlistCancellationLink(cancellationCode, email)`, `generateWaitlistClaimLink(cancellationCode, email)` using the same HMAC-SHA256 + `RESERVATION_SECRET_KEY` pattern as `src/lib/utils/reservation-auth.ts`
- [X] T005 [P] Create `groot-reservation/src/lib/types/waitlist.ts` — export `WaitlistStatus` union type, `WaitlistEntry` interface, `JoinWaitlistInput` interface, `WaitlistQueueDepth` interface, `AlternativeSlot` interface per the TypeScript types section in `data-model.md`

**Checkpoint**: MAC utilities importable; type definitions available in both repos

---

## Phase 3: User Story 1 — Guest Joins Waitlist for a Fully Booked Slot (Priority: P1) 🎯 MVP

**Goal**: Customer can join the waitlist for a fully booked time slot and receive a confirmation email with their queue position and a cancellation link.

**Independent Test**: Navigate to a fully booked slot in the customer app → click "Join Waitlist" → submit name/email/phone/party-size → verify `waitlist_entries` row inserted with `status='active'` and `queue_position=1` → verify confirmation email received containing queue position and a working cancellation link URL.

- [X] T006 [US1] Add `joinWaitlist` server action to `groot-reservation/src/lib/actions/waitlist.ts` (create file) — validate input with Zod, re-check slot is still fully booked (call existing `validateSlotAvailability`), reject duplicate active entry (same email + slot + date + business), compute next `queue_position`, generate `cancellation_code` with `nanoid(8)`, insert row into `waitlist_entries` via Prisma, generate cancellation link via `generateWaitlistCancellationLink`, call `sendWaitlistConfirmationEmail`, return `{ success, queuePosition, cancellationLink }`; on SLOT_NOW_AVAILABLE return `{ success: false, error: { code: 'SLOT_NOW_AVAILABLE', bookingUrl } }`
- [X] T007 [P] [US1] Create `groot-reservation/src/emails/WaitlistConfirmation.tsx` — React Email template matching existing reservation email visual style; props: `customerName`, `restaurantName`, `date`, `timeslotStart`, `timeslotEnd`, `partySize`, `queuePosition`, `cancellationLink`; display queue position prominently; include cancellation link button
- [X] T008 [US1] Add `sendWaitlistConfirmationEmail` to `groot-reservation/src/lib/actions/email.ts` — follow existing pattern: import Resend client, render `WaitlistConfirmation` template with `@react-email/components`, send via `getResendClient().emails.send()`; `from` address: `{restaurantName} <reservations@notifications.hellogroot.com>`; subject: `You're on the waitlist — {restaurantName}`
- [X] T009 [P] [US1] Modify `groot-reservation/src/components/ui/time-slot-button.tsx` — add optional props `queueDepth?: number` and `onJoinWaitlist?: () => void`; when `available=false && onJoinWaitlist !== undefined`, render label "Full — Join Waitlist" instead of "Fully Booked" and show a queue depth badge "X waiting" when `queueDepth > 0`; clicking the button in this state calls `onJoinWaitlist()` instead of doing nothing
- [X] T010 [US1] Create `groot-reservation/src/components/restaurant/waitlist-join-modal.tsx` — modal/sheet component that takes `businessId`, `date`, `timeslotStart`, `timeslotEnd`, `partySize`, `restaurantName` as props; contains name/email/phone form fields with Zod validation; on submit calls `joinWaitlist` action; on success shows queue position + "Check your email" confirmation; handles `SLOT_NOW_AVAILABLE` by redirecting to booking URL; handles `ALREADY_ON_WAITLIST` with friendly message
- [X] T011 [US1] Modify `groot-reservation/src/app/[slug]/page.tsx` — pass `onJoinWaitlist` callback to time slot display for fully booked slots that opens `WaitlistJoinModal` with the slot's details pre-filled; render `WaitlistJoinModal` component in the page

**Checkpoint**: Full join flow works end-to-end. Confirmation email arrives. Row in `waitlist_entries` with correct `queue_position` and `status='active'`.

---

## Phase 4: User Story 2 — Guest Receives Slot-Available Notification and Claims the Booking (Priority: P1)

**Goal**: When a reservation is cancelled, the first eligible waitlisted guest receives a notification email with a 30-minute claim link. If they don't act, the queue automatically advances.

**Independent Test**: Create a reservation + 1 active waitlist entry for the same slot → cancel the reservation from the admin app → trigger `/api/cron/process-waitlist` manually → verify `waitlist_entries.status` changes to `'notified'` and `claim_window_expires_at` is set → verify slot-available email received with a working claim link → click claim link within 30 minutes → verify redirect to booking completion page with details pre-filled.

- [X] T012 [P] [US2] Create `groot-admin/emails/WaitlistSlotAvailable.tsx` — React Email template; props: `customerName`, `restaurantName`, `date`, `timeslotStart`, `timeslotEnd`, `partySize`, `queuePosition`, `claimLink`, `claimWindowMinutes` (30); show claim window countdown prominently; include primary CTA "Claim My Spot" button linking to `claimLink`; include "window expires in 30 minutes" warning
- [X] T013 [US2] Add `sendWaitlistNotificationEmail` to `groot-admin/lib/email.ts` — follow existing `sendCancellationEmail` pattern; render `WaitlistSlotAvailable` template; subject: `Your waitlisted spot at {restaurantName} is available — 30 minutes to claim`; `from`: `{restaurantName} <reservations@notifications.hellogroot.com>`; return result for logging
- [X] T014 [US2] Modify `groot-admin/lib/modules/reservations/api/reservation-service.ts` at line ~2323 (after `updatedReservation` confirmed not null, before cancellation email) — add async `notifyWaitlistForSlot(reservation)` call inside a `try/catch` block (failure must not throw or block cancellation); `notifyWaitlistForSlot` queries `waitlist_entries` for `status='active'` entries matching `business_id + date + timeslot_start`, sorted by `queue_position ASC`; for each freed slot: skips guests whose `party_size` exceeds available capacity, finds next eligible guest, generates claim link via MAC, calls `sendWaitlistNotificationEmail`, updates entry `status='notified'`, `notified_at=NOW()`, `claim_window_expires_at=NOW()+30min`, `notification_attempt_count=1`
- [X] T015 [US2] Create `groot-admin/app/api/cron/process-waitlist/route.ts` — `GET` handler with `Authorization: Bearer ${CRON_SECRET}` validation; **Job A** (claim window expiry): query entries where `status='notified' AND claim_window_expires_at < NOW()`, mark each `status='expired'`, then for each find and notify next eligible active entry in same slot queue; **Job B** (notification retry): query entries where `(status='notified' OR status='notified_failed') AND notification_attempt_count < 3 AND notified_at < NOW() - INTERVAL '2 minutes'`, retry email, on success reset `status='notified'`, increment count, on 3rd failure set `status='notified_failed'` and advance queue; return `{ processed: number, errors: string[] }`
- [X] T016 [US2] Create `groot-reservation/src/app/waitlist/claim/[code]/[mac]/page.tsx` — server component; load `waitlist_entries` row by `cancellation_code`, validate MAC with `verifyWaitlistMAC`, check `status='notified'` and `claim_window_expires_at > NOW()`; if valid: redirect to `/[restaurantSlug]` booking page with query params pre-filling name/email/phone/party-size/date/timeslot; if expired: render "window closed" message with option to rejoin waitlist linking back to `/{slug}`
- [X] T017 [US2] Modify `groot-admin/vercel.json` — add cron entries: `{ "path": "/api/cron/process-waitlist", "schedule": "*/2 * * * *" }` and `{ "path": "/api/cron/expire-waitlist", "schedule": "0 1 * * *" }`; verify existing vercel.json structure before editing

**Checkpoint**: Cancel a reservation → trigger cron manually → notification email sent → claim link works → redirects to booking flow with pre-filled details. Expired claim link shows correct error page.

---

## Phase 5: User Story 3 — Guest Cancels Their Waitlist Entry (Priority: P2)

**Goal**: Customer can cancel their own waitlist entry via the secure link in their confirmation email.

**Independent Test**: Create a waitlist entry → confirm confirmation email contains a working cancellation link → click link → verify `waitlist_entries.status='cancelled'` → verify remaining entries in same queue have updated `queue_position` values (repacked).

- [X] T018 [US3] Add `cancelWaitlistEntry(cancellationCode, mac)` to `groot-reservation/src/lib/actions/waitlist.ts` — load entry by `cancellation_code`, validate MAC with `verifyWaitlistMAC`, reject if status is not `active` or `notified` (return `ENTRY_ALREADY_INACTIVE`), update `status='cancelled'`, repack queue: decrement `queue_position` of all entries in same slot where `queue_position > cancelled_entry.queue_position AND status IN ('active','notified')`
- [X] T019 [US3] Create `groot-reservation/src/app/waitlist/[code]/[mac]/page.tsx` — server component; load entry by `cancellation_code`, validate MAC; if entry is `active` or `notified`: render entry details (date, time, party size, restaurant name, queue position) plus "Cancel My Waitlist Spot" button that calls `cancelWaitlistEntry`; on success render "You've been removed from the waitlist" confirmation; if entry is already inactive render "This entry is no longer active" message; if MAC invalid render 403 error page

**Checkpoint**: Cancellation link from confirmation email loads correctly, cancels entry, repacks queue, shows confirmation page.

---

## Phase 6: User Story 4 — Staff Views and Manages the Waitlist (Priority: P2)

**Goal**: Restaurant staff can view, reorder, notify, remove, add walk-in guests, and convert waitlist entries to reservations from the admin dashboard.

**Independent Test**: With 3 active waitlist entries for a slot → open admin dashboard reservations page for that date → verify waitlist count badge visible → open waitlist panel → verify all 3 entries shown with correct positions → reorder position #3 to #1 → verify queue repacks → manually notify entry → verify status changes to 'notified' and email sent → delete an entry → verify queue repacks → add a walk-in guest → verify new entry appears at end of queue.

- [X] T020 [P] [US4] Create `groot-admin/app/api/waitlist/route.ts` — `GET` handler: query `waitlist_entries` by `business_id + date` (from query params), optional `timeslot` and `status` filters, return entries sorted by `timeslot_start ASC, queue_position ASC`; `POST` handler: staff adds walk-in guest, validate Clerk auth, compute next queue position for the slot, insert row with `cancellation_code = nanoid(8)` (no email sent for walk-ins); both handlers verify `business_id` belongs to authenticated user via Supabase RLS
- [X] T021 [P] [US4] Create `groot-admin/app/api/waitlist/[id]/route.ts` — `PATCH` handler: accept `{ queuePosition }`, validate new position is ≥ 1 and ≤ total active entries for that slot, shift intermediate entries ±1 to maintain contiguous positions, update entry to new position; `DELETE` handler: set `status='cancelled'`, repack queue for remaining active entries in same slot; both verify entry belongs to authenticated user's business
- [X] T022 [P] [US4] Create `groot-admin/app/api/waitlist/[id]/notify/route.ts` — `POST` handler: load entry, verify `status='active'`, call `validateSlotAvailability` to confirm a slot genuinely exists for the entry's `party_size` (return 409 if not), generate claim link via `generateWaitlistClaimLink` (import MAC util from a shared util or replicate pattern), call `sendWaitlistNotificationEmail`, update entry `status='notified'`, `notified_at=NOW()`, `claim_window_expires_at=NOW()+30min`, `notification_attempt_count=1`; return `{ notifiedAt, claimWindowExpiresAt }`
- [X] T023 [P] [US4] Create `groot-admin/app/api/waitlist/[id]/convert/route.ts` — `POST` handler: load entry, verify `status IN ('active','notified')`, run availability check for slot + party size (return 409 if unavailable), call existing reservation creation logic to create a new reservation with the waitlist entry's customer details, update entry `status='claimed'`, send reservation confirmation email to customer, advance queue for remaining active entries in same slot; return `{ reservation: { confirmationCode, reservationLink } }`
- [X] T024 [US4] Create `groot-admin/components/dashboard/reservations/WaitlistPanel.tsx` — client component that consumes the 4 API endpoints above; props: `businessId: string, date: string`; fetches `GET /api/waitlist?businessId&date` on mount; renders entries grouped by time slot, each showing: queue position, customer name + email + phone, party size, status badge, created time, claim window countdown (if notified); per-entry actions: reorder up/down buttons (calls PATCH), manual notify button (calls notify endpoint, disabled when slot unavailable), convert button (calls convert endpoint), delete button (calls DELETE); add walk-in form at bottom of panel; use semantic design tokens (`bg-card`, `text-foreground`) per CLAUDE.md; action buttons must use `bg-primary`, destructive must use `bg-destructive`, cancel must use `bg-secondary`
- [X] T025 [US4] Modify the existing reservations dashboard page (find correct path: `groot-admin/app/dashboard/reservations/page.tsx` or similar) — fetch waitlist count for the selected date via `GET /api/waitlist?businessId&date`; show a count badge "X on waitlist" next to the date header when count > 0; add a collapsible "Waitlist" panel below the reservations list that renders `WaitlistPanel` for the current date

**Checkpoint**: Full staff management flow works: view, reorder, notify, convert, delete, add walk-in all function correctly with correct queue position repacking.

---

## Phase 7: User Story 5 — Guest Sees Queue Depth and Smart Alternative Suggestions (Priority: P2)

**Goal**: When a slot is fully booked, the join screen shows how many people are ahead and suggests the nearest available alternative slots.

**Independent Test**: Seed 3 waitlist entries for a slot → navigate to booking page, select that slot → verify "3 people ahead of you" badge shown on the time slot button → verify at least one alternative slot suggestion displayed (nearest available timeslot on same date OR nearest future date with same timeslot) → click alternative suggestion → verify redirect to booking flow with that slot pre-selected.

- [X] T026 [US5] Add `getWaitlistQueueDepth({ businessId, date, timeslotStart })` to `groot-reservation/src/lib/actions/waitlist.ts` — count `waitlist_entries` rows where `business_id + date + timeslot_start + status IN ('active','notified')`; return `{ count: number }`
- [X] T027 [P] [US5] Add `getAlternativeSlots({ businessId, date, timeslotStart, partySize })` to `groot-reservation/src/lib/actions/waitlist.ts` — (1) fetch schedule for `date` to get all configured timeslots; for each slot on the same date (excluding the requested one) call `validateSlotAvailability`; return the first available as `sameDate`; (2) for the same timeslot, iterate the next 30 calendar days calling `validateSlotAvailability`; return first available date as `otherDate`; return `{ sameDate: { timeslotStart, timeslotEnd } | null, otherDate: { date, timeslotStart, timeslotEnd } | null }`
- [X] T028 [US5] Modify `groot-reservation/src/lib/actions/reservation.ts` function `validateSlotAvailability` — extend return type: add `queueDepth?: number` field; when returning `{ isAvailable: false, error: { code: 'NO_TABLES_AVAILABLE' } }`, additionally call `getWaitlistQueueDepth` and include the count as `queueDepth`; this is an additive backward-compatible change
- [X] T029 [US5] Create `groot-reservation/src/components/restaurant/alternative-slots.tsx` — component that takes `sameDate: AlternativeSlot | null` and `otherDate: AlternativeSlot | null` props plus `restaurantSlug: string` and `partySize: number`; renders a "No availability? Try these:" section with clickable cards for each suggestion; clicking navigates to `/{slug}?date=...&timeslot=...&partySize=...` (pre-selecting the alternative in the booking flow)
- [X] T030 [US5] Modify `groot-reservation/src/app/[slug]/page.tsx` — when time slot availability returns `NO_TABLES_AVAILABLE`, pass `queueDepth` to `TimeSlotButton`; after waitlist join modal, render `AlternativeSlots` component with results from `getAlternativeSlots` call (fetch alternatives when modal opens, cache for the slot); this modifies the same file as T011 — apply sequentially after T011

**Checkpoint**: Fully booked slot shows queue depth badge and alternative suggestions. Clicking an alternative navigates to its booking flow.

---

## Phase 8: User Story 6 — Waitlist Entries Auto-Expire on Date Passage (Priority: P3)

**Goal**: Waitlist entries for past dates are silently expired by a daily cron job.

**Independent Test**: Create a waitlist entry with `date = yesterday` directly in Supabase → trigger `/api/cron/expire-waitlist` manually → verify entry `status='expired'` → verify clicking the entry's cancellation link shows "no longer active" message.

- [X] T031 [US6] Create `groot-admin/app/api/cron/expire-waitlist/route.ts` — `GET` handler with `Authorization: Bearer ${CRON_SECRET}` validation; execute: `UPDATE waitlist_entries SET status='expired', updated_at=NOW() WHERE date < CURRENT_DATE AND status IN ('active','notified')`; return `{ expiredCount: number }`; no emails sent (silent expiry per spec)
- [X] T032 [US6] Verify `groot-admin/vercel.json` already has the `expire-waitlist` cron schedule from T017 (`"0 1 * * *"`); if not added yet, add it now

**Checkpoint**: Manual cron trigger expires past-date entries. Cancellation link for expired entry shows correct inactive message.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Build verification, end-to-end validation, and final checks.

- [X] T033 [P] Run `npm run build` in `groot-admin/groot-admin/` — fix any TypeScript errors or import issues before marking complete
- [X] T034 [P] Run `npm run build` in `groot-reservation/groot-reservation/` — fix any TypeScript errors, Prisma client issues, or missing type imports before marking complete
- [X] T035 Run full end-to-end flow per `quickstart.md` test scenario: (1) join waitlist via customer app → confirm email received; (2) cancel reservation from admin → trigger process-waitlist cron → confirm notification email → claim within window → confirm booking created; (3) let claim window expire (set `claim_window_expires_at` to past in DB) → trigger cron → confirm next-in-queue notified; (4) staff reorder + convert via admin panel → confirm reservation created; (5) trigger expire-waitlist cron → confirm past-date entries expired

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (T001–T003 complete)
- **Phase 3 (US1)**: Depends on Phase 2 (T004–T005 complete)
- **Phase 4 (US2)**: Depends on Phase 2 — can run **in parallel with Phase 3** (separate files, separate repo)
- **Phase 5 (US3)**: Depends on Phase 3 (T006 must exist — cancelWaitlistEntry extends the same file)
- **Phase 6 (US4)**: Depends on Phase 2 — can start after Foundational (admin API is independent of customer flow)
- **Phase 7 (US5)**: Depends on Phase 3 T011 (modifies same page.tsx file)
- **Phase 8 (US6)**: Depends on Phase 4 T017 (vercel.json already created)
- **Phase 9 (Polish)**: Depends on all desired phases complete

### User Story Dependencies

| Story | Depends On | Independent? |
|-------|-----------|--------------|
| US1 (join waitlist) | Phase 2 foundational | ✅ Yes |
| US2 (notification + claim) | Phase 2 foundational | ✅ Yes (parallel with US1) |
| US3 (cancel entry) | US1 T006 (same file) | ✅ Mostly (needs US1 file to exist) |
| US4 (staff management) | Phase 2 foundational | ✅ Yes (parallel with US1+US2) |
| US5 (queue depth + alternatives) | US1 T011 (same page.tsx) | ✅ Mostly (extends T011's page changes) |
| US6 (auto-expiry) | US2 T017 (vercel.json) | ✅ Yes (just adds one more cron) |

### Within Each User Story

- Files that are independent of each other are marked `[P]`
- Email template tasks (T007, T012) can be written in parallel with action/service tasks
- API route tasks within US4 (T020–T023) are all parallel — separate files, no shared state

---

## Parallel Opportunities

### Parallel After Phase 2 Foundational (max throughput with 3 developers)

```
Developer A (groot-reservation): Phase 3 US1 → Phase 5 US3 → Phase 7 US5
Developer B (groot-admin): Phase 4 US2 → Phase 8 US6
Developer C (groot-admin): Phase 6 US4
```

### Parallel Within US1 (Phase 3)

```
T006 joinWaitlist action + T007 WaitlistConfirmation email template  ← parallel
T009 TimeSlotButton modification                                       ← parallel with T006/T007
Then: T008 sendWaitlistConfirmationEmail (depends on T007)
Then: T010 WaitlistJoinModal (depends on T006)
Then: T011 wire into page.tsx (depends on T009, T010)
```

### Parallel Within US4 (Phase 6)

```
T020 GET+POST /api/waitlist/route.ts
T021 PATCH+DELETE /api/waitlist/[id]/route.ts      ← all 4 parallel
T022 POST /api/waitlist/[id]/notify/route.ts
T023 POST /api/waitlist/[id]/convert/route.ts
Then: T024 WaitlistPanel (depends on T020–T023)
Then: T025 wire into reservations page (depends on T024)
```

### Parallel Build Verification (Phase 9)

```
T033 npm run build groot-admin    ← parallel
T034 npm run build groot-reservation
Then: T035 end-to-end validation
```

---

## Implementation Strategy

### MVP First (US1 + US2 only)

1. ✅ Phase 1: Setup (DB migration)
2. ✅ Phase 2: Foundational (MAC utils + types)
3. ✅ Phase 3: US1 — customers can join waitlist and receive confirmation email
4. ✅ Phase 4: US2 — cancellations trigger notifications; guests can claim slots
5. **STOP and VALIDATE**: Core revenue recovery loop is complete
6. Deploy and gather feedback before continuing to P2 stories

### Incremental Delivery

| Sprint | Delivers |
|--------|---------|
| 1 | Phases 1–3: DB + US1 (join waitlist) — captures demand |
| 2 | Phase 4: US2 (notification + claim) — recovers revenue |
| 3 | Phases 5–6: US3 + US4 (cancel + staff management) — operational control |
| 4 | Phases 7–8: US5 + US6 (queue depth + expiry) — polish & hygiene |
| 5 | Phase 9: Build verify + E2E validation |

### Task Counts per Story

| Phase | Story | Tasks | Parallel Tasks |
|-------|-------|-------|----------------|
| Phase 1 | Setup | 3 | 0 |
| Phase 2 | Foundational | 2 | 1 |
| Phase 3 | US1 (Join) | 6 | 2 |
| Phase 4 | US2 (Notify+Claim) | 6 | 2 |
| Phase 5 | US3 (Cancel) | 2 | 0 |
| Phase 6 | US4 (Staff Mgmt) | 6 | 4 |
| Phase 7 | US5 (Queue+Alt) | 5 | 1 |
| Phase 8 | US6 (Expiry) | 2 | 0 |
| Phase 9 | Polish | 3 | 2 |
| **Total** | | **35** | **12** |

---

## Notes

- `[P]` tasks = different files, no incomplete task dependencies
- All admin API routes (groot-admin) require Clerk JWT auth — use the same auth pattern as existing routes
- The cancellation trigger in `reservation-service.ts` (T014) MUST be wrapped in `try/catch` — waitlist failure must never block or throw from a cancellation
- All new UI components in groot-admin must use semantic design tokens: `bg-card`, `text-foreground`, `bg-primary`, `bg-destructive`, `bg-secondary` per CLAUDE.md
- `CRON_SECRET` env var must be added to Vercel environment variables before deploying cron jobs
- Commit after each completed checkpoint (end of each phase)
- Run `npm run build` in both repos after each phase to catch type errors early
