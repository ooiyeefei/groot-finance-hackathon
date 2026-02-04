# PRD: Leave & Time-Off Management Module

**Product:** FinanSEAL
**Module:** Leave Management
**Author:** Product Management
**Date:** 2026-02-03
**Status:** Draft
**Priority:** P0 - Strategic Feature

---

## Problem Statement

Southeast Asian SMEs currently use separate systems for expense claims and leave management, forcing managers to:
- Check multiple approval queues daily
- Navigate different UX patterns for similar workflows
- Manually track who's absent when reviewing expense claims
- Use tools designed for Singapore-only (QuickHR) or Malaysia/Singapore (BrioHR)

**FinanSEAL currently offers expense claims only.** Expanding to leave management creates:
1. **Unified workflow** - single approval queue for managers (no competitor offers this)
2. **Platform stickiness** - more reasons to stay on FinanSEAL
3. **Regional expansion** - support MY, SG, ID, PH, TH, VN (vs competitors' limited coverage)

---

## User Stories

### Employee Stories

| ID | Story | Priority |
|----|-------|----------|
| E1 | As an employee, I want to submit a leave request so that I can take time off | P0 |
| E2 | As an employee, I want to see my leave balance so that I know how many days I have left | P0 |
| E3 | As an employee, I want to see public holidays for my country so that I can plan time off | P0 |
| E4 | As an employee, I want to cancel a pending leave request so that I can change my plans | P0 |
| E5 | As an employee, I want to see my leave history so that I can track my time off | P1 |
| E6 | As an employee, I want to receive notifications when my leave is approved/rejected | P0 |

### Manager Stories

| ID | Story | Priority |
|----|-------|----------|
| M1 | As a manager, I want to approve/reject leave requests so that I can manage my team | P0 |
| M2 | As a manager, I want to see a team calendar so that I know who's absent when | P0 |
| M3 | As a manager, I want to see leave + expense claims in one queue so that I don't switch apps | P0 |
| M4 | As a manager, I want to be warned about team conflicts so that I don't approve overlapping leave | P1 |
| M5 | As a manager, I want one-tap approval from mobile notifications so that I can approve quickly | P1 |
| M6 | As a manager, I want to see team leave balances so that I can plan coverage | P1 |

### Admin/HR Stories

| ID | Story | Priority |
|----|-------|----------|
| A1 | As an admin, I want to configure leave types so that I can match company policy | P0 |
| A2 | As an admin, I want to set country-specific public holidays so that employees see correct holidays | P0 |
| A3 | As an admin, I want to configure accrual rules so that balances update automatically | P1 |
| A4 | As an admin, I want to run leave reports so that I can track usage | P1 |
| A5 | As an admin, I want to set carryover limits so that unused leave is handled correctly | P2 |
| A6 | As an admin, I want to configure tenure-based entitlements so that long-term employees get more days | P2 |

---

## Competitive Analysis

### Market Position

| Competitor | Leave + Expense | SEA Countries | UX | Pricing |
|------------|-----------------|---------------|-----|---------|
| **BrioHR** | Separate modules | MY, SG | Traditional | SGD 2/emp/mo |
| **QuickHR** | Separate modules | SG only | Traditional | SGD 5-15/emp/mo |
| **BambooHR** | No expense | Global (basic SEA) | Good | ~$10/emp/mo |
| **HiBob** | No expense | Global (basic SEA) | Modern | Quote-based |
| **Rippling** | No expense | Global (basic SEA) | Modern | Quote-based |
| **FinanSEAL** | **Unified** | MY, SG, ID, PH, TH, VN | **Modern** | TBD |

### Competitive Advantages

1. **Unified Workflow** - No competitor combines expense claims + leave in single approval queue
2. **Regional Coverage** - 6 SEA countries vs QuickHR (SG only) or BrioHR (MY/SG)
3. **Modern UX** - Real-time updates via Convex vs traditional page-refresh competitors
4. **Architecture Ready** - 80% of patterns already exist from expense claims

---

## Functional Requirements

### FR1: Leave Request Management (P0)

| Req | Description | Acceptance Criteria |
|-----|-------------|---------------------|
| FR1.1 | Create leave request | Employee can select dates, leave type, add notes |
| FR1.2 | Edit draft request | Employee can modify before submission |
| FR1.3 | Submit request | Request routes to manager via existing approval system |
| FR1.4 | Cancel request | Employee can cancel pending/draft requests |
| FR1.5 | View request status | Employee sees draft/submitted/approved/rejected status |
| FR1.6 | Request validation | System prevents: past dates, exceeds balance, overlaps with existing |

### FR2: Leave Balance Tracking (P0)

| Req | Description | Acceptance Criteria |
|-----|-------------|---------------------|
| FR2.1 | Display current balance | Per leave type (annual, sick, etc.) |
| FR2.2 | Real-time updates | Balance updates immediately on approval |
| FR2.3 | Balance history | Show accruals, deductions, adjustments |
| FR2.4 | Always-visible widget | Balance shown on dashboard without navigation |

### FR3: Approval Workflow (P0)

| Req | Description | Acceptance Criteria |
|-----|-------------|---------------------|
| FR3.1 | Route to manager | Uses existing `business_memberships.managerId` |
| FR3.2 | Fallback routing | Uses existing 4-level fallback algorithm |
| FR3.3 | Approve/reject actions | Manager can approve with one click |
| FR3.4 | Rejection reason | Manager can provide reason for rejection |
| FR3.5 | Notifications | Push/email on submission, approval, rejection |
| FR3.6 | Unified queue | Leave + expense claims in same approval list |

### FR4: Team Calendar (P0)

| Req | Description | Acceptance Criteria |
|-----|-------------|---------------------|
| FR4.1 | Month view | Show team absences in calendar format |
| FR4.2 | Filter by team member | Manager can filter to specific reports |
| FR4.3 | Public holidays overlay | Show country holidays on calendar |
| FR4.4 | Conflict highlighting | Visual indicator when multiple team members off |

### FR5: Leave Type Configuration (P0)

| Req | Description | Acceptance Criteria |
|-----|-------------|---------------------|
| FR5.1 | Default leave types | Annual, Sick, Medical, Unpaid |
| FR5.2 | Custom leave types | Admin can create additional types |
| FR5.3 | Per-type settings | Days allowed, requires approval, deducts from balance |
| FR5.4 | Country association | Leave types can be country-specific |

### FR6: Public Holiday Management (P0)

| Req | Description | Acceptance Criteria |
|-----|-------------|---------------------|
| FR6.1 | Pre-loaded holidays | MY, SG, ID, PH, TH, VN public holidays |
| FR6.2 | Annual refresh | Holidays auto-update yearly |
| FR6.3 | Custom holidays | Admin can add company-specific holidays |
| FR6.4 | Employee visibility | Employees see holidays for their country |

### FR7: Reporting (P1)

| Req | Description | Acceptance Criteria |
|-----|-------------|---------------------|
| FR7.1 | Leave usage report | By employee, team, leave type, date range |
| FR7.2 | Balance summary | Current balances across team |
| FR7.3 | Export capability | CSV/Excel export |

### FR8: Accrual Rules (P1)

| Req | Description | Acceptance Criteria |
|-----|-------------|---------------------|
| FR8.1 | Monthly accrual | Configurable days per month |
| FR8.2 | Annual grant | Lump sum at year start |
| FR8.3 | Pro-rata for new hires | Calculate based on start date |
| FR8.4 | Tenure-based tiers | More days based on years of service |

### FR9: Carryover Rules (P2)

| Req | Description | Acceptance Criteria |
|-----|-------------|---------------------|
| FR9.1 | Carryover limits | Max days that can carry to next year |
| FR9.2 | Expiry dates | Carryover days expire after X months |
| FR9.3 | Use-it-or-lose-it | Option to forfeit unused leave |

---

## Non-Functional Requirements

### NFR1: Performance

| Req | Description | Target |
|-----|-------------|--------|
| NFR1.1 | Page load time | < 2 seconds |
| NFR1.2 | Real-time sync | < 500ms for balance updates |
| NFR1.3 | Calendar render | < 1 second for 50 team members |

### NFR2: Scalability

| Req | Description | Target |
|-----|-------------|--------|
| NFR2.1 | Team size | Support up to 500 employees per business |
| NFR2.2 | Concurrent users | Support 100 concurrent users per business |

### NFR3: Usability

| Req | Description | Target |
|-----|-------------|--------|
| NFR3.1 | Mobile responsive | Full functionality on mobile devices |
| NFR3.2 | Clicks to request | ≤ 4 clicks from dashboard to submitted request |
| NFR3.3 | Clicks to approve | ≤ 2 clicks from notification to approved |

### NFR4: Security

| Req | Description | Target |
|-----|-------------|--------|
| NFR4.1 | Data isolation | Leave data scoped to business |
| NFR4.2 | Role-based access | Reuse existing RBAC system |
| NFR4.3 | Audit logging | All leave actions logged to audit_events |

---

## Acceptance Criteria by Priority

### P0 - Must Have for MVP

- [ ] Employee can submit leave request with date range and leave type
- [ ] Employee can see current leave balance on dashboard
- [ ] Manager can approve/reject leave request from unified queue
- [ ] Manager can view team calendar with absences
- [ ] Admin can configure leave types (annual, sick, etc.)
- [ ] System displays country-specific public holidays (MY, SG, ID, PH, TH, VN)
- [ ] Approval workflow uses existing manager hierarchy
- [ ] Notifications sent on submit/approve/reject
- [ ] Audit trail records all leave actions

### P1 - Should Have

- [ ] One-tap approval from mobile push notification
- [ ] Team conflict warnings when approving
- [ ] Leave usage reports with export
- [ ] Accrual rules with monthly/annual options
- [ ] Pro-rata calculation for new hires
- [ ] Leave balance history view

### P2 - Nice to Have

- [ ] Tenure-based entitlement tiers
- [ ] Carryover rules with limits and expiry
- [ ] Google/Outlook calendar sync
- [ ] Slack/Teams integration

---

## Edge Cases

| Case | Handling |
|------|----------|
| Employee has no manager assigned | Route to any admin (existing fallback) |
| Leave request spans public holiday | Exclude holiday from deduction |
| Negative balance after adjustment | Allow but flag for admin review |
| Manager approves own leave | Route to their manager or admin |
| Employee changes country | Update to new country's holidays, keep balance |
| Partial day leave | V1: full days only. V2: half-day support |
| Overlapping requests | Reject second request with clear message |
| Leave request during notice period | Allow but flag for manager |

---

## Out of Scope (V1)

| Feature | Reason | Future Version |
|---------|--------|----------------|
| Half-day leave | Complexity, add in V2 | V2 |
| Time-in-lieu | Requires timesheets | V2 |
| Shift scheduling | Different product domain | V3 |
| Payroll integration | Requires partnerships | V2 |
| Custom approval chains | Existing hierarchy sufficient | V2 |
| Overtime tracking | Different product domain | V3 |

---

## Technical Considerations

### Architecture Reuse

| Component | Reuse Level | Notes |
|-----------|-------------|-------|
| `business_memberships.managerId` | 100% | Manager hierarchy exists |
| Approval workflow engine | 90% | Add leave-specific status |
| `audit_events` table | 100% | Add leave event types |
| RBAC system | 100% | Same roles apply |
| Status state machine | 80% | New states for leave |
| React Query patterns | 100% | Same patterns |
| API patterns | 100% | Same rate limiting, caching |

### New Components Needed

| Component | Complexity | Notes |
|-----------|------------|-------|
| `leave_requests` table | Medium | New Convex table |
| `leave_balances` table | Medium | Per employee, per leave type |
| `leave_types` table | Low | Configurable leave types |
| `public_holidays` table | Low | Pre-loaded data |
| Team calendar component | Medium | New React component |
| Balance widget component | Low | Dashboard addition |

### Data Model (Draft)

```
leave_requests:
  - id
  - businessId
  - userId
  - leaveTypeId
  - startDate
  - endDate
  - totalDays
  - status (draft, submitted, approved, rejected, cancelled)
  - notes
  - approverId
  - approverNotes
  - createdAt, updatedAt

leave_balances:
  - id
  - businessId
  - userId
  - leaveTypeId
  - year
  - entitled
  - used
  - adjustments
  - remaining

leave_types:
  - id
  - businessId
  - name
  - defaultDays
  - requiresApproval
  - deductsBalance
  - countryCode (optional)

public_holidays:
  - id
  - countryCode
  - date
  - name
  - year
```

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Adoption rate | 50% of expense claims users | Users with ≥1 leave request |
| Approval time | < 4 hours median | Time from submit to decision |
| Mobile approval rate | > 30% | Approvals from mobile device |
| Balance check frequency | > 3x/month per user | Dashboard widget views |
| Unified queue usage | > 70% | Managers using combined view |

---

## Timeline (Proposed)

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1: MVP | 4-6 weeks | P0 features, core workflow |
| Phase 2: Polish | 2-3 weeks | P1 features, mobile optimization |
| Phase 3: Advanced | 3-4 weeks | P2 features, integrations |

---

## Open Questions

1. **Pricing model** - Include in existing plan or separate module?
2. **Data migration** - Any customers with existing leave data to import?
3. **Public holiday source** - Which API/data source for holiday data?
4. **Mobile app** - Update existing app or web-responsive only for V1?

---

## Appendix: Competitive Evidence

See `.pm/competitors/_landscape.md` for detailed competitor analysis.

### Key Findings

1. **BrioHR**: SGD 2/emp/mo, MY/SG only, traditional UX
2. **QuickHR**: SGD 5-15/emp/mo, SG only, 2000+ customers, no calendar sync
3. **BambooHR**: ~$10/emp/mo, global but basic SEA, 34K customers
4. **HiBob**: Mid-market focus, modern UX, no SEA specialization
5. **Rippling**: Enterprise focus, too complex for SMEs

**Gap exploited**: No competitor offers unified expense + leave workflow.
