# Feature Specification: Mobile-First Testing & PWA Enhancements

**Feature Branch**: `001-mobile-pwa`
**Created**: 2026-01-07
**Status**: Draft
**Input**: GitHub Issue #84 - Mobile-First Testing & PWA Enhancements for SEA market
**GitHub Reference**: grootdev-ai/finanseal-mvp#84

## Clarifications

### Session 2026-01-07

- Q: How long should cached dashboard data remain valid before showing a "stale data" warning? → A: 7 days maximum retention with "stale" warning after 24 hours
- Q: How should the system handle offline sync conflicts? → A: Server wins - discard conflicting offline action, notify user with explanation
- Q: What should be the maximum file size for receipt images after compression? → A: 2MB maximum - balanced quality for OCR readability and upload speed on SEA networks
- Q: Is this a native mobile app? → A: **No.** This is a mobile-friendly web application with PWA enhancements. No native iOS/Android apps planned. "Add to Home Screen" is a web browser feature, not app store distribution.

## Context

FinanSEAL targets Southeast Asian (SEA) SMEs where 70%+ of users are mobile-first. The current application has a `mobile-camera-capture.tsx` component but lacks systematic mobile testing, PWA features, and mobile-optimized UX patterns. This feature addresses the critical need for real-device testing and progressive web app capabilities before market launch.

**Important**: FinanSEAL is a **mobile-friendly web application**, not a native mobile app. There are no plans to release iOS or Android apps via app stores. All mobile functionality is delivered through the browser with PWA enhancements for offline access and home screen installation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mobile Receipt Capture (Priority: P1)

A field employee needs to photograph and submit expense receipts while on-site at a vendor location using their smartphone. They should be able to launch the camera directly from the app, capture the receipt, and submit it without switching between apps.

**Why this priority**: Receipt capture is the primary mobile use case for FinanSEAL. Poor camera experience on real devices directly impacts user adoption and the core value proposition.

**Independent Test**: Can be fully tested by submitting a receipt photo on a real mobile device and verifying it processes correctly through the expense workflow.

**Acceptance Scenarios**:

1. **Given** a user is on the expense submission screen on a mobile device, **When** they tap the camera button, **Then** the native camera interface opens within 2 seconds
2. **Given** a user has captured a receipt photo, **When** they confirm the capture, **Then** the image is uploaded and processing begins with visual feedback
3. **Given** a user is in a low-light environment, **When** they attempt to capture a receipt, **Then** the camera provides flash/light assistance options
4. **Given** the user's camera permission was previously denied, **When** they try to capture a receipt, **Then** they see clear instructions on how to enable camera access

---

### User Story 2 - Offline App Access (Priority: P1)

A business owner traveling in areas with poor internet connectivity needs to access their dashboard and view recent financial data. They should be able to open the app and see cached data even without internet connection.

**Why this priority**: SEA markets have variable connectivity. Users lose trust in apps that show blank screens when offline.

**Independent Test**: Can be tested by loading the app with connectivity, enabling airplane mode, and verifying cached data displays correctly.

**Acceptance Scenarios**:

1. **Given** a user has previously loaded the dashboard, **When** they open the app without internet, **Then** they see their cached dashboard with a "Last updated" timestamp
2. **Given** a user is offline, **When** they attempt to perform a write action (submit expense), **Then** they see a clear offline indicator and the action is queued for sync
3. **Given** a user regains connectivity, **When** the app detects internet, **Then** queued actions sync automatically with success/failure feedback

---

### User Story 3 - Add to Home Screen (PWA) (Priority: P2)

A frequent user wants quick access to FinanSEAL from their phone's home screen without opening a browser. They should be able to add the web app to their home screen for app-like access.

**Clarification**: This is NOT a native mobile app (iOS/Android). FinanSEAL is a mobile-friendly web application. PWA (Progressive Web App) features allow users to "install" the web app to their home screen, where it opens in standalone mode (without browser chrome) and supports offline access. No app store distribution is involved.

**Why this priority**: PWA home screen installation improves engagement and retention. Users with installed PWAs return 2-3x more frequently.

**Independent Test**: Can be tested by triggering the "Add to Home Screen" prompt on a mobile browser and verifying the web app installs to the home screen with correct icon and name.

**Acceptance Scenarios**:

1. **Given** a user visits FinanSEAL in a mobile browser, **When** they use the app for the second time, **Then** they see an "Add to Home Screen" prompt
2. **Given** a user has installed the PWA, **When** they launch from home screen, **Then** the app opens in standalone mode without browser UI
3. **Given** a user has the PWA installed, **When** they receive important updates, **Then** they can optionally receive push notifications (future enhancement)

---

### User Story 4 - Expense Approval on Mobile (Priority: P2)

A manager needs to review and approve expense claims while commuting or away from their desk. They should be able to efficiently review expense details and approve/reject with minimal taps.

**Why this priority**: Approval workflows are often blocked by managers who can't access desktop. Mobile approval accelerates reimbursement cycles.

**Independent Test**: Can be tested by logging in as a manager on a mobile device and completing an approval workflow end-to-end.

**Acceptance Scenarios**:

1. **Given** a manager opens the app on mobile, **When** pending approvals exist, **Then** they see a prominent notification badge and quick access to approval queue
2. **Given** a manager is reviewing an expense, **When** they want to approve/reject, **Then** they can complete the action with a single swipe gesture or two taps maximum
3. **Given** a manager approves an expense, **When** the action completes, **Then** haptic feedback confirms the action

