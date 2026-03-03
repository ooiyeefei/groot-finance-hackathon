# Feature Specification: PDPA Compliance — Security Measures Documentation

**Feature Branch**: `001-pdpa-sec-measures-doc`
**Created**: 2026-03-03
**Status**: Draft
**Input**: GitHub Issue #241 — Document all existing security controls for compliance audits and customer security questionnaires
**Deliverable**: `docs/compliance/security-measures.md`

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Compliance Officer Reviews Security Posture (Priority: P1)

A compliance officer (internal or external auditor) needs to review Groot Finance's security measures to verify PDPA compliance. They open the security measures document and find a structured, comprehensive inventory of all security controls organized by domain (authentication, authorization, encryption, etc.). Each control includes what it does, how it protects data, and where it is implemented in the codebase.

**Why this priority**: This is the primary use case — without a complete, accurate security document, the company cannot pass compliance audits or demonstrate PDPA adherence. It directly addresses regulatory risk.

**Independent Test**: Can be fully tested by having a compliance reviewer read the document and confirm all 8 security domains are covered with sufficient detail to answer standard audit questions.

**Acceptance Scenarios**:

1. **Given** a compliance officer opens `docs/compliance/security-measures.md`, **When** they look for authentication controls, **Then** they find Clerk integration details, JWT validation, MFA support, and session management documented with code references.
2. **Given** an auditor checks for data protection measures, **When** they review the encryption section, **Then** they find at-rest encryption (SSM SecureString/KMS, S3 AES-256), in-transit encryption (TLS 1.2+), and secret management practices documented.
3. **Given** an auditor asks about access control, **When** they review the authorization section, **Then** they find the RBAC model (Owner > Admin > Manager > Employee), multi-tenant isolation by businessId, and server-side role enforcement documented.
4. **Given** an auditor looks for audit trail capabilities, **When** they check the audit & monitoring section, **Then** they find the audit_events system, Sentry PII scrubbing, CloudWatch logging, and Clerk login monitoring documented.

---

### User Story 2 - Sales Team Answers Customer Security Questionnaire (Priority: P2)

A sales team member receives a security questionnaire from a prospective enterprise customer. They use the security measures document as a reference to answer questions about data handling, encryption, access controls, and compliance posture. The document is organized in a way that maps to common security questionnaire categories.

**Why this priority**: Directly impacts revenue — enterprise customers require security documentation before signing contracts. A well-structured document accelerates the sales cycle and builds trust.

**Independent Test**: Can be tested by taking a standard security questionnaire template (e.g., CAIQ, SIG, or VSA) and confirming that at least 80% of questions can be answered using information from the document.

**Acceptance Scenarios**:

1. **Given** a customer asks "How do you handle authentication?", **When** the sales team checks the document, **Then** they find a clear answer covering Clerk OAuth 2.0, email/password, MFA support, and SOC 2 Type II certification of the provider.
2. **Given** a customer asks "Do you store credit card data?", **When** the sales team checks the payment security section, **Then** they find a clear statement that all payment data is handled by Stripe (PCI Level 1) and no card numbers are stored in Groot Finance systems.
3. **Given** a customer asks "How do you handle data deletion?", **When** the sales team checks the data protection section, **Then** they find information about soft deletion for audit trail preservation and user anonymization on account deletion.

---

### User Story 3 - Developer Maintains Security Documentation (Priority: P3)

A developer adds a new security control (e.g., a new Lambda function with IAM policy, a new encrypted storage mechanism, or a new audit event type). They update the security measures document to reflect the change, following the established structure and referencing the relevant code files and CDK stacks.

**Why this priority**: Documentation must stay current to remain useful. Without a clear maintenance pattern, the document becomes stale and unreliable for compliance purposes.

**Independent Test**: Can be tested by having a developer locate the correct section for a hypothetical new control and confirm the document structure makes it obvious where to add the update.

**Acceptance Scenarios**:

1. **Given** a developer adds a new Lambda function with IAM policy, **When** they open the security document, **Then** they find an infrastructure security section with a clear pattern showing how existing Lambda functions and IAM policies are documented, making it easy to add the new entry.
2. **Given** a developer adds a new audit event type, **When** they look at the audit & monitoring section, **Then** they find the existing event types listed with descriptions, and can add the new type following the same format.

---

### Edge Cases

