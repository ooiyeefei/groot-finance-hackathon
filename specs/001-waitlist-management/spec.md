# Feature Specification: Waitlist Management

**Feature Branch**: `001-waitlist-management`
**Created**: 2026-02-22
**Status**: Draft
**Input**: Waitlist management feature for restaurant reservation system — customers join a waitlist when a time slot is fully booked, receive email notifications when a slot opens, and staff manage the waitlist queue from the admin dashboard.

---

## Clarifications

### Session 2026-02-22

- Q: When a cancellation occurs and the freed slot capacity doesn't match the first waitlisted guest's party size (e.g., 4-person table opens but first guest needs 6), should the system skip that guest? → A: Yes — skip ineligible party sizes and notify the next eligible guest in queue (best-fit matching).
- Q: When two cancellations occur near-simultaneously for the same slot, are two separate waitlisted guests notified at once? → A: Yes — notify one guest per freed slot simultaneously; if 2 tables cancel, notify the #1 and #2 guests in queue at the same time. Availability re-check at claim time is the final guard against double-booking.
- Q: If the slot-available notification email fails to deliver, what should the system do? → A: Retry up to 3 times with exponential backoff; only skip to the next guest after all retries are exhausted. Mark entry as notified-failed.
- Q: Should there be a maximum number of active waitlist entries per slot, and how should queue depth be communicated to customers? → A: No cap — accept unlimited entries. Show queue depth ("X people ahead of you") on the join screen so customers can self-select. Additionally, surface smart alternative suggestions (nearest available timeslot on the same date, or nearest date with the same timeslot available) to help guests find a confirmed booking instead of waiting.
- Q: Should waitlist management actions (reorder, delete, convert to reservation) be restricted by staff role? → A: No role-based restriction needed — the admin system has a single effective role (any authenticated business user with active subscription). All logged-in staff have full access to all waitlist operations.

---

## Context

The Groot Reservation platform currently shows a time slot as "Unavailable" when it is fully booked, with no way for interested customers to express intent or recover a cancelled slot. This results in lost bookings when cancellations occur and no mechanism to fill those seats.

Competitor platforms (TableCheck, OpenTable, Resy, UMAI, SevenRooms) all provide waitlist management as a core feature. UMAI charges an additional RM 50/month for queue management as an add-on. Groot should offer this natively to remain competitive.

### Competitive Benchmarks

| Platform       | Waitlist Features                                                    |
| -------------- | -------------------------------------------------------------------- |
| **TableCheck** | Smart Waitlist, auto-fill on cancellation, SMS/email, position view  |
| **OpenTable**  | "Alert Me" button, reward member priority, auto-fill                 |
| **Resy**       | "Notify Me" email alerts, walk-in text notifications                 |
| **UMAI**       | Walk-in queue, SMS notifications, wait time estimates (+RM 50/mo)    |
| **SevenRooms** | VIP priority tiers, automated notification sequences                 |
| **Groot**      | Not yet implemented — roadmap item, High Priority                    |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Guest Joins Waitlist for a Fully Booked Slot (Priority: P1)

A guest visits a restaurant's booking page, selects a date and party size, then discovers their preferred time slot is fully booked. Instead of leaving empty-handed, they can join a waitlist for that slot by providing their contact details. They receive a confirmation email with their queue position and a link to cancel their waitlist entry.

**Why this priority**: This is the core value proposition. Without the ability to join a waitlist, all other features have no data to work with. This directly captures revenue recovery from cancellations.

**Independent Test**: Deploy just the customer-facing "Join Waitlist" form and the confirmation email. A tester can navigate to a fully booked slot, join the waitlist, and verify the confirmation email is received with the correct queue position. Delivers value as a standalone MVP.

**Acceptance Scenarios**:

1. **Given** a time slot is fully booked, **When** a guest visits the booking page and selects that slot, **Then** the slot is shown as "Full — Join Waitlist" instead of simply "Unavailable"
2. **Given** a guest clicks "Join Waitlist", **When** they submit their name, email, phone, and party size, **Then** their waitlist entry is recorded and they receive a confirmation email with their position in queue and a cancellation link
3. **Given** a guest with the same email already has an active waitlist entry for the same slot, **When** they try to join again, **Then** the system rejects the duplicate and informs them they are already on the waitlist
4. **Given** a guest submits the waitlist form, **When** the slot becomes available at the time of submission (a cancellation occurred while they were filling in the form), **Then** the system offers them the ability to proceed directly to a standard booking instead

