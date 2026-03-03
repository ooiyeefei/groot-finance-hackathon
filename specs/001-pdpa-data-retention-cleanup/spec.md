# Feature Specification: PDPA Compliance — Data Retention Policy & Automated Cleanup

**Feature Branch**: `001-pdpa-data-retention-cleanup`
**Created**: 2026-03-03
**Status**: Draft
**Input**: GitHub Issue #239 — "PDPA Compliance: Data Retention Policy & Automated Cleanup"
**Legal Context**: Malaysia PDPA 2010, MY Income Tax Act s.82, MY Employment Act s.101A, Singapore PDPA 2012, SG Income Tax Act s.67, SG Employment Act (MOM)
**Jurisdiction Policy**: Where MY and SG requirements differ, the **strictest (longest) retention period** is applied across both jurisdictions.

## Clarifications

### Session 2026-03-03

- Q: Should cleanup operations produce an audit trail for compliance evidence? → A: Yes — cleanup jobs log summary counts per run (e.g., "Deleted 42 conversations, 318 messages") to an internal audit log. Lightweight approach sufficient for PDPA compliance proof.
- Q: Should soft-deleted records follow accelerated or standard retention? → A: Standard retention — soft-deleted records follow the same retention period measured from `deletedAt` timestamp. Uniform rule avoids legal risk for financial records.
- Q: Cross-jurisdiction retention analysis (MY vs SG) — which periods apply? → A: Use the strictest (longest) period across both jurisdictions. Financial records: 7 years (MY s.82 > SG 5 years). Employment records: 7 years (MY s.101A > SG 2+1 years). Chat/audit/export: policy-based (no specific requirement in either jurisdiction). Neither MY nor SG PDPA grants a "right to erasure."
- Q: How should conversation age be determined when a conversation has zero messages? → A: Use the conversation's own creation timestamp as fallback. Empty conversations age from when they were created.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Automated Chat Data Cleanup (Priority: P1)

As the system, I automatically delete chat conversations and messages older than 2 years so that personal data is not retained beyond its useful purpose, complying with PDPA data minimization principles.

**Why this priority**: Chat data accumulates fastest and contains personal/business information. It has the shortest new retention period (2 years), making it the highest-impact cleanup to implement first. No legal requirement mandates longer retention for chat data.

**Independent Test**: Can be fully tested by creating conversations with backdated timestamps, running the cleanup job, and verifying both conversation and associated message records are permanently deleted.

**Acceptance Scenarios**:

1. **Given** a conversation last updated more than 2 years ago with 15 associated messages, **When** the daily cleanup job runs, **Then** the conversation record and all 15 message records are permanently deleted from the database.
2. **Given** a conversation last updated 1 year and 364 days ago, **When** the daily cleanup job runs, **Then** the conversation and its messages remain untouched.
3. **Given** a conversation exactly 2 years old (to the day), **When** the daily cleanup job runs, **Then** the conversation is retained (deletion threshold is strictly "older than 2 years").
4. **Given** 5,000 expired conversations to clean up, **When** the daily cleanup job runs, **Then** all 5,000 conversations and their messages are deleted in batches without timeout or performance degradation.
5. **Given** a conversation created more than 2 years ago with zero messages, **When** the daily cleanup job runs, **Then** the conversation record is deleted (age measured from creation timestamp since no messages exist).

---

### User Story 2 — Automated Export History Cleanup (Priority: P1)

As the system, I automatically delete export history records and their associated download files older than 1 year so that temporary export artifacts do not accumulate indefinitely.

**Why this priority**: Export history already has a partial cleanup mechanism (90-day archive + file deletion), but records themselves persist indefinitely. This story extends the existing pattern to fully delete archived records after 1 year, building on proven infrastructure.

**Independent Test**: Can be fully tested by creating export history records with backdated timestamps (including some with file storage references), running the cleanup job, and verifying records and files are both deleted.

**Acceptance Scenarios**:

1. **Given** an archived export record older than 1 year with no file (already cleaned by existing 90-day archiver), **When** the cleanup job runs, **Then** the record is permanently deleted.
2. **Given** an export record older than 1 year that still has a file storage reference, **When** the cleanup job runs, **Then** both the file and the record are deleted.
3. **Given** an export record that is 11 months old, **When** the cleanup job runs, **Then** the record remains untouched.

