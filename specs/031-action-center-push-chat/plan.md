# Implementation Plan: Proactive Chat Alerts

**Branch**: `031-action-center-push-chat` | **Date**: 2026-03-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/031-action-center-push-chat/spec.md`

## Summary

Push high/critical Action Center insights to users' chat conversations as system messages with action cards (Investigate/Dismiss). Add unread badge to chat widget. Send weekly email digest of top 5 insights. Critical alerts also trigger native mobile push. Batch 3+ simultaneous alerts into summary messages.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Next.js 15.5.7 + Convex 1.31.3)
**Primary Dependencies**: Convex (DB + real-time), LangGraph (chat agent), SES (email), APNs (push)
**Storage**: Convex tables (messages, conversations, proactive_alert_delivery)
**Testing**: Manual UAT with test accounts (admin, manager, employee)
**Target Platform**: Web (Next.js) + iOS (Capacitor)
**Project Type**: Web application (monorepo)
**Performance Goals**: Alert delivery < 60 seconds from insight creation
**Constraints**: Convex free plan 2GB/month bandwidth — proactive alerts must be low-bandwidth
**Scale/Scope**: ~2-5 insights/business/day, ~30-90 alert deliveries/business/month

## Constitution Check

*No custom constitution defined — default template. No gates to evaluate.*

## Project Structure

### Documentation (this feature)

```text
specs/031-action-center-push-chat/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research decisions
├── data-model.md        # Data model design
├── quickstart.md        # Implementation quickstart
├── contracts/           # Function contracts
│   └── convex-functions.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (next)
```

### Source Code (files to create/modify)

```text
convex/
├── schema.ts                                    # ADD proactive_alert_delivery table
├── functions/
│   ├── proactiveAlerts.ts                       # NEW — core alert pipeline
│   ├── actionCenterInsights.ts                  # MODIFY — add scheduler hook
│   └── emailDigestJobs.ts                       # MODIFY — implement body

src/domains/chat/
├── components/
│   ├── action-cards/
│   │   ├── proactive-alert-card.tsx             # NEW — alert action card
│   │   └── index.tsx                            # MODIFY — register new card
│   └── chat-widget-badge.tsx                    # NEW or MODIFY — unread badge

src/lambda/scheduled-intelligence/
└── modules/
    └── weekly-email-digest.ts                   # MODIFY — implement digest logic
```

**Structure Decision**: All changes fit within existing domain structure. New Convex function file for proactive alerts. New action card component in existing chat domain. Email digest in existing Lambda module.
