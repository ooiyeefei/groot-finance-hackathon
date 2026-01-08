# Feature Specification: User Feedback Collection (In-App Feedback Widget)

**Feature Branch**: `001-user-feedback`
**Created**: 2026-01-07
**Status**: Draft
**Input**: GitHub Issue #83 - Feature: User Feedback Collection (In-App Feedback Widget)

## Problem Statement

FinanSEAL currently has **no feedback mechanism**. Users have no way to report issues, suggest improvements, or communicate problems they encounter.

**Current Pain Points**:
1. **No Feedback Channel**: Users cannot easily report bugs or suggest features
2. **Silent Churn**: Users leave without explaining why
3. **Missed Opportunities**: Good feature ideas never reach the team
4. **Support Burden**: Users resort to email/chat for simple feedback

## Clarifications

### Session 2026-01-07
- Q: Should the UI be optimized for non-technical users? → A: Yes, UI must be extremely user-friendly and frictionless with natural language input, designed for very non-technical users
- Q: Should feedback automatically create GitHub issues? → A: Yes, bug reports and feature requests must automatically create GitHub issues for triage

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Submit Bug Report (Priority: P1)

As a logged-in user encountering a problem, I want to quickly report a bug using simple, everyday language so that the development team can fix issues I experience without me needing technical knowledge.

**Why this priority**: Bug reports are critical for product stability. Users who encounter bugs and cannot report them easily will churn silently. This is the highest-value feedback type.

**Independent Test**: Can be fully tested by logging in, clicking the feedback button, selecting "Bug Report", entering a description in plain language, and submitting. Delivers immediate value as bug reports are captured and automatically filed as GitHub issues.

**Acceptance Scenarios**:

1. **Given** I am logged in and on any page, **When** I click the feedback button, **Then** I see a simple, friendly feedback modal with clear type selection (no technical jargon)
2. **Given** the feedback modal is open, **When** I select "Bug Report" and describe my problem in everyday language, **Then** I can submit the feedback without needing to know technical terms
3. **Given** I am submitting a bug report, **When** I click the screenshot button, **Then** the current page is captured automatically with one click
4. **Given** I have submitted feedback, **When** submission succeeds, **Then** I see a friendly confirmation message ("Thank you! We'll look into this.") and the modal closes
5. **Given** a bug report is submitted, **When** the system processes it, **Then** a GitHub issue is automatically created with the "bug" label for team triage

---

### User Story 2 - Submit Feature Request (Priority: P1)

As a logged-in user with an idea for improvement, I want to suggest new features using simple words so that the product can evolve based on real user needs without requiring technical expertise from me.

**Why this priority**: Feature requests are essential for product iteration, especially during early-stage growth. Equal priority to bug reports as both drive product improvement.

**Independent Test**: Can be fully tested by logging in, clicking feedback button, selecting "Feature Request", describing the idea in plain language, and submitting. Automatically creates a GitHub issue for team review.

**Acceptance Scenarios**:

1. **Given** I am logged in, **When** I open the feedback modal and select "Feature Request", **Then** I see a simple prompt asking what I'd like to see improved (no technical terminology)
2. **Given** I have described my feature idea in everyday language, **When** I submit, **Then** my request is saved and I see a friendly confirmation
3. **Given** a feature request is submitted, **When** the system processes it, **Then** a GitHub issue is automatically created with the "feature-request" label for team triage

---

### User Story 3 - Submit General Feedback (Priority: P2)

As a logged-in user, I want to provide general feedback or comments about my experience so that the team understands overall user sentiment.

**Why this priority**: General feedback captures sentiment and experience that doesn't fit bug/feature categories. Lower priority than specific actionable feedback.

**Independent Test**: Can be tested by selecting "General Feedback" option and submitting a comment.

**Acceptance Scenarios**:

1. **Given** I am logged in, **When** I select "General Feedback" type, **Then** I see a simple text area with friendly placeholder text ("Tell us what's on your mind...")
2. **Given** I want to remain anonymous, **When** I check the anonymous option, **Then** my feedback is submitted without my user identity attached

---

### User Story 4 - View and Manage Feedback (Priority: P2)

As an administrator, I want to view all submitted feedback and update its status so that I can track and act on user input.

**Why this priority**: Admin visibility is essential to close the feedback loop, but the primary value is in collection (P1 stories).

**Independent Test**: Can be tested by admin logging in, navigating to feedback admin view, and seeing submitted feedback items with status controls and GitHub issue links.

**Acceptance Scenarios**:

1. **Given** I am an admin user, **When** I navigate to the feedback management area, **Then** I see a list of all submitted feedback with links to associated GitHub issues
2. **Given** I am viewing feedback, **When** I filter by type (Bug/Feature/General), **Then** I see only feedback of that type
3. **Given** I am viewing a feedback item that created a GitHub issue, **When** I click the issue link, **Then** I am taken directly to the GitHub issue for that feedback

---

### User Story 5 - Receive Team Notification (Priority: P3)

As a team member, I want to receive notifications when new feedback is submitted so that I can respond promptly.

**Why this priority**: Notifications improve response time but are not critical for initial feedback collection functionality.

**Independent Test**: Can be tested by submitting feedback and verifying team receives notification.

**Acceptance Scenarios**:

1. **Given** feedback notification is configured, **When** a user submits new feedback, **Then** designated team members receive a notification

---

### Edge Cases

- What happens when screenshot capture fails (e.g., browser permission denied)?
  - System allows submission without screenshot and displays a friendly, non-alarming message ("No worries, you can still submit without a screenshot")
- What happens when user submits empty feedback message?
  - System shows gentle validation ("Please tell us a bit more so we can help you")
