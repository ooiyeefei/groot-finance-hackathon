# Feature Specification: PDPA Breach Notification SOP

**Feature Branch**: `001-pdpa-breach-notif-sop`
**Created**: 2026-03-03
**Status**: Draft
**Input**: GitHub Issue #238 — PDPA Compliance: Breach Notification SOP
**External Ref**: https://github.com/grootdev-ai/groot-finance/issues/238

## Clarifications

### Session 2026-03-03

- Q: Should the SOP include a standing incident register for tracking all security incidents over time, and what tool should be used? → A: Use GitHub Issues as the incident register for both SG and MY jurisdictions. Each incident (including false alarms) is filed as a GitHub Issue with labels for severity, jurisdiction, and status. This satisfies SG PDPA Section 26E record-keeping (all breaches documented with facts, assessment findings, and actions) and MY PDPA requirements.
- Q: Which jurisdiction's requirements should apply when MY and SG have different thresholds/timelines? → A: Always apply the strictest requirement across both jurisdictions. For timelines, use MY's "as soon as possible" (internal target: 2 hours). For record-keeping, use SG's Section 26E (all breaches, not just notifiable). For data categories triggering notification, use SG's 7 prescribed categories plus any additional MY categories when guidelines are published.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Classify and Respond to a Detected Breach (Priority: P1)

A team member detects a potential data breach — through a CloudWatch alarm, Sentry alert, Clerk suspicious activity, AWS GuardDuty finding, or a user report to admin@hellogroot.com. The Incident Commander (CTO/Founder) uses the SOP to classify the severity (P1–P4), conduct a breach assessment, determine whether MY PDPC and/or SG PDPC notification is required, and initiate the response within the legally mandated timeframes.

**Why this priority**: This is the core purpose of the SOP. Without a clear classification and response procedure, the team cannot meet Malaysia's "as soon as possible" or Singapore's "3 calendar days from assessment completion" notification deadlines, risking regulatory penalties up to SGD 1M or 10% of SG turnover (whichever is higher) and MY criminal penalties up to RM 500,000 and/or imprisonment.

**Independent Test**: Can be fully tested by running a tabletop exercise where a simulated breach scenario is presented, and the Incident Commander walks through the SOP to classify severity, determine notification obligations, and trigger the correct response actions within specified timeframes.

**Acceptance Scenarios**:

