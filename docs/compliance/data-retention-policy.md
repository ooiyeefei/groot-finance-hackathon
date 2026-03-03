# Data Retention Policy

**Groot Finance — Financial Co-Pilot for Southeast Asian SMEs**

**Effective Date**: 2026-03-03
**Last Reviewed**: 2026-03-03
**Review Frequency**: Annually or when new data types are introduced
**Jurisdictions**: Malaysia, Singapore

## 1. Purpose

This document defines the data retention periods for all personal and business data stored by Groot Finance. It ensures compliance with:

- **Malaysia**: Personal Data Protection Act 2010 (PDPA), Income Tax Act 1967 (s.82), Employment Act 1955 (s.101A)
- **Singapore**: Personal Data Protection Act 2012 (PDPA), Income Tax Act (s.67), Employment Act (MOM regulations)

**Jurisdiction Policy**: Where Malaysian and Singaporean requirements differ, the **strictest (longest) retention period** is applied across both jurisdictions.

## 2. Retention Schedule

### 2.1 Financial Records — 7 Years

| Data Type | Table | Retention | Legal Basis | Auto-Delete |
|-----------|-------|-----------|-------------|-------------|
| Expense claims + receipts | `expense_claims` | 7 years | MY Income Tax Act s.82 (7yr) > SG IRAS s.67 (5yr) | Not yet (no data >7yr old) |
| Sales invoices | `sales_invoices` | 7 years | MY Income Tax Act s.82 (7yr) > SG IRAS s.67 (5yr) | Not yet |
| Accounting entries | `accounting_entries` | 7 years | MY Income Tax Act s.82 (7yr) > SG IRAS s.67 (5yr) | Not yet |
| Supplier invoices | `invoices` | 7 years | MY Income Tax Act s.82 (7yr) > SG IRAS s.67 (5yr) | Not yet |

**Note**: Automated deletion crons for 7-year records will be implemented when the system's data approaches the 7-year mark. The retention period is measured from the record's creation date.

### 2.2 Employment Records — 7 Years

| Data Type | Table | Retention | Legal Basis | Auto-Delete |
|-----------|-------|-----------|-------------|-------------|
| Leave requests | `leave_requests` | 7 years | MY Employment Act s.101A (7yr) > SG MOM (2yr+1yr) | Not yet |
| Attendance records | `attendance_records` | 7 years | MY Employment Act s.101A (7yr) > SG MOM (2yr+1yr) | Not yet |

### 2.3 Operational Data — Policy-Based Retention

| Data Type | Table | Retention | Basis | Auto-Delete | Cron Schedule |
|-----------|-------|-----------|-------|-------------|---------------|
| Chat conversations | `conversations`, `messages` | 2 years | PDPA data minimization | Yes | Daily 3:30 AM UTC |
| Audit logs | `audit_events` | 3 years | Compliance best practice | Yes | Daily 4:00 AM UTC |
| Export history | `export_history` | 1 year | Reference utility | Yes | Daily 4:30 AM UTC |
| Notifications | `notifications` | 90 days | User utility | Yes | Daily 2:30 AM UTC |
| Draft submissions | `expense_submissions` | 24 hours | Temporary data | Yes | Hourly |
| Credit packs | `credit_packs` | 90 days (expiry) | Usage tracking | Yes (status change) | Daily 3:00 AM UTC |

### 2.4 User Account Data

| Data Type | Table | Retention | Basis | Auto-Delete |
|-----------|-------|-----------|-------|-------------|
| User accounts | `users` | Active + 90 days after deactivation | Service provision | Existing soft-delete |

## 3. Deletion Methods

### 3.1 Hard Delete (Permanent Removal)
Used for: chat conversations, messages, audit events, export history records, notifications, draft submissions.

Records are permanently removed from the database. This is irreversible. Associated files (Convex storage or S3) are deleted before the database record.

### 3.2 Soft Delete (Deactivation)
Used for: user accounts, certain financial records.

Records are marked with a `deletedAt` timestamp. The data remains in the database but is excluded from queries. Soft-deleted records follow the same retention schedule as active records, with the retention clock starting from the `deletedAt` timestamp.

### 3.3 Status Change (Expiry)
Used for: credit packs.

