# Groot Finance — Data Breach Notification Standard Operating Procedure

## 1. Document Control

| Field | Value |
|-------|-------|
| **Version** | 1.1 |
| **Status** | Active |
| **Approved by** | Ooi Yee Fei (Co-Founder) |
| **Effective date** | 2026-03-03 |
| **Last reviewed** | 2026-03-03 |
| **Next review** | 2026-06-03 (Q2 2026) |
| **Review cadence** | Quarterly, or within 7 days of any incident that reveals gaps |
| **Owner** | Incident Commander (CTO/Founder) |

### Change Log

| Version | Date | Author | Summary of Changes |
|---------|------|--------|-------------------|
| 1.0 | 2026-03-03 | grootdev-ai | Initial SOP covering MY PDPA Section 12B and SG PDPA Part VIA |
| 1.1 | 2026-03-03 | grootdev-ai | Updated with MY JPDP DBN portal fields (live 26 Feb 2026), SG delayed notification field, IRT contacts, notification sequencing rule |

---

## 2. Purpose & Scope

### Purpose

This Standard Operating Procedure (SOP) establishes Groot Finance's procedures for detecting, classifying, assessing, and responding to personal data breaches in compliance with:

- **Malaysia Personal Data Protection Act 2010** — Section 12B (mandatory breach notification), effective 1 June 2025, introduced by the Personal Data Protection (Amendment) Act 2024
- **Singapore Personal Data Protection Act 2012** — Part VIA (notification of data breaches), effective 1 February 2021

This SOP applies the **strictest requirement across both jurisdictions** at every decision point.

### Applicability

Groot Finance operates as:

- **Data Controller** — for its own user registration data (email, name, authentication credentials), business profile data, platform configuration, and billing data
- **Data Intermediary / Processor** — for SME customer business data including financial transactions, expense claims, invoices, and e-invoice submissions processed on behalf of customers

This SOP covers both roles with distinct notification procedures for each.

### Regulatory Penalties

| Jurisdiction | Penalty |
|-------------|---------|
| **Malaysia** | Fines up to RM 300,000–500,000 and/or imprisonment of 2–3 years. Directors and officers face joint and several liability with a due diligence defence. |
| **Singapore** | Financial penalties up to SGD 1,000,000 or 10% of annual Singapore turnover (for entities exceeding SGD 10M turnover), whichever is higher. |

### Out of Scope

- Implementation of new monitoring tools (separate engineering tasks)
- Broader PDPA compliance beyond breach notification (consent management, data subject access requests)
- Employee data protection training programs
- Contractual data processing agreements with third-party sub-processors
- Cross-border data transfer impact assessments

---

## 3. Definitions & Glossary

| Term | Definition |
|------|-----------|
| **Incident** | A detected security event being investigated. Not all incidents are data breaches. Has a severity level (P1–P4), status, and GitHub Issues reference number. |
| **Data Breach** | An incident confirmed to meet the legal definition: unauthorised access, collection, use, disclosure, copying, modification, or disposal of personal data; OR loss of a storage medium where unauthorised access to the personal data is likely. Aligned with SG PDPA Section 26A. |
| **Notifiable Data Breach** | A data breach that meets the notification threshold under either jurisdiction: (a) involves SG prescribed personal data likely to cause significant harm, (b) affects 500+ individuals, or (c) meets MY significant harm/scale criteria. |
| **Data Controller / Data User** | An organisation that decides the purpose and manner of processing personal data. Groot Finance is a controller for its own user/platform data. |
| **Data Intermediary / Processor** | An organisation that processes personal data on behalf of a controller. Groot Finance is an intermediary for SME customer business data. |
| **Prescribed Personal Data** | Seven categories of personal data defined under SG PDPA that, if breached, are presumed likely to cause significant harm. See Section 10 for the full list. |
| **Significant Harm** | Harm that a reasonable person would consider serious in the circumstances. Under SG PDPA, a breach involving prescribed personal data categories is presumed to cause significant harm. Under MY PDPA, the definition is further specified in subsidiary guidelines. |
| **PDPC** | Personal Data Protection Commission (Singapore). |
| **JPDP** | Jabatan Perlindungan Data Peribadi — Department of Personal Data Protection (Malaysia). Also referred to as "the Commissioner." |
| **IRT** | Incident Response Team — the designated team that manages breach response. |
| **Assessment** | The formal evaluation of whether an incident constitutes a data breach and whether notification thresholds are met. Under SG PDPA, the 3-day notification clock starts from assessment completion. |

---

## 4. Incident Response Team

### Roles & Responsibilities