- What happens when user loses internet connection during submission?
  - System displays friendly error message ("Oops! Check your internet and try again") and preserves user input for retry
- What happens when user submits feedback with very long text?
  - System enforces reasonable character limit (2000 characters) with visible counter in friendly terms ("You have 500 characters left")
- What happens when anonymous user tries to access feedback widget?
  - Feedback button only visible to logged-in users (per acceptance criteria)
- What happens when GitHub issue creation fails?
  - System stores feedback locally and retries issue creation in background; admin is notified of sync failure
- What happens when user submits duplicate feedback?
  - System accepts the feedback (user intent is valid); deduplication is a triage responsibility

## Requirements *(mandatory)*

### Functional Requirements

#### User Experience (Frictionless Design)
- **FR-001**: System MUST display a floating feedback button on all pages for logged-in users with clear, friendly icon and label
- **FR-002**: System MUST provide three feedback types using simple, non-technical labels: "Report a Problem", "Suggest an Idea", "Share Feedback"
- **FR-003**: System MUST allow users to submit feedback in 3 clicks or fewer (open modal → select type → submit)
- **FR-004**: System MUST use natural, conversational language throughout the feedback flow (no technical jargon like "bug", "ticket", "issue")
- **FR-005**: System MUST provide helpful placeholder text that guides users (e.g., "What went wrong?" for bugs, "What would make this better?" for features)
- **FR-006**: System MUST display friendly, encouraging confirmation messages after submission

#### Core Functionality
- **FR-007**: System MUST capture and attach screenshots with one-click functionality
- **FR-008**: System MUST allow anonymous submission option (feedback stored without user identity link)
- **FR-009**: System MUST store feedback with: type, message, screenshot (if provided), page URL, submission timestamp
- **FR-010**: System MUST validate feedback message is not empty and within character limits using gentle, non-alarming validation messages
- **FR-011**: System MUST preserve user input if submission fails, allowing retry

#### GitHub Integration
- **FR-012**: System MUST automatically create a GitHub issue for every bug report with the "bug" label
- **FR-013**: System MUST automatically create a GitHub issue for every feature request with the "feature-request" label
- **FR-014**: GitHub issues MUST include: user feedback text, screenshot link (if provided), page URL, submission timestamp, and user identifier (unless anonymous)
- **FR-015**: System MUST store the GitHub issue URL in the feedback record for admin reference
- **FR-016**: System MUST handle GitHub API failures gracefully with background retry (max 3 attempts)

#### Admin & Notifications
- **FR-017**: System MUST provide admin interface to view all feedback submissions with GitHub issue links
- **FR-018**: System MUST allow admins to filter feedback by type and status
- **FR-019**: System MUST allow admins to update feedback status (New, Reviewed, Resolved)
- **FR-020**: System MUST send notification to team when new feedback is submitted

### Key Entities

- **Feedback**: Represents a single feedback submission containing type, message, optional screenshot, page context, status, optional user reference, and GitHub issue URL
- **User**: The person submitting feedback (optional if anonymous submission)
- **Business**: The business context associated with the feedback (for multi-tenant filtering)
- **GitHub Issue**: External representation of bug/feature feedback for team triage (linked back to Feedback entity)

## Success Criteria *(mandatory)*

### Measurable Outcomes

#### User Experience
- **SC-001**: Users can submit feedback in under 30 seconds from clicking the button to seeing confirmation
- **SC-002**: Feedback submission requires maximum 3 clicks (open → type → submit)
- **SC-003**: 90% of users successfully complete feedback submission on first attempt (no abandonment)
- **SC-004**: Zero technical terms visible to end users during feedback flow

#### Performance
- **SC-005**: Feedback widget loads and is visible within 2 seconds of page load
- **SC-006**: Screenshot capture completes within 3 seconds when requested

#### Reliability
- **SC-007**: 100% of submitted feedback is persisted and visible to admins
- **SC-008**: 99% of bug reports and feature requests result in GitHub issues within 5 minutes
- **SC-009**: Failed GitHub issue creation retries successfully within 1 hour

#### Admin Experience
- **SC-010**: Admin can view and filter feedback within 5 seconds of accessing the management area
- **SC-011**: Team receives notification within 5 minutes of feedback submission

#### Engagement
- **SC-012**: At least 5% of active users submit feedback within the first month of launch (engagement baseline)

## Scope & Boundaries

### In Scope (Phase 1)
- Floating feedback button component with friendly, accessible design
- Feedback modal with simple type selection (non-technical labels)
- Screenshot capture functionality (one-click)
- Feedback submission and storage
- **Automatic GitHub issue creation** for bugs and feature requests
- Admin feedback viewing with GitHub issue links
- Basic team notification

### Out of Scope (Future Phases)
- External integrations (Canny.io, Productboard, Typeform)
- Live chat support integration (Intercom/Crisp)
- Sentiment analysis on feedback
- Public roadmap display
- Mobile app feedback (web app only per user clarification)
- GitHub issue two-way sync (updates from GitHub back to feedback)

## Dependencies

- User authentication system (to identify logged-in users and admins)
- File storage capability (for screenshot attachments)
- Notification system (for team alerts)
- GitHub API access (repository write permissions for issue creation)

## Assumptions

- Feedback button position (bottom-right corner) is acceptable for all page layouts
- Email notifications are the default notification mechanism for team alerts
- Business context is automatically inferred from the logged-in user's active business
- Screenshot captures the visible viewport only, not the full page
- Character limit of 2000 characters is sufficient for feedback messages
- Admin role already exists in the system for access control
- Target GitHub repository for issues is preconfigured by admin
- GitHub API rate limits (5000 requests/hour for authenticated) are sufficient for expected feedback volume
