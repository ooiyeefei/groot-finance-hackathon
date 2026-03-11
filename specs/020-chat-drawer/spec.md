# Feature Specification: Chat Drawer Panel

**Feature Branch**: `020-chat-drawer`
**Created**: 2026-03-10
**Status**: Draft
**Input**: User description: "Chat drawer UI: Convert the floating chat widget into a right-side drawer panel (like Stripe's Assistant). Desktop: right-side drawer ~380px wide, overlays content, persists across page navigation. Mobile: full-screen overlay. Bubble FAB stays visible when collapsed. Slide-in/out animation. State persists across navigation since ChatWidget is in root layout."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open Chat as Side Drawer on Desktop (Priority: P1)

As a desktop user, I want to click the chat bubble and have a chat panel slide open from the right side of the screen, so I can interact with the AI assistant while still viewing my financial data in the background.

**Why this priority**: This is the core interaction — replacing the floating popup with a professional side-drawer panel like Stripe's Assistant. It delivers the primary value: persistent, full-height chat alongside the working context.

**Independent Test**: Can be fully tested by clicking the chat FAB on any desktop page and verifying a right-side panel slides in with the chat interface.

**Acceptance Scenarios**:

1. **Given** I am a signed-in user on a desktop viewport (≥768px), **When** I click the chat FAB button, **Then** a chat panel slides in from the right edge of the screen, approximately 380px wide and full viewport height.
2. **Given** the chat drawer is closed, **When** I click the FAB, **Then** the panel animates in with a smooth slide-from-right transition (under 300ms).
3. **Given** the chat drawer is open, **When** I click the close button (X) or the FAB again, **Then** the panel slides out to the right and the FAB remains visible.
4. **Given** the chat drawer is open, **When** I press the Escape key, **Then** the drawer closes with the slide-out animation.
5. **Given** the chat drawer is open, **When** I resize the browser window below 768px, **Then** the drawer transitions to the full-screen mobile layout.

---

### User Story 2 - Full-Screen Chat on Mobile (Priority: P1)

As a mobile user, I want the chat to open as a full-screen overlay when I tap the chat bubble, so I have a usable chat experience on a small screen without a cramped side panel.

**Why this priority**: Mobile users cannot use a narrow side drawer. Full-screen overlay is essential for usability on phones and small tablets.

**Independent Test**: Can be tested by opening chat on a mobile viewport (<768px) and verifying it takes full screen.

**Acceptance Scenarios**:

1. **Given** I am on a mobile viewport (<768px), **When** I tap the chat FAB, **Then** the chat opens as a full-screen overlay covering the entire viewport.
2. **Given** the full-screen chat is open on mobile, **When** I tap close (X), **Then** the overlay slides down/away and the FAB becomes visible again.
3. **Given** I am on a mobile viewport with full-screen chat open, **When** I rotate the device to landscape (if width becomes ≥768px), **Then** the chat transitions to the side-drawer layout.

---

### User Story 3 - Chat Persists Across Page Navigation (Priority: P1)

As a user, I want my chat conversation to remain visible and uninterrupted when I navigate between pages, so I don't lose context while multitasking between chat and financial operations.

**Why this priority**: Persistence is core to the "assistant alongside your work" experience. Without it, the drawer is just a repositioned popup. Stripe's key differentiator is that the assistant stays open as you browse.

**Independent Test**: Can be tested by opening the chat drawer, sending a message, navigating to a different page, and verifying the drawer stays open with the conversation intact.

**Acceptance Scenarios**:

1. **Given** the chat drawer is open with an active conversation, **When** I click a sidebar navigation link to go to a different page, **Then** the drawer stays open and the conversation is preserved.
2. **Given** the chat drawer is open, **When** the page transitions, **Then** the drawer does not flicker, re-animate, or reset its scroll position.
3. **Given** I close the chat drawer and navigate to a different page, **When** I reopen the drawer, **Then** my previous conversation is still loaded (from the existing Convex real-time subscription).

---

### User Story 4 - External "Ask AI" Integration (Priority: P2)

As a user viewing an insight card or action prompt, I want to click "Ask AI about this" and have the chat drawer open with a pre-filled message, so I can seamlessly transition from data insight to AI conversation.

**Why this priority**: Existing feature — the `finanseal:open-chat` custom event already supports this. Must continue working with the new drawer layout.

**Independent Test**: Can be tested by clicking an "Ask AI" button on any insight card and verifying the drawer opens with the pre-filled message.

