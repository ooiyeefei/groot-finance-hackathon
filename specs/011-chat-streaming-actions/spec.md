# Feature Specification: Action-Driven Rendering & SSE Streaming

**Feature Branch**: `011-chat-streaming-actions`
**Created**: 2026-02-12
**Status**: Draft
**Input**: User description: "Action-driven rendering with interactive card components and SSE streaming for the FinanSEAL chat widget"
**Depends on**: `010-copilotkit-migration` (floating chat widget, agent API endpoint, Convex persistence)

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Real-Time Response Streaming (Priority: P1)

A manager opens the floating chat widget and asks "How much did the team spend on meals in January?" Currently, the user stares at a "Thinking..." indicator for 5-15 seconds with no feedback, then the entire response appears at once. With streaming, the user immediately sees status updates ("Searching transactions...", "Analyzing results..."), then text streams in progressively word-by-word as the AI generates it. The experience feels responsive and alive rather than frozen.

**Why this priority**: This is the single highest-impact improvement. Every user of the chat widget experiences the current lag on every message. Streaming transforms the perceived responsiveness of the entire feature without changing what the AI returns.

**Independent Test**: Can be fully tested by sending any message to the chat widget and observing progressive rendering. Delivers value for all users on every interaction regardless of whether action cards exist.

**Acceptance Scenarios**:

1. **Given** a user sends a message, **When** the AI agent begins processing, **Then** a status indicator appears within 1 second showing what the agent is doing (e.g., "Searching documents...")
2. **Given** the agent is generating a response, **When** text is being produced, **Then** the response text streams progressively into the chat (not all at once after completion)
3. **Given** a response is streaming, **When** the user clicks the Stop button, **Then** streaming stops immediately, partial text is preserved and displayed, and the partial message is persisted
4. **Given** a response is streaming, **When** a network error or timeout occurs, **Then** the user sees a clear error message and the partial response (if any) is preserved
5. **Given** a response completes streaming, **When** the full response is available, **Then** the complete message is persisted to conversation history as a single message (not multiple fragments)

---

### User Story 2 - Interactive Anomaly & Expense Cards (Priority: P2)

A manager asks "Are there any suspicious transactions this month?" Instead of receiving a plain text list, the AI returns an interactive anomaly card showing color-coded severity levels (high/medium/low), key details for each anomaly, and action buttons. The manager can click "View Transaction" to navigate directly to the relevant expense claim, or click "Send Reminder" to notify the employee about a missing receipt. Similarly, when asking about pending approvals, the AI shows expense approval cards with Approve/Reject buttons that process the approval directly from within the chat.

**Why this priority**: This is the core "action-driven rendering" feature that transforms the chat from a read-only text interface into an interactive command center. It directly enables managers to take action on financial data without leaving the chat. However, it depends on the streaming infrastructure (P1) for the best experience.

**Independent Test**: Can be tested by asking the AI about anomalies or pending expenses and verifying that interactive cards appear with working buttons. Delivers value as a standalone feature even without streaming.

**Acceptance Scenarios**:

1. **Given** a manager asks about suspicious transactions, **When** the agent detects anomalies in the data, **Then** an anomaly card renders inline in the chat with severity indicators, descriptions, and navigation links to the specific records
2. **Given** an anomaly card is displayed, **When** the manager clicks "View Transaction", **Then** the app navigates to the specific expense claim detail page
3. **Given** a manager asks about pending approvals, **When** the agent finds pending expenses, **Then** an expense approval card renders with the submitter name, amount, category, date, and Approve/Reject buttons
4. **Given** an expense approval card is displayed, **When** the manager clicks "Approve" or "Reject", **Then** the expense claim status is updated in the system and the card reflects the new status
5. **Given** the AI response contains both text explanation and structured data, **When** the message is rendered, **Then** the text appears normally with the interactive card rendered below or alongside it
6. **Given** a conversation with action cards is reopened later, **When** the historical messages load, **Then** the cards render in their final state (e.g., "Approved" badge rather than active Approve button)

---

### User Story 3 - Vendor Comparison & Spending Visualizations (Priority: P3)

A finance admin asks "Compare our top office supply vendors on price and reliability" or "Show me team spending by category for Q1." The AI returns rich visual components: a vendor comparison card with side-by-side metrics (average price, on-time delivery rate, rating), or a spending chart showing category breakdowns with bars/trends. These visualizations include action buttons like "Request Quote from All Vendors" or "Export as Report."

**Why this priority**: This enhances the analytics and decision-making capability of the chat but covers less frequent use cases than anomaly detection and expense approvals. The charting capability requires an additional visualization component but builds on the same action-rendering infrastructure from P2.

**Independent Test**: Can be tested by asking vendor comparison or spending visualization questions and verifying rich cards render with correct data and working action buttons.

**Acceptance Scenarios**:

1. **Given** a user asks to compare vendors, **When** the agent has data for multiple vendors, **Then** a comparison card renders showing each vendor's metrics in a visually distinct layout
2. **Given** a comparison card is displayed, **When** the user clicks an action button (e.g., "View Vendor History"), **Then** the app navigates to the relevant vendor page
3. **Given** a user asks about spending patterns, **When** the agent returns spending data by category or time period, **Then** a chart visualization renders showing the breakdown with labeled segments and amounts
4. **Given** a chart is displayed, **When** the user views it on mobile (screen width < 640px), **Then** the chart adapts to the smaller width without losing readability
5. **Given** the chat window is 400px wide, **When** any card or chart renders, **Then** the component fits within the available width without horizontal scrolling

---

### User Story 4 - Dead Code Cleanup (Priority: P0)

Before adding new features, unused dependencies and components from the CopilotKit integration attempt must be removed. The app currently ships unused CopilotKit packages that add to bundle size and an unused provider component. These should be cleaned up to reduce confusion and bundle weight.

**Why this priority**: P0 because it is a prerequisite — unused code should be removed before building new features on top of the current architecture. This ensures a clean foundation.

**Independent Test**: Can be tested by verifying no CopilotKit runtime packages are imported anywhere in the codebase, the unused provider component is deleted, the app builds and runs normally, and bundle size decreases.

**Acceptance Scenarios**:

1. **Given** the current codebase has unused CopilotKit packages, **When** cleanup is complete, **Then** no CopilotKit runtime code is imported or executed at runtime
2. **Given** the cleanup is applied, **When** the app is built, **Then** the build succeeds with no new errors and bundle size does not increase
3. **Given** the unused CopilotKit provider component exists, **When** cleanup is complete, **Then** the file is deleted and no references to it remain

---

### Edge Cases

- What happens when the AI agent returns a response that contains both text and an action card, but the card data is malformed or missing required fields? The system should render the text portion normally and show a graceful fallback for the malformed card (e.g., a plain text summary instead of the interactive card).
- What happens when the user clicks an action button (e.g., "Approve") but the backend operation fails (e.g., the expense was already approved by someone else)? The card should show an error state with a descriptive message and not silently fail.
- What happens when a streaming response is interrupted mid-sentence (network drop, server timeout)? The partial text should be preserved, an error indicator shown, and the user should be able to send a new message without the chat being stuck in a loading state.
- What happens when the AI returns an action card type that the frontend does not recognize (e.g., future card types not yet implemented)? The system should fall back to rendering the text content and log a warning, not crash.
- What happens when the user scrolls up during streaming? Auto-scroll should pause so the user can read earlier messages, and resume when the user scrolls back to the bottom.
- What happens when an action card contains a navigation link to a record the user doesn't have permission to view? The navigation should proceed and the target page's existing permission checks should handle access denial normally.
- What happens when the chat widget is closed during an active stream? The stream should be aborted, partial content persisted, and reopening the widget should show the partial response.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Workstream 0: Dead Code Cleanup

- **FR-001**: System MUST remove all unused CopilotKit runtime packages from the application bundle
- **FR-002**: System MUST delete the unused CopilotKit provider wrapper component
- **FR-003**: System MUST remove any dead imports referencing CopilotKit modules across the codebase
- **FR-004**: System MUST continue to build and run correctly after cleanup with no new errors

#### Workstream 1: SSE Streaming

- **FR-010**: System MUST stream AI responses progressively to the chat widget as they are generated, rather than waiting for the complete response
- **FR-011**: System MUST display status indicators during agent processing phases (e.g., "Searching documents...", "Analyzing transactions...") that appear within 1 second of the user sending a message
- **FR-012**: System MUST support interrupting an in-progress stream when the user clicks the Stop button, preserving any partial text already received
- **FR-013**: System MUST persist the final complete message to conversation history only after the stream completes (not individual streaming fragments)
- **FR-014**: System MUST handle stream errors (network failures, timeouts, server errors) gracefully by showing an error indicator and preserving any partial content. If no new stream data is received for 60 seconds, the system MUST show a timeout message with an option to retry the query
- **FR-015**: System MUST support the existing keyboard shortcut behavior (Enter to send, Shift+Enter for newline, Escape to close) while streaming is in progress
- **FR-016**: System MUST auto-scroll to show new streaming content unless the user has manually scrolled up to read earlier messages

#### Workstream 2: Action-Driven Rendering