---

### User Story 2 — Guest Receives Slot-Available Notification and Claims the Booking (Priority: P1)

When a reservation is cancelled, the system identifies waitlisted guests for that slot and sends a time-limited notification to the first person in the queue. The notified guest follows the link in the email to claim the slot and complete the booking (including any required deposit). If they do not act within the claim window, the system automatically notifies the next person in the queue.

**Why this priority**: This completes the core loop. Capturing a waitlist is only valuable if cancellations are actually recovered into confirmed bookings. This delivers direct, measurable revenue impact.

**Independent Test**: Create a test reservation, add a waitlist entry, cancel the reservation, and verify the notification email is sent to the waitlisted guest within 5 minutes. Verify the claim link leads to the booking completion flow. Delivers measurable recovery value independently.

**Acceptance Scenarios**:

1. **Given** an active waitlist entry exists for a slot, **When** a confirmed or pending reservation for that exact slot is cancelled, **Then** the first waitlisted guest is sent a notification email within 5 minutes containing a claim link
2. **Given** a guest receives a claim notification, **When** they click the link within 30 minutes, **Then** they are taken to the standard booking completion flow with their details pre-filled, including payment if a deposit is required
3. **Given** a guest does not act within 30 minutes of receiving a claim notification, **When** the window expires, **Then** the next person in queue is notified and the original guest's entry is marked as expired
4. **Given** a guest claims the slot and completes booking, **When** the same slot would otherwise notify another waitlisted guest, **Then** the system recognises the slot is filled and skips further notifications for that slot
5. **Given** a guest's claim link is clicked after the 30-minute window has closed, **When** they attempt to complete the booking, **Then** they see a clear message that the window has expired and are offered the option to rejoin the waitlist

---

### User Story 3 — Guest Cancels Their Waitlist Entry (Priority: P2)

A guest on the waitlist can cancel their entry at any time via the secure link included in their confirmation email. This prevents stale entries from wasting notifications on guests who no longer want the slot.

**Why this priority**: Without self-service cancellation, the waitlist fills with stale entries and wastes notification slots on uninterested guests. This improves conversion quality and list hygiene.

**Independent Test**: Create a waitlist entry, verify the confirmation email contains a working cancellation link, click it, and verify the entry is removed and remaining queue positions are updated. Delivers value independently.

**Acceptance Scenarios**:

1. **Given** a guest has an active waitlist entry, **When** they click the cancellation link in their confirmation email, **Then** they see a confirmation page and their entry is removed from the queue
2. **Given** a guest cancels their waitlist entry, **When** the remaining entries are checked, **Then** they retain their relative order and their displayed position numbers update correctly
3. **Given** a guest's waitlist entry has already expired or been used to claim a slot, **When** they click the cancellation link, **Then** they see a message explaining the entry is no longer active and no action is taken

---

### User Story 4 — Staff Views and Manages the Waitlist (Priority: P2)

Restaurant staff can view the waitlist for any date and time slot from the admin dashboard. They can see all pending entries, manually trigger notifications, remove entries, reorder the queue, and add walk-in guests directly.

**Why this priority**: Staff oversight is essential for VIP handling, operational situations requiring manual intervention, and maintaining accurate queue order when automatic FIFO is insufficient. All authenticated staff have full access to all waitlist operations — no role hierarchy exists.

**Independent Test**: With waitlist entries in the system, verify staff can open the waitlist panel in the admin dashboard for a specific date, view all entries with their details, and perform a manual notification action. Delivers value independently.

**Acceptance Scenarios**:

1. **Given** staff navigates to the Reservations section of the admin dashboard and selects a date, **When** waitlist entries exist for that date, **Then** a waitlist count is shown alongside reservations and staff can open a waitlist panel displaying all entries grouped by time slot
2. **Given** a cancellation has occurred and auto-notification has been triggered, **When** staff view the waitlist panel, **Then** they can see which entry was notified, its status, and how much time remains in the claim window
3. **Given** a staff member manually clicks "Notify" on a waitlist entry and a slot is available, **When** the action is confirmed, **Then** a notification is sent immediately to that guest and the 30-minute claim window starts
4. **Given** a staff member wants to prioritise a guest, **When** they reorder the queue entries, **Then** the new order is saved and that guest will be notified before others currently ranked below them
5. **Given** a staff member adds a walk-in guest to the waitlist, **When** they enter name, phone, party size, and desired time slot, **Then** the guest is added to the queue and can receive a notification when a slot opens
6. **Given** a staff member removes a waitlist entry, **When** they confirm the action, **Then** the entry is deleted and the remaining queue positions update accordingly

---

### User Story 5 — Guest Sees Queue Depth and Smart Alternative Suggestions (Priority: P2)

When a guest encounters a fully booked slot, the booking page shows them how many people are already waiting ahead in the queue, and proactively surfaces the nearest available alternatives — both a different timeslot on the same date and the nearest date where the same timeslot has availability. This lets guests make an informed choice between joining the queue or booking a confirmed slot immediately.

**Why this priority**: Reduces guest frustration at a fully booked screen, increases overall booking conversion (guest books an alternative instead of leaving), and sets honest expectations for waitlist position.

**Independent Test**: Navigate to a fully booked slot with a non-empty waitlist and verify the queue depth count is shown. Verify at least one alternative slot suggestion is displayed and is genuinely bookable. Delivers value independently of the notification chain.

**Acceptance Scenarios**:

1. **Given** a slot is fully booked and has 3 active waitlist entries, **When** a guest selects that slot, **Then** the waitlist join screen shows "3 people ahead of you"
2. **Given** a slot is fully booked, **When** the system checks availability, **Then** it displays the nearest available timeslot on the same date for the same party size (if one exists)
3. **Given** a slot is fully booked and no other timeslot on that date is available for the party size, **When** alternatives are computed, **Then** the system shows the nearest future date on which the same timeslot has availability
4. **Given** no alternative slots exist within a reasonable future window (e.g., next 30 days), **When** alternatives are computed, **Then** no suggestions panel is shown and only the waitlist join option is presented
5. **Given** a guest clicks on a suggested alternative slot, **When** they are redirected, **Then** they are taken directly to the standard booking flow with the alternative date/time pre-selected

---

### User Story 6 — Waitlist Entries Auto-Expire on Date Passage (Priority: P3)

Waitlist entries for past dates are automatically closed so the system remains clean and analytics remain accurate.

**Why this priority**: Hygiene requirement to prevent incorrect notifications and data clutter. Lower priority as it does not directly impact the core booking recovery loop.

**Independent Test**: Create a waitlist entry with a past date, verify it transitions to "expired" status automatically without sending any notification to the guest. Delivers value independently.

**Acceptance Scenarios**:

1. **Given** a waitlist entry exists for a date and time that has now passed, **When** the scheduled cleanup runs, **Then** the entry status changes to "expired" and no further notifications are sent for it
2. **Given** the cleanup runs and marks entries as expired, **When** the guest's cancellation link is clicked, **Then** they see a message that the entry is no longer active (no notification is sent)

---

### Edge Cases

