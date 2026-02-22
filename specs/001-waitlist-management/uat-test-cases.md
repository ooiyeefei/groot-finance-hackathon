# UAT Test Cases: Waitlist Management

**Feature Branch**: `001-waitlist-management`  
**Created**: 2026-02-22  
**Environments**:
- Customer App: http://localhost:3003  
- Admin App: http://localhost:3000  
**Test Restaurant**: Atas Hawker (`/atas-hawker`)  
**Booked Slot**: Monday 2026-02-23, 12:00–13:00 (party of 2, 1 table = fully booked)  
**Test Credentials**: `dukeeduck33@gmail.com` / `ZlMq$Pk%A%7!E`

---

## TC-001 — Fully Booked Slot Shows "Full — Join Waitlist" Button (P1 Critical)

**Goal**: Verify the time slot button shows the waitlist state instead of "Fully Booked" when the slot is full

**Steps**:
1. Navigate to http://localhost:3003/atas-hawker
2. Select date 2026-02-23 (Monday)
3. Set party size to 2
4. Observe the 12:00 time slot

**Expected**: Slot button shows "Full — Join Waitlist" text in amber styling (not gray "Fully Booked")

**Screenshot**: `uat-tc001-waitlist-button.png`

---

## TC-002 — Guest Joins Waitlist Successfully (P1 Critical)

**Goal**: A customer can join the waitlist, entry is stored in DB, and confirmation email is triggered

**Steps**:
1. Navigate to http://localhost:3003/atas-hawker
2. Select 2026-02-23, party of 2
3. Click "Full — Join Waitlist" on the 12:00 slot
4. Verify WaitlistJoinModal appears
5. Fill in: Name = "UAT Waitlister", Email = "uat-waitlist-join@test.com", Phone = "+60129999001"
6. Click "Join Waitlist"

**Expected**: 
- Success state shows "You're #1 on the waitlist!"
- DB: `waitlist_entries` has a row with `status='active'`, `queue_position=1`, `customer_email='uat-waitlist-join@test.com'`

**Screenshot**: `uat-tc002-join-success.png`

---

## TC-003 — Duplicate Waitlist Entry Is Rejected (P2 High)

**Goal**: Submitting the same email for the same slot returns "Already on waitlist" error

**Steps**:
1. Repeat TC-002 using the same email `uat-waitlist-join@test.com` for the same slot
2. Click "Join Waitlist" again

**Expected**: Form shows error "You are already on the waitlist for this time slot."

**Screenshot**: `uat-tc003-duplicate-rejected.png`

---

## TC-004 — Queue Depth Badge Shows on Fully Booked Slot (P2 High)

**Goal**: After TC-002, a second visitor sees "(1 waiting)" queue depth badge

**Steps**:
1. Navigate fresh to http://localhost:3003/atas-hawker
2. Select 2026-02-23, party of 2
3. Observe the 12:00 slot button

**Expected**: Shows "Full — Join Waitlist" with "(1 waiting)" badge in amber

**Screenshot**: `uat-tc004-queue-depth.png`

---

## TC-005 — Guest Cancels Waitlist Entry via Link (P1 Critical)

**Goal**: Guest can cancel their waitlist entry using the MAC-secured link

**Steps**:
1. Query DB: `SELECT cancellation_code, customer_email FROM waitlist_entries WHERE customer_email = 'uat-waitlist-join@test.com' LIMIT 1;`
2. Generate the cancellation link: `http://localhost:3003/waitlist/{cancellation_code}/{mac}`
3. Compute MAC using HMAC-SHA256 of `{code}:{email}` with key `wyoBBPznVhr2PjyXxh0Vp9Fgz5b6GrHEqn8pXMtTIvc=`
4. Navigate to the cancel page
5. Click "Cancel My Waitlist Spot"

**Expected**:
- Page shows entry details (date, time, party size, queue position)
- After click: shows "You've been removed from the waitlist"
- DB: entry `status='cancelled'`

**Screenshot**: `uat-tc005-cancel-page.png`, `uat-tc005-cancel-success.png`

---

## TC-006 — Admin Dashboard Shows Waitlist Tab (P2 High)

**Goal**: Staff can see the Waitlist tab in the reservations dashboard

**Steps**:
1. Navigate to http://localhost:3000/sign-in
2. Log in with `dukeeduck33@gmail.com` / `ZlMq$Pk%A%7!E`
3. Navigate to Dashboard → Reservations
4. Look for "Waitlist" tab in the tabs bar

**Expected**: Three tabs visible: "Active Reservations", "Past Reservations", "Waitlist"

**Screenshot**: `uat-tc006-admin-tabs.png`

---

## TC-007 — Admin Waitlist Panel Shows Entries (P2 High)

**Goal**: Staff can view active waitlist entries for today's date

**Steps**:
1. Log into admin app
2. Navigate to Reservations → Waitlist tab
3. Observe waitlist panel content for today's date (2026-02-22) or 2026-02-23

**Expected**: Panel loads waitlist entries for the date (may show empty state with "Add Walk-In Guest" button if no entries)

**Screenshot**: `uat-tc007-admin-waitlist-panel.png`

---

## TC-008 — Admin Can Add Walk-In Guest to Waitlist (P2 High)

**Goal**: Staff can manually add a walk-in guest to the waitlist

**Steps**:
1. In admin Waitlist tab, click "Add Walk-In Guest"
2. Fill in: Name = "Walk-In UAT", Phone = "+60128888002", Party Size = 2, Time = 12:00, End = 13:00
3. Submit

**Expected**: New entry appears in waitlist list

**Screenshot**: `uat-tc008-walkin-added.png`

---

## TC-009 — Invalid MAC on Cancellation Link Shows Error (P2 High)

**Goal**: Tampered cancel link is rejected gracefully

**Steps**:
1. Navigate to http://localhost:3003/waitlist/invalidcode/badmac123

**Expected**: Page shows "Invalid Link" with lock icon (not a 500 error)

**Screenshot**: `uat-tc009-invalid-mac.png`

---

## TC-010 — Expired Claim Window Shows Error (P3 Medium)

**Goal**: A claim link for a non-notified/expired entry shows the correct message

**Steps**:
1. Insert a waitlist entry with `status='expired'` directly in DB
2. Generate its cancellation link
3. Navigate to http://localhost:3003/waitlist/{code}/{mac}

**Expected**: Shows "No Longer Active" message (not a 500)

**Screenshot**: `uat-tc010-expired-state.png`

---

## Summary

| ID | Test Case | Priority |
|----|-----------|----------|
| TC-001 | Waitlist button on fully booked slot | P1 Critical |
| TC-002 | Guest joins waitlist | P1 Critical |
| TC-003 | Duplicate rejected | P2 High |
| TC-004 | Queue depth badge | P2 High |
| TC-005 | Cancel via link | P1 Critical |
| TC-006 | Admin waitlist tab | P2 High |
| TC-007 | Admin panel loads | P2 High |
| TC-008 | Admin add walk-in | P2 High |
| TC-009 | Invalid MAC error | P2 High |
| TC-010 | Expired entry state | P3 Medium |