**Acceptance Scenarios**:

1. **Given** the chat drawer is closed, **When** an external component dispatches the `finanseal:open-chat` event with a message, **Then** the drawer slides open and the message is pre-filled in the input.
2. **Given** the chat drawer is already open, **When** the event fires, **Then** the drawer stays open and the new message is populated in the input field.

---

### Edge Cases

- What happens when the user has the drawer open and resizes their browser across the 768px breakpoint repeatedly? The drawer should smoothly transition between side-panel and full-screen modes without losing state or conversation.
- What happens when the user's subscription is locked (paused/canceled/unpaid)? The chat FAB and drawer should not render, same as current behavior.
- What happens on very narrow desktop viewports (768px-900px)? The drawer should overlay the content (not push it), ensuring the main content remains usable even if partially obscured.
- What happens when the drawer is open and a notification or modal appears? The drawer should have a z-index lower than modals but higher than page content, so modals render above it.

## Clarifications

### Session 2026-03-10

- Q: Should a semi-transparent backdrop (scrim) appear behind the drawer when open? → A: No backdrop/scrim — content behind stays fully visible and interactive (both desktop and mobile).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The chat FAB button MUST remain visible on all pages when the user is signed in and not subscription-locked, regardless of whether the drawer is open or closed.
- **FR-002**: On desktop viewports (>=768px), clicking the FAB MUST open a right-aligned side drawer panel, approximately 380px wide and full viewport height.
- **FR-003**: On mobile viewports (<768px), tapping the FAB MUST open the chat as a full-screen overlay covering the entire viewport.
- **FR-004**: The drawer MUST animate with a slide-from-right transition when opening and a slide-to-right transition when closing. Animation duration should be 200-300ms.
- **FR-005**: The drawer MUST persist its open/closed state across page navigations within the same session. Navigation MUST NOT cause the drawer to close, re-mount, or lose its conversation state.
- **FR-006**: The drawer MUST support closing via: (a) clicking the X button, (b) clicking the FAB again, and (c) pressing the Escape key.
- **FR-007**: The drawer MUST NOT push or reflow the main page content. It MUST overlay on top of the existing page with no backdrop or scrim — the underlying content remains fully visible and interactive.
- **FR-008**: The drawer MUST continue to support the existing `finanseal:open-chat` custom event for programmatic opening with a pre-filled message.
- **FR-009**: The chat FAB MUST use a fixed position at bottom-right on desktop when the drawer mode is active. The current drag-to-reposition behavior will be removed for the drawer pattern.
- **FR-010**: The drawer MUST respond to viewport resize events, transitioning between side-drawer (>=768px) and full-screen (<768px) modes in real time.
- **FR-011**: The drawer content (ChatWindow component) MUST remain mounted when the drawer is closed to preserve conversation state and avoid re-fetching messages on reopen.

### Key Entities

- **Chat Drawer State**: Open/closed status, active conversation ID, viewport mode (drawer vs full-screen). Stored in component state within the root layout — no new database entities needed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Chat drawer opens within 300ms of clicking the FAB, with a visible slide-in animation.
- **SC-002**: Chat conversation persists across at least 5 consecutive page navigations without losing messages, scroll position, or drawer open state.
- **SC-003**: On mobile (<768px), chat overlay covers 100% of viewport width and height.
- **SC-004**: On desktop (>=768px), chat drawer is approximately 380px wide and does not cause horizontal scrolling or content reflow on the underlying page.
- **SC-005**: Existing "Ask AI" integrations (via `finanseal:open-chat` event) continue to function with zero regressions.
- **SC-006**: Chat widget does not render for unauthenticated users or users with locked subscriptions (existing behavior preserved).

## Assumptions

- The ChatWidget is already mounted in the root layout (`src/app/[locale]/layout.tsx`), so it naturally persists across navigations. The primary change is visual (popup to drawer), not architectural.
- The existing `ChatWindow` component handles conversation management, streaming, and action cards. It will be reused as-is inside the drawer container — no changes to chat logic needed.
- The 768px breakpoint aligns with the existing Tailwind `md:` breakpoint used throughout the app.
- The drawer overlay approach (not pushing content) is intentional — it avoids complex layout shifts and matches the Stripe pattern shown in the reference screenshot.
- The drag-to-reposition FAB behavior will be removed in favor of a fixed-position FAB. This simplifies the interaction model and is consistent with side-drawer patterns (Stripe, Intercom, Zendesk).
