# Data Subject Rights — Groot Finance

**Last Updated**: 2026-03-03
**Status**: Active
**Applicable Regulation**: PDPA (Personal Data Protection Act) — Malaysia PDPA 2010, Thailand PDPA B.E. 2562
**Document Type**: Internal compliance reference / audit evidence

## Overview

This document describes how Groot Finance fulfills the three core data subject rights required under PDPA:

1. **Right of Access** (Section 24) — Data subjects may request access to their personal data
2. **Right of Correction** (Section 25) — Data subjects may request correction of inaccurate data
3. **Right of Deletion** (Section 26) — Data subjects may request deletion of their personal data

## Architecture: Source of Truth

| Data Category | System | Description |
|--------------|--------|-------------|
| **Identity** (name, email, authentication) | Clerk | Identity provider — single source of truth for user identity |
| **Business Context** (role, preferences, currency, membership) | Convex | Real-time document database — business data and operational state |
| **Financial Records** (expenses, invoices, accounting, leave) | Convex | Per-business, role-scoped data |

**Sync mechanism**: Clerk webhooks (`user.created`, `user.updated`, `user.deleted`) automatically sync identity changes to Convex.

---

## Right of Access (Section 24)

**Requirement**: Users must be able to access and obtain a copy of their personal data held by the organization.

### Implemented Today

| Capability | Access Method | User Roles | Status |
|-----------|--------------|------------|--------|
| **Export Reporting Dashboard** | Reporting page → Export tab (4-step wizard) | Owner, Manager | Live |
| **Module-based CSV Export** | Select module (Expense, Invoice, Leave, Accounting) → Template → Filters → Download | Owner, Manager | Live |
| **Role-scoped Data** | Employees see only their own records; Managers see their team; Admins see all | All roles | Live |
| **23 Pre-built Templates** | SQL Payroll, Xero, QuickBooks, BrioHR, Kakitangan, Generic, Master Accounting | Owner, Manager | Live |
| **Scheduled Exports** | Daily/weekly/monthly automated exports | Owner, Finance Admin | Live |
| **Export History** | View past exports with status and record counts | Owner, Manager | Live |

### User-Facing Process

1. Navigate to **Reporting** page
2. Select the **Export** tab
3. Choose a data module (Expense, Invoice, Leave, or Accounting)
4. Select a template format
5. Apply date range and status filters
6. Preview data, then click **Export** to download CSV

### Planned Enhancement

| Capability | Description | Status |
|-----------|-------------|--------|
| **"Download My Data" Button** | One-click personal data export from Profile Settings — exports all modules across all businesses as a ZIP of CSVs | Planned |

---

## Right of Correction (Section 25)

**Requirement**: Users must be able to request correction of inaccurate, incomplete, or outdated personal data.

### Implemented Today

| Data Field | How to Correct | Who Can Edit | Status |
|-----------|---------------|--------------|--------|
| **Preferred Currency** | Profile Settings → Currency dropdown | User (self) | Live |
| **Timezone** | Profile Settings → Timezone selector | User (self) | Live |
| **Language Preference** | Profile Settings → Language selector | User (self) | Live |
| **Notification Preferences** | Profile Settings → Notification toggles | User (self) | Live |
| **Email Preferences** | Profile Settings → Email subscription toggles | User (self) | Live |
| **Full Name** | Team Management (admin edits) OR Profile Settings (self-edit) → Syncs to Clerk identity provider first, then webhooks sync to business database | Admin/Owner (team), User (self) | Live (identity-first sync) |
| **Email Address** | Must be changed via Clerk identity provider dashboard (security-sensitive) | User (via Clerk) | Live |

### Architecture Decision: Identity-First Sync

Name changes follow the **identity-first pattern**:

1. Name updated in Clerk (identity provider) via API
2. Clerk fires `user.updated` webhook
3. Webhook handler syncs new name to Convex (business database)
4. Real-time subscription updates the UI

This ensures the identity provider always remains the source of truth, preventing data inconsistency between systems.

### User-Facing Process

**For name correction:**
- **Self-service**: Edit own name in Profile Settings
- **Admin-assisted**: Admin edits team member's name in Team Management

**For email correction:**
- Change email via Clerk account settings (security-sensitive — requires email verification)

---

## Right of Deletion (Section 26)

**Requirement**: Users must be able to request deletion or anonymization of their personal data, subject to legal retention requirements.

### Implemented Today

| Mechanism | How It Works | Trigger | Status |
|----------|-------------|---------|--------|
| **Soft Delete (Anonymization)** | User's identity fields anonymized: email → `deleted_{id}@deleted.local`, fullName → `Deleted User`. Business records preserved for audit trail. | Clerk account deletion triggers `user.deleted` webhook | Live |
| **Manual Deletion Request** | User emails `admin@hellogroot.com` to request account deletion | User-initiated email | Live (PDPA compliant) |

### What Happens on Deletion

1. User's Clerk account is deleted (by admin or self-service in Clerk dashboard)
2. Clerk fires `user.deleted` webhook
3. Webhook handler runs `softDeleteUser` mutation:
   - `clerkUserId` → cleared
   - `email` → `deleted_{clerkUserId}@deleted.local`
   - `fullName` → `Deleted User`
4. Business records (expenses, invoices, accounting entries) are **preserved** with anonymized user reference for financial audit compliance
5. Business memberships remain linked but identity is anonymized

### Data Retention Rationale

Financial records are retained after user deletion because:
- Accounting regulations require retention of financial records (typically 7 years)
- Audit trails must remain intact for compliance
- Records reference the anonymized user, not identifiable personal data

### Planned Enhancement

| Capability | Description | Status |
|-----------|-------------|--------|
| **Self-Service "Delete My Account" Button** | In-app account deletion with confirmation dialog, cooling-off period, and admin notification | Future |

---

## Capability Matrix

| PDPA Right | In-App Feature | User Process | Status |
|-----------|---------------|-------------|--------|
| Access — View own data | Reporting dashboard export | Navigate to Reporting → Export tab | Live |
| Access — Download own data | Module-based CSV export | Select module → Template → Filters → Download | Live |
| Access — One-click export | "Download My Data" in Profile Settings | Click button → ZIP download | Planned |
| Correction — Name | Profile Settings / Team Management | Edit name → Saves via identity-first sync | Live |
| Correction — Email | Clerk identity provider | Change via Clerk account settings | Live |
| Correction — Preferences | Profile Settings | Edit currency/timezone/language/notifications | Live |
| Deletion — Account | Manual email request | Email admin@hellogroot.com | Live |
| Deletion — Self-service | "Delete My Account" button | Future in-app button with confirmation | Future |

---

## Contact

For data subject rights requests, contact: **admin@hellogroot.com**