- **FR-020**: System MUST support rendering interactive card components inline within chat messages via an extensible action registry — a type-to-component map where new card types can be added by registering a component, with graceful fallback to text content for unrecognized types
- **FR-021**: System MUST render an **Anomaly Card** when the agent identifies suspicious transactions, showing severity level (high/medium/low), anomaly description, amounts, and dates with color-coded visual indicators
- **FR-022**: Anomaly Cards MUST include navigation links that take the user to the specific transaction or expense claim record in the app
- **FR-023**: Anomaly Cards MUST include contextual action buttons (e.g., "Send Reminder" for missing receipts) that trigger the appropriate backend operation
- **FR-024**: System MUST render an **Expense Approval Card** when the agent finds pending expenses for the user to act on, showing submitter name, amount, category, and date
- **FR-025**: Expense Approval Cards MUST include Approve and Reject buttons that show a lightweight inline confirmation prompt (e.g., "Approve $450 meal expense from John? Yes / Cancel") before executing the status update, then reflect the updated state on the card
- **FR-026**: System MUST render a **Vendor Comparison Card** when the agent compares multiple vendors, showing side-by-side metrics (average price, delivery rate, rating)
- **FR-027**: Vendor Comparison Cards MUST include action buttons for common follow-up actions (e.g., "View Vendor History", "Request Quote")
- **FR-028**: System MUST render a **Spending Chart** when the agent returns spending data by category or time period, visualizing the breakdown as a chart
- **FR-029**: All interactive cards MUST use the application's design system tokens for colors, spacing, and typography — no hardcoded color values
- **FR-030**: All interactive cards MUST render correctly in both light and dark mode
- **FR-031**: All interactive cards MUST fit within the 400px chat widget width without horizontal scrolling, and adapt appropriately on mobile screens
- **FR-032**: When a message containing action cards is loaded from conversation history (not a live stream), cards MUST render in their final state (e.g., showing "Approved" badge rather than active Approve/Reject buttons)
- **FR-033**: When the agent returns both text content and action data in a single response, the system MUST render the text content followed by the action card(s)
- **FR-034**: When action data is malformed or the card type is unrecognized, the system MUST fall back to rendering the text content without crashing
- **FR-035**: When an action button triggers a backend operation that fails, the card MUST display an error state with a descriptive message

### Key Entities

- **Chat Action**: A structured data object returned by the AI agent alongside text content, containing an action type identifier and the data needed to render an interactive card component. Stored as part of message metadata for historical rendering.
- **Action Card**: A visual, interactive component rendered inline in the chat that displays structured data (anomalies, expenses, vendor comparisons, charts) with optional action buttons that trigger backend operations or app navigation.
- **Stream Event**: A unit of data sent from the server to the client during response generation, representing either a status update, a text fragment, an action card payload, or a completion signal.

## Clarifications

### Session 2026-02-12

- Q: Should expense approval/rejection from chat cards require confirmation or execute on single click? → A: Lightweight inline confirmation prompt before executing (e.g., "Approve $450 from John? Yes / Cancel")
- Q: Should the action card type registry be a closed set (4 types) or extensible? → A: Extensible registry with type-to-component map; new card types added by registering a component, graceful fallback for unknown types
- Q: What is the stream timeout threshold before showing a timeout error? → A: 60 seconds of no new stream data; show timeout message with retry option (matches existing agent timeout)

## Assumptions

- The existing AI agent (8-node LangGraph StateGraph) can be extended to return structured action metadata alongside text responses without changing the agent's core workflow or tool implementations.
- The agent's LLM (Qwen3 on Modal) supports generating structured JSON when instructed via system prompt, enabling it to decide when to emit action cards based on the data returned by tools.
- The Convex message metadata field is flexible enough to store action card data for historical rendering without schema changes.
- The existing 12 agent tools already return sufficient data (transaction IDs, amounts, categories, vendor names) for the frontend to construct action cards — no new tools are required.
- Expense approval/rejection functionality already exists elsewhere in the app; the action card buttons trigger the same operations.
- The application's routing structure supports deep linking to specific expense claims, vendors, and transactions via URL paths.
- The chat widget's 400px width is sufficient for single-column card layouts; multi-column layouts (e.g., vendor comparison) will stack or scroll within the card.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users see initial feedback (status indicator or first text) within 2 seconds of sending a message, compared to the current 5-15 second wait for any visible response
- **SC-002**: The complete response rendering time (from user send to full response visible) remains the same or improves — streaming does not add latency to the total response time
- **SC-003**: 100% of anomaly detection responses render as interactive anomaly cards (when the agent detects anomalies) rather than plain text lists
- **SC-004**: 100% of pending expense responses render as interactive approval cards (when pending expenses exist) rather than plain text
- **SC-005**: Users can complete an expense approval/rejection directly from the chat widget in a single click, without navigating to a separate page
- **SC-006**: Navigation links in action cards take the user to the correct record page 100% of the time
- **SC-007**: All interactive cards render correctly in both light mode and dark mode with proper contrast and readability
- **SC-008**: All interactive cards render within the 400px widget width on desktop and adapt to mobile screen widths without horizontal scrolling
- **SC-009**: Unused CopilotKit runtime packages are removed, reducing the shipped bundle — no CopilotKit code executes at runtime
- **SC-010**: The application builds successfully after all changes with zero new type errors or build failures
- **SC-011**: Streaming interruption (Stop button) halts response within 500ms and preserves partial content
- **SC-012**: Historical messages with action cards render in their final state when conversations are reopened
