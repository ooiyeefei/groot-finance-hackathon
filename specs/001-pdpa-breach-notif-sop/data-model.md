# Data Model: PDPA Breach Notification SOP

**Feature Branch**: `001-pdpa-breach-notif-sop`
**Date**: 2026-03-03

> This feature produces a documentation deliverable (Markdown SOP), not application code. The "data model" describes the **SOP document structure** and the **GitHub Issues incident register schema**.

## SOP Document Structure

The deliverable is a single Markdown file at `docs/compliance/breach-notification-sop.md` with the following section hierarchy. Each section maps to one or more functional requirements (FR).

```text
docs/compliance/breach-notification-sop.md
│
├── 1. Document Control                          [FR-020]
│   ├── Version number, last reviewed, next review, approved by
│   └── Change log table
│
├── 2. Purpose & Scope                           [FR-002]
│   ├── Legal basis (MY PDPA Section 12B, SG PDPA Part VIA)
│   ├── Definition of "data breach" (aligned to SG Section 26A)
│   ├── Applicability (Groot Finance as controller + intermediary)
│   └── Out of scope
│
├── 3. Definitions & Glossary                    [FR-002]
│   ├── Incident vs Data Breach vs Notifiable Data Breach
│   ├── Data Controller vs Data Intermediary
│   ├── Prescribed Personal Data (SG's 7 categories)
│   └── Significant Harm
│
├── 4. Incident Response Team                    [FR-010, FR-011]
│   ├── Roles table (IC, Tech Lead, Communications, Legal)
│   │   ├── Primary + Alternate for each role
│   │   └── Responsibilities per role
│   ├── Escalation procedures
│   │   ├── Chain of command
│   │   ├── Maximum escalation time (30 min)
│   │   └── Out-of-hours contacts
│   └── Activation criteria (when to assemble the IRT)
│
├── 5. Detection Mechanisms                      [FR-012]
│   └── Table: mechanism, status, alert channel, detection scope
│       ├── CloudWatch Alarms (Active)
│       ├── Sentry (Active)
│       ├── Clerk (Active, suspicious activity not configured)
│       ├── AWS GuardDuty (Not configured)
│       ├── User Reports (Active)
│       ├── Audit Logging (Active)
│       └── Gaps & planned improvements
│
├── 6. Severity Classification                   [FR-001]
│   └── Table: P1–P4 with criteria + response time
│       ├── P1 Critical: Personal data exposed/exfiltrated → Immediate
│       ├── P2 High: Unauthorized access detected → 4 hours
│       ├── P3 Medium: Near-miss, anomalous pattern → 24 hours
│       └── P4 Low: Minor vulnerability, no exposure → 1 week
│
├── 7. Breach Assessment Procedure               [FR-019]
│   ├── Assessment checklist (must complete before SG notification clock starts)
│   ├── Timeline: ≤30 days from awareness (PDPC recommendation)
│   ├── What to assess: scope, data types, individuals affected, jurisdictions
│   └── Documentation requirements (for Section 26E)
│
├── 8. Notification Decision Tree                [FR-008]
│   ├── Step 1: Is this a data breach per legal definition?
│   ├── Step 2: Does it involve SG prescribed data categories?
│   ├── Step 3: Are 500+ individuals affected?
│   ├── Step 4: Is significant harm likely?
│   ├── Step 5: Which jurisdictions are affected?
│   ├── Step 6: What is the notification timeline for each?
│   └── Step 7: Document decision (notify or not) in incident register
│
├── 9. Regulatory Notification — Malaysia        [FR-003, FR-004]
│   ├── Threshold criteria
│   ├── Submission channels (portal, phone, email)
│   ├── Timeline: "as soon as possible" (internal target: 2 hours)
│   ├── Notification checklist (required fields)
│   └── Follow-up reporting requirements
│
├── 10. Regulatory Notification — Singapore      [FR-005, FR-006, FR-007]
│    ├── Two grounds (significant harm, 500+ individuals)
│    ├── 7 prescribed personal data categories (full list)
│    ├── Submission portal URL
│    ├── Timeline: 3 calendar days from assessment completion
│    ├── 10-field notification checklist
│    └── When individual notification required vs not
│
├── 11. Affected User Notification               [FR-009]
│    ├── When to notify (either jurisdiction's threshold met)
│    ├── Email notification template (6 SG-required fields)
│    ├── Multi-tenant scoping (per-business notifications)
│    ├── Phased notification (initial + updates)
│    └── Delivery channel (SES via notifications.hellogroot.com)
│
├── 12. Data Intermediary Procedures             [FR-017]
│    ├── When Groot Finance is acting as processor
│    ├── Notification to SME customer ("without undue delay")
│    ├── Information to provide the customer
│    └── Dual-chain scenarios (controller + intermediary)
│
├── 13. Third-Party / Sub-Processor Directory    [FR-016]
│    └── Table: provider, service, breach contact, SLA, data categories
│        ├── Clerk (auth/identity)
│        ├── Stripe (billing/payments)
│        ├── Convex (database)
│        ├── AWS (infrastructure/storage)
│        └── Modal (AI inference)
│
├── 14. Evidence Preservation                    [FR-015]
│    ├── What to preserve (logs, screenshots, access records)
│    ├── Retention periods
│    ├── Chain of custody
│    └── Storage locations
│
├── 15. Personal Data Inventory                  [FR-018]
│    └── Table: data category, storage location, SG prescribed?,
│        jurisdiction, controller/intermediary role, approx volume
│        ├── User identity (Clerk + Convex) — Controller
│        ├── Business details (Convex) — Controller
│        ├── Financial transactions (Convex) — Intermediary
│        ├── Expense claims & receipts (Convex + S3) — Intermediary
│        ├── Invoices & documents (Convex + S3) — Intermediary
│        ├── Device tokens (Convex) — Controller
│        └── Digital signature keys (AWS SSM) — Controller [PRESCRIBED]
│
├── 16. Incident Register Procedures             [FR-014]
│    ├── GitHub Issues workflow
│    ├── Label taxonomy (severity, jurisdiction, status, notification)
│    ├── Issue template (required fields per Section 26E)
│    ├── When to create (every suspected breach, including false alarms)
│    └── Producing the register for regulators
│
├── 17. Post-Incident Review                     [FR-013]
│    ├── Timeline: within 7 days of resolution
│    ├── Review template
│    │   ├── Incident timeline reconstruction
│    │   ├── Root cause analysis
│    │   ├── Remediation actions
│    │   ├── Lessons learned
│    │   └── SOP update recommendations
│    └── SOP update process (who approves, version control)
│
└── Appendices
    ├── A. Regulatory Contact Quick Reference
    ├── B. Incident Response Checklist (one-page tearsheet)
    └── C. Email Notification Template (ready-to-use)
```

