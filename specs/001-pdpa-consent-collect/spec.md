# Feature Specification: PDPA Consent Collection

**Feature Branch**: `001-pdpa-consent-collect`
**Created**: 2026-03-03
**Status**: Draft
**Input**: GitHub Issue #237 — PDPA Compliance: Consent Collection (Signup, Invitation, Existing Users)
**Labels**: enhancement, compliance

## Clarifications

### Session 2026-03-03

- Q: Should the existing-user consent banner escalate from non-blocking to blocking after a grace period? → A: Yes — non-blocking for a grace period (30 days), then escalates to a blocking overlay that prevents app access until consent is accepted.
- Q: What happens to app access after a user revokes consent? → A: Immediate blocking — revocation instantly shows the blocking overlay, preventing all app access until the user re-consents. Both Malaysia PDPA 2010 and Singapore PDPA 2012 require cessation "as soon as reasonably practicable," which in a SaaS context is immediate.
- Q: Should the revocation flow offer data export before lockout? → A: Yes — the confirmation dialog explains lockout consequences AND provides a link to a self-service "Download My Data" feature in account settings. The export does not block the revocation action.
- Q: Should data export be self-service or email-based? → A: Self-service "Download My Data" in account settings. Required for California CCPA/CPRA compliance (mandates self-service + 45-day SLA + machine-readable format) and Thailand PDPA (requires machine-readable output). Also future-proofs for multi-jurisdiction expansion.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - New User Consent at Onboarding (Priority: P1)

A new user signs up and creates their first business on Groot Finance. During onboarding Step 1 (Business Details), before they can proceed to the next step, they must explicitly consent to the Privacy Policy and personal data processing. The consent checkbox is unchecked by default (opt-in, not opt-out) and blocks progression until accepted. Once accepted, a timestamped consent record is created linking the user, the policy type, the policy version, and the acceptance timestamp.

**Why this priority**: PDPA requires explicit consent before processing personal data. Without this, every new user onboarded is a compliance violation. This is the highest-traffic consent touchpoint and the foundation for all other consent flows.

**Independent Test**: Can be fully tested by creating a new account, going through onboarding, and verifying the consent checkbox appears on Step 1, blocks progression when unchecked, and creates a consent record when accepted.

**Acceptance Scenarios**:

1. **Given** a new user is on onboarding Step 1 (Business Details), **When** the step loads, **Then** a consent checkbox is displayed below the business fields, unchecked by default, with text linking to the Privacy Policy.
2. **Given** a new user has not checked the consent checkbox, **When** they attempt to click "Next", **Then** progression is blocked and a validation message is shown.
3. **Given** a new user checks the consent checkbox, **When** they click "Next", **Then** a consent record is created with the user ID, policy type ("privacy_policy"), current policy version, and acceptance timestamp.
4. **Given** a new user has accepted the consent, **When** they complete onboarding and log in later, **Then** they are not prompted again for the same policy version.

---

### User Story 2 - Existing User Consent Banner (Priority: P2)

An existing user who signed up before PDPA consent collection was implemented logs into their dashboard. They see a persistent, non-blocking banner at the top of the dashboard informing them of the updated Privacy Policy and asking them to review and accept. The banner remains visible on every page until the user clicks "Accept". Once accepted, the banner is permanently dismissed and a consent record is created. If the user does not accept within a 30-day grace period, the banner escalates to a blocking overlay that prevents access to the application until consent is provided.

**Why this priority**: This addresses the compliance gap for the existing user base. The grace period balances user experience (no immediate disruption) with compliance enforcement (guaranteed eventual consent). The 30-day window aligns with SC-003's adoption target.

**Independent Test**: Can be fully tested by logging in as an existing user without a consent record and verifying the banner appears, persists across page navigation, disappears after acceptance, and creates a consent record. Escalation can be tested by simulating a user past the grace period.

**Acceptance Scenarios**:

1. **Given** an existing user without a consent record for the current policy version, **When** they navigate to any dashboard page within the 30-day grace period, **Then** a persistent but non-blocking banner is displayed at the top of the page.
2. **Given** the consent banner is displayed, **When** the user navigates to different pages, **Then** the banner remains visible on every page.
3. **Given** the consent banner is displayed, **When** the user clicks "Review & Accept", **Then** a consent record is created and the banner is permanently dismissed.
4. **Given** an existing user has already accepted the current policy version, **When** they log in, **Then** no consent banner is displayed.
5. **Given** an existing user has not accepted consent and the 30-day grace period has elapsed, **When** they navigate to any page, **Then** a blocking overlay is displayed that prevents access until consent is accepted.

