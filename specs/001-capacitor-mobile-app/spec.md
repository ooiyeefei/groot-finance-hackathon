# Feature Specification: Capacitor Mobile App (iOS & Android)

**Feature Branch**: `001-capacitor-mobile-app`
**Created**: 2026-02-21
**Status**: Draft
**Input**: User description: "Build mobile app using Capacitor to wrap existing FinanSEAL web app and publish to iOS App Store (and Android Play Store). Reference: GitHub Issue #222."
**Scope**: Phase 1 targets iOS (App Store) only. Android (Play Store) is deferred to a subsequent phase.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Access FinanSEAL via Native Mobile App (Priority: P1)

As an SME employee or manager, I want to install FinanSEAL from the App Store (iOS) or Play Store (Android) and use all existing features — expense submission, approvals, dashboards, chat — exactly as they work on the web, so I can manage finances on the go with a native app experience.

**Why this priority**: This is the foundational capability. Without the core app functioning correctly in the native shell, no other native features matter. It validates the wrapping approach and ensures zero regression.

**Independent Test**: Install the app from TestFlight (iOS) or Internal Testing (Android), log in with existing Clerk credentials, and navigate through every major section (expenses, invoices, analytics, chat, settings). All features should work identically to the web version.

**Acceptance Scenarios**:

1. **Given** a user has installed the app from the App Store, **When** they open the app, **Then** they see the login screen and can authenticate with their existing Clerk credentials
2. **Given** an authenticated user, **When** they navigate to any existing feature (expenses, invoices, analytics, chat), **Then** the feature works identically to the web version with no broken layouts or missing functionality
3. **Given** a user with an active session, **When** they close and reopen the app, **Then** their session is preserved and they return to the app without re-authenticating (within standard session duration)
4. **Given** a user on a slow or unstable network, **When** they use the app, **Then** the existing offline indicator and PWA fallback behavior continue to function

---

### User Story 2 - Capture Receipts with Native Camera (Priority: P2)

As an employee submitting expense claims, I want to capture receipt photos using the device's native camera (with full resolution, flash control, and focus), so I get higher quality receipt images compared to the browser camera API.

**Why this priority**: Receipt capture is one of the most common mobile actions for FinanSEAL users. The native camera provides significantly better quality than the browser API, directly improving OCR accuracy and the expense submission experience.

**Independent Test**: Open the expense submission flow, tap the camera button, verify the native camera opens (not the browser camera), take a photo of a receipt, and confirm the image is attached to the expense with full resolution.

**Acceptance Scenarios**:

1. **Given** a user is submitting an expense claim on the mobile app, **When** they tap the camera/photo capture button, **Then** the device's native camera interface opens (not the browser camera overlay)
2. **Given** a user has captured a receipt photo, **When** the photo is attached to the expense, **Then** the image quality is at full device resolution (not compressed by browser limitations)
3. **Given** a user is on the web version, **When** they use the camera, **Then** the existing browser-based camera continues to work as before (no regression)

---

### User Story 3 - Receive Push Notifications for Approvals (Priority: P3)

As a manager, I want to receive push notifications on my phone when an expense claim or document requires my approval, so I can respond promptly without needing to check the app manually.

**Why this priority**: Push notifications are a key differentiator over the PWA. Timely approval notifications reduce bottlenecks in expense workflows, which is a top pain point for SME teams.

**Independent Test**: Submit an expense claim as an employee, verify the assigned approver receives a push notification on their device, tap the notification, and confirm it deep-links to the pending approval.

**Acceptance Scenarios**:

1. **Given** an expense claim has been submitted for approval, **When** the approver has the mobile app installed with notifications enabled, **Then** they receive a push notification within 30 seconds of submission
2. **Given** a user receives a push notification, **When** they tap the notification, **Then** the app opens directly to the relevant approval item (deep link)
3. **Given** a user has not granted notification permissions, **When** they are prompted, **Then** they can choose to allow or deny, and the app functions normally regardless of their choice
4. **Given** the app is not running (killed/backgrounded), **When** a notification-worthy event occurs, **Then** the notification is still delivered

