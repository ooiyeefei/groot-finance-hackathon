# Quickstart: PDPA Breach Notification SOP

**Feature Branch**: `001-pdpa-breach-notif-sop`
**Date**: 2026-03-03

> This quickstart is for the **SOP author** (the person writing the SOP document), not for SOP users. It explains how to implement the SOP deliverable.

## What You're Building

A single Markdown file at `docs/compliance/breach-notification-sop.md` that serves as Groot Finance's breach notification Standard Operating Procedure for Malaysia and Singapore PDPA compliance. Plus a GitHub Issues template for the incident register.

## Prerequisites

1. Read the [spec](./spec.md) — especially the Regulatory Reference Summary table
2. Read the [data model](./data-model.md) — this IS the SOP document outline
3. Read the [research](./research.md) — contains all regulatory details you'll reference
4. Have access to:
   - The `grootdev-ai/groot-finance` GitHub repository (for issue template creation)
   - The Convex schema at `convex/schema.ts` (for personal data inventory)
   - The CDK stacks at `infra/lib/` (for detection mechanisms inventory)

## Implementation Order

The SOP sections should be written in dependency order:

### Phase 1: Foundation (write first — other sections reference these)

1. **Document Control** (FR-020) — Version metadata, change log
2. **Purpose & Scope** (FR-002) — Legal basis, definitions
3. **Definitions & Glossary** (FR-002) — Canonical terms used throughout
4. **Personal Data Inventory** (FR-018) — Maps data to prescribed categories
5. **Detection Mechanisms** (FR-012) — Current state from codebase audit

### Phase 2: Core Procedures (the heart of the SOP)

6. **Severity Classification** (FR-001) — P1–P4 criteria and response times
7. **Incident Response Team** (FR-010, FR-011) — Roles, escalation, out-of-hours
8. **Breach Assessment Procedure** (FR-019) — Assessment checklist, 30-day timeline
9. **Notification Decision Tree** (FR-008) — Flowchart for notification decisions

### Phase 3: Notification Templates & Checklists

10. **Regulatory Notification — Malaysia** (FR-003, FR-004) — Checklist + submission channels
11. **Regulatory Notification — Singapore** (FR-005, FR-006, FR-007) — 10-field checklist + portal
12. **Affected User Notification** (FR-009) — Email template (6 SG-required fields)
13. **Data Intermediary Procedures** (FR-017) — Customer notification chain

### Phase 4: Supporting Materials

14. **Sub-Processor Directory** (FR-016) — Third-party contacts table (placeholder until DEP-004)
15. **Evidence Preservation** (FR-015) — What to retain and for how long
16. **Incident Register Procedures** (FR-014) — GitHub Issues workflow
17. **Post-Incident Review** (FR-013) — Review template

### Phase 5: GitHub Infrastructure

18. **Create GitHub Issue template** — `.github/ISSUE_TEMPLATE/breach-incident.yml`
19. **Create GitHub labels** — All 16 labels from the contracts schema

## Key Sources

| What | Where | Used For |
|------|-------|----------|
| Convex schema | `convex/schema.ts` | Personal data inventory (FR-018) |
| CDK stacks | `infra/lib/*.ts` | Detection mechanisms (FR-012) |
| Sentry config | `sentry.server.config.ts` | Detection mechanisms (FR-012) |
| Sentry webhook | `src/app/api/v1/system/webhooks/sentry/route.ts` | Alert channels |
| SES email stack | `infra/lib/system-email-stack.ts` | Email notification capability |
| Audit service | `src/domains/audit/lib/audit.service.ts` | Audit logging status |
| SG PDPA Part VIA | Research R-002 | Regulatory requirements |
| MY PDPA Section 12B | Research R-001 | Regulatory requirements |
| Sub-processor contacts | Research R-006 (to be verified) | Sub-processor directory |

## Validation

After writing, validate the SOP with a tabletop exercise:

1. **Scenario**: "Sentry alerts show a SQL injection that exposed the `users` table including emails and clerkUserIds for ~200 users across MY and SG"
2. Walk through the SOP from detection → classification → assessment → notification decision → regulator notification → user notification → post-incident review
3. Time the classification (target: <15 min per SC-001)
4. Verify all checklists have the information needed
5. File a test GitHub Issue using the template

## Dependencies to Resolve During Implementation

- **DEP-003**: IRT member names/contacts → Ask CTO/Founder
- **DEP-004**: Sub-processor contacts → Research each provider's trust/security page
- **DEP-002**: Verify MY PDPA Breach Notification Guidelines publication status
