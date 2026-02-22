# Quickstart: Waitlist Management Development

**Branch**: `001-waitlist-management` | **Date**: 2026-02-22

This feature spans two repositories. Both must run locally for end-to-end testing.

---

## Prerequisites

- Node.js 20.x
- Access to the shared Supabase project (get connection string from team)
- `RESERVATION_SECRET_KEY` env var (same value in both apps — used for MAC generation)
- `RESEND_API_KEY` env var (for email sending)
- `CRON_SECRET` env var (for cron endpoint auth, any string locally)

---

## Step 1: Apply the Database Migration

Run this once against the shared Supabase instance (or local Supabase if using `supabase start`):

```bash
cd /home/fei/fei/code/groot-admin/groot-admin
npx supabase db push
# or for a specific migration:
psql $DATABASE_URL -f supabase/migrations/20260222_create_waitlist_entries.sql
```

---

## Step 2: Update Prisma Schema (groot-reservation)

After the migration is applied:

```bash
cd /home/fei/fei/code/groot-reservation/groot-reservation
npx prisma db pull     # introspect Supabase to sync schema
npx prisma generate    # regenerate Prisma client
```

---

## Step 3: Run Both Apps

**Terminal 1 — Admin app**:
```bash
cd /home/fei/fei/code/groot-admin/groot-admin
npm run dev
# Runs at http://localhost:3000
```

**Terminal 2 — Customer app**:
```bash
cd /home/fei/fei/code/groot-reservation/groot-reservation
npm run dev
# Runs at http://localhost:3001 (or check package.json for port)
```

---

## Step 4: Seed Test Data

To test the full waitlist flow, you need a restaurant with a fully booked slot.

1. Log in to the admin app → create a reservation for a date/time with all tables occupied
2. Navigate to the customer app at `localhost:3001/{restaurant-slug}`
3. Select the fully booked date and time — the "Join Waitlist" button should appear

---

## Step 5: Test the Notification Chain

1. Create a waitlist entry via the customer app
2. Cancel the reservation from the admin app
3. The waitlist notification cron runs every 2 minutes in production. Locally, trigger it manually:

```bash
curl -H "Authorization: Bearer local-test-secret" \
  http://localhost:3000/api/cron/process-waitlist
```

4. Check the email inbox (use a real email address in dev, or check Resend dashboard)

---

## Step 6: Cron Auth (Local Development)

Add to `groot-admin/.env.local`:
```
CRON_SECRET=local-test-secret
```

Then trigger cron endpoints manually via curl (see Step 5).

---

## Key Files to Implement (in order)

### Phase 1 — Database & Types
1. `groot-admin/supabase/migrations/20260222_create_waitlist_entries.sql` ← run migration
2. `groot-reservation/prisma/schema.prisma` ← add `waitlist_entries` model + `prisma generate`

### Phase 2 — Core Customer Flow
3. `groot-reservation/src/lib/utils/waitlist-auth.ts` ← MAC utilities
4. `groot-reservation/src/lib/actions/waitlist.ts` ← `joinWaitlist`, `cancelWaitlistEntry`, `getWaitlistQueueDepth`, `getAlternativeSlots`
5. `groot-reservation/src/lib/actions/reservation.ts` ← extend `validateSlotAvailability` return type with `queueDepth`
6. `groot-reservation/src/components/ui/time-slot-button.tsx` ← add `queueDepth` prop + waitlist state
7. `groot-reservation/src/components/restaurant/waitlist-join-modal.tsx` ← new component
8. `groot-reservation/src/components/restaurant/alternative-slots.tsx` ← new component
9. `groot-reservation/src/app/[slug]/page.tsx` ← wire up waitlist modal + alternatives
10. `groot-reservation/src/app/waitlist/[code]/[mac]/page.tsx` ← cancel entry page
11. `groot-reservation/src/app/waitlist/claim/[code]/[mac]/page.tsx` ← claim redirect page

### Phase 3 — Email Templates
12. `groot-reservation/src/emails/WaitlistConfirmation.tsx` ← confirmation email
13. `groot-reservation/src/lib/actions/email.ts` ← add `sendWaitlistConfirmationEmail`
14. `groot-admin/emails/WaitlistSlotAvailable.tsx` ← notification email
15. `groot-admin/lib/email.ts` ← add `sendWaitlistNotificationEmail`

### Phase 4 — Admin Backend
16. `groot-admin/app/api/waitlist/route.ts` ← GET list, POST walk-in
17. `groot-admin/app/api/waitlist/[id]/route.ts` ← PATCH reorder, DELETE remove
18. `groot-admin/app/api/waitlist/[id]/notify/route.ts` ← POST manual notify
19. `groot-admin/app/api/waitlist/[id]/convert/route.ts` ← POST convert to reservation
20. `groot-admin/lib/modules/reservations/api/reservation-service.ts` ← hook cancellation trigger
21. `groot-admin/app/api/cron/process-waitlist/route.ts` ← queue advancement + retry
22. `groot-admin/app/api/cron/expire-waitlist/route.ts` ← date expiry
23. `groot-admin/vercel.json` ← add cron schedule entries

### Phase 5 — Admin UI
24. `groot-admin/components/dashboard/reservations/WaitlistPanel.tsx` ← staff management UI
25. Wire WaitlistPanel into the existing reservations page

---

## Testing the Full Loop

```
Customer joins waitlist for fully booked slot
  → Check waitlist_entries in Supabase (status: active)
  → Check confirmation email received

Staff cancels reservation
  → Check reservation-service.ts fires waitlist trigger
  → Trigger cron manually (curl)
  → Check entry status: notified, claim_window_expires_at set
  → Check slot-available email received

Customer clicks claim link (within 30 min)
  → Check redirect to booking completion page
  → Complete booking → check status: claimed
  → Check new reservation created

Customer clicks claim link (after 30 min)
  → Check "window expired" message shown

Staff manages waitlist
  → Open admin dashboard → select date
  → Verify waitlist panel shows entries with positions
  → Test reorder, manual notify, delete, convert
```