1. **Given** a P1 Critical alert (personal data exposed/exfiltrated), **When** the Incident Commander reviews the SOP, **Then** they can determine within 15 minutes: (a) severity classification, (b) whether prescribed personal data categories are involved (SG's 7 categories), (c) which regulators to notify, (d) the notification deadline, and (e) the first three containment actions.
2. **Given** a P2 High alert (unauthorized access detected), **When** the Technical Lead follows the SOP, **Then** they can identify the containment steps, evidence preservation requirements, and escalation path within 30 minutes.
3. **Given** an incident that affects users in both Malaysia and Singapore, **When** the team follows the SOP, **Then** they can determine the notification requirements for each jurisdiction separately, applying the strictest timeline (MY's "as soon as possible" = internal 2-hour target) and using each jurisdiction's correct regulator portal.
4. **Given** a P3 Medium incident (near-miss, anomalous access pattern), **When** the team follows the SOP, **Then** they know to document the incident in the GitHub Issues incident register, investigate without regulatory notification, and understand the threshold that would escalate it to P2/P1.

---

### User Story 2 - Notify Regulators (MY PDPC and SG PDPC) (Priority: P1)

When a breach meets the notification threshold, the designated team member uses the SOP to prepare and submit regulatory notifications. Under SG PDPA, the two grounds are: (a) breach involves prescribed personal data likely to cause significant harm, OR (b) 500+ individuals affected. Under MY PDPA (Section 12B, effective 1 June 2025), notification is required when significant harm is likely or significant scale is reached. The SOP applies the strictest threshold across both.

**Why this priority**: Regulatory notification is a legal obligation with strict deadlines. Malaysia requires notification "as soon as possible" (no defined upper limit — the SOP targets 2 hours). Singapore requires notification within 3 calendar days of assessment completion. Failure carries penalties: SG up to SGD 1M or 10% turnover; MY up to RM 500,000 and/or 2–3 years imprisonment.

**Independent Test**: Can be fully tested by preparing a mock notification submission using the SOP's templates and checklists, verifying all required fields are addressed before navigating to the regulator portal.

**Acceptance Scenarios**:

1. **Given** a notifiable breach affecting Malaysian users, **When** the Communications lead follows the SOP, **Then** they have a checklist of required information and the correct submission channel (JPDP portal at pdp.gov.my, phone 03-7456 3888, email aduan@pdp.gov.my), targeting submission within 2 hours.
2. **Given** a notifiable breach affecting Singaporean users, **When** the Communications lead follows the SOP, **Then** they have a checklist covering all 10 required PDPC fields (date discovered, how discovered, how it occurred, number affected, data categories, potential harm assessment, remedial steps taken, future remedial actions, individual notification plan, and authorised representative contact) and the correct portal URL (https://www.pdpc.gov.sg/), targeting submission within 24 hours (well within the 3-day statutory deadline from assessment completion).
3. **Given** a breach that does NOT meet notification thresholds, **When** the team reviews the SOP decision tree, **Then** they document the decision not to notify in the GitHub Issues incident register with supporting rationale, satisfying SG Section 26E record-keeping requirements.
4. **Given** a breach involving any of SG's 7 prescribed personal data categories (financial information, vulnerable individual identification data, insurance information, medical information including HIV/STD/mental health, adoption records, private cryptographic keys, or account access credentials), **When** the team reviews the SOP decision tree, **Then** the breach is automatically flagged as potentially notifiable under the "significant harm" ground.

---

### User Story 3 - Notify Affected Users (Priority: P1)

When affected users must be notified, the Communications lead uses the SOP's email notification template. Under SG PDPA, individual notification is required when the "significant harm" ground is met (not for the 500+ ground alone). Under MY PDPA, notification to data subjects is required "without unnecessary delay" when significant harm is likely. The SOP applies the strictest standard: notify individuals whenever either jurisdiction's threshold is met.

**Why this priority**: Both MY PDPA and SG PDPA require notification to affected individuals. User notification is a legal requirement and critical to maintaining trust.

**Independent Test**: Can be fully tested by reviewing the notification template against regulatory requirements and sending a test email through the existing SES infrastructure to verify formatting and completeness.

**Acceptance Scenarios**:

1. **Given** a breach where user personal data has been compromised, **When** the Communications lead uses the SOP template, **Then** the notification email includes all required sections per SG PDPA (the strictest): (a) breach circumstances, (b) data types affected, (c) potential harm description, (d) Groot Finance's remedial actions, (e) individual self-help steps, (f) representative contact details.
2. **Given** a breach affecting users across multiple businesses (multi-tenant), **When** the team follows the SOP, **Then** notifications are scoped per business — each business's affected users receive a notification specific to their data, not a generic blast.
3. **Given** a breach where the scope is still being determined, **When** the team follows the SOP, **Then** they know the guidelines for sending an initial notification with available information, followed by updates as the investigation progresses.

---

### User Story 4 - Conduct Post-Incident Review (Priority: P2)

After containment and notification are complete, the Incident Commander initiates a post-incident review within 7 days. The team uses the SOP's post-incident checklist to conduct a root cause analysis, document lessons learned, update security measures, and update the SOP itself if gaps are found.

**Why this priority**: Post-incident review prevents repeat breaches and demonstrates due diligence to regulators. It is essential but not time-critical like detection/notification.

**Independent Test**: Can be fully tested by completing the post-incident review template after a tabletop exercise, verifying it captures root cause, timeline, remediation actions, and SOP improvement recommendations.

**Acceptance Scenarios**:

1. **Given** a breach incident has been contained and notifications sent, **When** the Incident Commander initiates the post-incident review, **Then** the SOP provides a structured template covering: timeline reconstruction, root cause analysis, remediation plan, and SOP improvement recommendations.
2. **Given** the post-incident review is complete, **When** findings identify gaps in the SOP, **Then** the document includes a clear process for updating the SOP (who approves changes, version control).
3. **Given** any incident (including false alarms), **When** the post-incident review is complete, **Then** the GitHub Issues incident register entry is updated with the review findings, satisfying SG Section 26E record-keeping requirements.

---

### User Story 5 - Verify Detection Mechanisms (Priority: P2)

A new team member or the Technical Lead uses the SOP as a reference to verify that all detection mechanisms are properly configured and operational. The SOP documents what should be monitored, current alert channels, and known gaps to be addressed.

**Why this priority**: Detection mechanisms must be in place before a breach occurs, but this is a setup/maintenance activity rather than an incident response action.

**Independent Test**: Can be fully tested by using the SOP's detection checklist to audit current monitoring infrastructure and verify each listed mechanism is operational or documented as a planned gap.

**Acceptance Scenarios**:

1. **Given** the SOP is read by a new team member, **When** they review the detection mechanisms section, **Then** they understand which monitoring tools are active, which channels receive alerts, and what gaps exist.
2. **Given** a quarterly SOP review, **When** the Technical Lead reviews the detection section, **Then** they can audit each mechanism against the documented state and update the SOP if new monitoring has been added or removed.

---

### User Story 6 - Handle Data Intermediary Breach (Priority: P2)

When Groot Finance processes data on behalf of an SME customer (acting as a data intermediary/processor), and a breach occurs affecting that customer's data, the Technical Lead uses the SOP to notify the affected SME customer so they can fulfill their own regulatory notification obligations. Under SG PDPA, data intermediaries must notify the data controller "without undue delay." Under MY PDPA, processors must comply with the Security Principle and contractually notify controllers.

**Why this priority**: Groot Finance has a dual role — data controller for its own user data AND data intermediary for SME customer data. The notification chain differs for each role. Getting this wrong could leave an SME customer unable to meet their own regulatory deadlines.

**Independent Test**: Can be fully tested by simulating a breach affecting customer business data, and verifying the SOP correctly routes notification to the affected SME customer (not directly to their end-users or regulators on their behalf).

**Acceptance Scenarios**:

1. **Given** a breach affecting data processed on behalf of an SME customer, **When** the team follows the SOP, **Then** they notify the affected SME customer "without undue delay" (SG PDPA requirement) with sufficient detail for the customer to assess their own notification obligations.
2. **Given** a breach affecting both Groot Finance's own user data AND SME customer data, **When** the team follows the SOP, **Then** they execute both notification chains: (a) regulator + individual notification for Groot Finance's own data (as controller), AND (b) customer notification for SME data (as intermediary).

---

### Edge Cases

- What happens when a breach is detected outside business hours (weekend/holiday)? The SOP must define an on-call escalation path with mobile contact numbers.
- What happens when the Incident Commander is unavailable? The SOP must define a chain of command with alternates for each role.
- What happens when a breach affects users whose country of residence is unknown? The SOP must define a conservative default (assume notification required for both jurisdictions, apply strictest timeline).
- What happens when a third-party service (Clerk, Stripe, Convex) is the source of the breach? The SOP must clarify Groot Finance's notification obligations versus the third party's, referencing the sub-processor contact directory.
- What happens when the breach scope cannot be determined within the notification deadline? The SOP must guide on submitting preliminary notifications with available information and updating later.
- What happens when a reported "breach" turns out to be a false alarm? The SOP must define how to close out the GitHub Issues incident register entry and document the false alarm for audit purposes (required by SG Section 26E).
- What happens when the breach involves prescribed personal data categories (SG's 7 types)? The SOP must automatically flag this as potentially notifiable under the "significant harm" ground without requiring a full assessment first.
- What happens when Groot Finance is acting as a data intermediary and the breach affects an SME customer's data? The SOP must route notification to the customer, not directly to regulators on the customer's behalf.

## Requirements *(mandatory)*

### Functional Requirements

#### Severity & Classification

- **FR-001**: The SOP document MUST define a severity classification system with four levels (P1 Critical, P2 High, P3 Medium, P4 Low) including specific criteria and maximum response times for each level.
- **FR-002**: The SOP document MUST define "data breach" consistently with both Acts: unauthorised access, collection, use, disclosure, copying, modification, or disposal of personal data; OR loss of a storage medium where unauthorised access to the personal data is likely (aligned with SG PDPA Section 26A).

#### Regulatory Notification — Malaysia

- **FR-003**: The SOP document MUST include Malaysia-specific notification procedures per Section 12B (effective 1 June 2025) with: notification threshold criteria (significant harm likely OR significant scale), submission channels (JPDP portal at pdp.gov.my, phone 03-7456 3888, email aduan@pdp.gov.my), required information fields, and the "as soon as possible" timeline (internal target: within 2 hours of confirmation).
- **FR-004**: The SOP document MUST include a Malaysia regulatory notification checklist listing every required field with guidance on how to gather the information, aligned with the JPDP's Personal Data Breach Notification Guidelines.

#### Regulatory Notification — Singapore

- **FR-005**: The SOP document MUST include Singapore-specific notification procedures per Part VIA with: two notification grounds ((a) prescribed personal data likely to cause significant harm, (b) 500+ individuals affected), PDPC portal URL, all 10 required notification fields, and the 3-calendar-day timeline from assessment completion.
- **FR-006**: The SOP document MUST list Singapore's 7 prescribed personal data categories that trigger the "significant harm" ground: (1) non-public financial information, (2) vulnerable individual identification data, (3) life/accident/health insurance information, (4) specified medical information including HIV/STD/mental health, (5) adoption records, (6) private cryptographic keys, (7) account access credentials (username + password/PIN).
- **FR-007**: The SOP document MUST include a Singapore regulatory notification checklist covering all 10 PDPC-required fields: date discovered, how discovered, how it occurred, number affected, data categories, potential harm assessment, remedial steps taken, future remedial actions, individual notification plan (or grounds for not notifying), and authorised representative contact.

#### Notification Decision Tree

- **FR-008**: The SOP document MUST include a notification decision tree that guides the team through: (a) Is this a data breach per the legal definition? (b) Does it involve SG prescribed personal data categories? (c) Are 500+ individuals affected? (d) Is significant harm likely? (e) Which jurisdictions are affected? (f) What is the notification timeline for each?

#### Affected User Notification

- **FR-009**: The SOP document MUST include an affected-user email notification template containing all fields required by the strictest jurisdiction (SG PDPA): breach circumstances, data types affected, potential harm description, Groot Finance's remedial actions, individual self-help steps, and representative contact details.

#### Incident Response Team & Escalation

- **FR-010**: The SOP document MUST define the Incident Response Team with named roles (Incident Commander, Technical Lead, Communications, Legal), their responsibilities, and alternates for each role.
- **FR-011**: The SOP document MUST define escalation procedures including: out-of-hours contacts, chain of command when the primary Incident Commander is unavailable, and maximum escalation time before the next-in-line assumes command.

#### Detection & Monitoring

- **FR-012**: The SOP document MUST list all detection mechanisms with their current operational status (active, planned, not configured), alert channels, and what each mechanism detects.

#### Post-Incident & Record-Keeping

- **FR-013**: The SOP document MUST include a post-incident review template covering: incident timeline, root cause analysis, remediation actions, lessons learned, and SOP update recommendations.
- **FR-014**: The SOP document MUST define incident register procedures using GitHub Issues, requiring that ALL breaches and suspected breaches (not just notifiable ones) be logged with: date, severity classification, facts of the breach, assessment findings, actions taken, notification decisions, and outcome. This satisfies SG PDPA Section 26E and MY PDPA record-keeping requirements. The register must be producible to either regulator on request.

#### Evidence Preservation

- **FR-015**: The SOP document MUST include an evidence preservation section specifying what logs, screenshots, and data must be retained during an incident and for how long.

#### Third-Party & Sub-Processor

- **FR-016**: The SOP document MUST address third-party breach scenarios with guidance on Groot Finance's notification obligations when the breach originates from a sub-processor. This MUST include a sub-processor contact directory listing each third party (Clerk, Stripe, Convex, AWS, Modal), their breach notification contact/channel, their contractual SLA for breach notification, and Groot Finance's obligations upon receiving such a notification.
- **FR-017**: The SOP document MUST include a data intermediary notification procedure for when Groot Finance (as processor) must notify an affected SME customer "without undue delay" (SG PDPA), including what information to provide the customer to enable them to assess their own notification obligations.

#### Personal Data Inventory

- **FR-018**: The SOP document MUST define a personal data inventory summarizing: categories of personal data Groot Finance processes, where it is stored, which of SG's 7 prescribed categories are present, approximate volume of data subjects per jurisdiction, and Groot Finance's role (controller vs intermediary) for each data category.

#### Breach Assessment

- **FR-019**: The SOP document MUST define a breach assessment procedure that the team completes before the notification clock starts (per SG PDPA, the 3-day clock starts from assessment completion, not from awareness). The assessment must be completed "in a reasonable and expeditious manner" (PDPC recommends within 30 days of awareness).

#### Document Control

- **FR-020**: The SOP document MUST include version control metadata (version number, last reviewed date, next review date, approved by) and a change log.

### Key Entities

- **Incident**: A detected security event being investigated — has severity level (P1–P4), status (detected, assessing, investigating, contained, resolved), affected systems, affected data subjects count, applicable jurisdiction(s), and GitHub Issues reference number. Distinct from "data breach" which is a confirmed incident meeting the legal definition.
- **Data Breach**: A confirmed incident meeting the legal definition under either Act (unauthorised access, collection, use, disclosure, copying, modification, or disposal of personal data; or loss of storage medium where unauthorised access is likely). May or may not be "notifiable."
- **Notifiable Data Breach**: A data breach that meets the notification threshold under either jurisdiction: (a) involves SG prescribed personal data likely to cause significant harm, (b) affects 500+ individuals, or (c) meets MY significant harm/scale criteria.
- **Detection Mechanism**: A monitoring tool or process that can trigger a breach investigation — has name, operational status (active/planned/not configured), alert channel, and detection scope.
- **Regulatory Notification**: A formal submission to a data protection authority — has target jurisdiction (MY/SG), submission channel, required information fields, deadline, and submission status.
- **Affected User Notification**: A communication sent to data subjects whose personal data was compromised — has email template, delivery channel, scope (per-business in multi-tenant context), and status (drafted/sent/updated).
- **Post-Incident Report**: A structured review document produced after incident resolution — has root cause, incident timeline, remediation plan, lessons learned, and SOP improvement recommendations.
- **Personal Data Category**: A classification of personal data processed by Groot Finance — has data type, storage location, whether it is a SG prescribed category, approximate data subjects count, applicable jurisdiction(s), and Groot Finance's role (controller/intermediary).
- **Sub-Processor**: A third-party service that processes personal data on Groot Finance's behalf — has name, service provided, breach notification contact, contractual SLA, and data categories handled.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The Incident Commander can classify a breach severity level within 15 minutes of reviewing the SOP, with no ambiguity between severity levels.
- **SC-002**: The team can prepare and submit a complete regulatory notification to MY PDPC within 2 hours of a P1 incident being confirmed, using only the SOP checklists and templates. This exceeds the "as soon as possible" statutory requirement by setting a concrete internal target.
- **SC-003**: The team can prepare and submit a complete regulatory notification to SG PDPC within 24 hours of breach assessment completion (well within the 3-calendar-day statutory deadline), using only the SOP checklists and templates.
- **SC-004**: An affected-user notification email can be drafted and ready for review within 1 hour of a decision to notify, using the SOP template.
- **SC-005**: A new team member can read the SOP and correctly identify the escalation path, detection mechanisms, and their role in an incident within 30 minutes.
- **SC-006**: Post-incident review is completed within 7 calendar days of incident resolution.
- **SC-007**: 100% of incidents (including false alarms) are logged in the GitHub Issues incident register with severity classification, assessment findings, actions taken, and outcome — satisfying SG Section 26E and producible to regulators on request.
- **SC-008**: The SOP is reviewed and updated at least once per quarter, or within 7 days of any incident that reveals gaps.
- **SC-009**: Breach assessment is completed within 30 calendar days of awareness, after which the SG 3-day notification clock starts.

## Regulatory Reference Summary

### Strictest Requirements Applied (MY vs SG)

| Aspect | MY PDPA (Section 12B) | SG PDPA (Part VIA) | Strictest (Applied) |
|--------|----------------------|---------------------|---------------------|
| Effective date | 1 June 2025 | 1 February 2021 | Both active |
| Regulator notification timeline | "As soon as possible" | 3 calendar days from assessment completion | MY — open-ended (internal target: 2 hours) |
| Individual notification timeline | "Without unnecessary delay" | When significant harm ground is met | Both — notify whenever either threshold met |
| Notification trigger (harm) | Significant harm likely | 7 prescribed data categories | SG — more specific categories |
| Notification trigger (scale) | Significant scale (TBD in guidelines) | 500+ individuals | SG — explicit 500 threshold |
| Record-keeping | Required (details in guidelines) | ALL breaches documented (Section 26E) | SG — all breaches, not just notifiable |
| Data intermediary duty | Comply with Security Principle; contractual notification | Notify controller "without undue delay" | SG — explicit statutory duty |
| Penalties | RM 300K–500K and/or 2–3 years imprisonment | SGD 1M or 10% of SG turnover (whichever higher) | Both apply to respective jurisdictions |
| Assessment requirement | Not explicitly defined | Must assess "reasonably and expeditiously" (≤30 days recommended) | SG — formal assessment phase |

### Singapore's 7 Prescribed Personal Data Categories

1. Non-public financial information (e.g., bank account numbers, credit card numbers)
2. Vulnerable individual identification data (e.g., NRIC of minors or vulnerable persons)
3. Life, accident, or health insurance information
4. Specified medical information including HIV status, STD, mental health
5. Adoption records
6. Private cryptographic keys (e.g., digital signature keys)
7. Account access credentials (username + password or security question answers)

## Assumptions

- **A-001**: The SOP document will be authored as a Markdown file at `docs/compliance/breach-notification-sop.md` within the Groot Finance repository, making it version-controlled and accessible to all team members.
- **A-002**: Groot Finance currently operates in Malaysia and Singapore only. If the company expands to other jurisdictions, the SOP will need to be updated with additional regulatory requirements.
- **A-003**: The Incident Commander role defaults to the CTO/Founder. As the team grows, a dedicated Data Protection Officer (DPO) may be appointed.
- **A-004**: Existing notification infrastructure (SES email, Telegram bot, Discord webhook) is sufficient for breach communications. No new notification systems need to be built for this SOP.
- **A-005**: Malaysia's "as soon as possible" requirement is addressed with an internal 2-hour target, which provides a concrete SLA while complying with the statutory language. This target should be reviewed when JPDP publishes detailed guidance.
- **A-006**: The personal data inventory in the SOP reflects the current Convex schema and AWS storage architecture. It must be updated whenever new PII fields or storage locations are added.
- **A-007**: Tabletop exercises (simulated breach drills) will be used to validate the SOP's effectiveness before a real incident occurs.
- **A-008**: Third-party processors (Clerk for auth, Stripe for billing, Convex for database, AWS for infrastructure, Modal for AI inference) have their own breach notification obligations, but Groot Finance retains the duty to notify its own users and regulators for data it controls.
- **A-009**: Groot Finance acts as a data controller for its own user/business data and as a data intermediary (processor) for SME customer business data. Notification obligations differ for each role.
- **A-010**: Singapore's 3-calendar-day notification deadline starts from the date the breach assessment is completed, not from the date of awareness. The assessment must be completed "in a reasonable and expeditious manner" — the SOP targets 30 days maximum per PDPC recommendation.
- **A-011**: GitHub Issues in the `grootdev-ai/groot-finance` repository will serve as the standing incident register for both jurisdictions, using labels for severity (P1–P4), jurisdiction (MY/SG/both), and status (investigating/contained/resolved/false-alarm).

## Scope & Boundaries

### In Scope

- Standard Operating Procedure document covering breach detection, classification, assessment, notification, and post-incident review
- Malaysia PDPA (Section 12B) and Singapore PDPA (Part VIA) notification requirements with strictest-of-both applied
- Incident Response Team roles and escalation procedures
- Affected-user email notification template (aligned to SG's 6-field requirement as the strictest)
- Regulatory notification checklists for both jurisdictions (MY and SG)
- Personal data inventory including SG prescribed data categories mapping
- Post-incident review template
- Detection mechanisms inventory (current state documentation)
- GitHub Issues-based incident register procedures
- Sub-processor contact directory and data intermediary notification procedures
- Breach assessment procedure (SG Section 26B)
- Notification decision tree incorporating both jurisdictions' thresholds

### Out of Scope

- Implementation of new monitoring tools (e.g., enabling AWS GuardDuty) — that is a separate engineering task
- Building automated breach detection pipelines or alerting systems
- Legal review of the SOP by external counsel (recommended but separate from document creation)
- PDPA compliance for data processing activities beyond breach notification (e.g., consent management, data subject access requests)
- Employee data protection training program (referenced as recommended but not delivered by this SOP)
- Contractual data processing agreements with third-party sub-processors (referenced in sub-processor directory but contract drafting is out of scope)
- Cross-border data transfer impact assessments (referenced but separate compliance activity)

## Dependencies

- **DEP-001**: Accurate personal data inventory requires current knowledge of the Convex schema and AWS storage architecture.
- **DEP-002**: Regulatory portal URLs and submission requirements must be verified against current MY PDPC (JPDP) and SG PDPC guidance at time of SOP authoring. Malaysia's detailed Breach Notification Guidelines should be checked for publication status.
- **DEP-003**: Incident Response Team member names and contact details must be provided by the CTO/Founder before the SOP can be finalized.
- **DEP-004**: Sub-processor breach notification contacts and SLAs must be gathered from each third-party provider (Clerk, Stripe, Convex, AWS, Modal) before the sub-processor directory can be completed.