---

### User Story 4 - Install from App Store (Priority: P4)

As a FinanSEAL customer or prospective user, I want to find and install the FinanSEAL app from the Apple App Store or Google Play Store, so I can get the app through the standard distribution channel I trust.

**Why this priority**: App Store presence is the ultimate delivery goal. It enables discoverability, standard install/update flow, and establishes credibility. Depends on all prior stories working correctly.

**Independent Test**: Search "FinanSEAL" in the App Store (iOS) or Play Store (Android), install the app, open it, and complete a full login-to-expense-submission flow.

**Acceptance Scenarios**:

1. **Given** the app has been submitted and approved, **When** a user searches "FinanSEAL" in the App Store or Play Store, **Then** the app appears in search results with correct name, icon, description, and screenshots
2. **Given** a user installs the app, **When** the installation completes, **Then** the app opens with the correct splash screen and transitions to the login screen
3. **Given** an app update is available, **When** the user opens the App Store/Play Store, **Then** they see the update and can install it seamlessly

---

### User Story 5 - Navigate to App Content via Deep Links (Priority: P5)

As a user who receives a link to a specific FinanSEAL resource (e.g., an expense claim, an invoice) via email or chat, I want the link to open directly in the mobile app if it is installed, so I can access the content without manually navigating.

**Why this priority**: Deep linking improves the user experience by connecting external communication (email notifications, shared links) to specific in-app content. It builds on the notification and core app stories.

**Independent Test**: Share a link to a specific expense claim, tap it on a device with the app installed, and verify the app opens directly to that expense claim.

**Acceptance Scenarios**:

1. **Given** a user has the mobile app installed, **When** they tap a FinanSEAL link (e.g., from email), **Then** the app opens to the corresponding content instead of the browser
2. **Given** a user does NOT have the mobile app installed, **When** they tap a FinanSEAL link, **Then** it opens in the web browser as it does today (graceful fallback)

---

### Edge Cases

