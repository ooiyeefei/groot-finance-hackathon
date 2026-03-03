# Tasks: PDPA Security Measures Documentation

**Input**: Design documents from `/specs/001-pdpa-sec-measures-doc/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Not applicable — this is a documentation deliverable. Validation is manual review against success criteria SC-001 through SC-005.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different sections, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single file**: `docs/compliance/security-measures.md` at repository root
- All tasks write to this single file unless noted otherwise

---

## Phase 1: Setup

**Purpose**: Create file and document skeleton

- [x] T001 Create directory `docs/compliance/` and initialize empty `docs/compliance/security-measures.md`
- [x] T002 Write document skeleton in `docs/compliance/security-measures.md` — title heading, metadata block (Last Updated, Version, Status, Purpose), and all 8 domain section headings (empty) per data-model.md top-level structure

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared content that ALL user stories depend on — must complete before domain sections

- [x] T003 Write the Third-Party Provider Summary table in `docs/compliance/security-measures.md` — 6 rows (Clerk, Stripe, Sentry, Convex, AWS, Vercel) with columns: Provider, Role, Certifications, Security Page URL. Use data from research.md Section 1.
- [x] T004 Establish the per-control entry format template as a visible example/comment at the top of the first domain section in `docs/compliance/security-measures.md` — must match data-model.md format: `#### [Control Name]` + description + `**Implementation**: file → symbol` + optional `**Provider**` + `**Status**: Implemented`

**Checkpoint**: Document structure ready with provider summary — domain section writing can now begin in parallel

---

## Phase 3: User Story 1 - Compliance Officer Reviews Security Posture (Priority: P1) 🎯 MVP

**Goal**: All 8 security domains fully documented with 31+ controls, each with human-readable description and code reference — auditor can verify PDPA compliance posture

**Independent Test**: A compliance reviewer reads the document and confirms all 8 domains are covered with sufficient detail to answer standard audit questions (SC-001: ≥3 controls per domain)

### Implementation for User Story 1

Write each domain section using the control inventory from data-model.md. Each control entry must include: human-readable description (FR-002), code reference in `file → symbol` format (FR-003), provider + certification if third-party (FR-004), and status (FR-005). Verify against the source files listed in research.md Section 2.

