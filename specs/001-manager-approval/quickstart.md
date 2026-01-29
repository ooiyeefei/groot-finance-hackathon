# Quickstart: Manager Approval Workflow Enforcement

**Feature**: 001-manager-approval
**Date**: 2026-01-29

## Overview

This guide helps you quickly understand, test, and verify the manager approval workflow changes.

---

## What's Changing

| Area | Before | After |
|------|--------|-------|
| Employee submission | Allowed without manager | Blocked with guidance |
| Manager self-approval | Not supported | Fallback when no other approver |
| Team Management | Manager optional for all | Required for employees |

---

## Quick Test Scenarios

### Test 1: Block Employee Submission (P1)

**Setup**: Employee user without manager assigned

```bash
# 1. Start dev environment
npm run dev

# 2. Log in as employee without manager
# 3. Create a draft expense claim
# 4. Click "Submit"
```

**Expected Result**:
- Submission blocked
- Error: "You cannot submit expense claims without an assigned manager"
- Guidance: "Please contact your administrator"

**Verify in Convex Dashboard**:
```typescript
// Check for employees without managers
ctx.db.query("business_memberships")
  .filter(q => q.and(
    q.eq(q.field("role"), "employee"),
    q.eq(q.field("managerId"), undefined)
  ))
```

---

### Test 2: Manager Self-Approval (P2)

**Setup**: Manager user with no assigned manager and no other admins

```bash
# 1. Log in as sole manager
# 2. Create and submit expense claim
# 3. Go to Approvals page
```

**Expected Result**:
- Claim appears in own approval queue
- Can approve own claim
- Status changes to "Approved"

**Verify in Convex Dashboard**:
```typescript
// Check claim was routed to self
ctx.db.query("expense_claims")
  .filter(q => q.and(
    q.eq(q.field("status"), "submitted"),
    q.eq(q.field("userId"), currentUserId) // submitter
  ))
// Should have processingMetadata.reviewed_by = currentUserId
```

---

### Test 3: Team Management Validation (P3)

**Setup**: Admin user managing team

```bash
# 1. Log in as admin/owner
# 2. Go to Business Settings > Team Management
# 3. Find employee with manager assigned
# 4. Change manager to "No Manager"
# 5. Click Save
```

**Expected Result**:
- Save blocked
- Error: "Employees must have a manager assigned"
- Manager dropdown shows required indicator

---

## Key Files to Review

| File | Purpose |
|------|---------|
| `convex/functions/expenseClaims.ts` | `findNextApprover` logic |
| `convex/functions/memberships.ts` | `assignManager` validation |
| `src/domains/expense-claims/lib/data-access.ts` | Submission blocking |
| `src/domains/account-management/components/teams-management-client.tsx` | UI validation |

---

## Common Issues

### "Claim submitted but no approver"

**Cause**: Existing claim from before changes
**Fix**: Not required - legacy claims unaffected

### "Manager can't see their own claim"

**Check**: Verify approval queue includes `user._id`:
```typescript
reportIds.add(user._id); // Should exist in list query
```

### "Employee saved without manager"

**Check**: Convex mutation validation may be missing
```typescript
if (role === 'employee' && !managerId) {
  throw new Error("Employees must have a manager assigned");
}
```

---

## Verification Checklist

- [ ] Employee without manager cannot submit (error shown)
- [ ] Error message includes guidance to contact admin
- [ ] Manager without manager can submit (routes to self)
- [ ] Manager sees own claim in approval queue
- [ ] Manager can approve own claim
- [ ] Team Management blocks saving employee without manager
- [ ] Team Management allows saving manager without manager
- [ ] Existing claims/memberships unaffected

---

## Development Commands

```bash
# Start development
npm run dev

# Run Convex dashboard
npx convex dashboard

# Run tests
npm run test

# Check types
npm run type-check

# Build for deployment
npm run build
```
