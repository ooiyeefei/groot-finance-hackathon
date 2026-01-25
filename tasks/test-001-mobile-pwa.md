# E2E Testing: Mobile PWA Features (Issue #84)

**PR #126 deployed to production**
**Test URL**: https://finanseal.vercel.app

---

## Pre-Test Setup

### Device Requirements
- [ ] **Primary**: Real mobile device (iPhone or Android)
- [ ] **Secondary**: Chrome DevTools mobile emulation (iPhone SE 320px, iPhone 12 390px)

### Browser Requirements
- [ ] Chrome (desktop + mobile) - full PWA support
- [ ] Safari iOS - limited PWA (no install prompt, no haptics)
- [ ] Firefox Android - partial support

### Test Account
- [ ] Login as a **manager** or **admin** user (for approval testing)
- [ ] Ensure there are pending expense claims to approve (or create one)

---

## Test 1: PWA Installation

### 1.1 Install Prompt (Chrome Android)
1. Open https://finanseal.vercel.app on Chrome Android
2. Navigate to `/en/expense-claims`
3. **Expected**: Install banner appears at bottom after ~3 seconds
4. Tap "Install"
5. **Expected**: App installs to home screen
6. Open from home screen
7. **Expected**: Opens in standalone mode (no browser chrome)

### 1.2 Add to Home Screen (Safari iOS)
1. Open https://finanseal.vercel.app in Safari
2. Tap Share button → "Add to Home Screen"
3. **Expected**: App icon appears on home screen
4. Open from home screen
5. **Expected**: Opens in standalone mode

### 1.3 Desktop Install (Chrome)
1. Open site in Chrome desktop
2. Look for install icon in address bar (right side)
3. Click to install
4. **Expected**: Opens as desktop app

**Pass Criteria**: App can be installed and opens in standalone mode

---

## Test 2: Bottom Navigation

### 2.1 Navigation Visibility
1. Open `/en/expense-claims` on mobile viewport (<640px)
2. **Expected**: Bottom navigation bar visible with 4 items:
   - Home
   - Expenses (with badge if pending approvals)
   - Analytics
   - Settings

### 2.2 Navigation Badge
1. Ensure there are pending expense claims (status: `submitted`)
2. View bottom nav
3. **Expected**: Red badge with count on "Expenses" icon
4. Approve all pending claims
5. **Expected**: Badge disappears

### 2.3 Navigation Tap
1. Tap each nav item
2. **Expected**:
   - Navigates to correct page
   - Active item highlighted (primary color)
   - Light haptic feedback (Android only)

### 2.4 Desktop Behavior
1. Resize to >640px width
2. **Expected**: Bottom nav hidden, sidebar visible

**Pass Criteria**: Navigation works, badge updates in real-time

---

## Test 3: Mobile Approval Cards

### 3.1 Card Layout (Mobile)
1. Login as manager/admin
2. Go to `/en/expense-claims` → "Approvals" tab
3. Ensure mobile viewport (<640px)
4. **Expected**: Compact single-column cards showing:
   - Employee name + avatar
   - Amount (right side)
   - Description + category badge
   - Vendor + date

### 3.2 Card Expand (Tap)
1. Tap on any approval card
2. **Expected**: Card expands showing 3 buttons:
   - "View Details" (left)
   - "Approve" (green, center)
   - "Reject" (red, right)
3. Tap card again
4. **Expected**: Card collapses

### 3.3 Swipe Gestures
1. Swipe a card **RIGHT** (toward approve)
2. **Expected**:
   - Green indicator appears on left
   - Card follows finger
   - After threshold: jumps to "slide to confirm" mode

3. Swipe a card **LEFT** (toward reject)
4. **Expected**:
   - Red indicator appears on right
   - After threshold: jumps to "slide to confirm" mode

### 3.4 Slide to Confirm
1. Trigger approve mode (swipe right or tap Approve)
2. **Expected**: Slider appears with green track
3. Drag slider thumb to the right
4. **Expected**:
   - At ~95%: action triggers
   - Haptic feedback (Android)
   - Card removed from list
   - Success state

5. Tap "Cancel" during confirmation
6. **Expected**: Returns to normal card state

### 3.5 Desktop Fallback
1. Resize to >640px
2. **Expected**: Standard 2-column grid cards (no swipe)

**Pass Criteria**: 2-tap flow works, swipe gestures work on touch devices

---

## Test 4: Haptic Feedback (Android Only)

### 4.1 Navigation Haptics
1. On Android device with Chrome
2. Tap bottom nav items
3. **Expected**: Light vibration on each tap

