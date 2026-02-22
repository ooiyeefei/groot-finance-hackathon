# Customer-Facing Contracts (groot-reservation)

**Type**: Next.js Server Actions
**File locations**: `groot-reservation/src/lib/actions/waitlist.ts`

---

## Action 1: `joinWaitlist`

**Purpose**: Customer joins waitlist for a fully booked slot.

**File**: `src/lib/actions/waitlist.ts`

```typescript
interface JoinWaitlistParams {
  businessId: string;
  date: string;           // YYYY-MM-DD
  timeslotStart: string;  // HH:MM
  timeslotEnd: string;    // HH:MM
  partySize: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}

interface JoinWaitlistResult {
  success: true;
  queuePosition: number;
  cancellationLink: string;  // /waitlist/{code}/{mac}
} | {
  success: false;
  error: {
    code:
      | 'SLOT_NOW_AVAILABLE'     // slot opened while form was being filled
      | 'ALREADY_ON_WAITLIST'    // same email already has active entry for slot
      | 'PARTY_SIZE_INVALID'     // party size cannot be accommodated even if slot opened
      | 'VALIDATION_ERROR';
    message: string;
    bookingUrl?: string;         // only when code === 'SLOT_NOW_AVAILABLE'
  };
}

export async function joinWaitlist(params: JoinWaitlistParams): Promise<JoinWaitlistResult>
```

**Behaviour**:
1. Validate input (Zod schema)
2. Check slot is still fully booked — if now available, return `SLOT_NOW_AVAILABLE` with booking URL
3. Check party size compatibility using existing `validateSlotAvailability` logic
4. Check for duplicate active entry (same email + slot + date + business)
5. Determine next queue position (`MAX(queue_position) + 1` for same slot, or `1` if first)
6. Generate `cancellation_code` (nanoid 8 chars)
7. Insert `waitlist_entries` row via Prisma
8. Generate cancellation MAC and cancellation link
9. Send confirmation email (Resend via `sendWaitlistConfirmationEmail`)
10. Return queue position + cancellation link

---

## Action 2: `cancelWaitlistEntry`

**Purpose**: Customer cancels their own waitlist entry via secure link.

```typescript
interface CancelWaitlistEntryParams {
  cancellationCode: string;
  mac: string;
}

interface CancelWaitlistEntryResult {
  success: true;
  message: 'cancelled';
} | {
  success: false;
  error: {
    code:
      | 'INVALID_MAC'         // MAC validation failed
      | 'ENTRY_NOT_FOUND'
      | 'ENTRY_ALREADY_INACTIVE'  // already claimed/expired/cancelled
      | 'VALIDATION_ERROR';
    message: string;
  };
}

export async function cancelWaitlistEntry(
  params: CancelWaitlistEntryParams
): Promise<CancelWaitlistEntryResult>
```

**Behaviour**:
1. Fetch entry by `cancellation_code`
2. Validate MAC: `verifyWaitlistMAC(cancellationCode, entry.customerEmail, mac)`
3. Check status is `active` or `notified` (cancellable states)
4. Update status to `cancelled`
5. Repack queue: decrement `queue_position` for all active entries with position > cancelled entry's position (same slot/date/business)

---

## Action 3: `getWaitlistQueueDepth`

**Purpose**: Returns number of active waitlist entries ahead of a new joiner for a given slot.

```typescript
interface GetQueueDepthParams {
  businessId: string;
  date: string;        // YYYY-MM-DD
  timeslotStart: string;
}

interface GetQueueDepthResult {
  count: number;
}

export async function getWaitlistQueueDepth(
  params: GetQueueDepthParams
): Promise<GetQueueDepthResult>
```

**Behaviour**: `COUNT(*) WHERE business_id = ? AND date = ? AND timeslot_start = ? AND status IN ('active', 'notified')`

---

## Action 4: `getAlternativeSlots`

**Purpose**: Returns nearest available slot alternatives when a requested slot is fully booked.