- When a cancellation frees a slot with insufficient capacity for the first waitlisted guest's party size, the system skips that guest and notifies the next eligible guest whose party size can be accommodated. Skipped guests remain active in the queue for future cancellations that may free a larger slot.
- When two cancellations occur near-simultaneously for the same slot, the system notifies one guest per freed slot at the same time (e.g., two cancellations → notify queue positions #1 and #2 simultaneously, each with their own 30-minute claim window). The availability re-check at claim completion is the final guard against double-booking.
- What if a restaurant's schedule is changed to mark a previously bookable date as closed, after waitlist entries have already been created for that date?
- What if the restaurant account is cancelled or suspended — should active waitlist entries receive a cancellation notice?
- What happens to the queue if the guest being notified has since joined a different waitlist entry for the same slot under a different email?

---

## Requirements *(mandatory)*

### Functional Requirements

**Customer-Facing (Booking App)**

- **FR-001**: System MUST display a "Join Waitlist" option for any time slot that is fully booked, replacing or supplementing the "Unavailable" label
- **FR-002**: System MUST allow customers to join a waitlist by providing: full name, email address, phone number, and party size
- **FR-003**: System MUST validate that the party size could be accommodated if a slot opened (i.e., a suitable table configuration exists for the party size)
- **FR-004**: System MUST prevent duplicate waitlist entries for the same email address on the same date and time slot at the same restaurant
- **FR-005**: System MUST send a confirmation email immediately upon successful waitlist entry, including: queue position, date, time slot, restaurant name, and a secure cancellation link
- **FR-006**: System MUST send a notification email to the first eligible person in queue within 5 minutes of a qualifying cancellation occurring. Eligibility requires that the freed slot capacity can accommodate the guest's party size; ineligible guests are skipped and the system tries the next entry in queue until an eligible guest is found or the queue is exhausted. If multiple slots are freed simultaneously (multiple cancellations at once), the system notifies one eligible guest per freed slot concurrently
- **FR-007**: The notification email MUST include a time-limited claim link valid for exactly 30 minutes from when the notification is sent
- **FR-008**: If the claim link is not used within 30 minutes, the system MUST automatically mark that entry as expired and notify the next eligible person in queue
- **FR-023**: If a slot-available notification email fails to deliver, the system MUST retry delivery up to 3 times with exponential backoff before advancing to the next eligible guest in queue. Failed entries MUST be marked with status notified-failed. The 5-minute notification target (SC-002) applies to the first attempt; retry duration does not reset the slot hold
- **FR-009**: The claim link MUST direct the customer to the standard booking completion flow with their name, email, phone, and party size pre-filled
- **FR-010**: System MUST allow customers to cancel their own waitlist entry via the secure cancellation link in their confirmation email at any time while the entry is active
- **FR-011**: System MUST detect if a slot becomes available while a customer is filling in the waitlist form and offer the option to proceed directly to a standard booking
- **FR-024**: When displaying the "Join Waitlist" option for a fully booked slot, the system MUST show the current queue depth to the customer (e.g., "4 people ahead of you") so they can make an informed decision before joining
- **FR-025**: When a slot is fully booked, the system MUST display smart alternative suggestions alongside the "Join Waitlist" option, including: (a) the nearest available timeslot on the same date for the same party size, and (b) the nearest future date on which the same timeslot has availability for the same party size. Suggestions must only show genuinely bookable slots

**Staff-Facing (Admin Dashboard)**

- **FR-012**: Staff MUST be able to view all waitlist entries for their restaurant, filterable by date and time slot
- **FR-013**: Each waitlist entry display MUST show: queue position, customer name, email, phone, party size, entry creation time, and current status
- **FR-014**: Staff MUST be able to manually trigger a notification to any active waitlist entry when a slot is available
- **FR-015**: Staff MUST be able to remove any waitlist entry from the queue
- **FR-016**: Any authenticated staff member MUST be able to reorder waitlist entries to change the notification priority within the same slot's queue. No role-based restrictions apply — the system has a single staff role.
- **FR-017**: Staff MUST be able to add a walk-in guest directly to the waitlist with: name, phone number, party size, and desired time slot
- **FR-018**: Staff MUST be able to convert an active waitlist entry into a confirmed reservation directly from the admin dashboard, bypassing the customer claim flow
- **FR-019**: The admin dashboard's reservations view for a given date MUST display a waitlist count indicator when active entries exist

**Automation**

- **FR-020**: System MUST automatically expire all waitlist entries for dates and time slots that have already passed
- **FR-021**: System MUST automatically trigger the waitlist notification chain when a reservation in status "new", "confirmed", or "arriving-soon" is cancelled
- **FR-022**: System MUST NOT trigger waitlist notifications for status transitions that do not free up a bookable slot (e.g., marking as "no-show", "seated", "completed")

### Key Entities

- **Waitlist Entry**: A customer's request to be notified when a specific restaurant time slot becomes available. Key attributes: restaurant, date, timeslot start/end, party size, customer name, customer email, customer phone, queue position, status (active / notified / notified-failed / claimed / expired / cancelled), created timestamp, notified timestamp, notification attempt count, claim window expiry timestamp.

- **Claim Window**: A time-limited hold placed on an open slot for the notified waitlist guest. When active, the slot is treated as spoken for and the queue does not advance. Duration: 30 minutes. Represented as an expiry timestamp on the notified waitlist entry.

- **Queue Position**: The ordinal rank of a waitlist entry within the group sharing the same restaurant, date, and time slot. Determines the order of notification. Default ordering: first-in, first-out by creation time. Staff can override order at any time.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Customers can complete joining a waitlist in under 60 seconds from clicking "Join Waitlist" to receiving the confirmation email
- **SC-002**: Waitlisted customers receive a slot-available notification within 5 minutes of a qualifying cancellation occurring
- **SC-003**: Staff can view and manage the full waitlist for a given date in under 30 seconds from within the admin dashboard
- **SC-004**: At least 25% of waitlist slot-available notifications result in a completed booking within the 30-minute claim window
- **SC-005**: Zero double-bookings occur as a direct result of the waitlist claim-to-reservation conversion flow
- **SC-006**: 100% of claim windows that expire without a claim automatically advance the queue to the next eligible entry
- **SC-007**: All waitlist entries for past dates are expired and inactive within 24 hours of the reservation time passing
- **SC-008**: Within 60 days of launch, restaurants report recovering at least 1 in 4 cancelled slots via the waitlist feature

---

## Scope

### In Scope

- Online pre-booking waitlist: customers join via the customer-facing booking app for a specific date and time slot
- Queue depth indicator shown to customers before joining ("X people ahead of you")
- Smart alternative slot suggestions when a slot is fully booked (nearest available timeslot same date; nearest date with same timeslot available)
- Email-only notifications (consistent with existing infrastructure)
- Confirmation email on waitlist join, including queue position and cancellation link
- Notification email with time-limited claim link when a slot opens
- Automatic queue advancement when a claim window expires
- Customer self-service cancellation of a waitlist entry via secure email link
- Staff management interface: view, filter, reorder, remove, notify, add walk-in, and convert entries
- Automatic triggering of the notification chain on qualifying reservation cancellations
- Automatic expiry of past-date waitlist entries via scheduled job

### Out of Scope

- SMS or WhatsApp notifications (deferred to future notification system expansion)
- Cross-date or cross-timeslot waitlisting ("notify me for any opening on a given date")
- Physical walk-in queue display screens or QR kiosk interfaces
- Deposits required at waitlist join time (deposit collected only when claiming the slot)
- Dedicated waitlist analytics dashboard (entry counts visible inline; full analytics deferred)
- Third-party waitlist integrations (Google, Yelp)
- PRESET scheduling mode compatibility (initial release targets SMART mode; PRESET evaluated post-launch)

---

## Assumptions

1. **Notification channel**: Email is the only notification channel in scope, matching the existing system. WhatsApp and SMS are explicitly future work.
2. **Slot specificity**: Customers join a waitlist for a specific date + time slot combination, not "any slot on a date".
3. **Authentication**: Customers do not log in to join or manage a waitlist entry. All self-service access uses MAC-secured links in emails, consistent with the existing stateless authentication pattern for reservations.
4. **Deposit timing**: No deposit is required to join the waitlist. A deposit (if configured by the restaurant) is collected only when the customer claims the slot and completes the booking.
5. **Claim flow**: Claiming a slot uses the standard booking completion flow, not an instant auto-confirmation. This ensures deposit collection functions correctly and availability is re-validated at claim time.
6. **Party size validation**: The system uses existing availability logic to determine whether a waitlisted party size can be accommodated, ensuring impossible bookings are never offered.
7. **FIFO default**: Queue order defaults to first-come-first-served by creation time. Staff can override order manually at any time.
8. **Claim window duration**: 30 minutes is the standard claim window, aligned with industry norms (TableCheck and Resy use 15–30 minutes). It is not per-restaurant configurable in this initial release.
9. **SMART mode only for initial release**: Waitlist availability checking leverages the SMART table allocation algorithm. PRESET mode compatibility will be assessed post-launch.

---

## Dependencies

- Existing reservation cancellation flow (triggers the waitlist notification chain)
- Existing email notification system (Resend + React Email templates)
- Existing MAC-based secure link generation (for claim and cancellation links)
- Existing availability validation logic (for party size compatibility check and slot re-validation at claim time)
- Existing admin dashboard reservations section (waitlist panel is added here)
- Scheduled job / cron infrastructure (for claim window expiry processing and date-based entry expiry)