- [x] T005 [P] [US1] Write "1. Authentication & Identity" section in `docs/compliance/security-measures.md` — 3 controls: Clerk JWT Validation (`convex/auth.config.ts → auth.config`), Middleware Route Protection (`src/middleware.ts → clerkMiddleware`), Webhook User Lifecycle Sync (`src/domains/system/lib/webhook.service.ts → handleClerkUserCreated`). Include MFA availability note. Satisfies FR-008.
- [x] T006 [P] [US1] Write "2. Authorization & Access Control" section in `docs/compliance/security-measures.md` — 4 controls: RBAC Role Model (`convex/schema.ts → business_memberships`), Permission Matrix (`src/domains/security/lib/rbac.ts → determineUserRoles`), Multi-Tenant Isolation (`src/lib/db/business-context.ts → business-context`), MCP Tool Permission Controls (`src/lib/ai/mcp/mcp-permissions.ts → canAccessMcpTool`). Include 4-tier role hierarchy description. Satisfies FR-009.
- [x] T007 [P] [US1] Write "3. Encryption & Secure Storage" section in `docs/compliance/security-measures.md` — 3 controls: SSM SecureString / KMS Encryption (`infra/lib/digital-signature-stack.ts → DigitalSignatureStack`), CloudFront Signed URLs (`src/lib/cloudfront-signer.ts → cloudfront-signer`), S3 HTTPS-Only Policy (`infra/lib/cdn-stack.ts → CdnStack`). Include at-rest vs in-transit breakdown and secret management policy. Satisfies FR-010.
- [x] T008 [P] [US1] Write "4. Infrastructure Security" section in `docs/compliance/security-measures.md` — 5 controls: IAM Least-Privilege Policies (`infra/lib/digital-signature-stack.ts → DigitalSignatureStack`), Vercel OIDC Federated Identity (`infra/lib/digital-signature-stack.ts → addPermission`), CloudFront OAC (`infra/lib/cdn-stack.ts → CdnStack`), Lambda IAM-Only Invocation (all stacks in `infra/lib/`), Certificate Expiry Monitoring (`infra/lib/digital-signature-stack.ts → certExpiryAlarm`). Satisfies FR-011.
- [x] T009 [P] [US1] Write "5. Audit & Monitoring" section in `docs/compliance/security-measures.md` — 4 controls: Convex Audit Events (`convex/functions/audit.ts → logEvent`), Sentry PII Scrubbing (`sentry.client.config.ts → beforeSend`), CloudWatch Lambda Logs (CDK stack defaults), Audit Access Restriction (`convex/functions/audit.ts → list`). Include audit_events field list and PII scrubbing rules. Satisfies FR-012.
- [x] T010 [P] [US1] Write "6. Code Security & Headers" section in `docs/compliance/security-measures.md` — 4 controls: Production Source Maps Disabled (`next.config.ts → productionBrowserSourceMaps`), X-Powered-By Removed (`next.config.ts → poweredByHeader`), React Strict Mode (`next.config.ts → reactStrictMode`), Sentry Source Map Security (`sentry.client.config.ts → hideSourceMaps`). Satisfies FR-013.
- [x] T011 [P] [US1] Write "7. Data Protection & Privacy" section in `docs/compliance/security-measures.md` — 5 controls: Soft Deletion Pattern (`convex/schema.ts → deletedAt fields`), User Anonymization (`src/domains/system/lib/webhook.service.ts → handleClerkUserDeleted`), Multi-Tenant Data Isolation (`convex/schema.ts → businessId foreign keys`), Webhook Idempotency (`src/app/api/v1/billing/webhooks/route.ts → stripeEventId`), Email Preference Management (`convex/schema.ts → emailPreferences`). Satisfies FR-014.
- [x] T012 [P] [US1] Write "8. Payment Security" section in `docs/compliance/security-measures.md` — 3 controls: Stripe Payment Delegation (`src/app/api/v1/billing/webhooks/route.ts → POST`), Webhook Signature Verification (`src/app/api/v1/billing/webhooks/route.ts → constructEvent`), Event Deduplication (`src/app/api/v1/billing/webhooks/route.ts → stripeEvents.exists`). Include "no card data stored" statement. Satisfies FR-015.

**Checkpoint**: All 8 domains documented with 31 controls — US1 is independently testable. Auditor can review complete security posture.

---

## Phase 4: User Story 2 - Sales Team Answers Customer Security Questionnaire (Priority: P2)

**Goal**: Document enhanced with executive summary, cross-references, and planned controls so sales team can quickly find answers to common security questionnaire questions

**Independent Test**: Take a standard security questionnaire (SIG Lite) and confirm ≥80% of relevant questions can be answered from the document (SC-002)

### Implementation for User Story 2

- [x] T013 [US2] Write Executive Summary section at the top of `docs/compliance/security-measures.md` (after header, before provider table) — 1 paragraph non-technical overview of Groot Finance's security posture for business stakeholders. Reference key certifications (SOC 2, PCI Level 1) and highlight data protection approach. Satisfies FR-016.
- [x] T014 [US2] Add cross-references between related controls in `docs/compliance/security-measures.md` — link multi-tenant isolation (Authorization) ↔ multi-tenant data isolation (Data Protection), webhook signature verification (Payment) ↔ webhook idempotency (Data Protection), Sentry PII scrubbing (Audit) ↔ source map security (Code Security). Use markdown anchor links between sections.
- [x] T015 [US2] Write the "Planned Controls" section at the bottom of `docs/compliance/security-measures.md` (before Version History) — document controls not yet implemented but on roadmap (e.g., dedicated data export API for right-of-access, automated compliance scanning). Use `**Status**: Planned` format. Satisfies FR-005.

**Checkpoint**: Document is now optimized for questionnaire use. Sales team can find executive summary + detailed answers for any security question.

---

## Phase 5: User Story 3 - Developer Maintains Security Documentation (Priority: P3)

**Goal**: Document includes version history, references, and table of contents so developers can maintain it over time

**Independent Test**: A developer can locate the correct section for a hypothetical new control and add it following the established pattern

### Implementation for User Story 3

