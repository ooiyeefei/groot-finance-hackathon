# Data Model: Leave & Time-Off Management

**Date**: 2026-02-03
**Branch**: `001-leave-management`

## Entity Overview

```
┌─────────────────┐     ┌─────────────────┐
│   leave_types   │◄────│ leave_requests  │
└─────────────────┘     └────────┬────────┘
        │                        │
        │                        │ updates
        ▼                        ▼
┌─────────────────┐     ┌─────────────────┐
│ public_holidays │     │ leave_balances  │
└─────────────────┘     └─────────────────┘
```

---

## Entity: leave_requests

A formal request by an employee to take time off.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| _id | Id | Auto | Convex document ID |
| _creationTime | number | Auto | Convex timestamp |
| businessId | Id<"businesses"> | Yes | Multi-tenant scope |
| userId | Id<"users"> | Yes | Employee requesting leave |
| leaveTypeId | Id<"leave_types"> | Yes | Type of leave |
| startDate | string | Yes | ISO date (YYYY-MM-DD) |
| endDate | string | Yes | ISO date (YYYY-MM-DD) |
| totalDays | number | Yes | Business days calculated |
| status | LeaveRequestStatus | Yes | Current workflow state |
| notes | string | No | Employee notes/reason |
| approverId | Id<"users"> | No | Manager who approved/rejected |
| approverNotes | string | No | Approval/rejection reason |
| approvedAt | number | No | Timestamp of decision |
| cancelledAt | number | No | Timestamp if cancelled |
| cancelReason | string | No | Reason for cancellation |

### Status Enum: LeaveRequestStatus

```typescript
type LeaveRequestStatus =
  | 'draft'      // Employee editing, not submitted
  | 'submitted'  // Pending manager approval
  | 'approved'   // Manager approved, balance deducted
  | 'rejected'   // Manager rejected
  | 'cancelled'  // Employee cancelled
```

### State Transitions

| From | To | Trigger | Side Effects |
|------|----|---------|--------------|
| draft | submitted | Employee submits | Notify manager |
| submitted | approved | Manager approves | Deduct balance, notify employee |
| submitted | rejected | Manager rejects | Notify employee with reason |
| submitted | cancelled | Employee cancels | Remove from queue |
| approved | cancelled | Employee cancels (future only) | Restore balance, notify manager |

### Indexes

| Name | Fields | Purpose |
|------|--------|---------|
| by_businessId | businessId | List all for business |
| by_userId | userId | Employee's own requests |
| by_status | status | Filter by status |
| by_businessId_status | businessId, status | Approval queue |
| by_businessId_userId | businessId, userId | Employee history |
| by_approverId_status | approverId, status | Manager's pending |

### Validation Rules

- startDate must be >= today (no past dates)
- endDate must be >= startDate
- totalDays must be > 0
- totalDays must not exceed available balance (for balance-deducting types)
- No overlapping dates with existing approved/submitted requests for same user

---

## Entity: leave_balances

Tracks an employee's leave entitlement and usage per type per year.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| _id | Id | Auto | Convex document ID |
| _creationTime | number | Auto | Convex timestamp |
| businessId | Id<"businesses"> | Yes | Multi-tenant scope |
| userId | Id<"users"> | Yes | Employee |
| leaveTypeId | Id<"leave_types"> | Yes | Leave type |
| year | number | Yes | Calendar year (e.g., 2026) |
| entitled | number | Yes | Total days entitled |
| used | number | Yes | Days used (approved requests) |
| adjustments | number | Yes | Manual adjustments (+/-) |
| carryover | number | No | Days carried from previous year |
| lastUpdated | number | Yes | Last modification timestamp |

### Computed Fields (not stored)

```typescript
remaining = entitled - used + adjustments + (carryover ?? 0)
```

### Indexes

| Name | Fields | Purpose |
|------|--------|---------|
| by_businessId | businessId | List all for business |
| by_userId | userId | Employee's balances |
| by_userId_year | userId, year | Employee's current year |
| by_businessId_userId_leaveTypeId_year | businessId, userId, leaveTypeId, year | Unique balance lookup |

### Validation Rules

- entitled >= 0
- used >= 0
- remaining >= 0 (soft rule, can be negative with admin flag)
- One record per (userId, leaveTypeId, year) combination

---

## Entity: leave_types