---

### User Story 3 — Automated Audit Log Cleanup (Priority: P2)

As the system, I automatically delete audit event records older than 3 years so that compliance logs are retained long enough for regulatory purposes but do not grow unbounded.

**Why this priority**: Audit logs are important for compliance but have a clear 3-year regulatory window. They don't contain files, making cleanup straightforward. Lower priority than chat (2yr) because audit logs accumulate more slowly.

**Independent Test**: Can be fully tested by creating audit event records with backdated timestamps, running the cleanup job, and verifying old records are deleted while recent ones remain.

**Acceptance Scenarios**:

1. **Given** an audit event recorded more than 3 years ago, **When** the daily cleanup job runs, **Then** the audit event record is permanently deleted.
2. **Given** an audit event recorded 2 years and 364 days ago, **When** the daily cleanup job runs, **Then** the record remains untouched.
3. **Given** 10,000 expired audit events to clean up, **When** the daily cleanup job runs, **Then** all records are deleted in batches without timeout.

---

### User Story 4 — Data Retention Policy Document (Priority: P2)

As a business owner or compliance officer, I can reference a formal data retention policy document that describes what data the system retains, for how long, the legal basis for each retention period, and when automated deletion occurs — so that I can demonstrate regulatory compliance during audits.

**Why this priority**: The policy document is a compliance deliverable required for PDPA audit readiness. It does not block the automated cleanup work but must be delivered alongside it.

**Independent Test**: Can be reviewed independently by a compliance officer to verify it covers all data types, cites correct legal references, and matches the actual system behavior.

**Acceptance Scenarios**:

1. **Given** the retention policy document exists, **When** a compliance officer reviews it, **Then** every data type stored by the system is listed with its retention period, legal basis, and deletion method.
2. **Given** the retention policy document exists, **When** compared against actual system behavior, **Then** every automated cleanup job matches the documented retention period.
3. **Given** a new data type is added to the system in the future, **When** the policy is reviewed, **Then** the document includes guidance on how to add new data types to the retention schedule.

---

### User Story 5 — S3 File Cleanup for Expired Records (Priority: P3)

As the system, when deleting records that reference files stored in external storage (S3 bucket), I also delete the associated files so that personal documents (receipts, invoices) are not orphaned in storage after their database records are removed.

**Why this priority**: For the initial implementation (chat, audit, exports), only export history has file references (handled by existing cleanup). S3 file cleanup becomes critical later when 7-year retention records (expense claims, invoices) begin expiring. This story establishes the pattern for future use.

**Independent Test**: Can be tested by creating a record with an associated S3 file reference, running the cleanup after the retention period, and verifying both the database record and the S3 file are deleted.

**Acceptance Scenarios**:

1. **Given** an expired record with a file storage reference (Convex File Storage), **When** the cleanup job runs, **Then** both the database record and the stored file are deleted.
2. **Given** an expired record with an S3 storage path, **When** the cleanup job runs, **Then** both the database record and the S3 object are deleted.
3. **Given** a file deletion fails (S3 temporarily unavailable), **When** the cleanup job encounters the error, **Then** the database record is NOT deleted, and the failure is logged for retry on the next run.
4. **Given** multiple records share the same file path (edge case), **When** one record is deleted, **Then** the file is only deleted when no other records reference it.

---

### Edge Cases

