# Implementation Plan: In-App & Email Notification System

**Branch**: `018-app-email-notif` | **Date**: 2026-02-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/018-app-email-notif/spec.md`
**GitHub Issue**: [#211](https://github.com/grootdev-ai/groot-finance/issues/211)

## Summary

Add a notification delivery system for proactive alerts across all domains. The system consists of:
1. **In-app notification center** — bell icon in header with real-time unread count, side panel with notification list, click-through to linked resources
2. **Notification triggers** — automated notifications from expense claim workflow transitions, anomaly detection, compliance alerts, and AI insights
3. **Email delivery** — immediate transactional emails for approvals and critical anomalies + scheduled digest emails for everything else
4. **User preferences** — per-category, per-channel toggles with digest frequency configuration

The approach leverages existing infrastructure: Convex real-time subscriptions for in-app delivery, SES email service for email delivery, RBAC via `business_memberships` for recipient targeting, and the workflow engine's existing notification placeholder for trigger integration.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0, AWS SES, lucide-react (icons), Radix UI (Sheet, Badge)
**Storage**: Convex (new `notifications` + `notification_digests` tables), AWS SES (email delivery)
**Testing**: Manual testing via Convex dashboard + `npm run build` verification
**Target Platform**: Web (Next.js SSR + Convex real-time subscriptions)
**Project Type**: Web application (existing monorepo: Next.js frontend + Convex backend + Lambda functions)
**Performance Goals**: <5s in-app notification delivery (SC-001), <10s for critical anomalies (SC-006)
**Constraints**: Multi-tenant (business scoping via `businessId`), RBAC (Convex-defined roles), CAN-SPAM/RFC 8058 compliance, 90-day notification retention
**Scale/Scope**: SME target (5-50 users per business, 5-20 notifications per user per day)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is template-only (no project-specific principles defined). No gate violations. Proceeding with plan.

**Post-Phase 1 re-check**: Design follows existing project patterns:
- Domain-driven structure (`src/domains/notifications/`)
- Convex functions in `convex/functions/`
- Email templates in `lambda/shared/templates/`
- RBAC via `business_memberships` role hierarchy
- Semantic design tokens for UI

## Project Structure

### Documentation (this feature)

```text
specs/018-app-email-notif/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research findings
├── data-model.md        # Phase 1: entity definitions
├── quickstart.md        # Phase 1: implementation guide
├── contracts/
│   ├── convex-functions.md  # Phase 1: Convex query/mutation contracts
│   └── components.md        # Phase 1: React component contracts
├── checklists/
│   └── requirements.md      # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
# Frontend (notification UI)
src/domains/notifications/
├── components/
│   ├── notification-bell.tsx              # Header bell icon + unread badge
│   ├── notification-panel.tsx             # Sheet side panel with list
│   ├── notification-item.tsx              # Individual notification row
│   └── notification-preferences-form.tsx  # Preferences grid with toggles
├── hooks/
│   ├── use-notifications.ts               # Real-time data + actions hook
│   └── use-notification-preferences.ts    # Preferences hook
├── lib/
│   └── notification-triggers.ts           # Trigger helper (client-side, if needed)
└── CLAUDE.md                              # Domain docs

# Backend (Convex functions)
convex/functions/
├── notifications.ts                       # Queries + mutations + internal functions
└── notificationJobs.ts                    # Digest aggregation + cron handlers

# Schema changes
convex/schema.ts                           # +notifications, +notification_digests tables, +notificationPreferences on users

# Cron additions
convex/crons.ts                            # +notification-digest, +notification-cleanup

# Email templates
lambda/shared/templates/index.ts           # +4 new templates (approval request, status, anomaly, digest)