- [x] T016 [P] [US3] Write Version History section at the bottom of `docs/compliance/security-measures.md` — table with columns: Date, Reviewer, Changes. Add initial entry for document creation. Satisfies FR-006.
- [x] T017 [P] [US3] Write References section at the bottom of `docs/compliance/security-measures.md` (after Version History) — links to all provider security pages (from research.md), related PDPA compliance documents (breach notification SOP, consent collection, data retention, data rights), and link to `specs/001-pdpa-sec-measures-doc/quickstart.md` maintenance guide.
- [x] T018 [US3] Add Table of Contents with anchor links at the top of `docs/compliance/security-measures.md` (after Executive Summary, before Provider Summary table) — list all 8 domain sections, Planned Controls, Version History, and References with clickable links.

**Checkpoint**: Document is fully self-contained with navigation, references, and maintenance instructions. Developer can find any section and follow the pattern to add new controls.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate completeness, accuracy, and formatting consistency across all sections

- [x] T019 Review all 31 controls against data-model.md control inventory in `docs/compliance/security-measures.md` — verify every control from the inventory appears in the document, no phantom controls are documented, and all code references use `file → symbol` format (SC-005 accuracy check)
- [x] T020 Validate document against all success criteria — SC-001 (8 domains, ≥3 controls each), SC-002 (questionnaire coverage), SC-003 (dual description + reference), SC-004 (navigation speed), SC-005 (codebase accuracy). Document pass/fail for each in a brief review note at the bottom of this tasks.md.
- [x] T021 Final formatting pass on `docs/compliance/security-measures.md` — consistent heading levels (##/###/####), consistent control entry format, consistent code reference format, no orphaned links, proper markdown table alignment, no trailing whitespace

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all domain section writing
- **US1 (Phase 3)**: Depends on Phase 2 — all 8 domain sections can run in parallel
- **US2 (Phase 4)**: Depends on US1 completion (needs domain content to cross-reference)
- **US3 (Phase 5)**: T016/T017 can start after Phase 2; T018 (ToC) depends on all sections being written
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — No dependencies on other stories
- **User Story 2 (P2)**: Depends on US1 completion (cross-references require domain sections to exist)
- **User Story 3 (P3)**: Version History (T016) and References (T017) can start after Phase 2; Table of Contents (T018) depends on US1+US2 being complete

### Within User Story 1

- All 8 domain sections (T005-T012) are fully independent — they reference different source files
- All can run in parallel with [P] marker

### Parallel Opportunities

**Phase 3 (US1)**: All 8 tasks (T005-T012) can run in parallel — different domain sections, different source files
**Phase 5 (US3)**: T016 and T017 can run in parallel — different sections, no dependencies

---

## Parallel Example: User Story 1

```bash
# Launch all 8 domain sections in parallel:
Task: "Write Authentication & Identity section (T005)"
Task: "Write Authorization & Access Control section (T006)"
Task: "Write Encryption & Secure Storage section (T007)"
Task: "Write Infrastructure Security section (T008)"
Task: "Write Audit & Monitoring section (T009)"
Task: "Write Code Security & Headers section (T010)"
Task: "Write Data Protection & Privacy section (T011)"
Task: "Write Payment Security section (T012)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational (T003-T004)
3. Complete Phase 3: User Story 1 (T005-T012) — **all 8 in parallel**
4. **STOP and VALIDATE**: All 8 domains documented with 31 controls — auditor can review
5. This alone satisfies SC-001, SC-003, SC-005

### Incremental Delivery

1. Setup + Foundational → Document skeleton with provider table ready
2. US1 (8 parallel tasks) → Full domain coverage → MVP complete
3. US2 (executive summary + cross-refs) → Questionnaire-ready
4. US3 (version history + ToC) → Maintenance-ready
5. Polish → Validated and finalized

---

## Notes

- [P] tasks = different sections/files, no dependencies
- All domain sections (T005-T012) write to different heading sections within the same file — no merge conflicts if done sequentially, or can be assembled from parallel outputs
- Each control entry must follow the format from data-model.md: name + description + implementation + optional provider + status
- Code references must use `file → symbol` format per clarification (no line numbers)
- Document is internal-only — full technical detail including file paths is appropriate
- Source data for all controls comes from the codebase audit (research.md Section 2) and data-model.md control inventory
