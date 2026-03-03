# Tasks: PDPA Breach Notification SOP

**Input**: Design documents from `/specs/001-pdpa-breach-notif-sop/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: No automated tests — validation is via tabletop exercise (documented in Phase 8).

**Organization**: Tasks grouped by user story to enable independent implementation. Each user story adds sections to the single SOP document at `docs/compliance/breach-notification-sop.md`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files or non-overlapping SOP sections)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **SOP document**: `docs/compliance/breach-notification-sop.md`
- **GitHub Issue template**: `.github/ISSUE_TEMPLATE/breach-incident.yml`
- **Spec artifacts**: `specs/001-pdpa-breach-notif-sop/`

---

## Phase 1: Setup

**Purpose**: Create directory structure and SOP document skeleton

- [x] T001 Create `docs/compliance/` directory and initialize `docs/compliance/breach-notification-sop.md` with the 17-section heading skeleton from `specs/001-pdpa-breach-notif-sop/data-model.md` (SOP Document Structure)
- [x] T002 [P] Create `.github/ISSUE_TEMPLATE/` directory if it does not exist

---

## Phase 2: Foundational (SOP Sections 1–3)

**Purpose**: Write the foundational sections that all other sections reference. These define the legal basis, terminology, and data inventory used throughout.

- [x] T003 Write Section 1 (Document Control) in `docs/compliance/breach-notification-sop.md` — version 1.0, review date Q2 2026, approved by placeholder [FR-020]
- [x] T004 Write Section 2 (Purpose & Scope) in `docs/compliance/breach-notification-sop.md` — legal basis (MY Section 12B, SG Part VIA), applicability (controller + intermediary), out of scope [FR-002]
- [x] T005 Write Section 3 (Definitions & Glossary) in `docs/compliance/breach-notification-sop.md` — define Incident, Data Breach, Notifiable Data Breach, Controller, Intermediary, Prescribed Personal Data, Significant Harm per spec Key Entities [FR-002]

**Checkpoint**: Foundation sections complete — terminology is now defined for all subsequent sections.

---

## Phase 3: User Story 1 — Classify and Respond to a Detected Breach (Priority: P1) MVP

**Goal**: An Incident Commander can use the SOP to classify any breach within 15 minutes and initiate the correct response.

**Independent Test**: Present a simulated P1 breach scenario, walk through SOP from detection to classification to first three containment actions. Must complete within 15 minutes.

### Implementation for User Story 1

- [x] T006 [US1] Write Section 6 (Severity Classification) in `docs/compliance/breach-notification-sop.md` — P1–P4 table with criteria and response times per spec FR-001
- [x] T007 [US1] Write Section 4 (Incident Response Team) in `docs/compliance/breach-notification-sop.md` — roles table (IC, Tech Lead, Comms, Legal), responsibilities, alternates (placeholders per DEP-003), escalation chain, out-of-hours, 30-min max escalation time [FR-010, FR-011]
- [x] T008 [US1] Write Section 7 (Breach Assessment Procedure) in `docs/compliance/breach-notification-sop.md` — assessment checklist, 30-day timeline, SG Section 26B requirements, documentation for Section 26E [FR-019]
- [x] T009 [US1] Write Section 8 (Notification Decision Tree) in `docs/compliance/breach-notification-sop.md` — 7-step flowchart: legal definition → prescribed data categories → 500+ individuals → significant harm → jurisdictions → timeline → document decision [FR-008]
- [x] T010 [US1] Write Section 5 (Detection Mechanisms) in `docs/compliance/breach-notification-sop.md` — table with mechanism, status (active/planned/not configured), alert channel, detection scope. Source from research.md R-005 and CDK stacks [FR-012]
- [x] T011 [US1] Write Section 15 (Personal Data Inventory) in `docs/compliance/breach-notification-sop.md` — data category table with SG prescribed mapping, storage location, jurisdiction, controller/intermediary role, approximate volume. Source from data-model.md Personal Data Inventory [FR-018]

**Checkpoint**: US1 complete. The SOP now has enough content for an Incident Commander to classify a breach and decide next steps. Testable with tabletop exercise targeting SC-001 (<15 min classification).

---

## Phase 4: User Story 2 — Notify Regulators (Priority: P1)

**Goal**: The team can prepare and submit regulatory notifications to MY PDPC (within 2 hours) and SG PDPC (within 24 hours) using only the SOP checklists.

**Independent Test**: Complete the MY notification checklist for a mock breach using only the SOP. Verify all 10 SG PDPC fields are covered.

### Implementation for User Story 2

- [x] T012 [P] [US2] Write Section 9 (Regulatory Notification — Malaysia) in `docs/compliance/breach-notification-sop.md` — threshold criteria, submission channels (portal/phone/email), 2-hour target, notification checklist with field guidance [FR-003, FR-004]
- [x] T013 [P] [US2] Write Section 10 (Regulatory Notification — Singapore) in `docs/compliance/breach-notification-sop.md` — two grounds (significant harm, 500+), 7 prescribed categories list, portal URL, 3-day timeline from assessment, 10-field notification checklist [FR-005, FR-006, FR-007]

**Checkpoint**: US2 complete. Both regulatory notification checklists usable end-to-end. Testable with mock notification prep targeting SC-002 (MY <2hr) and SC-003 (SG <24hr).

---

## Phase 5: User Story 3 — Notify Affected Users (Priority: P1)

**Goal**: An affected-user notification email can be drafted within 1 hour using the SOP template.

**Independent Test**: Draft a breach notification email for a mock multi-tenant scenario using only the SOP template. Verify all 6 SG-required fields present.

### Implementation for User Story 3

- [x] T014 [US3] Write Section 11 (Affected User Notification) in `docs/compliance/breach-notification-sop.md` — when to notify (either jurisdiction threshold met), email template with 6 SG fields, multi-tenant scoping guidance, phased notification procedure, delivery channel note [FR-009]

**Checkpoint**: US3 complete. User notification template usable. Testable with mock email draft targeting SC-004 (<1hr).

---

## Phase 6: User Story 4 — Post-Incident Review (Priority: P2)

**Goal**: A post-incident review template is available and can be completed within 7 days of incident resolution.

**Independent Test**: Complete the post-incident review template for a mock incident.

### Implementation for User Story 4

- [x] T015 [US4] Write Section 17 (Post-Incident Review) in `docs/compliance/breach-notification-sop.md` — 7-day timeline, review template (incident timeline, root cause, remediation, lessons learned, SOP update recommendations), SOP update process (who approves, version control) [FR-013]
- [x] T016 [US4] Write Section 14 (Evidence Preservation) in `docs/compliance/breach-notification-sop.md` — what to preserve (logs, screenshots, access records, communication records), retention periods, chain of custody, storage locations [FR-015]

**Checkpoint**: US4 complete. Post-incident and evidence preservation sections usable. Testable with mock review exercise targeting SC-006 (review within 7 days).

---

## Phase 7: User Story 5 — Verify Detection Mechanisms (Priority: P2)

**Goal**: A new team member can read the SOP and understand the detection landscape within 30 minutes.

**Independent Test**: Have someone unfamiliar with the infrastructure read the SOP and answer: "What tools alert us to breaches? Which are active? What gaps exist?"

*Note*: Section 5 (Detection Mechanisms) was already written in Phase 3 (T010). No additional SOP sections needed for this story.

**Checkpoint**: US5 is covered by T010 (already complete). Testable with readability check targeting SC-005 (<30 min).

---

## Phase 8: User Story 6 — Handle Data Intermediary Breach (Priority: P2)

**Goal**: The SOP correctly routes notification to the affected SME customer (not regulators) when Groot Finance is acting as data intermediary.

**Independent Test**: Simulate a breach affecting customer business data and walk through the SOP to determine the correct notification chain.

### Implementation for User Story 6

- [x] T017 [US6] Write Section 12 (Data Intermediary Procedures) in `docs/compliance/breach-notification-sop.md` — when Groot Finance is acting as processor, "without undue delay" notification to SME customer, information to provide, dual-chain scenarios (controller + intermediary simultaneously) [FR-017]
- [x] T018 [P] [US6] Write Section 13 (Sub-Processor Directory) in `docs/compliance/breach-notification-sop.md` — contact table for Clerk, Stripe, Convex, AWS, Modal with breach notification contact/channel, SLA, data categories handled. Use verified contacts where available, placeholder otherwise (DEP-004) [FR-016]

**Checkpoint**: US6 complete. Data intermediary and sub-processor sections usable.

---

## Phase 9: GitHub Infrastructure & Incident Register

**Purpose**: Set up the GitHub Issues incident register infrastructure

- [x] T019 Write Section 16 (Incident Register Procedures) in `docs/compliance/breach-notification-sop.md` — GitHub Issues workflow, label taxonomy, when to create issues, how to produce register for regulators, Section 26E compliance mapping [FR-014]
- [x] T020 [P] Create `.github/ISSUE_TEMPLATE/breach-incident.yml` from `specs/001-pdpa-breach-notif-sop/contracts/github-issues-schema.md` — YAML-based issue form with all required fields
- [x] T021 Create 16 GitHub labels in `grootdev-ai/groot-finance` using `gh label create` — severity (4), jurisdiction (3), status (4), notification (3), type (1), plus `compliance` label per contracts/github-issues-schema.md

**Checkpoint**: Incident register infrastructure ready. Can create a test breach issue using the template.

---

## Phase 10: Appendices & Polish

**Purpose**: Final sections and cross-cutting improvements

- [x] T022 [P] Write Appendix A (Regulatory Contact Quick Reference) in `docs/compliance/breach-notification-sop.md` — one-table summary of MY PDPC and SG PDPC contacts, portals, phone numbers, deadlines
- [x] T023 [P] Write Appendix B (Incident Response Checklist) in `docs/compliance/breach-notification-sop.md` — one-page tearsheet format for printing/quick reference during an incident
- [x] T024 [P] Write Appendix C (Email Notification Template) in `docs/compliance/breach-notification-sop.md` — ready-to-use email template with placeholders, based on Section 11
- [x] T025 Review entire SOP for internal consistency — verify all cross-references between sections are correct, terminology matches Section 3 glossary, all FR requirements are addressed
- [x] T026 Validate FR coverage — cross-reference each of the 20 functional requirements against SOP sections to confirm 20/20 coverage in `docs/compliance/breach-notification-sop.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundation)**: Depends on Phase 1 — defines terminology used by all subsequent sections
- **Phase 3 (US1)**: Depends on Phase 2 — core classification and decision procedures
- **Phase 4 (US2)**: Depends on Phase 2 — can run in parallel with Phase 3
- **Phase 5 (US3)**: Depends on Phase 2 — can run in parallel with Phases 3–4
- **Phase 6 (US4)**: Depends on Phase 2 — can run in parallel with Phases 3–5
- **Phase 7 (US5)**: Covered by Phase 3 task T010 — no additional work
- **Phase 8 (US6)**: Depends on Phase 2 — can run in parallel with Phases 3–6
- **Phase 9 (GitHub Infra)**: Depends on Phase 2 (for Section 16 content) — T020/T021 can run in parallel with SOP writing
- **Phase 10 (Polish)**: Depends on Phases 3–9 completion