| Role | Primary | Alternate | Responsibilities |
|------|---------|-----------|-----------------|
| **Incident Commander (IC)** | Ooi Yee Fei (Co-Founder / CTO) | Windrich (Co-Founder) | Overall incident ownership. Activates IRT, makes severity classification, approves regulatory notifications, authorises public communications, initiates post-incident review. |
| **Technical Lead** | Ooi Yee Fei (Co-Founder / CTO) | Windrich (Co-Founder) | Technical investigation and containment. Identifies breach scope, preserves evidence, implements technical remediation, documents technical findings. |
| **Communications** | Windrich (Co-Founder) | Ooi Yee Fei (Co-Founder / CTO) | Prepares regulatory notification submissions, drafts affected-user notifications, coordinates with external stakeholders (regulators, legal counsel, affected customers). |
| **Legal** | Ooi Yee Fei (Co-Founder / CTO) — external counsel to be engaged for P1/P2 incidents when appointed | Windrich (Co-Founder) | Advises on legal obligations, reviews regulatory notifications before submission, advises on liability and disclosure strategy. External counsel should be appointed when resources allow. |

### Contact Details

| Name | Email | Phone |
|------|-------|-------|
| **Ooi Yee Fei** | yeefei@hellogroot.com | +6597370158 |
| **Windrich** | windrich@hellogroot.com | +6597370158 |
| **DPO Group** | dpo@hellogroot.com | — |

### Escalation Procedures

**Escalation chain** (when primary is unavailable):
1. Primary contact for the role (email/phone/Telegram)
2. Wait maximum **30 minutes** for response
3. If no response → contact the Alternate
4. If Alternate also unavailable → the Incident Commander designates any available team member to the role
5. If Incident Commander is unavailable → Technical Lead assumes IC responsibilities

**Out-of-hours protocol**:
- P1 Critical and P2 High incidents: Contact via **phone call** (not just messaging) at any hour including weekends and holidays
- P3 Medium: Telegram message; response expected within 4 hours during business days
- P4 Low: Next business day response acceptable

**IRT Activation criteria**:
- **Automatically activated**: Any P1 or P2 incident
- **IC discretion**: P3 incidents (IC decides whether to convene the full IRT)
- **Not activated**: P4 incidents (handled by Technical Lead alone, documented in incident register)

---

## 5. Detection Mechanisms

| Mechanism | Status | Alert Channel | Detects |
|-----------|--------|---------------|---------|
| **CloudWatch Alarms — Lambda errors** | Active | SNS → Email | Lambda execution failures, unusual error rates across all functions |
| **CloudWatch Alarms — SES bounce/complaint rates** | Active | SNS → Email (`finanseal-email-alarms`) | Email delivery anomalies (bounce >3%, complaint >0.05%) |
| **CloudWatch Alarms — Certificate expiry** | Active | SNS → Email (`finanseal-cert-expiry-alerts`) | Digital signature certificate nearing expiration (30 days) |
| **Sentry error tracking** | Active | Telegram bot, Discord webhook | Application errors, unhandled exceptions (error/fatal severity only). PII scrubbing active — sensitive data redacted from error reports. |
| **Clerk authentication** | Active | Webhook → user sync | User creation, update, deletion events. Session management across `*.hellogroot.com`. |
| **Clerk suspicious activity** | Not configured | — | Login anomalies, brute force detection (built-in capability, not yet enabled) |
| **AWS GuardDuty** | Not configured | — | Network-level threat detection, unauthorised API calls, malicious IP access |
| **User reports** | Active | admin@hellogroot.com | User-reported security concerns, suspicious activity |
| **CloudWatch Logs (all Lambdas)** | Active | CloudWatch console (30-day retention) | Application-level logging for document processor, digital signature, MCP server, e-invoice, email workflows |
| **Audit logging (Convex)** | Active | Convex `audit_events` table | Permission changes, data access events, deletion audit trails |
| **Rate limiting** | Active (optional) | Application-level | Brute force attempts, API abuse (Redis-based when configured, in-memory fallback) |
| **RBAC authorization** | Active | Application-level | Unauthorised access attempts (role: owner, admin, manager, employee) |
| **CSRF protection** | Active | Application-level | Cross-site request forgery attempts |

### Known Gaps & Planned Improvements

- **AWS GuardDuty**: Recommended for network-level threat detection. Enabling is a separate engineering task.
- **Clerk suspicious activity monitoring**: Built-in capability available but not configured. Should be enabled.
- **Dedicated security email**: `security@hellogroot.com` or `dpo@hellogroot.com` should be created for external breach reports.
- **CloudWatch log retention**: Currently 30 days. Consider extending to 90 days for compliance evidence.

---

## 6. Severity Classification

| Level | Criteria | Response Time | IRT Activation | Example Scenarios |
|-------|----------|---------------|----------------|-------------------|
| **P1 Critical** | Personal data confirmed exposed, exfiltrated, or accessed by unauthorised parties. Credentials compromised. Prescribed personal data categories involved. | **Immediate** — IRT assembled within 30 minutes | Automatic (full IRT) | Database breach exposing user emails and financial data. Compromised API keys providing access to user records. S3 bucket misconfiguration exposing receipts. |
| **P2 High** | Unauthorised access detected but exposure not confirmed. Data integrity concern. Evidence of intrusion attempt with partial success. | **Within 4 hours** | Automatic (full IRT) | Suspicious API access pattern from unknown IP. Elevated privilege escalation detected. Unauthorised login to admin panel. |
| **P3 Medium** | Near-miss event. Policy violation detected. Anomalous access pattern without evidence of data exposure. Vulnerability discovered that could lead to exposure. | **Within 24 hours** | IC discretion | Repeated failed login attempts. Employee accessing data outside their role. Unpatched vulnerability in dependency. |
| **P4 Low** | Minor vulnerability identified. No data exposure or access. Informational security finding. | **Within 1 week** | Not activated (Tech Lead only) | Outdated dependency with no known exploit path. Minor configuration improvement identified. |

