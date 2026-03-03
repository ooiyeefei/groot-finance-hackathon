# Feature Specification: PDPA Data Subject Rights & Clerk/Convex Name Sync

**Feature Branch**: `001-pdpa-data-rights`
**Created**: 2026-03-03
**Status**: Complete
**Input**: GitHub Issue #240 — PDPA Compliance: Data Subject Rights & Clerk/Convex Name Sync
**Labels**: bug, enhancement, compliance

## Clarifications

### Session 2026-03-03

- Q: Should the identity-first sync fix also apply when a regular (non-admin) user edits their own name via profile settings? → A: Yes — fix both admin edits AND self-edits. All name changes go through identity provider first.
- Q: Should "Download My Data" export data across all businesses the user belongs to, or only the active business? → A: Export across ALL businesses the user belongs to.
- Q: Which file format should "Download My Data" use? → A: ZIP archive containing separate CSV files per domain (profile, expense claims, accounting entries, payroll), organized by business.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Admin Edits Team Member's Name (Priority: P1)

An admin or business owner edits a team member's name through the team management screen. The name change must propagate to both the identity provider (Clerk) and the business database (Convex) so that the member's displayed name is consistent everywhere — in the app, in Clerk's dashboard, and on any future login.

**Why this priority**: This is a **bug fix**. Currently, admin name edits only update Convex. The identity provider retains the old name, and the next identity sync event overwrites the Convex change — effectively undoing the admin's edit. This creates data integrity issues and a confusing user experience.

**Independent Test**: Can be fully tested by having an admin edit a team member's name, then verifying the name matches in both the identity provider and the app's database within seconds.

**Acceptance Scenarios**:

1. **Given** an admin is viewing the team management page, **When** they edit a member's name from "John Smith" to "Jonathan Smith" and save, **Then** the identity provider profile is updated to "Jonathan Smith" AND the business database reflects "Jonathan Smith" within 5 seconds via the existing webhook sync.

2. **Given** an admin has just edited a member's name, **When** the identity sync webhook fires, **Then** the name in the business database remains "Jonathan Smith" (not reverted to the old name).

3. **Given** an admin attempts to edit a name for a user whose identity provider account has been deactivated, **When** the identity provider rejects the update, **Then** the system shows a clear error message and does NOT update the business database with a name that would be out of sync.

4. **Given** an admin edits their own name via team management (rather than personal profile), **When** they save, **Then** the same identity-first sync applies — identity provider updated first, then webhook syncs to business database.

5. **Given** a regular (non-admin) user edits their own name via profile settings, **When** they save, **Then** the identity provider is updated first and the webhook syncs the change back to the business database — the same identity-first pattern as admin edits.

---

### User Story 2 — Data Subject Rights Compliance Documentation (Priority: P2)

The compliance team needs formal documentation of how Groot Finance fulfills PDPA data subject rights (right of access, correction, and deletion). This documentation covers what capabilities already exist, what gaps remain, and how each right is exercised by users. It serves as both internal reference and audit evidence.

**Why this priority**: PDPA compliance documentation is a regulatory requirement. Most capabilities already exist in the product — this story formalizes them into a single auditable document.

**Independent Test**: Can be verified by reviewing the documentation against PDPA Section 24-26 requirements and confirming each right maps to a specific in-app capability or documented process.

**Acceptance Scenarios**:

1. **Given** a compliance auditor reviews the data subject rights document, **When** they check the Right of Access section, **Then** they find clear documentation of how users can export their own data (existing CSV export engine for accounting, expenses, payroll).

2. **Given** a compliance auditor reviews the Right of Correction section, **When** they check what users can self-edit, **Then** they find documentation of editable fields (currency, timezone, language, notifications) and the process for name/email correction (admin-assisted via team management, now with proper identity sync per User Story 1).

3. **Given** a compliance auditor reviews the Right of Deletion section, **When** they check the deletion process, **Then** they find documentation of the current soft-delete mechanism (anonymization to "Deleted User" on identity account deletion) and the interim manual process (email admin@hellogroot.com) for self-service deletion requests.

---

### User Story 3 — "Download My Data" Button in User Profile (Priority: P3)