---

### User Story 3 - Invited User Consent at Acceptance (Priority: P2)

A user receives a team invitation to join an existing business on Groot Finance. When they click the invitation link and proceed to accept, they are shown a consent checkbox before membership is activated. The consent must be accepted before the invitation can be completed. A consent record is created upon acceptance.

**Why this priority**: Invited users are a secondary onboarding path. PDPA consent must be collected before any personal data processing begins, which includes activating a team membership. This shares priority with P2 since invited users are a smaller volume than new signups but equally require consent.

**Independent Test**: Can be fully tested by sending an invitation, clicking the acceptance link, and verifying the consent checkbox appears before the "Accept Invitation" action, blocks acceptance when unchecked, and creates a consent record when accepted.

**Acceptance Scenarios**:

1. **Given** a user clicks an invitation acceptance link and is signed in, **When** the acceptance page loads, **Then** a consent checkbox is displayed before the "Accept Invitation" button.
2. **Given** an invited user has not checked the consent checkbox, **When** they attempt to accept the invitation, **Then** acceptance is blocked and a validation message is shown.
3. **Given** an invited user checks the consent checkbox and accepts, **When** the invitation is processed, **Then** a consent record is created before the team membership is activated.
4. **Given** an invited user who already has a valid consent record for the current policy version, **When** they accept an invitation, **Then** no additional consent checkbox is shown (consent is already on file).

---

### User Story 4 - Policy Version Update Re-Consent (Priority: P3)

When the Privacy Policy is updated to a new version, all users — including those who previously consented — must re-consent to the updated policy. The system detects that the user's most recent consent record is for an older policy version and triggers the consent banner for existing users. New users and invited users automatically see the latest version during their respective flows.

**Why this priority**: This is a future-proofing concern. The initial implementation only has one policy version, but the architecture must support version changes from day one to avoid a rebuild later. The existing user banner (P2) naturally handles this if the version check is built correctly.

**Independent Test**: Can be tested by changing the current policy version identifier and verifying that previously-consented users see the consent banner again.

**Acceptance Scenarios**:

1. **Given** a user previously consented to policy version "2026-01-15", **When** the current policy version is updated to "2026-06-01", **Then** the consent banner reappears on their dashboard.
2. **Given** a user re-consents to the new policy version, **When** the consent is recorded, **Then** both the old and new consent records are preserved (not overwritten).
3. **Given** the policy version is updated, **When** a new user goes through onboarding, **Then** the consent references the latest policy version.

---

### User Story 5 - Consent Revocation (Priority: P3)

A user can revoke their consent to the Privacy Policy. Revocation marks the existing consent record with a revocation timestamp but does not delete the record (for audit purposes). Upon revocation, the user is immediately shown a blocking overlay preventing all app access until they re-consent. This satisfies both Malaysia PDPA 2010 and Singapore PDPA 2012 requirements that data processing cease "as soon as reasonably practicable" upon withdrawal.

**Why this priority**: PDPA grants individuals the right to withdraw consent. While lower priority for MVP, the data model must support revocation from the start. The actual revocation UI can be minimal (e.g., a link in account settings), but the immediate blocking behavior must be built into the consent check infrastructure.

**Independent Test**: Can be tested by revoking consent via account settings and verifying the consent record is marked as revoked, the blocking overlay appears immediately, and the user can re-consent to restore access.

**Acceptance Scenarios**:

1. **Given** a user has an active consent record, **When** they revoke consent, **Then** the consent record is updated with a revocation timestamp (not deleted).
2. **Given** a user has revoked consent, **When** they attempt to navigate to any page, **Then** a blocking overlay is displayed preventing all app access until re-consent.
3. **Given** a user revokes and then re-accepts consent, **When** the new consent is recorded, **Then** both the revoked record and the new acceptance record exist (full audit trail), and app access is restored.
4. **Given** a user is about to revoke consent, **When** they initiate revocation, **Then** a confirmation dialog explains the consequences (immediate loss of app access) and provides a link to request a data export before confirming.
5. **Given** a user sees the revocation confirmation dialog, **When** they click the data export link, **Then** they are directed to a data export request flow without the revocation being processed yet.
6. **Given** a user sees the revocation confirmation dialog, **When** they confirm revocation without exporting data, **Then** the revocation proceeds immediately (data export is optional, not mandatory).

---

### User Story 6 - Self-Service Personal Data Export (Priority: P3)