**Escalation triggers** (move to higher severity):
- P3 → P2: Evidence of actual unauthorised access found during investigation
- P2 → P1: Confirmation that personal data was exposed or exfiltrated
- Any → P1: Prescribed personal data categories (Section 10) involved in confirmed breach

---

## 7. Breach Assessment Procedure

When an incident is detected, the team must assess whether it constitutes a **data breach** under the legal definition and whether it is **notifiable**. Under SG PDPA, the 3-calendar-day notification clock starts from **assessment completion**, not from awareness.

### Assessment Timeline

- Assessment must be completed **"in a reasonable and expeditious manner"**
- PDPC recommends: **within 30 calendar days of awareness**
- Internal target: Complete assessment as fast as possible; P1/P2 incidents assessed within 24 hours

### Assessment Checklist

Complete the following for every incident P1–P3:

- [ ] **Is this a data breach?** — Does it meet the legal definition (Section 3)?
  - Unauthorised access, collection, use, disclosure, copying, modification, or disposal of personal data?
  - Loss of storage medium where unauthorised access is likely?
- [ ] **What personal data is involved?** — List the specific data categories
- [ ] **Are any SG prescribed categories involved?** — Check against the 7 categories in Section 10
- [ ] **How many individuals are affected?** — Count or estimate
- [ ] **Which jurisdictions are affected?** — MY, SG, or both?
  - If unknown, assume both (conservative default)
- [ ] **Is significant harm likely?** — Based on data type, circumstances, and whether data is encrypted/protected
- [ ] **What is the breach status?** — Ongoing, contained, or resolved?
- [ ] **What evidence has been preserved?** — Per Section 14

### Assessment Documentation

Document findings in the **GitHub Issues incident register** (Section 16). Update the issue with:
- Assessment completion date
- Each checklist item's finding
- Notification decision and rationale

**Important**: The assessment completion date triggers the SG PDPA 3-day notification clock. Record it accurately.

---

## 8. Notification Decision Tree

Follow these steps sequentially for every confirmed data breach:

```
Step 1: Is this a data breach per the legal definition (Section 3)?
├── NO  → Document as incident (not breach) in register → STOP
└── YES → Continue to Step 2

Step 2: Does the breach involve SG prescribed personal data categories (Section 10)?
├── YES → Flag as potentially notifiable under "significant harm" ground
└── NO  → Continue to Step 3

Step 3: Are 500 or more individuals affected (or likely to be)?
├── YES → Notifiable under "significant scale" ground (SG)
└── NO  → Continue to Step 4

Step 4: Is significant harm to affected individuals likely?
├── YES → Notifiable under "significant harm" ground (both jurisdictions)
└── NO  → If neither Step 2, 3, nor 4 triggers → NOT notifiable

Step 5: Which jurisdictions are affected?
├── Malaysia data subjects → Notify MY JPDP (Section 9)
├── Singapore data subjects → Notify SG PDPC (Section 10)
├── Both → Notify BOTH regulators
└── Unknown → Assume BOTH (conservative default)

Step 6: Is individual notification required?
├── Significant harm ground met (Step 2 or 4) → YES, notify individuals (Section 11)
│   └── SG SEQUENCING RULE: Notify PDPC FIRST, then individuals (on or after PDPC notification)
│   └── MY: No sequencing requirement — can notify JPDP and individuals simultaneously
├── 500+ ground only (Step 3 only, no significant harm) → NO individual notification required under SG, but check MY requirements
└── MY PDPA: notify individuals "without unnecessary delay" when significant harm likely

Step 7: Document decision
└── Update GitHub Issues incident register with:
    - Notification decision (notify / do not notify)
    - Rationale referencing specific grounds
    - Jurisdictions and applicable deadlines
```

**If not notifiable**: Document the decision NOT to notify in the incident register with supporting rationale. This documentation must be producible to either regulator on request.

---

## 9. Regulatory Notification — Malaysia

### Legal Basis

**MY PDPA Section 12B** (effective 1 June 2025) — Mandatory notification to the Commissioner.

### Notification Threshold

Notification is required when:
- **Significant harm** to affected individuals is likely (assessed via 5 harm criteria — see below), OR
- The breach is of **significant scale** — MY threshold is **1,000 individuals** (confirmed on JPDP DBN portal). However, SG's threshold is 500. This SOP uses **500 as the conservative default** for both jurisdictions.

**MY Significant Harm Criteria** (5 outcome-based categories on JPDP portal):
1. Physical injury, financial loss, credit impact, or property damage
2. Data could be misused for unlawful purposes
3. Breach involves sensitive personal data
4. Combined data could enable identity fraud
5. Scale exceeds 1,000 affected individuals