Records are marked as "expired" but not deleted. This preserves the audit trail of usage.

## 4. File Cleanup

When a database record is deleted that references stored files:

1. **Convex File Storage** (`storageId` field): File is deleted via `ctx.storage.delete()` before the database record.
2. **S3 Storage** (`storagePath` field): File deletion requires coordination with AWS Lambda. Currently only applicable to 7-year financial records (future implementation).

**Failure handling**: If file deletion fails, the database record is NOT deleted. The cleanup job logs the failure and retries on the next scheduled run.

## 5. Automated Cleanup Jobs

All cleanup jobs run during off-peak hours (2:00–5:00 AM UTC) to minimize impact on active users.

| Job Name | Schedule | Target Table | Retention | Batch Size |
|----------|----------|--------------|-----------|------------|
| `cleanup-expired-conversations` | Daily 3:30 AM UTC | conversations + messages | 2 years | 500 |
| `cleanup-old-audit-events` | Daily 4:00 AM UTC | audit_events | 3 years | 500 |
| `cleanup-old-export-history` | Daily 4:30 AM UTC | export_history | 1 year | 500 |
| `notification-cleanup` | Daily 2:30 AM UTC | notifications | 90 days | Unlimited |
| `cleanup-empty-draft-submissions` | Hourly | expense_submissions | 24 hours | Unlimited |
| `expire-credit-packs` | Daily 3:00 AM UTC | credit_packs | 90 days | Unlimited |

### 5.1 Audit Trail

Each cleanup job logs a structured summary to the application logs containing:
- Data type cleaned
- Number of records deleted
- Number of associated files deleted (if applicable)
- Run timestamp

These logs serve as compliance evidence that retention policies are being enforced.

## 6. Special Cases

### 6.1 Conversation Age Measurement
Chat conversation age is measured from the **last message timestamp** (`lastMessageAt`), not the conversation creation date. This prevents deletion of old conversations that are still actively used. For conversations with zero messages, the conversation's creation timestamp is used.

### 6.2 Business Deactivation
When a business is deactivated, their data is NOT deleted on an accelerated schedule. Legal retention requirements override business status. All records are retained for their full legal retention period.

### 6.3 Cross-Jurisdiction Compliance
Groot Finance serves businesses in both Malaysia and Singapore. Where retention requirements differ between jurisdictions, the longer period is always applied. This ensures compliance regardless of which country a business is registered in.

## 7. Key Legal References

| Jurisdiction | Statute | Requirement |
|-------------|---------|-------------|
| Malaysia | PDPA 2010, Section 10 (Retention Principle) | Data shall not be kept longer than is necessary for the fulfilment of the purpose |
| Malaysia | Income Tax Act 1967, Section 82 | Accounting records: 7 years from the end of the year of assessment |
| Malaysia | Employment Act 1955, Section 101A | Employment records: 7 years |
| Singapore | PDPA 2012, Section 25 (Retention Limitation) | Cease to retain when no longer necessary for business or legal purpose |
| Singapore | Income Tax Act, Section 67 | Business records: 5 years from the relevant year of assessment |
| Singapore | Employment Act (MOM) | Current employees: 2 years; former: 1 year after departure |

**Neither jurisdiction grants a "right to erasure"** (unlike GDPR). Retention obligations are principles-based, requiring data controllers to justify ongoing retention based on business or legal necessity.

## 8. Adding New Data Types

When a new data type is introduced to the system:

1. **Determine the retention period**: Check if any MY or SG statute specifies a mandatory minimum. If not, apply a policy-based period proportional to the data's utility.
2. **Apply the strictest period**: If both jurisdictions have requirements, use the longer period.
3. **Implement automated cleanup**: Add an `internalMutation` with a daily cron job following the existing batch pattern (500 records per run, off-peak hours).
4. **Update this document**: Add the new data type to the appropriate section of the retention schedule.
5. **Deploy changes**: Run `npx convex deploy --yes` after adding new cron jobs.

## 9. Review and Amendment

This policy is reviewed annually or when:
- New data types are added to the system
- Legal requirements change in Malaysia or Singapore
- The system expands to serve additional jurisdictions
- A data breach or compliance audit identifies gaps

All amendments must be documented with the date and reason for change.