---

### User Story 5 - Mobile Dashboard Experience (Priority: P2)

A business owner checks their financial overview during brief moments throughout the day. The dashboard should present key metrics in a mobile-optimized layout that's scannable in under 10 seconds.

**Why this priority**: Dashboard is the landing page. Poor mobile layout creates immediate negative impression.

**Independent Test**: Can be tested by loading the dashboard on a small screen (iPhone SE) and verifying all key metrics are visible without horizontal scrolling.

**Acceptance Scenarios**:

1. **Given** a user opens the dashboard on a small screen, **When** the page loads, **Then** key financial metrics are visible without horizontal scrolling
2. **Given** a user is viewing charts on mobile, **When** they tap a data point, **Then** they see detailed information in a touch-friendly tooltip
3. **Given** a user wants to navigate to different sections, **When** they look for navigation, **Then** they find a bottom navigation bar with clear icons

---

### Edge Cases

- What happens when the camera fails to initialize on certain Android devices?
- How does the system handle large image files (>10MB) captured on high-end phones?
- What happens when a user attempts to install the PWA on an unsupported browser?
- When switching between online and offline states mid-action, the system completes in-progress requests if possible, otherwise queues for retry
- What happens when the device storage is full and caching fails?
- When offline sync encounters a conflict (e.g., deleted category, already-processed expense), server state wins and user receives a notification explaining the conflict

## Requirements *(mandatory)*

### Functional Requirements

**Mobile Testing Infrastructure**
- **FR-001**: System MUST be testable on real iOS devices (minimum: iPhone SE, iPhone 14)
- **FR-002**: System MUST be testable on real Android devices (minimum: Samsung Galaxy A14, mid-range Android)
- **FR-003**: System MUST pass all critical user flows on real devices without layout breaks or functional failures

**PWA Core Features**
- **FR-004**: System MUST be installable as a PWA on iOS Safari and Android Chrome
- **FR-005**: System MUST cache critical assets for offline access (app shell, fonts, icons)
- **FR-006**: System MUST provide a web app manifest with proper app name, icons, and theme colors
- **FR-007**: System MUST display cached data when offline with clear offline status indicator

**Mobile UX**
- **FR-008**: All forms MUST be usable on screens as small as 320px width without horizontal scrolling
- **FR-009**: All modals MUST be properly sized and dismissible on mobile devices
- **FR-010**: Touch targets MUST be minimum 44x44 pixels for accessibility compliance
- **FR-011**: System MUST provide visual feedback for all user actions within 100ms

**Camera Capture**
- **FR-012**: Camera capture MUST work on both iOS and Android native browsers
- **FR-013**: System MUST handle camera permission denial gracefully with recovery instructions
- **FR-014**: System MUST compress captured images to maximum 2MB before upload, preserving text readability for OCR processing

**Offline Capabilities**
- **FR-015**: System MUST queue write actions when offline and sync when connectivity returns
- **FR-016**: System MUST show "last synced" timestamp for cached data
- **FR-017**: System MUST notify users of sync success/failure when reconnecting
- **FR-018**: System MUST retain cached data for maximum 7 days, displaying "stale data" warning after 24 hours without refresh
- **FR-019**: System MUST use server-wins conflict resolution for offline sync - discard conflicting offline actions and notify user with clear explanation of what failed and why

### Key Entities *(include if feature involves data)*

- **Service Worker**: Background script managing asset caching, offline handling, and background sync
- **Web App Manifest**: Configuration defining PWA properties (name, icons, display mode, theme)
- **Offline Queue**: Pending user actions stored locally for sync when connectivity returns
- **Cache Storage**: Browser cache containing app shell, static assets, and API response data

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 7 critical user flows (login, dashboard, receipt upload, expense submission, expense approval, settings, AI chat) pass testing on 2+ real mobile devices
- **SC-002**: Zero critical mobile UX bugs reported in pre-launch testing phase
- **SC-003**: PWA achieves Lighthouse mobile performance score of 80+
- **SC-004**: PWA installable on 95%+ of mobile browsers used by target SEA market
- **SC-005**: Camera capture works successfully on iOS Safari and Android Chrome
- **SC-006**: Users can view cached dashboard data within 3 seconds when offline
- **SC-007**: 90% of users can complete the "Add to Home Screen" flow successfully on first attempt
- **SC-008**: All touch targets meet 44x44px minimum accessibility standard
- **SC-009**: No horizontal scrolling required on any screen at 320px viewport width

## Assumptions

- BrowserStack or similar cloud testing service will be used for CI/CD mobile testing (not procuring physical devices for automated tests)
- Push notifications are deferred to a future enhancement (not in initial scope)
- The existing `mobile-camera-capture.tsx` component provides a foundation that will be enhanced, not replaced
- Offline data persistence uses standard browser APIs (IndexedDB, Cache Storage) without additional backend changes
- Target devices represent 80%+ of SEA mobile market share

## Out of Scope

- Native mobile app development (iOS App Store / Google Play)
- Push notification implementation
- Biometric authentication (Face ID, fingerprint)
- Mobile-specific payment integrations
- SMS/WhatsApp notifications
- Tablet-optimized layouts (focus is phone-first)