# Modified files
src/components/ui/header-with-user.tsx                        # +NotificationBell integration
src/domains/expense-claims/lib/enhanced-workflow-engine.ts     # Activate notification triggers at line 414
src/domains/account-management/components/user-profile-section.tsx  # +NotificationPreferencesForm
convex/functions/actionCenterInsights.ts                       # +notification creation alongside insight creation
```

**Structure Decision**: Follows existing domain-driven architecture. New `src/domains/notifications/` domain with standard `components/`, `hooks/`, `lib/` structure. Backend logic in `convex/functions/` matching the existing pattern. Email templates co-located with existing templates in `lambda/shared/templates/`.

## Phase 0: Research Findings

See [research.md](research.md) for full details. Key decisions:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Notification storage | New Convex `notifications` table | Dedicated lifecycle (read/dismissed), separate from Action Center insights |
| Real-time delivery | Convex `useQuery` subscriptions | Zero additional infrastructure, proven pattern in codebase |
| Email delivery model | Dual: transactional + digest | Approvals need immediacy; other types batch well |
| Recipient targeting | RBAC via `business_memberships` roles | Existing role hierarchy (owner > finance_admin > manager > employee) |
| UI pattern | Bell icon + Sheet side panel | Consistent with existing Radix UI patterns |
| Preference storage | `notificationPreferences` on users table | Extends existing `emailPreferences` pattern |
| Workflow integration | Hook at line 414 in `enhanced-workflow-engine.ts` | Existing placeholder with pre-defined notification arrays |
| Bulk batching | 5+ events / 60s window → summary | Prevents notification flooding from batch operations |
| Retention | 90-day auto-cleanup cron | Industry standard, matches existing insight cleanup pattern |

## Phase 1: Design Artifacts

| Artifact | Path | Contents |
|----------|------|----------|
| Data Model | [data-model.md](data-model.md) | `notifications` table, `notification_digests` table, `notificationPreferences` schema extension, state transitions, relationships |
| Convex Contracts | [contracts/convex-functions.md](contracts/convex-functions.md) | 3 queries, 4 mutations, 3 internal mutations, 2 internal actions, 2 cron jobs |
| Component Contracts | [contracts/components.md](contracts/components.md) | 4 new components, 2 hooks, 2 modified components |
| Quickstart | [quickstart.md](quickstart.md) | 6-step implementation order, domain structure, key commands |

## Implementation Phases

### Phase 1: Backend Foundation (Schema + Convex Functions)

**Goal**: Establish the notification data layer with all queries and mutations.

**Files to create/modify**:
- `convex/schema.ts` — Add `notifications`, `notification_digests` tables + `notificationPreferences` on users
- `convex/functions/notifications.ts` — All queries, mutations, internal functions
- `convex/crons.ts` — Add cleanup cron

**Verification**: `npx convex dev` syncs without errors, `npx convex deploy --yes` succeeds.

### Phase 2: In-App Notification UI (Bell + Panel)

**Goal**: Notification bell in header with real-time badge, side panel with notification list.

**Files to create/modify**:
- `src/domains/notifications/components/notification-bell.tsx`
- `src/domains/notifications/components/notification-panel.tsx`
- `src/domains/notifications/components/notification-item.tsx`
- `src/domains/notifications/hooks/use-notifications.ts`
- `src/components/ui/header-with-user.tsx` — Add NotificationBell

**Verification**: `npm run build` passes, notification bell visible in header, panel opens on click.

### Phase 3: Notification Triggers (Workflow + Insight Integration)

**Goal**: Automatic notification creation from expense claim transitions and anomaly detection.

**Files to modify**:
- `src/domains/expense-claims/lib/enhanced-workflow-engine.ts` — Activate line 414 placeholder
- `convex/functions/actionCenterInsights.ts` — Add notification creation in `internalCreate`

**Verification**: Submit expense claim → approver sees notification in bell. Anomaly detected → finance admin sees notification.

### Phase 4: Notification Preferences

**Goal**: User-configurable preferences with per-category, per-channel toggles.

**Files to create/modify**:
- `src/domains/notifications/components/notification-preferences-form.tsx`
- `src/domains/notifications/hooks/use-notification-preferences.ts`
- `src/domains/account-management/components/user-profile-section.tsx` — Add preferences section

**Verification**: Toggle preference → notification suppressed for that category/channel.

### Phase 5: Transactional Email Delivery

**Goal**: Immediate email for approval requests and critical anomalies.

**Files to create/modify**:
- `lambda/shared/templates/index.ts` — Add notification email templates
- `convex/functions/notifications.ts` — Implement `sendTransactionalEmail` action

**Verification**: Submit expense claim → approver receives email with review link.

### Phase 6: Digest Email + Cron

**Goal**: Scheduled digest aggregating unactioned notifications.

**Files to create/modify**:
- `convex/functions/notificationJobs.ts` — Digest aggregation and sending
- `lambda/shared/templates/index.ts` — Add digest template
- `convex/crons.ts` — Add digest cron

**Verification**: Run digest manually → email contains grouped notifications. Empty digest → no email sent.

## Complexity Tracking

No constitution violations to justify. Design follows existing patterns throughout.