Any user (regardless of role) can access a "Download My Data" feature in their account settings. This generates a machine-readable export (JSON) of all personal data the system holds about them, including: user profile, consent history, activity metadata, and any personal data processed by the application. The export is generated on-demand and available for download directly in the browser. This is separate from the business data export in `/reporting` (which exports financial records and is restricted to owner/manager roles).

**Why this priority**: PDPA (Malaysia, Singapore, Thailand) grants individuals the right to access their personal data. California CCPA/CPRA mandates self-service access with a 45-day response SLA and machine-readable format. Building self-service from the start avoids retrofitting when expanding to US/global markets. The revocation confirmation dialog links to this feature so users can export their data before revoking consent.

**Independent Test**: Can be fully tested by navigating to account settings, clicking "Download My Data", and verifying a JSON file is generated containing the user's personal data, consent records, and activity history.

**Acceptance Scenarios**:

1. **Given** any authenticated user (employee, manager, or owner), **When** they navigate to account settings, **Then** a "Download My Data" option is available.
2. **Given** a user clicks "Download My Data", **When** the export is generated, **Then** a JSON file is downloaded containing their personal profile, consent history, and activity metadata.
3. **Given** a user initiates a data export, **When** the export completes, **Then** the file is in a structured, machine-readable format (JSON) that allows transfer to another service.
4. **Given** a user is on the revocation confirmation dialog, **When** they click the data export link, **Then** they are navigated to the "Download My Data" section in account settings.
5. **Given** a user has no business data (e.g., new user with only a profile), **When** they request a data export, **Then** the export still completes successfully with the available personal data.

---