- What happens when a third-party provider (Clerk, Stripe, Sentry) updates their security certifications? The document must note certification dates and provide links to provider security pages for the latest status.
- How does the document handle controls that span multiple code areas (e.g., multi-tenant isolation is enforced in Convex schema, application queries, and middleware)? Cross-references between sections should link related controls.
- What if an auditor asks about a control not yet implemented (e.g., dedicated data export API for right-of-access requests)? The document should distinguish between implemented controls and planned/roadmap items.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Document MUST cover all 8 security domains: (1) Authentication & Identity, (2) Authorization & Access Control, (3) Encryption & Secure Storage, (4) Infrastructure Security, (5) Audit & Monitoring, (6) Code Security & Headers, (7) Data Protection & Privacy, (8) Payment Security.
- **FR-002**: Each security control MUST include a human-readable description of what it does and why it exists, without requiring the reader to understand code.
- **FR-003**: Each security control MUST reference the specific codebase location using file path + symbol name format (e.g., `infra/lib/cdn-stack.ts → CdnStack`), so a technical reviewer can verify the claim. Line numbers MUST NOT be used as they go stale on every edit.
- **FR-004**: Document MUST clearly identify third-party providers (Clerk, Stripe, Sentry, AWS) and their relevant security certifications (SOC 2, PCI DSS, etc.) with links to their security/compliance pages.
- **FR-005**: Document MUST distinguish between controls that are fully implemented in the current codebase and any controls that are planned but not yet deployed.
- **FR-006**: Document MUST include a "Last Updated" date and a version history section to track when the document was last reviewed and by whom.
- **FR-007**: Document MUST be written in Markdown format and stored at `docs/compliance/security-measures.md` within the repository.
- **FR-008**: The authentication section MUST document: Clerk JWT validation, session management, webhook-based user lifecycle sync, and MFA availability.
- **FR-009**: The authorization section MUST document: the 4-tier RBAC model (Owner, Admin, Manager, Employee), permission matrix, multi-tenant isolation via businessId scoping, server-side role enforcement, and MCP tool permission controls.
- **FR-010**: The encryption section MUST document: at-rest encryption (AWS SSM SecureString with KMS, S3 server-side encryption AES-256, Convex managed encryption), in-transit encryption (TLS 1.2+ enforced), and secret management practices (SSM Parameter Store only, no secrets in code/DB/env vars).
- **FR-011**: The infrastructure security section MUST document: IAM least-privilege policies with specific resource ARN scoping, Vercel OIDC federated identity (no long-lived credentials), CloudFront Origin Access Control and signed URLs, Lambda IAM-only invocation (no public endpoints), and certificate expiry monitoring.
- **FR-012**: The audit & monitoring section MUST document: Convex audit_events table (fields, access restrictions, multi-tenant scoping), Sentry error tracking with PII scrubbing rules, CloudWatch Lambda execution logs with retention settings, and Clerk login activity monitoring.
- **FR-013**: The code security section MUST document: disabled production source maps, removed X-Powered-By header, external Lambda bundle modules, React strict mode, and Sentry source map upload with hide-source-maps.
- **FR-014**: The data protection section MUST document: soft deletion pattern (preserving audit trail), user anonymization on account deletion, CloudFront signed URLs with time-limited access, multi-tenant data isolation, webhook idempotency (Clerk + Stripe), and email preference/unsubscribe management.
- **FR-015**: The payment security section MUST document: Stripe as sole payment processor (PCI Level 1), no card data stored in Groot Finance systems, webhook signature verification, and event deduplication.
- **FR-016**: Document MUST be usable by non-technical readers (sales team, business stakeholders) while providing enough technical detail for auditors and developers.

### Key Entities

- **Security Control**: A specific measure implemented to protect data, users, or systems. Attributes: name, description, domain (which of the 8 categories), implementation location (file/stack reference), status (implemented/planned), related third-party provider (if any).
- **Security Domain**: A category grouping related security controls (e.g., "Authentication & Identity", "Encryption & Secure Storage"). Attributes: name, description, list of controls.
- **Third-Party Provider**: An external service that handles part of the security posture. Attributes: name, role, security certifications, compliance page URL.
- **Code Reference**: A pointer to where a control is implemented using file path + symbol name format (e.g., `infra/lib/cdn-stack.ts → CdnStack`). Attributes: file path, symbol/class/function name, brief description of what the code does. No line numbers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Document covers 100% of the 8 security domains with at least 3 specific controls documented per domain.
- **SC-002**: At least 80% of questions from a standard security questionnaire (SIG Lite or equivalent) relevant to the product's scope can be answered using information from the document alone.
- **SC-003**: Every documented control includes both a non-technical description (readable by sales/business stakeholders) and a technical reference (file path or stack name verifiable by developers).
- **SC-004**: A new team member can locate the relevant section and understand any specific security control within 2 minutes of opening the document.
- **SC-005**: The document accurately reflects the current state of the codebase — no control is documented that does not exist in code, and no implemented control visible in the codebase audit is missing from the document.

## Clarifications

### Session 2026-03-03

- Q: What format should code references use for each security control? → A: File path + symbol name (e.g., `infra/lib/cdn-stack.ts → CdnStack`) — stable and semantically meaningful, no line numbers.
- Q: Should the document be shared directly with customers or used as an internal reference? → A: Internal reference only — sales team extracts answers into customer questionnaire forms; document is never shared directly with external parties.

## Assumptions

- The document will be maintained manually as part of the development workflow (updated when security-relevant changes are made). No automated documentation generation is required at this stage.
- The 8 security domains identified from the codebase audit are comprehensive for PDPA compliance. If additional domains are required by specific regulations, they will be added in future iterations.
- Third-party provider certifications (Clerk SOC 2, Stripe PCI DSS) are current and accurate as of the document creation date. The document will link to provider security pages rather than reproducing certification details.
- The document is strictly for internal reference. It is never shared directly with external parties. The sales team uses it to extract answers into customer security questionnaire forms. Full technical detail (including code paths) is appropriate since no external audience will see the raw document.
- PDPA-specific requirements (data protection officer, cross-border transfer, breach notification) are covered by separate documents in the compliance suite and are out of scope for this security measures document.

## Dependencies

- Codebase audit findings (completed as part of this specification process) — provides the source data for all documented controls.
- Access to third-party provider security pages (Clerk, Stripe, Sentry, AWS) for certification details and links.
- Related PDPA compliance documents: breach notification SOP (`001-pdpa-breach-notif-sop`), consent collection (`001-pdpa-consent-collect`), data retention cleanup (`pdpa-data-retention-cleanup`), data rights (`pdpa-data-right-clerk-convex`).

## Out of Scope

- Implementing new security controls — this feature documents existing controls only.
- Automated compliance scanning or monitoring tools.
- PDPA-specific procedural documents (breach notification, consent management, data subject rights workflows) — these are separate features.
- Penetration testing or vulnerability assessment reports.
- Security training materials for staff.
