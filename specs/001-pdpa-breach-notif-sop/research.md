# Research: PDPA Breach Notification SOP

**Feature Branch**: `001-pdpa-breach-notif-sop`
**Date**: 2026-03-03
**Spec**: [spec.md](./spec.md)

## R-001: Malaysia PDPA Breach Notification Requirements

**Decision**: Apply MY PDPA Section 12B (effective 1 June 2025) with "as soon as possible" interpreted as 2-hour internal target.

**Rationale**: The Personal Data Protection (Amendment) Act 2024 (gazetted 17 October 2024) introduced Section 12B as the mandatory breach notification provision. The statutory language "as soon as possible" has no defined hour/day limit — a concrete internal target of 2 hours provides a measurable SLA that demonstrably exceeds the statutory requirement, reducing regulatory risk.

**Key findings**:
- **Trigger**: Significant harm likely OR significant scale (exact thresholds in subsidiary guidelines, expected to align with SG's 500 threshold)
- **Who notified**: Commissioner AND data subjects (when significant harm likely)
- **Timeline**: "As soon as possible" (Commissioner), "without unnecessary delay" (data subjects)
- **Submission channels**: JPDP portal (pdp.gov.my), phone (03-7456 3888), email (aduan@pdp.gov.my)
- **Penalties**: RM 300,000–500,000 and/or 2–3 years imprisonment; directors face joint/several liability
- **Data processor duty**: No direct notification duty to Commissioner, but must comply with Security Principle (from April 2025); controllers expected to contractually require prompt notification
- **Open item**: Detailed Breach Notification Guidelines (subsidiary legislation) should be checked for publication status — may add specific hour limits and form fields

**Alternatives considered**:
- 4-hour internal target (rejected: less margin for "as soon as possible")
- 1-hour internal target (rejected: impractical for small team to gather all required information)

## R-002: Singapore PDPA Breach Notification Requirements

**Decision**: Apply SG PDPA Part VIA (effective 1 February 2021) with all 10 PDPC notification fields, 7 prescribed data categories, and 3-calendar-day timeline from assessment completion.

**Rationale**: Singapore's framework is the more mature and detailed of the two, with well-defined notification grounds, prescribed data categories, and explicit record-keeping obligations (Section 26E). Using SG as the baseline for detail level ensures the SOP covers both jurisdictions.

**Key findings**:
- **Definition** (Section 26A): Unauthorised access, collection, use, disclosure, copying, modification, or disposal; OR loss of storage medium where unauthorised access is likely
- **Ground 1 — Significant harm**: Breach involves any of 7 prescribed personal data categories
- **Ground 2 — Significant scale**: 500+ individuals affected (regardless of data type)
- **Timeline**: 3 calendar days from **assessment completion** (not from awareness). Assessment must be completed "in a reasonable and expeditious manner" (PDPC recommends ≤30 days)
- **10 PDPC notification fields**: date discovered, how discovered, how it occurred, number affected, data categories, potential harm assessment, remedial steps taken, future remedial actions, individual notification plan, authorised representative contact
- **Individual notification** (6 fields, significant harm ground only): breach circumstances, data types affected, potential harm description, organisation's remedial actions, individual self-help steps, representative contact
- **Section 26E**: ALL breaches must be documented (facts, assessment findings, actions). Must be produced to PDPC on request.
- **Data intermediary**: Must notify data controller "without undue delay." Does NOT notify PDPC or individuals directly.
- **Penalties**: Up to 10% of annual SG turnover (for entities >SGD 10M turnover) or SGD 1M, whichever is higher

**7 Prescribed Personal Data Categories**:
1. Non-public financial information (bank accounts, credit cards)
2. Vulnerable individual identification data (NRIC of minors/vulnerable persons)
3. Life, accident, or health insurance information
4. Specified medical information (HIV, STD, mental health)
5. Adoption records
6. Private cryptographic keys (digital signature keys)
7. Account access credentials (username + password/PIN)

**Alternatives considered**: N/A — statutory requirements, no discretion

## R-003: Groot Finance Dual Role Classification

**Decision**: Document Groot Finance as both data controller (own user/business data) AND data intermediary (SME customer business data), with distinct notification chains for each role.

**Rationale**: Groot Finance collects user registration data (email, name) for its own purposes (controller) while processing financial documents, expense claims, and invoices on behalf of SME customers (intermediary/processor). The notification obligations differ materially:
- As controller: Notify regulators + individuals directly
- As intermediary: Notify the SME customer (the controller); they handle regulator/individual notification

**Key findings**:
- **Controller data**: users table (email, fullName, clerkUserId), businesses table (contactEmail, taxId, address), push_subscriptions (device tokens)
- **Intermediary data**: accounting_entries (financial transactions), expense_claims (receipts, amounts, vendor details), invoices (customer documents), LHDN e-invoice data
- **Sub-processors**: Clerk (auth/identity), Stripe (billing), Convex (database), AWS (infrastructure/storage), Modal (AI inference)
- Each sub-processor should be contractually bound to notify Groot Finance of breaches promptly

**Alternatives considered**:
- Treat all data as controller data (rejected: legally inaccurate, would create unnecessary direct notification obligations for customer data)
- Treat all data as intermediary data (rejected: Groot Finance clearly controls its own user registration and platform data)

## R-004: GitHub Issues as Incident Register

**Decision**: Use GitHub Issues in `grootdev-ai/groot-finance` as the standing incident register for both SG and MY jurisdictions.

**Rationale**: GitHub Issues provides timestamped records, labels (severity, jurisdiction, status), assignees, comment threads for evidence, and search/filter capabilities. The team already uses GitHub Issues for project management. SG Section 26E requires all breaches to be documented with "facts, assessment findings, and actions" — a GitHub Issue with structured comments satisfies this. The register must be producible to either regulator on request.

**Implementation approach**:
- **Labels**: `breach:P1-critical`, `breach:P2-high`, `breach:P3-medium`, `breach:P4-low`, `jurisdiction:MY`, `jurisdiction:SG`, `jurisdiction:both`, `status:investigating`, `status:contained`, `status:resolved`, `status:false-alarm`, `notified:regulator`, `notified:individuals`
- **Issue template**: Standardized template with fields matching SG Section 26E requirements
- **Confidentiality**: Issues should be in a private repository or a dedicated private repo if the main repo has broader access

**Alternatives considered**:
- Dedicated incident management tool like PagerDuty/Opsgenie (rejected: overhead for small team, adds cost, already have GitHub)
- Markdown files in repo per incident (rejected: harder to search/filter, no comment threads, no labels)
- Spreadsheet/Google Sheets (rejected: no version control, not easily producible as audit trail)

## R-005: Existing Infrastructure for Breach Detection

**Decision**: Document current detection mechanisms as-is (active/planned/not configured) without implementing new tools.

**Rationale**: The SOP is a documentation deliverable. Implementing new monitoring (e.g., GuardDuty) is out of scope per the spec.

**Key findings — Current state**:

| Mechanism | Status | Alert Channel | Detects |
|-----------|--------|---------------|---------|
| CloudWatch Alarms (Lambda errors) | Active | SNS → Email | Lambda execution failures, unusual error rates |
| CloudWatch Alarms (SES bounce/complaint) | Active | SNS → Email | Email delivery anomalies |
| CloudWatch Alarms (cert expiry) | Active | SNS → Email | Certificate nearing expiration |
| Sentry error tracking | Active | Telegram, Discord (webhook) | Application errors, unhandled exceptions |
| Sentry PII scrubbing | Active | N/A | Prevents sensitive data in error reports |
| Clerk authentication | Active | Webhook → user sync | User creation/update/deletion events |
| Clerk suspicious activity | Not configured | N/A | Login anomalies (built-in but not set up) |
| AWS GuardDuty | Not configured | N/A | Network-level threat detection, unauthorized access |
| User reports | Active | admin@hellogroot.com | User-reported issues |
| CloudWatch Logs (all Lambdas) | Active | CloudWatch (30-day retention) | Application-level logging |
| Audit logging (Convex) | Active | Convex database | Permission changes, data access, deletions |
| Rate limiting | Active (optional) | N/A | Brute force, abuse detection |
| CSRF protection | Active | N/A | Cross-site request forgery |
| RBAC authorization | Active | N/A | Unauthorized access attempts |

**Gaps identified**:
- No GuardDuty (network-level threats)
- No Clerk suspicious activity monitoring configured
- No dedicated security contact email (e.g., security@hellogroot.com)
- CloudWatch log retention is 30 days — may need extension for compliance evidence

## R-006: Sub-Processor Breach Notification Contacts

**Decision**: Include a sub-processor contact directory in the SOP as a placeholder table. Actual contacts to be populated during implementation (DEP-004).

**Rationale**: FR-016 requires a sub-processor contact directory. The contacts need to be gathered from each provider's security/trust documentation.

**Known contact channels** (to be verified):
- **Clerk**: Trust center at clerk.com/trust, status page at status.clerk.com
- **Stripe**: Security page at stripe.com/docs/security, breach notification per DPA
- **Convex**: Security documentation at docs.convex.dev/trust
- **AWS**: AWS Security Bulletins, shared responsibility model, PHD (Personal Health Dashboard)
- **Modal**: Security contact to be determined (smaller provider, may need direct outreach)

**Alternatives considered**: N/A — directory is required by FR-016