- **Mid-onboarding interruption**: If a user clears cookies/storage mid-onboarding and returns, the consent state persists because consent is recorded server-side, not in client storage.
- **Multiple business invitations**: A user invited to multiple businesses needs to consent only once per policy version. Consent is user-level, not business-level.
- **Privacy Policy page unreachable**: The consent checkbox remains functional even if the linked Privacy Policy page is temporarily down. The link opens in a new tab and is informational — acceptance is not gated on loading the external page.
- **SSO signup (Google/Apple)**: SSO users still go through the onboarding wizard after Clerk authentication. Consent is collected at onboarding Step 1, not at the Clerk signup screen.
- **Network failure during consent submission**: If the "Accept" action fails due to a network error, a user-friendly error message is shown and the banner/checkbox remains. The user can retry.
- **Concurrent sessions**: If a user accepts consent in one browser tab, other open tabs should reflect the updated consent status on their next navigation or data refresh.
- **Large data export**: If a user has extensive activity history, the personal data export should still complete within a reasonable time. The export generates a single JSON file — if the file exceeds browser download limits, an error message is shown suggesting the user contact support.
- **Data export after revocation**: Once a user revokes consent and is blocked, they can no longer access the "Download My Data" feature (since the app is blocked). They must re-consent first, or contact `privacy@hellogroot.com` for a manual export request.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST present an unchecked consent checkbox during business onboarding (Step 1) that blocks progression until accepted.
- **FR-002**: System MUST record each consent action with: user identifier, policy type, policy version, acceptance timestamp, and optionally the user's IP address.
- **FR-003**: System MUST present a consent checkbox during invitation acceptance that blocks membership activation until accepted.
- **FR-004**: System MUST display a persistent, non-blocking banner on all dashboard pages for users who have not consented to the current policy version, during a 30-day grace period from deployment (or from the user's first login after a policy version change).
- **FR-005**: System MUST dismiss the consent banner permanently (for the current policy version) once the user accepts.
- **FR-012**: System MUST escalate the consent banner to a blocking overlay after the 30-day grace period, preventing application access until consent is accepted.
- **FR-006**: System MUST support multiple policy versions and detect when a user's most recent consent is for an older version.
- **FR-007**: System MUST preserve all consent records (including revoked ones) as an immutable audit trail — records are never deleted or overwritten.
- **FR-008**: System MUST allow users to revoke their consent, marking the record with a revocation timestamp and immediately blocking app access until re-consent is provided.
- **FR-013**: System MUST show a confirmation dialog before processing consent revocation, explaining the consequence (immediate loss of app access) and providing a link to request a data export.
- **FR-014**: The data export link in the revocation confirmation MUST NOT block the revocation action — export is optional.
- **FR-015**: System MUST provide a self-service "Download My Data" feature accessible to all authenticated users (any role) in account settings.
- **FR-016**: The personal data export MUST be in a structured, machine-readable format (JSON) that allows transfer to another service, satisfying Thailand PDPA and California CCPA/CPRA requirements.
- **FR-017**: The personal data export MUST include: user profile information, consent history (all records), and activity metadata. Business financial data (expenses, invoices) is excluded — that is available via the existing `/reporting` Export tab for authorized roles.
- **FR-018**: The revocation confirmation dialog MUST link directly to the "Download My Data" feature in account settings.
- **FR-009**: System MUST skip the consent checkbox for invited users who already have a valid consent record for the current policy version.
- **FR-010**: Consent checkbox text MUST link to the publicly hosted Privacy Policy page and clearly state that the user consents to personal data processing.
- **FR-011**: The consent checkbox MUST be unchecked by default (opt-in, not opt-out) in all entry points (onboarding, invitation).

### Key Entities

- **Consent Record**: Represents a single consent action by a user. Attributes: user reference, optional business reference, policy type (privacy_policy or terms_of_service), policy version (date-based string like "2026-01-15"), acceptance timestamp, optional IP address, optional revocation timestamp. A user may have multiple consent records across different policy versions and types. Records are append-only — never deleted or modified (except to add a revocation timestamp).
- **Policy Version**: A date-based identifier (e.g., "2026-01-15") representing a specific version of a privacy policy or terms of service document. The "current" version is a system-level configuration that all consent checks validate against.
- **User**: The existing user entity. Extended with a derived consent status (consented/not-consented) determined by querying consent records for the current policy version and checking that no revocation exists.
- **Personal Data Export**: A point-in-time snapshot of all personal data held about a user, generated on-demand. Includes: user profile (name, email, preferences), consent records (all versions, including revoked), and activity metadata (login history, actions taken). Excludes business financial data (available separately via `/reporting`). Output format: structured JSON.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of new users who complete onboarding have a consent record created before accessing the application.
- **SC-002**: The consent checkbox adds no more than 5 seconds to the onboarding flow (single checkbox, no additional page or step).
- **SC-003**: Within 30 days of deployment, at least 80% of existing active users have accepted the current privacy policy via the consent banner.
- **SC-004**: Consent records provide a complete audit trail — every acceptance and revocation is timestamped and preserved, with zero records deleted or overwritten.
- **SC-005**: When the policy version is updated, 100% of users without a matching consent record see the consent prompt within their next session.
- **SC-006**: Invited users cannot activate team membership without a valid consent record for the current policy version.
- **SC-007**: Any authenticated user can generate and download a personal data export within 30 seconds (on-demand, no waiting for email delivery).
- **SC-008**: Personal data exports are in machine-readable JSON format, satisfying CCPA/CPRA and Thailand PDPA portability requirements.

## Assumptions

- **Jurisdictional standard**: This feature applies the strictest requirements across Malaysia PDPA 2010, Singapore PDPA 2012, Thailand PDPA 2019, and California CCPA/CPRA, since Groot Finance serves Southeast Asian SMEs and may expand globally. Key implications: immediate cessation upon consent withdrawal, opt-in only (no pre-ticked boxes), consent records retained for audit/legal purposes, confirmation with consequences before revocation, self-service personal data export in machine-readable format (JSON).
- The initial policy version will be "2026-01-15" (as specified in the issue). Future versions will follow the same date-based format.
- The Privacy Policy is hosted externally at `https://hellogroot.com/privacy` and is always accessible. The system does not host or version-control the policy document itself — only tracks consent to specific versions.
- Consent is user-level, not business-level. A user who consents once does not need to re-consent when joining additional businesses (unless the policy version changes).
- The consent banner for existing users is non-blocking during a 30-day grace period. After the grace period, it escalates to a blocking overlay (similar to the subscription lock overlay) that prevents app access until consent is accepted.
- IP address collection is optional and best-effort. If not available (e.g., server-side rendering context), the consent record is still valid without it.
- Terms of Service consent can use the same infrastructure but is out of scope for the initial implementation. The data model supports it for future use.
- The consent checkbox text will be: "I agree to the Privacy Policy and consent to processing of my personal data as described" with "Privacy Policy" linked to `https://hellogroot.com/privacy`.

## Dependencies

- **External**: Privacy Policy page at `https://hellogroot.com/privacy` must be live and accessible before deployment.
- **Existing**: Clerk authentication (user identity), Convex database (consent storage), onboarding wizard, invitation acceptance flow, dashboard layout.
- **GitHub Issue**: #237 (grootdev-ai/groot-finance)