## GitHub Issues Incident Register Schema

### Labels

| Label | Color | Description |
|-------|-------|-------------|
| `breach:P1-critical` | `#d73a49` (red) | Personal data exposed/exfiltrated, credentials compromised |
| `breach:P2-high` | `#e36209` (orange) | Unauthorized access detected, data integrity concern |
| `breach:P3-medium` | `#fbca04` (yellow) | Near-miss, policy violation, anomalous access pattern |
| `breach:P4-low` | `#0e8a16` (green) | Minor vulnerability, no data exposure |
| `jurisdiction:MY` | `#1d76db` (blue) | Affects Malaysian data subjects |
| `jurisdiction:SG` | `#5319e7` (purple) | Affects Singaporean data subjects |
| `jurisdiction:both` | `#006b75` (teal) | Affects data subjects in both jurisdictions |
| `status:assessing` | `#bfdadc` (light teal) | Breach assessment in progress |
| `status:investigating` | `#c5def5` (light blue) | Active investigation |
| `status:contained` | `#bfd4f2` (lavender) | Breach contained, cleanup in progress |
| `status:resolved` | `#0e8a16` (green) | Incident fully resolved |
| `status:false-alarm` | `#e4e669` (light yellow) | Investigated and determined to be non-breach |
| `notified:regulator` | `#d93f0b` (dark orange) | Regulatory notification submitted |
| `notified:individuals` | `#d93f0b` (dark orange) | Affected individuals notified |
| `notified:customer` | `#d93f0b` (dark orange) | SME customer notified (intermediary scenario) |
| `type:breach-incident` | `#000000` (black) | Identifies this issue as a breach incident (vs normal issue) |