- What happens when a cleanup job encounters more records than can be processed in a single execution window? The job processes records in batches and picks up remaining records on the next scheduled run.
- What happens if the database is temporarily unavailable during a scheduled cleanup? The job fails gracefully and retries on the next scheduled run. No partial deletions occur — each batch is atomic.
- What happens to conversations that are still actively being used but were created over 2 years ago? The retention period is measured from the last activity date (last message timestamp), not the creation date. Active conversations are not deleted.
- What happens to soft-deleted records (those with `deletedAt` set)? Soft-deleted records follow the same retention schedule as active records — the retention period starts from the `deletedAt` timestamp or creation date, whichever is later.
- What if a business is deactivated — are their records deleted sooner? No. Legal retention requirements override business status. Records are retained for their full legal retention period regardless of business status.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST run automated cleanup jobs on a daily schedule during off-peak hours (between 2:00–5:00 AM UTC) to minimize impact on users.
- **FR-002**: System MUST permanently delete chat conversation records and all associated message records when the conversation's last activity is older than 2 years (730 days).
- **FR-003**: System MUST permanently delete export history records (and any associated stored files) older than 1 year (365 days).
- **FR-004**: System MUST permanently delete audit event records older than 3 years (1,095 days).
- **FR-005**: System MUST process deletions in batches to avoid timeout or performance issues, continuing across multiple scheduled runs if the volume exceeds a single execution window.
- **FR-006**: System MUST NOT delete any financial records (expense claims, invoices, sales invoices, accounting entries) before their 7-year legal retention period expires. Legal basis: MY Income Tax Act s.82 (7 years) is stricter than SG IRAS s.67 (5 years); the longer period is applied for cross-jurisdiction compliance.
- **FR-007**: System MUST NOT delete employment records (leave requests, attendance records) before their 7-year retention period expires. Legal basis: MY Employment Act s.101A (7 years) is stricter than SG Employment Act/MOM (2 years current + 1 year post-departure); the longer period is applied.
- **FR-008**: System MUST delete associated stored files (both Convex File Storage and S3 objects) when deleting records that reference them.
- **FR-009**: If file deletion fails, the system MUST NOT delete the corresponding database record and MUST log the failure for retry on the next run.
- **FR-010**: System MUST retain a formal data retention policy document that maps every data type to its retention period, legal basis, and automated deletion schedule.
- **FR-011**: System MUST measure conversation age from the timestamp of the last message (not conversation creation date) to avoid deleting actively used conversations. For conversations with zero messages, the conversation's own creation timestamp is used as fallback.
- **FR-012**: System MUST NOT introduce user-visible changes — all cleanup operations are background system processes invisible to end users.
- **FR-013**: Each cleanup job run MUST log a summary record containing: the data type cleaned, the number of records deleted, the number of associated files deleted (if applicable), and the run timestamp — for compliance audit trail purposes.
- **FR-014**: Soft-deleted records (those with a `deletedAt` timestamp) MUST follow the same retention period as active records, with the retention clock starting from the `deletedAt` timestamp. No accelerated deletion schedule applies.

### Key Entities

- **Conversation**: A chat thread between a user and the AI assistant. Contains metadata and references to a business. Age measured by last message timestamp.
- **Message**: An individual message within a conversation. Always belongs to exactly one conversation. Deleted when its parent conversation expires.
- **Audit Event**: A compliance log entry recording a system or user action. Contains event type, actor, timestamp, and details. Independent entity with no file attachments.
- **Export History**: A record of a data export operation. May reference a downloadable file in Convex File Storage. Age measured from creation date.
- **Retention Schedule**: The mapping of each data type to its legally-required or policy-defined retention period, forming the basis for all automated cleanup.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All chat conversations inactive for over 2 years are automatically deleted within 24 hours of crossing the retention threshold, with zero orphaned messages remaining.
- **SC-002**: All export history records older than 1 year are automatically deleted within 24 hours of crossing the retention threshold, with associated files also removed.
- **SC-003**: All audit event records older than 3 years are automatically deleted within 24 hours of crossing the retention threshold.
- **SC-004**: Zero financial or employment records (expense claims, invoices, sales invoices, accounting entries, leave requests, attendance records) are deleted before their 7-year retention period.
- **SC-005**: The data retention policy document covers 100% of data types stored by the system, with each entry specifying retention period, legal basis, and deletion method.
- **SC-006**: Cleanup jobs complete daily without causing noticeable performance degradation to active users (no increase in response times during cleanup windows).
- **SC-007**: When records with file references are deleted, 100% of associated files are also deleted — zero orphaned files remain in storage.
- **SC-008**: The system handles cleanup of at least 10,000 expired records per job run without timeout or failure.
- **SC-009**: Every cleanup job run produces an audit log entry with deletion counts, enabling compliance officers to verify cleanup activity for any given date.

## Cross-Jurisdiction Retention Schedule

