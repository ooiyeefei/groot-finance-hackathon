# Implementation Plan: Manager Approval Workflow Enforcement

**Branch**: `001-manager-approval` | **Date**: 2026-01-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-manager-approval/spec.md`

## Summary

Enforce manager approval workflow by: (1) blocking expense submission for employees without assigned managers, (2) implementing self-approval routing for managers/admins without managers, and (3) adding validation in Team Management to require manager assignment for employees.

**Technical Approach**: Modify Convex `findNextApprover` query to support self-approval routing, add pre-submission validation in expense claims data-access layer, and enhance Team Management UI with role-based manager assignment validation.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Next.js 15.5.7
**Primary Dependencies**: Convex 1.31.3, React 19.1.2, Clerk 6.30.0, Zod 3.23.8
**Storage**: Convex (document database with real-time sync)
**Testing**: Vitest (unit), Playwright (e2e)
**Target Platform**: Web application (PWA-ready)
**Project Type**: Full-stack web application (monorepo with Convex backend)
**Performance Goals**: Real-time updates via Convex subscriptions
**Constraints**: Must work with existing role hierarchy (owner > finance_admin > manager > employee)
**Scale/Scope**: Multi-tenant SaaS, ~100-1000 users per business

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

✅ **No blocking violations** - Constitution is a placeholder template without specific rules.

**Implicit principles followed:**
- Minimal changes to existing architecture
- Leverage existing patterns (Convex mutations/queries, domain services)
- Maintain backwards compatibility with existing claims
- No new dependencies required

## Project Structure

### Documentation (this feature)

```text
specs/001-manager-approval/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
# Existing structure - files to modify

convex/
├── schema.ts                         # business_memberships (managerId field exists)
└── functions/
    └── expenseClaims.ts              # findNextApprover query (modify)
                                      # list query (verify filtering)

src/
├── domains/
│   ├── expense-claims/
│   │   └── lib/
│   │       └── data-access.ts        # Add pre-submission validation
│   └── account-management/
│       └── components/
│           └── teams-management-client.tsx  # Add manager validation
└── hooks/
    └── useTeamMembersRealtime.ts     # Add validation to assignManager

# No new files required - all changes are modifications
```

**Structure Decision**: Modify existing files only. No new modules, services, or infrastructure needed.

## Complexity Tracking

> No violations to justify - this is a focused enhancement to existing workflow logic.

---

## Phase 0: Research Findings

### Research Task 1: Self-Approval Routing Logic

**Decision**: Add self-approval as final fallback in `findNextApprover` for managers/admins only

**Rationale**:
- Current code returns `null` when no approver found, leaving claims orphaned
- Self-approval is standard practice for small businesses and solo managers
- Separation of duties maintained by preferring other approvers first

**Alternatives Considered**:
- Requiring all claims to have external approver → rejected (blocks legitimate use cases)
- Auto-escalating to business owner → rejected (may not exist or be the submitter)

### Research Task 2: Submission Blocking Implementation

**Decision**: Block at data-access layer before Convex mutation

**Rationale**:
- Single point of control for all submission paths
- Can provide detailed error messages with guidance
- Allows UI to show warnings before user attempts submission

**Alternatives Considered**:
- Block in Convex mutation → rejected (less detailed error handling)
- Block only in UI → rejected (can be bypassed, not secure)

### Research Task 3: Team Management Validation

**Decision**: Add client-side validation with server-side enforcement via Convex mutation

**Rationale**:
- Immediate feedback to admins when assigning roles
- Server-side backup prevents bypassing via API
- Consistent with existing role assignment patterns

**Alternatives Considered**:
- Server-side only → rejected (poor UX, no immediate feedback)
- Database constraint → rejected (Convex doesn't support conditional constraints)

---

## Phase 1: Design & Contracts

### Data Model Changes

**No schema changes required** - existing `business_memberships.managerId` field is sufficient.

**Validation Rules**:
1. If `role === 'employee'` → `managerId` is required (non-null)
2. If `role === 'manager' | 'finance_admin' | 'owner'` → `managerId` is optional

### API Contract Changes

#### Modified: `findNextApprover` Query

**Current Behavior**:
1. If submitter has `managerId` → return manager
2. Else find finance_admin/owner (excluding submitter)
3. Else return `null`

**New Behavior**:
1. If submitter has `managerId` → return manager
2. Else if submitter is employee → return `null` (will be blocked at submission)
3. Else find other finance_admin/owner (excluding submitter)
4. Else if submitter is manager/admin → return submitter (self-approval)
5. Else return `null`

#### Modified: Expense Submission Flow

**Current Behavior**:
- Accepts submission regardless of approver availability

**New Behavior**:
- Pre-validation: Check if submitter is employee without manager
- If so: Return error with guidance message
- Else: Proceed with existing flow

#### Modified: Team Management `assignManager` Mutation

**Current Behavior**:
- Accepts any `managerId` value (including null)

**New Behavior**:
- If target role is `employee` and new `managerId` is null → error
- If target role is non-employee → allow null `managerId`

### Implementation Tasks Summary

| Priority | Area | Change |
|----------|------|--------|
| P1 | Convex | Update `findNextApprover` with self-approval fallback |
| P1 | Data Access | Add pre-submission validation for employee manager check |
| P1 | UI | Show warning on draft claims for employees without managers |
| P2 | Convex | Verify approval queue filtering includes self-submitted claims |
| P3 | UI | Add manager requirement validation in Team Management |
| P3 | Convex | Add validation to `assignManager` mutation |

---

## Quickstart

### Prerequisites
- Convex dev environment running (`npm run convex:dev`)
- Access to a test business with employees, managers, and admin users

### Testing the Changes

**P1 - Submission Blocking**:
1. Create/find an employee without manager assignment
2. Create a draft expense claim
3. Attempt to submit → should see blocking error with guidance
4. Assign a manager to the employee
5. Re-attempt submission → should succeed

**P2 - Self-Approval Routing**:
1. Log in as a manager without assigned manager
2. Ensure no other finance_admin/owner exists (or they are the submitter)
3. Submit an expense claim
4. View approval queue → should see own claim
5. Approve own claim → should succeed

**P3 - Team Management Validation**:
1. Go to Business Settings > Team Management
2. Try to change a team member to "employee" role without selecting manager
3. Should see validation error requiring manager selection
4. Select a manager → should allow save

### Verification Queries

```typescript
// Check for employees without managers
db.query("business_memberships")
  .filter(m => m.role === "employee" && !m.managerId)
  .collect()

// Check for submitted claims without approver
db.query("expense_claims")
  .filter(c => c.status === "submitted" && !c.processingMetadata?.reviewed_by)
  .collect()
```