Any authenticated user can navigate to their profile settings and click a "Download My Data" button. The system exports the user's personal data across all domains (accounting entries, expense claims, payroll records, profile information) as a downloadable file. This exercises the PDPA Right of Access in a self-service manner.

**Why this priority**: The export engine already exists for admin-level data export. This story adds a user-facing entry point scoped to the individual user's own data. It's lower priority because the current admin-assisted export process is PDPA-compliant — this is a UX improvement.

**Independent Test**: Can be tested by logging in as any user, navigating to profile settings, clicking "Download My Data", and verifying the downloaded file contains only that user's records across all relevant domains.

**Acceptance Scenarios**:

1. **Given** a user is on their profile settings page, **When** they click "Download My Data", **Then** the system generates a data export containing only their personal records (profile info, accounting entries, expense claims, payroll data) and initiates a file download.

2. **Given** a user clicks "Download My Data", **When** the export completes, **Then** the downloaded file does not contain data belonging to other users in the same business.

3. **Given** a user clicks "Download My Data" but they have no records in a particular domain (e.g., no payroll data), **When** the export generates, **Then** that domain section is either empty or omitted — the export still completes successfully.

4. **Given** a user clicks "Download My Data" while another export is already in progress, **When** they attempt the second export, **Then** the system prevents duplicate concurrent exports and informs the user to wait.

---

### User Story 4 — Self-Service Account Deletion Request (Priority: P4 — Future)

A user can navigate to their profile settings and initiate an account deletion request. Since account deletion has irreversible business implications (audit trails, shared business data), this follows a request-and-confirm flow rather than instant deletion.

**Why this priority**: Scoped as a **future enhancement**. The current manual process (emailing admin@hellogroot.com) is PDPA-compliant. Self-service is a UX improvement that requires careful handling of audit trail preservation, business data ownership, and multi-business membership scenarios.

**Independent Test**: Can be tested by a user initiating a deletion request and verifying the request is recorded, the admin is notified, and upon confirmation, the user's identity account is deleted and data anonymized via the existing soft-delete mechanism.

**Acceptance Scenarios**:

1. **Given** a user is on their profile settings page, **When** they click "Delete My Account", **Then** they see a confirmation dialog explaining what happens (data anonymization, loss of access) and must confirm with a typed confirmation phrase.

2. **Given** a user confirms account deletion, **When** the request is submitted, **Then** the business admin is notified and the deletion is either processed automatically after a cooling-off period or requires admin approval (depending on business policy).

---

### Edge Cases

- What happens when an admin edits a name but the identity provider API is temporarily unavailable? The system must fail the entire operation (no partial update to Convex).
- What happens when two admins edit the same user's name simultaneously? Last-write-wins at the identity provider level; the webhook sync ensures eventual consistency in the business database.
- What happens when a user requests data export but their business membership has been revoked? They should still be able to export their personal profile data, but business-scoped data (expenses, accounting) should respect access controls.
- What happens when the identity provider webhook fires during an in-progress name edit? The UI should handle optimistic updates gracefully — the webhook-triggered update should not cause a visible "flicker" if the name is already correct.
- What happens when an admin tries to edit the name of a user who has already been soft-deleted (anonymized)? The system should prevent edits to deleted users.

## Requirements *(mandatory)*

### Functional Requirements

**Name Sync (Bug Fix — P1)**

- **FR-001**: When any user's name is changed — whether by an admin editing a team member or by a user editing their own name — the system MUST update the identity provider (Clerk) profile FIRST, then allow the existing webhook sync to update the business database (Convex). The business database must never be updated without a corresponding identity provider update.
- **FR-002**: The name update operation MUST be atomic from the user's perspective — if the identity provider update fails, no changes are persisted anywhere and the user sees a clear error message.
- **FR-003**: The admin name edit API MUST require admin or owner role permissions, verified server-side.
- **FR-004**: The system MUST apply the identity-first sync pattern to ALL name edit paths: admin editing a team member, admin editing their own name via team management, and any user editing their own name via profile settings.
- **FR-005**: After a successful name update via admin, the identity sync webhook MUST NOT overwrite the newly updated name (this is satisfied by design — the webhook syncs FROM the identity provider, which now has the correct name).

**Compliance Documentation (P2)**