- What happens when a user tries to use the app without internet connectivity? (Existing offline behavior should be preserved; app should show the offline indicator and cached content where available.)
- What happens when the OAuth login redirect fails inside the native shell? (The app must handle OAuth redirects correctly within the native context, falling back to an in-app browser if the WebView cannot handle the redirect.)
- What happens when a user denies camera permissions? (The app should display a clear message explaining why camera access is needed and how to enable it in device settings.)
- What happens when a user denies push notification permissions? (The app should continue to function normally; notification features degrade gracefully.)
- What happens when the user's device runs an older OS version? (Define minimum supported OS versions — iOS 16+ and Android 10+ — and display an appropriate message for unsupported versions.)
- What happens when the app is force-closed during an active upload? (The upload should resume or prompt to retry when the app is reopened.)
- What happens during an App Store review? (Content must comply with App Store Review Guidelines — no private API usage, correct metadata, valid privacy policy.)
- What happens when the native shell version is critically outdated? (The app blocks usage with a full-screen update prompt directing the user to the App Store. For non-critical updates, a dismissible banner encourages updating without blocking functionality.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST render the complete existing FinanSEAL web application within a native shell, including all pages, components, and interactive features
- **FR-002**: The app MUST support user authentication via the existing Clerk-based auth system, including OAuth redirects and session management
- **FR-003**: The app MUST maintain real-time data subscriptions (Convex) with the same behavior as the web version
- **FR-004**: The app MUST provide native camera access for receipt and document capture, replacing the browser camera API on mobile
- **FR-005**: The app MUST deliver push notifications for expense approval requests (pending manager action). Additional notification event types (status updates, document processing completion) are deferred to future iterations
- **FR-006**: The app MUST support deep linking, allowing external URLs to open directly to specific content within the app
- **FR-007**: The app MUST display a branded splash screen and app icon consistent with FinanSEAL's visual identity
- **FR-008**: The app MUST integrate with the device status bar, displaying correctly in both light and dark mode
- **FR-009**: The app MUST be distributed through the Apple App Store with proper metadata, screenshots, and privacy policy (Google Play Store deferred to Phase 2)
- **FR-010**: The app MUST NOT break or alter any existing web application functionality — the web version must continue to work independently
- **FR-011**: The app MUST support the existing PWA offline behavior (service worker, cached content) within the native shell
- **FR-012**: The app MUST handle app lifecycle events (background, foreground, termination) gracefully, preserving user state and session
- **FR-013**: The app MUST support a minimum OS version of iOS 16 (Android minimum version to be defined in Phase 2)
- **FR-014**: The app MUST enforce a forced update (blocking usage) when the native shell version is below a critical minimum, and display a non-blocking soft prompt encouraging update for routine new versions
- **FR-015**: The app MUST include crash and ANR (App Not Responding) monitoring to detect and report production stability issues

### Key Entities

- **Mobile App Package**: The distributable application package for each platform (IPA for iOS, AAB/APK for Android), including app identifier, version number, build number, signing credentials, and platform-specific metadata
- **Push Notification Subscription**: A device registration linking a user to their device token, notification preferences (opt-in/opt-out), and platform (iOS/Android)
- **App Store Listing**: The public store entry including app name ("FinanSEAL"), description, screenshots, privacy policy URL, category (Finance/Business), age rating, and review status

## Clarifications

### Session 2026-02-21

- Q: Should we release iOS and Android simultaneously or iOS first? → A: iOS first, Android follows in a later phase.
- Q: What app update strategy should be used when new versions are available? → A: Hybrid — force update (block usage) for critical/breaking native shell changes; soft prompt (non-blocking banner) for routine updates.
- Q: Which events should trigger push notifications in Phase 1? → A: Approval requests only (expense claims pending manager action). Additional event types (status updates, document processing) deferred to future iterations.
- Q: Who participates in beta testing before public App Store submission? → A: Internal team only via TestFlight (FinanSEAL team members).
- Q: What level of app monitoring/analytics should be included at launch? → A: Crash reporting only (crash/ANR monitoring for production stability). Full usage analytics deferred to post-launch iteration.

## Assumptions

- The existing FinanSEAL web app works correctly in a WebView context without significant modifications
- Clerk authentication (OAuth redirects, session tokens) is compatible with a native WebView, potentially requiring an in-app browser for OAuth flows
- Convex real-time subscriptions function correctly over WebSocket connections within the native shell
- The existing PWA service worker and offline capabilities remain functional in the Capacitor WebView
- Apple Developer Program ($99/year) and Google Play Developer ($25 one-time) accounts are already set up or will be provisioned before App Store submission
- Push notification backend infrastructure (APNs for iOS, FCM for Android) will need to be configured; this is new infrastructure not currently part of the web app
- App Store review compliance: the app provides sufficient native value beyond a simple web wrapper (native camera, push notifications, deep linking) to satisfy Apple's review guidelines regarding minimum functionality

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of existing web features are functional and usable within the mobile app — verified by completing the same manual test suite used for the web version
- **SC-002**: Users can install the app from the App Store (iOS) and complete their first login within 2 minutes
- **SC-003**: Receipt photos captured via the native camera are at least 2x higher resolution than those captured via the browser camera API on the same device
- **SC-004**: Push notifications for approval requests are delivered within 30 seconds of the triggering event, with a 95%+ delivery rate for devices with notifications enabled
- **SC-005**: The app passes internal team beta testing via TestFlight and Apple App Store review on the first submission (or within one resubmission)
- **SC-006**: Deep links resolve to the correct in-app content at least 95% of the time on devices with the app installed
- **SC-007**: App launch time (splash screen to interactive content) is under 3 seconds on devices from the last 3 years
- **SC-008**: No regressions detected in the web application after mobile app integration — verified by existing automated and manual test coverage
- **SC-009**: App crash rate is below 1% of sessions in the first 30 days post-launch, as measured by crash monitoring