The following table documents the legal basis for each retention period, applying the strictest requirement across Malaysia and Singapore.

| Data Type | MY Requirement | SG Requirement | Applied Period | Basis |
|-----------|---------------|----------------|----------------|-------|
| Expense claims + receipts | 7 years (Income Tax Act s.82) | 5 years (IRAS s.67) | **7 years** | MY (stricter) |
| Sales invoices | 7 years (Income Tax Act s.82) | 5 years (IRAS s.67) | **7 years** | MY (stricter) |
| Accounting entries | 7 years (Income Tax Act s.82) | 5 years (IRAS s.67) | **7 years** | MY (stricter) |
| Supplier invoices | 7 years (Income Tax Act s.82) | 5 years (IRAS s.67) | **7 years** | MY (stricter) |
| Leave/attendance records | 7 years (Employment Act s.101A) | 2 yrs + 1 yr post-departure (MOM) | **7 years** | MY (stricter) |
| Chat conversations | No specific (PDPA s.10: "not longer than necessary") | No specific (PDPA s.25: "cease when no longer necessary") | **2 years** | Policy-based |
| Audit logs | No specific | No specific | **3 years** | Policy-based |
| Export history | No specific | No specific | **1 year** | Policy-based |
| Notifications | No specific | No specific | **90 days** | Already implemented |
| Draft submissions | No specific | No specific | **24 hours** | Already implemented |
| Credit packs | No specific | No specific | **90 days** | Already implemented |
| User accounts | Active + necessary (PDPA s.10) | Active + necessary (PDPA s.25) | **Active + 90 days** | Existing soft-delete |

**Key legal notes**:
- Neither MY PDPA 2010 nor SG PDPA 2012 grants a "right to erasure" (unlike GDPR)
- Both are principles-based: retain only as long as necessary for business/legal purpose
- SG penalties: up to 10% annual turnover or S$1M (whichever higher)
- MY penalties: increased under October 2023 PDPA amendments
- No AI-specific data retention rules in either jurisdiction

## Assumptions

- **A-001**: The existing daily cron scheduling infrastructure in Convex is reliable and will continue to execute jobs at their scheduled times.
- **A-002**: Chat conversation age is best measured by the `_creationTime` of the most recent message in the conversation, as conversations do not have an explicit "last activity" timestamp.
- **A-003**: The existing 90-day notification cleanup and 24-hour draft cleanup jobs do not need modification — they already meet the retention schedule.
- **A-004**: Credit pack expiry (90-day status change to "expired") is sufficient — no hard deletion is needed for credit pack records at this time.
- **A-005**: For the initial implementation, the 7-year retention items (financial/employment records) do not need automated deletion crons since no data in the system is older than 7 years yet. The policy document will specify these periods for future implementation.
- **A-006**: Export history cleanup will handle both the existing 90-day file archival and the new 1-year record deletion as separate jobs that work together.
- **A-007**: Audit event data does not contain file references and requires only database record deletion.
- **A-008**: S3 file deletion for expired records will require coordination between Convex (identifies expired records) and AWS Lambda (performs S3 deletion), following the existing architecture pattern where Convex handles data and Lambda handles AWS operations.

## Dependencies

- **D-001**: Existing Convex cron infrastructure (already operational with 10 active cron jobs).
- **D-002**: Existing Convex File Storage deletion API (already used by export history archiver).
- **D-003**: AWS Lambda with IAM role for S3 file deletion (required for User Story 5 — may need new Lambda function or extension of existing document processor).
- **D-004**: Legal review of retention periods (assumed correct per GitHub issue #239, which cites MY Income Tax Act s.82, SG IRAS s.67, MY Employment Act s.101A).

## Out of Scope

- Automated deletion of 7-year retention records (financial and employment data) — these crons will be implemented when data approaches the 7-year mark.
- User-facing data export or "right to be forgotten" request handling — these are separate PDPA features.
- Modifications to existing cleanup jobs (notifications 90d, drafts 24h, credit packs 90d) — these already meet the retention schedule.
- Data anonymization as an alternative to deletion — out of scope for this iteration.
- Cross-border data transfer compliance — separate PDPA concern.