- **FR-006**: The project MUST include a formal data subject rights document covering Right of Access, Right of Correction, and Right of Deletion per PDPA Sections 24-26.
- **FR-007**: The documentation MUST map each right to specific in-app capabilities and describe the user-facing process for exercising each right.
- **FR-008**: The documentation MUST clearly distinguish between capabilities that exist today vs. planned future enhancements (e.g., "Download My Data" button, self-service deletion).

**Download My Data (P3)**

- **FR-009**: The system MUST provide a "Download My Data" button accessible from the user's profile settings page. This is a separate, simplified entry point — the existing reporting/export dashboard wizard remains unchanged.
- **FR-010**: The data export MUST include the user's personal profile information plus accounting entries, expense claims, invoices, and leave records across ALL businesses the user belongs to (not just the currently active business). Data MUST be organized by business for clarity.
- **FR-011**: The data export MUST NOT include data belonging to other users, even if the requesting user is an admin. The export always forces user-scoped filtering regardless of role.
- **FR-012**: The system MUST prevent concurrent duplicate exports for the same user.
- **FR-013**: The export MUST be delivered as a ZIP archive containing separate CSV files per domain (e.g., `profile.csv`, `expense_claims.csv`, `accounting_entries.csv`, `invoices.csv`, `leave_requests.csv`), organized by business when the user belongs to multiple businesses. CSV is chosen for spreadsheet compatibility with non-technical SME users.
- **FR-016**: "Download My Data" MUST reuse the existing domain-level data retrieval functions (per-module record fetching with role-based scoping) and the existing CSV export engine. No new export infrastructure is required.

**Self-Service Deletion (P4 — Future, documentation only)**

- **FR-014**: The documentation MUST describe the current manual deletion process (email admin@hellogroot.com) as the interim Right of Deletion mechanism.
- **FR-015**: Future self-service deletion MUST include a confirmation step with explicit user acknowledgment of irreversible consequences.

### Key Entities

- **User**: Identity (name, email) managed by Clerk; business context (role, preferences, currency) managed in Convex. Clerk is source of truth for identity fields.
- **Business Membership**: Links a user to a business with role permissions (employee, manager, finance admin). A user may belong to multiple businesses. Data exports span all memberships.
- **Data Export**: A user-initiated export of their personal data across all domains and all businesses. Delivered as a ZIP archive of per-domain CSV files. Contains metadata (requested timestamp, status) and the generated ZIP file.
- **Data Subject Rights Document**: Compliance artifact documenting how each PDPA right is fulfilled.

## Assumptions

- Clerk's `updateUser` API is available and supports updating `firstName` and `lastName` fields from the server side.
- The existing Clerk webhook (`user.updated`) will fire after a programmatic `updateUser` call, syncing the change back to Convex automatically.
- The existing export engine (CSV generation) and domain-level data retrieval functions (`getRecordsByModule`, `enrichByModule` in `exportJobs.ts`) can be reused for "Download My Data" with minimal modification — adding user-scoped filtering forced to `ownRecordsOnly` and looping across all business memberships.
- The existing reporting/export dashboard (4-step wizard, templates, schedules, history) is NOT modified by this feature. "Download My Data" is a separate, simpler entry point in profile settings.
- The PDPA compliance documentation is an internal/audit document, not a user-facing privacy policy page.
- Self-service account deletion (P4) is explicitly out of scope for implementation in this feature — only documentation of the current manual process is included.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After an admin edits a team member's name, the name displayed in the app and in the identity provider dashboard match within 10 seconds, with zero data discrepancy.
- **SC-002**: Name edit operations complete successfully on the first attempt 99% of the time (failures due to identity provider downtime are handled gracefully with clear error messaging).
- **SC-003**: The data subject rights document passes compliance review covering all three PDPA rights (access, correction, deletion) with specific in-app capability mappings.
- **SC-004**: Users can initiate and complete a personal data export from their profile settings within 2 minutes (for typical data volumes under 10,000 records).
- **SC-005**: Personal data exports contain 100% of the user's own records and 0% of other users' records (verified by spot-check auditing).
- **SC-006**: Zero support tickets related to "name not updating" or "name reverted" after the name sync fix is deployed.