### User Story Dependencies

- **US1 (P1)**: No dependencies on other stories — the core SOP
- **US2 (P1)**: References US1's decision tree (Section 8) but can be written independently
- **US3 (P1)**: Independent — email template stands alone
- **US4 (P2)**: Independent — post-incident review is self-contained
- **US5 (P2)**: Covered by US1's detection mechanisms section
- **US6 (P2)**: Independent — data intermediary procedures are self-contained

### Parallel Opportunities

Within SOP writing (since all sections go into one file, true parallelism means drafting content separately then merging):

- T012 + T013 (MY and SG regulatory sections) — different content, can draft in parallel
- T017 + T018 (intermediary procedures + sub-processor directory) — different content
- T022 + T023 + T024 (all three appendices) — independent content
- T020 + T021 (GitHub issue template + labels) — independent from SOP writing

---

## Implementation Strategy

### MVP First (User Stories 1–3)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 2: Foundation (T003–T005)
3. Complete Phase 3: US1 — Classify & Respond (T006–T011)
4. **VALIDATE**: Tabletop exercise — can you classify a breach within 15 min?
5. Complete Phase 4: US2 — Regulator Notification (T012–T013)
6. Complete Phase 5: US3 — User Notification (T014)
7. **VALIDATE**: Can you complete MY checklist in 2 hours? Can you draft user email in 1 hour?

### Incremental Delivery

1. Setup + Foundation → Terminology defined
2. Add US1 (classify/respond) → Core SOP usable for incident classification
3. Add US2 (regulators) → Regulatory notification capability
4. Add US3 (users) → Full notification capability → **MVP complete**
5. Add US4 (post-incident) → Complete lifecycle coverage
6. Add US6 (intermediary) → Dual-role coverage
7. GitHub Infrastructure → Incident register operational
8. Polish → Appendices, cross-references, validation

---

## Notes

- All SOP sections are written into a single file: `docs/compliance/breach-notification-sop.md`
- [P] tasks can be drafted independently, but must be merged into the single file sequentially
- Each checkpoint should verify the SOP sections added are usable in isolation
- DEP-003 (IRT contacts): Use `[TBD — to be provided by CTO/Founder]` placeholders
- DEP-004 (sub-processor contacts): Research from provider trust pages, use placeholder where unknown
- Commit after each phase completion