```typescript
interface GetAlternativeSlotsParams {
  businessId: string;
  date: string;           // YYYY-MM-DD
  timeslotStart: string;  // HH:MM — the fully booked slot
  partySize: number;
}

interface GetAlternativeSlotsResult {
  sameDate: {
    timeslotStart: string;
    timeslotEnd: string;
  } | null;                // nearest available timeslot on same date, null if none
  otherDate: {
    date: string;          // YYYY-MM-DD
    timeslotStart: string;
    timeslotEnd: string;
  } | null;                // nearest future date with same timeslot available, null if none
}

export async function getAlternativeSlots(
  params: GetAlternativeSlotsParams
): Promise<GetAlternativeSlotsResult>
```

**Behaviour**:
1. Fetch schedule for the date to get all available timeslots
2. For each timeslot on the same date (excluding the requested one), call `validateSlotAvailability` — return first available
3. For the same timeslot, check the next 30 calendar days — return first date where `validateSlotAvailability` returns `isAvailable: true`

---

## Extended Return: `validateSlotAvailability`

**File**: `src/lib/actions/reservation.ts` — modify existing function

```typescript
// BEFORE
interface AvailabilityValidationResult {
  isAvailable: boolean;
  error?: {
    code: 'NO_SCHEDULE' | 'SLOT_NOT_IN_SCHEDULE' | 'NO_TABLES_AVAILABLE' | 'VALIDATION_ERROR';
    message: string;
  };
}

// AFTER — add queueDepth when NO_TABLES_AVAILABLE
interface AvailabilityValidationResult {
  isAvailable: boolean;
  queueDepth?: number;    // populated only when isAvailable=false AND error.code='NO_TABLES_AVAILABLE'
  error?: {
    code: 'NO_SCHEDULE' | 'SLOT_NOT_IN_SCHEDULE' | 'NO_TABLES_AVAILABLE' | 'VALIDATION_ERROR';
    message: string;
  };
}
```

---

## MAC Utilities

**File**: `src/lib/utils/waitlist-auth.ts` (new file, mirrors reservation-auth.ts)

```typescript
export function generateWaitlistMAC(cancellationCode: string, email: string): string
// Input: `${cancellationCode}:${email}` → HMAC-SHA256 → hex
// Uses same RESERVATION_SECRET_KEY env var

export function verifyWaitlistMAC(cancellationCode: string, email: string, mac: string): boolean

export function generateWaitlistCancellationLink(cancellationCode: string, email: string): string
// Returns: /waitlist/{cancellationCode}/{mac}

export function generateWaitlistClaimLink(cancellationCode: string, email: string): string
// Returns: /waitlist/claim/{cancellationCode}/{mac}
```

---

## New Pages

### `/waitlist/[code]/[mac]` — Waitlist Entry Management

**File**: `src/app/waitlist/[code]/[mac]/page.tsx`

Shows entry details and Cancel button. On load: validates MAC, checks entry status. Renders:
- Active/Notified: entry details + Cancel button
- Inactive: "This entry is no longer active" message

### `/waitlist/claim/[code]/[mac]` — Claim Slot

**File**: `src/app/waitlist/claim/[code]/[mac]/page.tsx`

On load: validates MAC, checks claim window not expired, redirects to booking flow with details pre-filled. If expired: shows "window closed" message with option to rejoin waitlist.

---

## Component Changes

### `TimeSlotButton` — `src/components/ui/time-slot-button.tsx`

```typescript
// Add to props:
interface TimeSlotButtonProps {
  start: string;
  end: string;
  available: boolean;
  selected: boolean;
  onClick: () => void;
  className?: string;
  queueDepth?: number;      // NEW: number of waitlist entries when available=false
  onJoinWaitlist?: () => void;  // NEW: callback to open waitlist join modal
}
```

New render state: when `available=false && queueDepth !== undefined`:
- Show "Full — Join Waitlist" label
- Show queue depth badge: "X waiting"
- Clicking triggers `onJoinWaitlist()` callback

### New: `WaitlistJoinModal` — `src/components/restaurant/waitlist-join-modal.tsx`

Form collecting name, email, phone. Calls `joinWaitlist` server action. Shows:
- Success: queue position + "Check your email"
- SLOT_NOW_AVAILABLE: redirect to booking flow
- ALREADY_ON_WAITLIST: "You're already on the list"

### New: `AlternativeSlots` — `src/components/restaurant/alternative-slots.tsx`

Shown below WaitlistJoinModal when alternatives exist. Displays:
- "Nearest available today: [time]" → click to book
- "Next available [date] at [time]" → click to book
