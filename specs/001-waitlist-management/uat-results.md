# UAT Results: Waitlist Management

**Date**: 2026-02-22  
**Branch**: `001-waitlist-management`  
**Tester**: Claude (automated via Playwright)  
**Environments**: groot-admin @ localhost:3000 · groot-reservation @ localhost:3003  
**Test Account**: `dukeeduck33@gmail.com` (The Hawker)

---

## Summary

| Priority | Total | PASS | FAIL | BLOCKED |
|----------|-------|------|------|---------|
| P1 Critical | 3 | 3 | 0 | 0 |
| P2 High | 6 | 6 | 0 | 0 |
| P3 Medium | 1 | 1 | 0 | 0 |
| **Total** | **10** | **10** | **0** | **0** |

**Overall Verdict: ✅ PASS**

All Critical (P1) and High (P2) test cases pass. No blocking issues remain.

---

## Per-Test Results

| ID | Test Case | Result | Notes |
|----|-----------|--------|-------|
| TC-001 | Fully booked slot shows "Full — Join Waitlist" button | ✅ PASS | Amber button with correct label rendered |
| TC-002 | Guest joins waitlist, DB entry created | ✅ PASS | queue_position=1, status='active', confirmation email triggered |
| TC-003 | Duplicate entry rejected | ✅ PASS | Error: "You are already on the waitlist for this time slot." |
| TC-004 | Queue depth "1 ahead" shown in modal header | ✅ PASS | · 1 ahead shown after fix |
| TC-005 | Guest cancels via MAC-secured link | ✅ PASS | "✓ You have been removed from the waitlist." |
| TC-006 | Admin dashboard shows Waitlist tab | ✅ PASS | Three tabs visible: Active, Past, Waitlist |
| TC-007 | Admin waitlist panel loads | ✅ PASS | Shows empty state with "Add Walk-In Guest" button |
| TC-008 | Admin adds walk-in guest | ✅ PASS | Entry appears in panel with notify/convert/remove actions |
| TC-009 | Invalid MAC shows error page | ✅ PASS | "Invalid Link" with 🔒 icon shown |
| TC-010 | Expired/cancelled entry shows inactive message | ✅ PASS | "No Longer Active (status: cancelled)" shown |

---

## Bugs Found and Fixed During Testing

### Bug 1 — 12h/24h Time Format Mismatch (Critical — Fixed)
**Location**: `groot-reservation/src/components/restaurant/waitlist-join-modal.tsx`  
**Root Cause**: `generateTimeSlots()` returns slot times in 12h format ("12:00 PM") but `joinWaitlist` Zod schema expects 24h ("12:00"). Caused Zod regex failure returning "Invalid".  
**Fix**: Added `to24Hour()` converter in `WaitlistJoinModal` before calling `joinWaitlist`.

### Bug 2 — Queue Depth DB Query Format Mismatch (P2 — Fixed)
**Location**: `groot-reservation/src/components/restaurant/date-picker.tsx`  
**Root Cause**: Same 12h/24h mismatch in `getWaitlistQueueDepth` and `getAlternativeSlots` calls — querying DB with "12:00 PM" but `timeslot_start` column stores "12:00".  
**Fix**: Added `to24HourSlot()` converter in DatePicker before all DB API calls.

### Bug 3 — `$executeRaw` Repack Failure (P1 — Fixed)
**Location**: `groot-reservation/src/lib/actions/waitlist.ts` `cancelWaitlistEntry()`  
**Root Cause**: `prisma.$executeRaw` tagged template literal failed with `Date` object for `@db.Date` typed field.  
**Fix**: Replaced with `prisma.waitlist_entries.updateMany({ data: { queue_position: { decrement: 1 } } })`.

### Bug 4 — Walk-In Email Validation Rejects Empty String (P2 — Fixed)
**Location**: `groot-admin/app/api/waitlist/route.ts` `WalkInSchema`  
**Root Cause**: `z.string().email().optional().default('')` rejects empty string (valid email required).  
**Fix**: Changed to `z.union([z.string().email(), z.literal('')]).optional().default('')`.

---

## Screenshots

| Test | Screenshot |
|------|-----------|
| TC-001 | uat-tc001-waitlist-button.png |
| TC-002 (form filled) | uat-tc002-modal-filled.png |
| TC-002 (success) | uat-tc002-join-success.png |
| TC-003 | uat-tc003-duplicate-rejected.png |
| TC-004 | uat-tc004-queue-depth.png |
| TC-005 (cancel page) | uat-tc005-cancel-page.png |
| TC-005 (success) | uat-tc005-cancel-success.png |
| TC-006 | uat-tc006-admin-tabs.png |
| TC-007 | uat-tc007-admin-waitlist-panel.png |
| TC-008 | uat-tc008-walkin-added.png |
| TC-009 | uat-tc009-invalid-mac.png |
| TC-010 | uat-tc010-expired-state.png |

---

## Build Status

| Repo | Build | Notes |
|------|-------|-------|
| groot-admin | ✅ PASS | All TypeScript errors resolved |
| groot-reservation | ✅ PASS | All TypeScript errors resolved |

---

## Remaining Known Items (Non-Blocking)

1. **Hydration warnings on groot-admin** — Dev mode only; pre-existing Clerk/Sentry hydration warnings. Not caused by waitlist feature, not visible in production.
2. **TC-009 original test**: Non-existent `cancellation_code` returns 404 (correct `notFound()` behavior). Updated test to use valid code + bad MAC to confirm "Invalid Link" page.
3. **Queue depth badge on slot button** (not modal) — Badge shows in modal header ("1 ahead") but not on the time slot button itself before clicking. Queue depth is fetch-on-click. Low priority cosmetic improvement.
4. **`to24Hour` duplication** — The same converter is in both `WaitlistJoinModal` and `DatePicker`. Could be extracted to a shared utility. Deferred.

---

## Data Cleanup

Test reservation (confirmation_code: `testuat01`) and waitlist entries were created in Supabase during UAT. Safe to clean up after review.