Configurable leave categories per organization.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| _id | Id | Auto | Convex document ID |
| _creationTime | number | Auto | Convex timestamp |
| businessId | Id<"businesses"> | Yes | Multi-tenant scope |
| name | string | Yes | Display name |
| code | string | Yes | Short code (e.g., "ANNUAL") |
| description | string | No | Help text for employees |
| defaultDays | number | Yes | Default entitlement |
| requiresApproval | boolean | Yes | Auto-approve if false |
| deductsBalance | boolean | Yes | Affects balance if true |
| countryCode | string | No | Country-specific (ISO 3166-1) |
| color | string | No | Calendar display color |
| isActive | boolean | Yes | Can be selected |
| sortOrder | number | Yes | Display order |

### Default Leave Types (seeded)

| Code | Name | Days | Approval | Deducts |
|------|------|------|----------|---------|
| ANNUAL | Annual Leave | 14 | Yes | Yes |
| SICK | Sick Leave | 14 | Yes | Yes |
| MEDICAL | Medical Leave | 60 | Yes | Yes |
| UNPAID | Unpaid Leave | 0 | Yes | No |

### Indexes

| Name | Fields | Purpose |
|------|--------|---------|
| by_businessId | businessId | List types for business |
| by_businessId_code | businessId, code | Lookup by code |
| by_businessId_isActive | businessId, isActive | Active types only |

### Validation Rules

- name must be non-empty
- code must be uppercase alphanumeric, unique per business
- defaultDays >= 0
- sortOrder >= 0

---

## Entity: public_holidays

Non-working days by country.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| _id | Id | Auto | Convex document ID |
| _creationTime | number | Auto | Convex timestamp |
| businessId | Id<"businesses"> | No | Null = system default |
| countryCode | string | Yes | ISO 3166-1 alpha-2 |
| date | string | Yes | ISO date (YYYY-MM-DD) |
| name | string | Yes | Holiday name |
| year | number | Yes | Calendar year |
| isCustom | boolean | Yes | Company-specific if true |

### Supported Countries

| Code | Country |
|------|---------|
| MY | Malaysia |
| SG | Singapore |
| ID | Indonesia |
| PH | Philippines |
| TH | Thailand |
| VN | Vietnam |

### Indexes

| Name | Fields | Purpose |
|------|--------|---------|
| by_countryCode_year | countryCode, year | Country holidays by year |
| by_businessId | businessId | Custom company holidays |
| by_date | date | Lookup by date |

### Validation Rules

- date must be valid ISO format
- year must match date's year
- countryCode must be in supported list
- No duplicate (countryCode, date) for system holidays
- No duplicate (businessId, date) for custom holidays

---

## Relationships

### leave_requests → users

```
leave_requests.userId → users._id (employee)
leave_requests.approverId → users._id (manager)
```

### leave_requests → leave_types

```
leave_requests.leaveTypeId → leave_types._id
```

### leave_balances → users

```
leave_balances.userId → users._id
```

### leave_balances → leave_types

```
leave_balances.leaveTypeId → leave_types._id
```

---

## Integration with Existing Tables

### audit_events

All leave actions logged to existing audit_events table:

| eventType | targetEntityType | Details |
|-----------|-----------------|---------|
| leave_request_created | leave_request | Request details |
| leave_request_submitted | leave_request | Status change |
| leave_request_approved | leave_request | Approver, notes |
| leave_request_rejected | leave_request | Approver, reason |
| leave_request_cancelled | leave_request | Reason |
| leave_balance_adjusted | leave_balance | Before/after values |

### business_memberships

Used for:
- `managerId` lookup for approval routing
- `role` for RBAC (employee, manager, admin, owner)
- `countryCode` for employee's holiday calendar

### users

Used for:
- Employee/manager identification
- Notification preferences

---

## Sample Data

### leave_requests

```json
{
  "_id": "j57...",
  "businessId": "k98...",
  "userId": "m12...",
  "leaveTypeId": "n34...",
  "startDate": "2026-02-10",
  "endDate": "2026-02-12",
  "totalDays": 3,
  "status": "submitted",
  "notes": "Family vacation"
}
```

### leave_balances

```json
{
  "_id": "p56...",
  "businessId": "k98...",
  "userId": "m12...",
  "leaveTypeId": "n34...",
  "year": 2026,
  "entitled": 14,
  "used": 3,
  "adjustments": 0,
  "carryover": 2,
  "lastUpdated": 1738540800000
}
```

### public_holidays

```json
{
  "_id": "q78...",
  "businessId": null,
  "countryCode": "SG",
  "date": "2026-01-01",
  "name": "New Year's Day",
  "year": 2026,
  "isCustom": false
}
```
