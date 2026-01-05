# Feature Specification: Error Logging & Monitoring (Sentry Integration)

**Feature Branch**: `003-sentry-integration`
**Created**: 2026-01-04
**Status**: Draft
**GitHub Issue**: [#82](https://github.com/grootdev-ai/finanseal-mvp/issues/82)
**Priority**: P0 - Launch Blocker | **WINNING Score**: 50/60

## Clarifications

### Session 2026-01-04

- Q: Which messaging platform should be the primary target for error alerts? → A: Telegram
- Q: What sampling rate should be used for performance traces? → A: 10%
- Q: Should background job failures trigger the same alerting pipeline as app errors? → A: Yes (same email + Telegram alerts)

## Overview

FinanSEAL currently relies solely on `console.log` statements for debugging. This creates blind spots in production where errors go unnoticed until users report them. This feature introduces comprehensive error tracking, performance monitoring, and team alerting to catch and resolve issues proactively.

**Problem Statement**:
1. **No Error Visibility**: Errors only visible in Vercel logs (requires manual checking)
2. **No Alerting**: Team not notified when errors occur
3. **No User Context**: Cannot reproduce issues without session data
4. **No Performance Monitoring**: No visibility into slow operations or frontend performance

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Team Receives Error Alerts (Priority: P1)

As a FinanSEAL team member, I want to be notified immediately when users encounter errors so I can investigate and fix issues before they impact more users.

**Why this priority**: Without alerting, the team operates blind - users suffer from bugs while the team remains unaware. This is foundational to all other monitoring capabilities.

**Independent Test**: Can be fully tested by intentionally triggering an error in production and verifying that the designated notification channel (email initially, messaging apps later) receives the alert within minutes.

**Acceptance Scenarios**:

1. **Given** an unhandled exception occurs in the application, **When** the error is captured, **Then** the team receives a notification within 5 minutes containing error type, message, and affected page.
2. **Given** a user encounters an error, **When** the error report is viewed, **Then** the report includes the user's business context (business_id, user role) if authenticated.
3. **Given** multiple identical errors occur, **When** viewing alerts, **Then** errors are grouped together to prevent alert fatigue.

---

### User Story 2 - Developer Investigates Production Errors (Priority: P1)

As a developer, I want to see detailed error reports with readable stack traces and user context so I can quickly identify the root cause and fix issues.

**Why this priority**: Capturing errors is useless without actionable debugging information. Source maps and context make the difference between a 5-minute fix and hours of guesswork.

**Independent Test**: Can be fully tested by triggering a known error and verifying the error report shows: readable stack trace with original source code lines, user information, and browser/device details.

**Acceptance Scenarios**:

1. **Given** an error is captured in production, **When** a developer views the error report, **Then** the stack trace shows original TypeScript/JavaScript line numbers and file names (not minified code).
2. **Given** an authenticated user triggers an error, **When** viewing the error report, **Then** it shows the user_id, business_id, and any custom tags relevant to the error domain.
3. **Given** sensitive data (passwords, tokens, PII) is present in request headers or body, **When** the error is captured, **Then** sensitive fields are automatically redacted from the report.

---

### User Story 3 - Monitor Application Performance (Priority: P2)

As a product owner, I want visibility into application performance (slow pages, slow API calls) so I can prioritize optimization efforts based on real user impact.

**Why this priority**: Performance issues degrade user experience but don't generate error alerts. This enables proactive optimization before users complain.

**Independent Test**: Can be fully tested by navigating through the application and verifying that page load times and API response times are visible in a monitoring dashboard.

**Acceptance Scenarios**:

1. **Given** a user loads a page, **When** viewing performance data, **Then** the page load time and Core Web Vitals (LCP, FID, CLS) are recorded.
2. **Given** an API call takes longer than expected, **When** reviewing performance traces, **Then** slow API endpoints are identifiable with response time distributions.
3. **Given** a background job runs, **When** viewing monitoring data, **Then** the job duration and success/failure status are tracked.

---

### User Story 4 - Forward Alerts to Messaging Platforms (Priority: P3)

As a team lead, I want error alerts forwarded to our team messaging platform (Telegram, WhatsApp, or Slack) so the team can respond quickly without checking email.

**Why this priority**: While email alerts provide baseline notification, messaging platforms enable faster team response. This can be implemented incrementally after core monitoring is working.

**Independent Test**: Can be fully tested by triggering an error and verifying the configured messaging platform receives the alert with relevant error summary.

**Acceptance Scenarios**:

1. **Given** a critical error occurs, **When** the alert is processed, **Then** the configured messaging channel receives a notification with error summary, affected user count, and link to full details.
2. **Given** the messaging integration is configured, **When** viewing alert settings, **Then** the team can enable/disable specific alert types per channel.
3. **Given** an error threshold is exceeded (e.g., >10 errors/hour for same issue), **When** threshold is breached, **Then** an escalation alert is sent to the messaging platform.

---

### Edge Cases

- What happens when the monitoring service itself is unavailable? System should continue functioning normally with graceful degradation (errors logged locally, alerts queued).
- How does the system handle high error volumes (error storms)? Rate limiting and grouping should prevent alert flooding and service degradation.
- What happens when an error contains extremely large payloads? Payloads should be truncated to prevent quota exhaustion.
- How are errors handled during the brief window before user authentication? Errors should still be captured with available context (IP, browser, page).

## Requirements *(mandatory)*

### Functional Requirements

**Error Tracking (P0)**
- **FR-001**: System MUST capture all unhandled exceptions in both client-side and server-side code.
- **FR-002**: System MUST upload source maps to enable readable stack traces in production error reports.
- **FR-003**: System MUST provide error boundaries to gracefully handle React component failures without crashing the entire application.
- **FR-004**: System MUST include user context (user_id, business_id) in error reports when the user is authenticated.
- **FR-005**: System MUST automatically redact sensitive data (Authorization headers, tokens, passwords, credit card numbers) from error reports.

**Alerting (P0)**
- **FR-006**: System MUST send error notifications to team email addresses for all unhandled exceptions.
- **FR-007**: System MUST group identical errors to prevent notification spam.
- **FR-008**: System MUST support configurable alert rules (e.g., alert only on first occurrence, or when error count exceeds threshold).

**Performance Monitoring (P1)**
- **FR-009**: System MUST track page load performance metrics (Core Web Vitals: LCP, FID/INP, CLS) with 10% sampling rate to balance data quality with quota conservation.
- **FR-010**: System MUST trace API request performance with response time distributions.
- **FR-011**: System MUST track background job execution times and failure rates; job failures MUST trigger the same alerting pipeline (email + Telegram) as application errors.

**Messaging Platform Integration (P2)**
- **FR-012**: System MUST support webhook-based alerting to enable custom integrations with messaging platforms.
- **FR-013**: System SHOULD provide ready-to-use integration with Telegram as the primary messaging platform.
- **FR-014**: System MUST allow filtering which alert types are sent to messaging platforms.

### Key Entities

- **Error Event**: Represents a captured error with stack trace, user context, tags, and metadata.
- **Performance Transaction**: Represents a traced operation (page load, API call, background job) with timing data.
- **Alert Rule**: Configuration defining when and how to notify the team about errors.
- **Alert Channel**: A destination for notifications (email, webhook, messaging platform).

## Assumptions

- The team is willing to use Sentry's free Developer tier initially, accepting the 1-user dashboard access limitation. Team alerting via webhooks to messaging platforms can still work with multiple recipients.
- Vercel deployment will be used, which has built-in Sentry integration support for automatic source map uploads.
- For messaging integrations beyond email, a webhook approach will be used (custom endpoint that forwards to Telegram/Slack/WhatsApp) since native integrations require paid Sentry plans.
- Error volume will stay within free tier limits (~5K errors/month) during initial launch period.
- Telegram is the primary messaging platform for error alerts (simple bot API, no user limits, instant setup).
- The monitoring solution is portable across job execution platforms; future migration from Trigger.dev to Lambda/Step Functions requires only SDK swap, not alerting reconfiguration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of unhandled exceptions in production are captured and visible in the monitoring dashboard within 1 minute of occurrence.
- **SC-002**: Team members receive error notifications within 5 minutes of a new error type occurring.
- **SC-003**: Error reports include readable source code references (not minified code) in 100% of captured errors.
- **SC-004**: Mean time to awareness (MTTA) for production errors decreases from "whenever user reports" to under 10 minutes.
- **SC-005**: Developers can identify error root cause from the error report alone in 80% of cases (without additional log diving).
- **SC-006**: No sensitive user data (passwords, tokens, PII) appears in any error reports (verified via audit).
- **SC-007**: Page performance metrics are available for all primary user flows (dashboard, invoice upload, expense claims).

## Out of Scope

- Real-time user session replay (can be added later, increases quota usage significantly)
- Custom error dashboards beyond what the monitoring service provides
- Automated error resolution or self-healing systems
- Integration with incident management tools (PagerDuty, OpsGenie)
- Log aggregation from infrastructure (Vercel, database) - this focuses on application-level monitoring

## Dependencies

- Vercel deployment (for source map integration)
- Clerk authentication (for user context enrichment)
- Background job system (Trigger.dev) for job monitoring integration

## Security Considerations

- All error reports must have PII automatically scrubbed before transmission
- API keys and DSN values must be stored as environment variables, not in code
- Webhook endpoints for messaging integrations must validate incoming requests
- Error data retention should comply with data protection requirements (default 90 days)