> **Note**: MY uses **outcome-based** harm criteria (what damage could result), while SG uses **data-type-based** prescribed categories (what type of data was breached). Both approaches must be checked.

### Timeline

- **Statutory requirement**: "As soon as possible" after becoming aware of a notifiable breach
- **Internal target**: **Within 2 hours** of P1 incident confirmation
- **Follow-up**: Update notification as new information becomes available

### Submission Channels

| Channel | Details |
|---------|---------|
| **Online portal** | [daftar.pdp.gov.my/v1/dbn](https://daftar.pdp.gov.my/v1/dbn) — JPDP DBN breach notification portal (live since 26 Feb 2026) |
| **Phone** | 03-7456 3888 |
| **Email** | dbnpdp@pdp.gov.my (dedicated DBN email — NOT the general complaints email) |

Use multiple channels for P1 incidents (portal + phone call to confirm receipt).

### MY Notification Checklist

Complete all fields before submitting via the JPDP DBN portal. The portal requires information in structured sections:

#### Portal Pre-Screening Fields
- [ ] **Notification type** — New notification or Update to prior notification (reference number format: `DBN-APDP-000X/YYYY`)
- [ ] **Entity role** — Declare whether you are the Data Controller, Data Processor, or Data Subject
- [ ] **Significant harm self-assessment** — Check which of the 5 MY harm criteria apply (see Notification Threshold above)

#### Organisation Details (Form Section)
- [ ] **Organisation name** — Groot Finance / FinanSEAL
- [ ] **Industry sector** — Select from JPDP's sector dropdown (likely: Information Technology / Financial Services)
- [ ] **Full address** — Including postcode, state, city (structured fields)
- [ ] **Contact person** — Name, designation, phone, email

#### Breach Details (Form Section)
- [ ] **Nature of the breach** — What happened (unauthorised access, data loss, etc.)
- [ ] **Date and time of breach** — When it occurred
- [ ] **Date of discovery** — When Groot Finance became aware
- [ ] **Personal data affected** — Categories of data involved
- [ ] **Number of individuals affected** — Exact count or estimate
- [ ] **Description of likely consequences** — What harm could result
- [ ] **Remedial actions taken** — Steps already implemented to contain the breach
- [ ] **Planned remedial actions** — Future steps to prevent recurrence
- [ ] **Whether affected individuals have been notified** — Yes/No, and if yes, how
- [ ] **Any other relevant information** — Additional context

### Notification to Individuals (MY)

Required **"without unnecessary delay"** when significant harm is likely. Use the template in Section 11.

---

## 10. Regulatory Notification — Singapore

### Legal Basis

**SG PDPA Part VIA** (effective 1 February 2021) — Sections 26B–26E.

### Notification Grounds

Notification to PDPC is mandatory when a data breach:

**(a) Significant harm ground**: The breach involves any of the **7 prescribed personal data categories** AND is likely to cause significant harm to affected individuals:

| # | Prescribed Category | Groot Finance Data Matching This Category |
|---|--------------------|-----------------------------------------|
| 1 | Non-public financial information (bank accounts, credit cards) | Financial transactions in `accounting_entries`, expense claims, Stripe billing data |
| 2 | Vulnerable individual identification data (NRIC of minors/vulnerable) | Not currently collected |
| 3 | Life, accident, or health insurance information | Not currently collected |
| 4 | Specified medical information (HIV, STD, mental health) | Not currently collected |
| 5 | Adoption records | Not currently collected |
| 6 | Private cryptographic keys (digital signature keys) | Digital signature private key in AWS SSM |
| 7 | Account access credentials (username + password/PIN) | Managed by Clerk (authentication provider) |

**Prescribed categories present in Groot Finance**: #1 (financial info), #6 (cryptographic keys), #7 (account credentials)

**(b) Significant scale ground**: The breach affects **500 or more individuals**, regardless of data type.

### Timeline

- **Statutory requirement**: **3 calendar days** from the date the breach assessment is completed
- **Internal target**: **Within 24 hours** of assessment completion
- Assessment must be completed "in a reasonable and expeditious manner" (PDPC recommends ≤30 days from awareness)

### Submission

- **Portal**: [pdpc.gov.sg](https://www.pdpc.gov.sg/) — Data breach notification form
- **Follow-up**: PDPC may request additional information; respond promptly

### SG Notification Checklist — 12 Required Fields

Complete ALL 12 fields before submitting to PDPC:

- [ ] **1. Date breach was discovered** — The date your organisation first became aware
- [ ] **2. How the breach was discovered** — Detection mechanism or source (e.g., Sentry alert, user report)
- [ ] **3. How the breach occurred** — Root cause or method (e.g., SQL injection, misconfigured permissions)
- [ ] **4. Number of affected individuals** — Exact count or best estimate with methodology
- [ ] **5. Personal data categories affected** — List each category, noting any prescribed categories
- [ ] **6. Potential harm assessment** — Description of likely harm to individuals
- [ ] **7. Remedial steps already taken** — Containment actions completed
- [ ] **8. Future remedial actions planned** — Corrective measures to prevent recurrence
- [ ] **9. Individual notification plan** — Plan for notifying affected individuals, OR grounds for NOT notifying (if 500+ ground only, individual notification may not be required)
- [ ] **10. Authorised representative contact** — Name, designation, email, phone number
- [ ] **11. Reasons for any delayed notification** — If notification was not made immediately upon assessment completion, explain why
- [ ] **12. Assessment methodology and steps taken** — How the breach was assessed (scope determination, data analysis, forensics conducted)

### Notification to Individuals (SG)

Required when the **significant harm ground** is met (not for the 500+ ground alone). Use the template in Section 11.

> **IMPORTANT — Notification Sequencing (SG only)**: Under SG PDPA, you must notify **PDPC first**, then individuals. Individual notification should be made **on or after** PDPC notification, as soon as practicable. Malaysia does NOT specify this order — notification to JPDP and individuals can be simultaneous.

---

## 11. Affected User Notification

### When to Notify

Notify affected individuals when **either** jurisdiction's threshold is met:
- SG: Significant harm ground (prescribed data categories involved)
- MY: "Without unnecessary delay" when significant harm is likely

**Internal target**: Draft ready for review **within 1 hour** of notification decision.

### Multi-Tenant Scoping

Groot Finance is multi-tenant. Notifications MUST be scoped per business:
- Identify which businesses are affected
- Each business's users receive a notification specific to their data
- Do NOT send a generic blast to all users

### Email Notification Template

Send via SES from `noreply@notifications.hellogroot.com`.

```
Subject: Important Security Notice from Groot Finance

Dear [User Name],

We are writing to inform you of a security incident that may have affected your personal data.

1. WHAT HAPPENED
[Describe the breach circumstances in plain language. Include when it occurred and when it was discovered.]

2. WHAT DATA WAS AFFECTED
[List the specific types of personal data that were or may have been compromised. Be specific — e.g., "email addresses and financial transaction records" rather than "personal information."]

3. WHAT HARM MAY RESULT
[Describe the potential consequences. Be honest and specific about risks — e.g., "This information could potentially be used to access your financial accounts" or "We believe the risk of harm is low because the data was encrypted."]

4. WHAT WE ARE DOING
[Describe remedial actions taken and planned. Include:
- Immediate containment steps already completed
- Ongoing investigation status
- Security improvements being implemented
- Whether regulators have been notified]

5. WHAT YOU SHOULD DO
[Provide specific, actionable steps for the individual:
- Change passwords for affected accounts
- Monitor financial statements for unusual activity
- Enable two-factor authentication if not already active
- Contact details for credit monitoring services (if applicable)
- How to report suspicious activity]

6. CONTACT US
If you have questions or concerns, please contact us:
- Email: support@finanseal.com
- Phone: +6597370158

We take the security of your personal data seriously and sincerely apologise for any concern this may cause.

Groot Finance
```

### Phased Notification

If the breach scope is still being determined:
1. **Initial notification**: Send with available information, clearly stating the investigation is ongoing
2. **Update notification**: Send when additional information becomes available (within 7 days or sooner)
3. Mark in the incident register when each notification was sent

---

## 12. Data Intermediary Procedures

### When Groot Finance Acts as Processor

When a breach affects data processed on behalf of an SME customer (see Personal Data Inventory, Section 15, "Intermediary" role), Groot Finance is a **data intermediary** and must notify the affected customer — NOT the regulators directly.

### Notification Chain

```
Breach detected
    ↓
Groot Finance notifies affected SME customer(s)
    ↓
SME customer (as controller) assesses their own notification obligations
    ↓
SME customer notifies their regulator and individuals (if required)
```

### Timeline

- **SG PDPA**: Notify the data controller **"without undue delay"**
- **MY PDPA**: Contractual obligation (should be in data processing agreement)
- **Internal target**: Notify affected customer within **4 hours** of confirming the breach affects their data

### Information to Provide the Customer

The customer notification must include sufficient detail for them to assess their own obligations:

- [ ] Description of what happened
- [ ] Date and time of the breach
- [ ] What customer data was affected (categories and approximate volume)
- [ ] Whether the data was encrypted or otherwise protected
- [ ] Containment actions taken by Groot Finance
- [ ] Remediation steps underway
- [ ] Groot Finance's contact for ongoing coordination
- [ ] Whether the data has been recovered or remains exposed

### Dual-Chain Scenarios

When a breach affects **both** Groot Finance's own data AND SME customer data:

1. **For Groot Finance's own data** (controller): Follow Sections 8–11 to notify regulators and individuals
2. **For customer data** (intermediary): Follow this section to notify the affected customer
3. Both chains execute **simultaneously** — do not wait for one to complete before starting the other

---

## 13. Third-Party / Sub-Processor Directory

Groot Finance uses the following third-party services that process personal data. If a breach originates from a sub-processor, use the contact information below.

| Provider | Service | Data Categories | Breach Contact | Expected SLA | Groot Finance Obligations |
|----------|---------|----------------|----------------|-------------|--------------------------|
| **Clerk** | Authentication & identity | User credentials (email, name, session data) [Prescribed #7] | Trust center: clerk.com/trust; Status: status.clerk.com | Per DPA terms | Assess impact on Groot Finance users; treat as P1 if credentials exposed |
| **Stripe** | Billing & payments | Customer IDs, subscription data, payment methods [Prescribed #1] | Security: stripe.com/docs/security; Per DPA terms | Per DPA terms | Assess impact on billing data; notify affected businesses |
| **Convex** | Database (real-time) | All Convex-stored personal data (users, businesses, transactions) | Security docs: docs.convex.dev; Direct contact per terms | Per DPA terms | Assess impact across all data categories; likely P1 |
| **AWS** | Infrastructure & storage | S3 documents (receipts, invoices), SSM secrets (signing keys) [Prescribed #1, #6] | AWS Security Bulletins; Personal Health Dashboard; shared responsibility model | Varies by service | Assess which services/data affected; check AWS shared responsibility |
| **Modal** | AI inference | Query text, business context (transient, not stored) | dpo@hellogroot.com (internal DPO group email) | Per terms | Assess whether query data contained personal information |

### Upon Receiving a Sub-Processor Breach Notification

1. **Acknowledge receipt** to the sub-processor immediately
2. **Assess impact** — determine what Groot Finance data was affected
3. **Classify severity** using Section 6 criteria
4. **Open incident register entry** in GitHub Issues
5. **Follow the standard SOP** from Section 7 (Assessment) onwards
6. **Coordinate with sub-processor** for remediation and evidence sharing

---

## 14. Evidence Preservation

### What to Preserve

During any P1–P3 incident, preserve the following immediately:

| Evidence Type | Source | How to Preserve |
|--------------|--------|----------------|
| **Application logs** | CloudWatch Log Groups | Export log groups for the incident timeframe. Note: default retention is 30 days — export critical logs before they expire. |
| **Sentry error events** | Sentry dashboard | Screenshot or export relevant error events with full stack traces and breadcrumbs. |
| **Audit log entries** | Convex `audit_events` table | Query and export audit events for the affected timeframe and entities. |
| **Access logs** | CloudWatch, Clerk dashboard | Export API access patterns, login attempts, and session data for the incident timeframe. |
| **Network logs** | AWS VPC Flow Logs (if enabled) | Export flow logs for affected resources. |
| **Communication records** | Telegram, Discord, Email | Screenshot or export all breach-related team communications. |
| **Configuration snapshots** | AWS console, CDK stacks | Capture current configuration of affected resources (IAM policies, S3 bucket policies, Lambda configurations). |
| **Notification records** | SES delivery logs, GitHub Issues | Record all notifications sent (regulator, individual, customer) with timestamps and content. |

### Retention Periods

| Data Type | Retention Period | Rationale |
|-----------|-----------------|-----------|
| Incident register (GitHub Issues) | **Permanent** | Regulatory audit trail; must be producible to PDPC/JPDP on request |
| Evidence supporting a notifiable breach | **Minimum 5 years** | Aligns with general PDPA record-keeping expectations |
| Evidence for non-notifiable incidents | **Minimum 2 years** | Demonstrates due diligence |
| Post-incident review reports | **Minimum 5 years** | May be requested during regulatory audits |

### Chain of Custody

- Document **who** collected each piece of evidence and **when**
- Store evidence in a dedicated, access-controlled location (not the public repo)
- Do not modify original evidence — work from copies
- Record evidence collection steps in the GitHub Issues incident register entry

---

## 15. Personal Data Inventory

| Data Category | Storage Location | SG Prescribed? | Jurisdiction | Role | Approx Volume |
|--------------|-----------------|----------------|-------------|------|---------------|
| User identity (email, full name, clerkUserId) | Convex `users` table, Clerk | No | MY + SG | Controller | <1,000 users |
| Business details (name, taxId, address, contactEmail, contactPhone) | Convex `businesses` table | No | MY + SG | Controller | <500 businesses |
| Account credentials (username + password) | Clerk (managed externally) | **Yes (#7)** | MY + SG | Controller | <1,000 accounts |
| Financial transactions (amounts, vendors, payment details) | Convex `accounting_entries` table | **Yes (#1)** | MY + SG | Intermediary | <10,000 entries |
| Expense claims (receipts, amounts, vendor names, business purpose) | Convex `expense_claims` table, S3 `finanseal-bucket` | **Yes (#1)** | MY + SG | Intermediary | <5,000 claims |
| Invoices & documents (customer invoices, e-invoice PDFs) | Convex `invoices` table, S3 `finanseal-bucket` | **Yes (#1)** | MY + SG | Intermediary | <5,000 invoices |
| Digital signature keys (private key, certificate) | AWS SSM Parameter Store (SecureString, encrypted at rest) | **Yes (#6)** | MY | Controller | 1 key pair |
| Device tokens (push notification tokens) | Convex `push_subscriptions` table | No | MY + SG | Controller | <500 tokens |
| LHDN e-invoice data (TIN, BRN, MSIC code) | Convex `businesses` table | No | MY only | Intermediary | <500 businesses |
| Stripe billing data (customerId, subscriptionId) | Convex `businesses` table, Stripe (external) | **Yes (#1)** | MY + SG | Controller | <500 accounts |

**SG Prescribed categories present**: #1 (non-public financial information), #6 (private cryptographic keys), #7 (account access credentials)

**Implications**: Any breach involving financial transactions, expense claims, invoices, digital signature keys, or authentication credentials is **automatically flagged** as potentially notifiable under the SG "significant harm" ground.

> **Maintenance note**: This inventory must be updated whenever new personal data fields or storage locations are added to the Groot Finance platform. Review during quarterly SOP reviews.

---

## 16. Incident Register Procedures

### Overview

All incidents — including false alarms — MUST be logged in the GitHub Issues incident register in the `grootdev-ai/groot-finance` repository. This satisfies **SG PDPA Section 26E** (all breaches documented with facts, assessment findings, and actions taken) and **MY PDPA** record-keeping requirements.

### When to Create an Issue

Create a GitHub Issue using the **Breach Incident Report** template for:
- Every P1–P3 incident (automatically)
- P4 incidents at Technical Lead's discretion
- Any event that triggers the IRT
- Any event that is later determined to be a false alarm (log the investigation and finding)

### GitHub Issues Workflow

1. **Create issue** using the `Breach Incident Report` template (`.github/ISSUE_TEMPLATE/breach-incident.yml`)
2. **Apply labels**:
   - Severity: `breach:P1-critical`, `breach:P2-high`, `breach:P3-medium`, or `breach:P4-low`
   - Jurisdiction: `jurisdiction:MY`, `jurisdiction:SG`, or `jurisdiction:both`
   - Status: `status:assessing` → `status:investigating` → `status:contained` → `status:resolved` (or `status:false-alarm`)
   - Notification: `notified:regulator`, `notified:individuals`, `notified:customer` (add as each notification is sent)
3. **Assign** to the Incident Commander
4. **Update** the issue as the incident progresses — add comments with new findings, decisions, and actions
5. **Close** the issue only when the post-incident review is complete

### Label Taxonomy

| Category | Labels |
|----------|--------|
| **Severity** | `breach:P1-critical`, `breach:P2-high`, `breach:P3-medium`, `breach:P4-low` |
| **Jurisdiction** | `jurisdiction:MY`, `jurisdiction:SG`, `jurisdiction:both` |
| **Status** | `status:assessing`, `status:investigating`, `status:contained`, `status:resolved`, `status:false-alarm` |
| **Notification** | `notified:regulator`, `notified:individuals`, `notified:customer` |
| **Type** | `type:breach-incident` (auto-applied by template) |

### Producing the Register for Regulators

If a regulator requests the incident register:

```bash
# Export all breach incidents as JSON
gh issue list --repo grootdev-ai/groot-finance --label type:breach-incident --state all --json number,title,state,labels,createdAt,closedAt,body,comments

# Export incidents for a specific jurisdiction
gh issue list --repo grootdev-ai/groot-finance --label type:breach-incident --label jurisdiction:SG --state all --json number,title,state,labels,createdAt,closedAt,body,comments
```

Convert the JSON output to a readable format (table or PDF) before submitting to the regulator.

---

## 17. Post-Incident Review

### Timeline

- Initiate the review **within 7 calendar days** of incident resolution
- The Incident Commander is responsible for scheduling and leading the review
- All IRT members must participate

### Review Template

Use the following structure. Document findings as comments in the GitHub Issues incident register entry.

#### 17.1 Incident Timeline

| Time (UTC+8) | Event | Actor |
|--------------|-------|-------|
| [Date HH:MM] | Incident detected via [mechanism] | [Name/System] |
| [Date HH:MM] | IRT activated, severity classified as [P?] | IC |
| [Date HH:MM] | Breach assessment completed | Tech Lead |
| [Date HH:MM] | Notification decision made: [notify/do not notify] | IC |
| [Date HH:MM] | [Regulator/individual/customer] notified | Communications |
| [Date HH:MM] | Breach contained | Tech Lead |
| [Date HH:MM] | Remediation complete | Tech Lead |
| [Date HH:MM] | Post-incident review completed | IC |

#### 17.2 Root Cause Analysis

- **What happened**: [Factual description of the breach]
- **Why it happened**: [Root cause — not symptoms]
- **Contributing factors**: [Systemic issues that allowed the breach]
- **What was the impact**: [Number of individuals, data categories, jurisdictions]

#### 17.3 Remediation Actions

| Action | Owner | Deadline | Status |
|--------|-------|----------|--------|
| [Immediate fix applied] | [Name] | [Date] | Complete |
| [Preventive measure planned] | [Name] | [Date] | In progress |
| [Monitoring improvement] | [Name] | [Date] | Planned |

#### 17.4 Lessons Learned

- What went well in the response?
- What could be improved?
- Were there delays? What caused them?
- Was the SOP adequate? Where did it fall short?

#### 17.5 SOP Update Recommendations

- [ ] Does the severity classification need adjustment?
- [ ] Are detection mechanisms adequate?
- [ ] Does the notification decision tree need updating?
- [ ] Do checklists need additional fields?
- [ ] Do escalation procedures need revision?
- [ ] Does the personal data inventory need updating?

**SOP Update Process**:
1. Proposed changes documented in the post-incident review
2. Changes reviewed and approved by the Incident Commander
3. SOP updated with new version number and change log entry
4. Updated SOP committed to the repository
5. Team notified of changes

---

## Appendix A: Regulatory Contact Quick Reference

| | Malaysia (JPDP) | Singapore (PDPC) |
|---|----------------|------------------|
| **Regulator** | Jabatan Perlindungan Data Peribadi | Personal Data Protection Commission |
| **Online portal** | [daftar.pdp.gov.my/v1/dbn](https://daftar.pdp.gov.my/v1/dbn) | [pdpc.gov.sg](https://www.pdpc.gov.sg/) |
| **Phone** | 03-7456 3888 | +65 6377 3131 |
| **Email** | dbnpdp@pdp.gov.my | info@pdpc.gov.sg |
| **Notification deadline** | "As soon as possible" (internal: 2 hours) | 3 calendar days from assessment completion |
| **Legal basis** | Section 12B (effective 1 June 2025) | Part VIA, Sections 26B–26E |
| **Individual notification** | "Without unnecessary delay" when significant harm likely | When significant harm ground is met |

---

## Appendix B: Incident Response Checklist (Quick Reference)

**Print this page and keep accessible for P1/P2 incidents.**

### IMMEDIATE (0–30 minutes)

- [ ] Incident detected — note time and source
- [ ] Contact Incident Commander (phone call for P1/P2)
- [ ] Open GitHub Issue using Breach Incident Report template
- [ ] Apply severity label (`breach:P1-critical` or `breach:P2-high`)
- [ ] Classify severity using Section 6 criteria
- [ ] Activate IRT (P1/P2: automatic)
- [ ] Begin evidence preservation (Section 14)

### ASSESSMENT (30 minutes – 24 hours for P1/P2)

- [ ] Complete breach assessment checklist (Section 7)
- [ ] Identify affected data categories — check prescribed categories (Section 10)
- [ ] Count or estimate affected individuals
- [ ] Determine affected jurisdictions (MY/SG/both)
- [ ] Follow notification decision tree (Section 8)
- [ ] Record assessment completion date in GitHub Issue

### NOTIFICATION (upon assessment completion)

- [ ] **MY PDPC** (if applicable): Submit within 2 hours — Section 9 checklist
- [ ] **SG PDPC** (if applicable): Submit within 24 hours (statutory: 3 days) — Section 10 checklist
- [ ] **Affected individuals** (if significant harm): Draft within 1 hour — Section 11 template
- [ ] **SME customers** (if intermediary): Notify within 4 hours — Section 12
- [ ] Add `notified:regulator` / `notified:individuals` / `notified:customer` labels to GitHub Issue

### CONTAINMENT & REMEDIATION

- [ ] Identify and stop the breach source
- [ ] Implement immediate technical fixes
- [ ] Update GitHub Issue status to `status:contained`
- [ ] Plan and implement preventive measures

### POST-INCIDENT (within 7 days)

- [ ] Conduct post-incident review (Section 17 template)
- [ ] Document lessons learned
- [ ] Update SOP if gaps identified
- [ ] Close GitHub Issue
- [ ] Update status label to `status:resolved`

---

## Appendix C: Email Notification Template (Ready-to-Use)

**From**: `noreply@notifications.hellogroot.com`
**Subject**: Important Security Notice from Groot Finance
**Configuration set**: `finanseal-transactional`

Copy the template below. Replace all `[bracketed]` placeholders before sending.

---

Dear [User Name],

We are writing to inform you of a security incident that may have affected your personal data held by Groot Finance.

**What happened**
On [date], we detected [brief description of the breach — e.g., "unauthorised access to our systems that may have exposed certain user data"]. We discovered this on [discovery date] through [detection method — e.g., "our security monitoring systems"].

**What data was affected**
The following types of your personal data may have been affected: [list specific data types — e.g., "your email address, name, and financial transaction records associated with your business account"].

**What harm may result**
[Describe potential consequences honestly — e.g., "There is a risk that this information could be used to attempt unauthorised access to financial services" OR "We believe the risk of harm is low because the data was encrypted at rest and we have no evidence of actual data exfiltration."]

**What we are doing**
We have taken the following steps:
- [Containment action — e.g., "Immediately revoked the compromised access credentials"]
- [Investigation — e.g., "Engaged our incident response team to conduct a thorough investigation"]
- [Prevention — e.g., "Implemented additional security controls to prevent similar incidents"]
- [Regulatory — e.g., "Notified the relevant data protection authorities as required by law"]

**What you should do**
We recommend you take the following steps to protect yourself:
- Change your Groot Finance password immediately at [accounts.hellogroot.com]
- Enable two-factor authentication if you have not already done so
- Monitor your financial accounts for any unusual activity
- Be cautious of phishing emails or messages that reference this incident
- [Additional specific recommendations based on data type]

**Contact us**
If you have any questions or concerns, please contact us at:
- Email: support@finanseal.com
- +6597370158

We take the protection of your personal data very seriously and sincerely apologise for any concern or inconvenience this may cause.

Groot Finance