### Issue Template

```markdown
---
name: Breach Incident Report
about: Log a security incident or suspected data breach (PDPA compliance)
title: "[BREACH] "
labels: type:breach-incident
---

## Incident Summary
<!-- Brief description of what was detected -->

## Detection
- **Date/time detected**:
- **How detected**: <!-- CloudWatch / Sentry / Clerk / User report / Other -->
- **Detected by**:

## Severity Classification
<!-- Select one: P1-critical / P2-high / P3-medium / P4-low -->
- **Severity**:
- **Rationale**:

## Breach Assessment (SG Section 26B)
- **Is this a data breach per legal definition?**: <!-- Yes / No / Under investigation -->
- **Prescribed personal data involved?**: <!-- List which of the 7 SG categories, or None -->
- **Estimated individuals affected**:
- **Jurisdictions affected**: <!-- MY / SG / Both / Unknown -->
- **Assessment completion date**: <!-- Date or "In progress" -->

## Notification Decisions
- **Regulator notification required?**: <!-- Yes (MY) / Yes (SG) / Yes (both) / No -->
- **Rationale**:
- **Individual notification required?**: <!-- Yes / No -->
- **Customer notification required?**: <!-- Yes (intermediary) / No / N/A -->

## Data Affected
<!-- Categories of personal data involved -->

## Containment Actions
<!-- What was done to contain the breach -->

## Remedial Actions
<!-- Corrective measures taken or planned -->

## Evidence Preserved
<!-- Links to logs, screenshots, exports -->

## Post-Incident Review
<!-- Link to review document when complete, or "Pending" -->
```

## Entity Lifecycle: Incident Status Flow

```text
[Detected] → [Assessing] → [Investigating] → [Contained] → [Resolved]
                  ↓                                              ↑
            [False Alarm] ─────────────────────────────────────→─┘
```

**Transitions**:
- **Detected → Assessing**: Incident Commander activates IRT, begins Section 26B assessment
- **Assessing → Investigating**: Assessment confirms this is a data breach per legal definition
- **Assessing → False Alarm**: Assessment determines no data breach occurred
- **Investigating → Contained**: Breach source identified and access/exfiltration stopped
- **Contained → Resolved**: Remediation complete, notifications sent, post-incident review done
- **False Alarm → Resolved**: Documented and closed (still logged per Section 26E)

## Personal Data Inventory (Current State)

| Data Category | Storage | SG Prescribed? | Jurisdiction | Role | Approx Volume |
|--------------|---------|----------------|-------------|------|---------------|
| User identity (email, name, clerkUserId) | Convex `users`, Clerk | No | MY + SG | Controller | <1,000 |
| Business details (taxId, address, contact) | Convex `businesses` | No | MY + SG | Controller | <500 |
| Account credentials (username + password) | Clerk (managed) | **Yes (#7)** | MY + SG | Controller | <1,000 |
| Financial transactions (amounts, vendors) | Convex `accounting_entries` | **Yes (#1)** | MY + SG | Intermediary | <10,000 |
| Expense claims (receipts, amounts) | Convex `expense_claims`, S3 | **Yes (#1)** | MY + SG | Intermediary | <5,000 |
| Invoices & documents | Convex `invoices`, S3 | **Yes (#1)** | MY + SG | Intermediary | <5,000 |
| Digital signature keys | AWS SSM (SecureString) | **Yes (#6)** | MY | Controller | 1 key pair |
| Device tokens (push notifications) | Convex `push_subscriptions` | No | MY + SG | Controller | <500 |
| LHDN e-invoice data (TIN, BRN) | Convex `businesses` | No | MY | Intermediary | <500 |
| Stripe billing (customerId, subscriptionId) | Convex `businesses`, Stripe | **Yes (#1)** | MY + SG | Controller | <500 |

**Prescribed categories present**: #1 (financial info), #6 (cryptographic keys), #7 (account credentials)