### 4.2 Approval Haptics
1. Complete an approval via slide-to-confirm
2. **Expected**: Success vibration pattern (single pulse)

3. Complete a rejection via slide-to-confirm
4. **Expected**: Error vibration pattern (triple pulse)

### 4.3 iOS Behavior
1. Test same actions on iOS
2. **Expected**: No vibration (Vibration API not supported)
3. **Expected**: No errors in console

**Pass Criteria**: Haptics work on Android, silent fail on iOS

---

## Test 5: Offline Indicators

### 5.1 Offline Detection
1. Open app on mobile
2. Turn on Airplane Mode
3. **Expected**: Offline indicator appears (top banner or toast)
4. Turn off Airplane Mode
5. **Expected**: Indicator disappears, data refreshes

### 5.2 Stale Data Warning
1. Load expense claims page
2. Go offline
3. Navigate around the app
4. **Expected**: Stale data warning may appear on data-heavy pages

**Pass Criteria**: Offline state clearly indicated to user

---

## Test 6: Camera Capture & Compression

### 6.1 Camera Access
1. Go to create new expense claim
2. Tap camera capture option
3. **Expected**: Camera permission prompt (first time)
4. Grant permission
5. **Expected**: Camera viewfinder appears

### 6.2 Photo Capture
1. Point at a receipt
2. Tap capture button
3. **Expected**: Photo captured, preview shown

### 6.3 Image Compression
1. After capturing, observe UI
2. **Expected**: "Compressing image..." progress bar (if large image)
3. Progress completes
4. **Expected**: Compressed image ready for upload

### 6.4 Retake Flow
1. On preview screen, tap "Retake"
2. **Expected**: Returns to camera viewfinder
3. Capture new photo
4. Tap "Use Photo"
5. **Expected**: Proceeds to form with image attached

**Pass Criteria**: Camera works, large images compressed before upload

---

## Test 7: Responsive Breakpoints

### 7.1 iPhone SE (320px)
1. Use DevTools → iPhone SE viewport
2. Navigate through all pages
3. **Expected**:
   - No horizontal scroll
   - Touch targets ≥44px
   - Text readable
   - Bottom nav visible

### 7.2 iPhone 12 (390px)
1. Switch to iPhone 12 viewport
2. **Expected**: Same as above, slightly more breathing room

### 7.3 Tablet (768px)
1. Switch to iPad viewport
2. **Expected**:
   - Sidebar visible
   - Bottom nav hidden
   - 2-column layouts where applicable

### 7.4 Desktop (1024px+)
1. Full desktop viewport
2. **Expected**: Full desktop experience, no mobile components

**Pass Criteria**: App usable at all breakpoints, no layout breaks

---

## Test 8: Service Worker & Caching

### 8.1 Service Worker Registration
1. Open DevTools → Application → Service Workers
2. **Expected**: Service worker registered for the domain
3. Status: "activated and running"

### 8.2 Cache Storage
1. DevTools → Application → Cache Storage
2. **Expected**: Caches created for:
   - Static assets (JS, CSS, images)
   - API responses (if implemented)

### 8.3 Offline Page Load
1. Load expense claims page fully
2. Go offline (DevTools → Network → Offline)
3. Refresh page
4. **Expected**: Page loads from cache (may show stale data warning)

**Pass Criteria**: Service worker active, basic offline support works

---

## Quick Smoke Test (5 minutes)

If short on time, run this abbreviated test:

1. [ ] Open on mobile → bottom nav visible with badge
2. [ ] Tap Expenses → navigates correctly
3. [ ] Go to Approvals tab → mobile cards visible
4. [ ] Tap card → expands with buttons
5. [ ] Swipe right → shows slide-to-confirm
6. [ ] Complete approval → card removed, haptic (Android)
7. [ ] Create expense → camera works
8. [ ] Resize to desktop → layout switches to sidebar

---

## Known Limitations

| Feature | Limitation |
|---------|------------|
| Haptics | Not supported on iOS Safari |
| Install Prompt | Not shown on iOS (use manual Add to Home Screen) |
| Background Sync | Not implemented in this phase |
| Push Notifications | Not implemented in this phase |

---

## Bug Report Template

If you find issues, report with:

```
**Device**: iPhone 13 / Samsung S21 / etc.
**Browser**: Chrome 120 / Safari 17 / etc.
**Viewport**: 390x844 / 320x568 / etc.
**Steps to reproduce**:
1.
2.
3.

**Expected**:
**Actual**:
**Screenshot/Video**: (attach)
```

---

## Sign-Off

| Tester | Date | Device | Result |
|--------|------|--------|--------|
| | | | |
| | | | |
