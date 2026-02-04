# Research: Leave & Time-Off Management Module

**Date**: 2026-02-03
**Branch**: `001-leave-management`

## Research Summary

All technical decisions resolved. No NEEDS CLARIFICATION items from spec - well-defined requirements with clear patterns to follow from existing expense claims domain.

---

## Decision 1: Public Holiday Data Source

**Decision**: Static JSON files bundled in repository, seeded to Convex on deployment

**Rationale**:
- No external API dependency = higher reliability
- SEA holidays are announced annually, low change frequency
- Admins can add company-specific holidays via UI
- Simpler implementation, no API keys or rate limits
- Can add API integration (e.g., Calendarific) in V2 if needed

**Alternatives Considered**:
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Static JSON files | No dependencies, fast, reliable | Manual annual update | ✅ Selected |
| Calendarific API | Auto-updates | Cost, API dependency, rate limits | Deferred to V2 |
| Google Calendar API | Well-known | OAuth complexity, overkill | Rejected |
| Nager.Date API | Free | Limited SEA coverage | Rejected |

**Implementation**:
- Store JSON files in `src/lib/data/public-holidays/{country}-{year}.json`
- Seed to `public_holidays` Convex table on migration
- Annual update via GitHub Action or manual PR

---

## Decision 2: Unified Approval Queue Architecture

**Decision**: Extend existing approval queue component to fetch both expense claims and leave requests, merge client-side

**Rationale**:
- Minimal changes to existing expense claims code
- Convex subscriptions handle real-time for both
- Clear type discrimination in UI
- Avoids complex backend aggregation

**Alternatives Considered**:
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Client-side merge | Simple, uses existing patterns | Two subscriptions | ✅ Selected |
| New unified table | Single query | Major schema change, data duplication | Rejected |
| Backend aggregation | Single response | Complex Convex function, no real-time | Rejected |

**Implementation**:
- `useUnifiedApprovalQueue()` hook fetches both sources
- Merge and sort by submission date
- Type field distinguishes `expense_claim` vs `leave_request`

---

## Decision 3: Leave Balance Calculation Strategy

**Decision**: Balance stored as separate record, updated on approval/cancellation via Convex mutation

**Rationale**:
- Real-time balance display requires stored value
- Convex mutations ensure atomic updates
- Audit trail via existing audit_events
- Simpler than calculating from request history on every query

**Alternatives Considered**:
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Stored balance record | Fast reads, real-time | Must sync on every change | ✅ Selected |
| Calculate from requests | Always accurate | Slow, no real-time, complex query | Rejected |
| Event sourcing | Full history | Overkill for V1 | Deferred |

**Implementation**:
- `leave_balances` table: `userId, businessId, leaveTypeId, year, entitled, used, adjustments`
- `remaining` computed as `entitled - used + adjustments`
- Update `used` atomically in approval mutation

---

## Decision 4: Business Day Calculation

**Decision**: Pure function that takes date range + holidays + weekends, returns count

**Rationale**:
- Testable in isolation
- No database dependency during calculation
- Holidays fetched once at request creation time
- Reusable across multiple contexts (request form, calendar, reports)

**Alternatives Considered**:
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Pure function | Testable, fast, simple | Must pass holidays | ✅ Selected |
| Database function | Single source of truth | Convex doesn't support | N/A |
| External library (date-fns-business-days) | Pre-built | No SEA holiday support | Rejected |

**Implementation**:
```typescript
function calculateBusinessDays(
  startDate: Date,
  endDate: Date,
  holidays: Date[],
  excludeWeekends: boolean = true
): number
```

---

## Decision 5: Leave Type Default Configuration

**Decision**: Seed 4 default leave types on business creation, allow admin customization

**Rationale**:
- Matches competitor patterns (BrioHR, QuickHR)
- Reduces setup friction for new businesses
- Admins can disable/modify defaults
- Country-specific types can be added later

**Default Leave Types**:
| Type | Default Days | Requires Approval | Deducts Balance |
|------|--------------|-------------------|-----------------|
| Annual | 14 | Yes | Yes |
| Sick | 14 | Yes | Yes |
| Medical | 60 | Yes | Yes |
| Unpaid | 0 | Yes | No |

---

## Decision 6: Notification Integration

**Decision**: Reuse existing notification infrastructure from expense claims

**Rationale**:
- Same patterns (push + email)
- Same triggers (submit, approve, reject)
- Minimal new code
- Consistent UX

**Implementation**:
- Add leave-specific notification templates
- Reuse `sendNotification()` utility
- Same preference settings apply

---

## Decision 7: State Machine for Leave Requests

**Decision**: Simple status enum with explicit transitions, similar to expense claims

**Statuses**:
```
draft → submitted → approved → (completed)
                  ↘ rejected

submitted → cancelled (by employee)
approved → cancelled (by employee, if future date)
```

**Rationale**:
- Matches expense claims pattern
- Clear, auditable transitions
- No complex workflow engine needed for V1

---

## Best Practices Applied

### Convex Patterns (from expense claims)

1. **Schema-first**: Define tables in `convex/schema.ts` with validators
2. **Indexed queries**: Add indexes for common query patterns (by_businessId, by_userId, by_status)
3. **Mutations for writes**: All state changes via mutations with optimistic updates
4. **Subscriptions for reads**: Real-time data via `useQuery` hooks

### React Patterns (from expense claims)

1. **Domain structure**: types/ → hooks/ → lib/ → components/
2. **Zod validation**: Request/response validation at boundaries
3. **React Query**: Cache management for non-Convex data
4. **Optimistic updates**: UI updates before server confirmation

### Testing Patterns

1. **Unit tests**: Pure functions (day calculator, validators)
2. **Integration tests**: Convex function flows
3. **E2E tests**: Critical user journeys (submit, approve)

---

## Open Items (Deferred to Implementation)

1. **Holiday data format**: Finalize JSON schema during data-model.md
2. **Calendar component library**: Evaluate react-big-calendar vs custom
3. **Mobile notification deep links**: Requires PWA service worker updates

---

## Research Complete

All technical decisions resolved. Ready for Phase 1: Design & Contracts.
