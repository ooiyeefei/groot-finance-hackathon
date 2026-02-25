# Leave Management Module Documentation

## Overview

The leave management module implements a complete leave request and approval workflow system for Groot Finance. It provides employees with self-service leave booking, managers with approval capabilities, and admins with configuration controls.

### Key Capabilities
- **Leave Request Workflow**: Draft → Submit → Approve/Reject
- **Business Day Calculation**: Excludes weekends and public holidays
- **Multi-Country Holidays**: Support for SEA countries (MY, SG, ID, PH, TH, VN)
- **Team Calendar**: Organization-wide visibility of approved leave
- **Balance Tracking**: Automatic deduction/restoration based on leave type

## Workflow State Machine

```
Employee Flow:
  draft → submitted → approved
                   ↘ rejected

Cancellation:
  submitted → cancelled (by employee, always)
  approved → cancelled (by employee, only if future start date)
```

### Status Definitions

- **draft**: Editable state, not yet submitted
- **submitted**: Pending manager approval, routed to assigned approver
- **approved**: Manager approved, balance deducted (if leave type deducts)
- **rejected**: Manager rejected with reason
- **cancelled**: Cancelled by employee

## Architecture

### Directory Structure

```
src/domains/leave-management/
├── components/
│   ├── leave-page-content.tsx      # Main employee leave page
│   ├── leave-request-form.tsx      # Create/edit leave request form
│   ├── leave-balance-widget.tsx    # Balance display widget
│   ├── my-leave-requests.tsx       # Employee's leave history
│   ├── leave-approvals-content.tsx # Manager approval interface
│   ├── leave-management-settings.tsx # Admin configuration
│   ├── team-calendar-content.tsx   # Organization calendar view
│   └── index.ts                    # Component exports
├── hooks/
│   ├── use-leave-requests.ts       # CRUD operations for requests
│   ├── use-leave-types.ts          # Leave type configuration
│   ├── use-leave-balances.ts       # Balance tracking
│   ├── use-public-holidays.ts      # Holiday management
│   ├── use-team-calendar.ts        # Calendar data
│   └── index.ts                    # Hook exports
├── lib/
│   ├── leave-workflow.ts           # State machine transitions
│   └── day-calculator.ts           # Business day calculations
└── types/
    └── index.ts                    # TypeScript interfaces
```

### Convex Functions

Located in `convex/functions/`:

- **leaveRequests.ts**: Request CRUD, approval/rejection mutations
- **leaveTypes.ts**: Leave type configuration
- **leaveBalances.ts**: Balance tracking and adjustments
- **publicHolidays.ts**: Holiday management
- **teamCalendar.ts**: Calendar data aggregation

## Business Day Calculation

### Core Algorithm

Location: `src/domains/leave-management/lib/day-calculator.ts`

```typescript
// Calculate business days between two dates (inclusive)
calculateBusinessDays(startDate, endDate, holidays, excludeWeekends)

// Validate a date range for leave requests
validateDateRange(startDateStr, endDateStr, holidayStrings)
```

### Key Rules

1. **Weekends Excluded**: Saturday (6) and Sunday (0) are not counted
2. **Holidays Excluded**: Public holidays specific to business country
3. **Inclusive Range**: Both start and end dates are counted
4. **UTC-Based**: All calculations use UTC to avoid timezone issues
5. **Validation**: Returns error if selected dates result in 0 business days

### Edge Cases Handled

- Multi-day leave spanning weekends → weekends excluded
- Leave starting/ending on holiday → holidays excluded
- All selected days are weekends/holidays → validation error
- Past date validation → start date must be future

## Leave Types Configuration

### Default Leave Types

1. **Annual Leave (AL)** - Deducts balance, requires approval
2. **Medical Leave (ML)** - Deducts balance, requires approval
3. **Emergency Leave (EL)** - Deducts balance, requires approval
4. **Unpaid Leave (UL)** - Does not deduct balance, requires approval

### Leave Type Properties

```typescript
{
  name: string;           // Display name
  code: string;           // Short code (AL, ML, etc.)
  defaultDays: number;    // Days allocated per year
  deductsBalance: boolean; // Whether to deduct from balance
  requiresApproval: boolean; // Whether manager approval needed
  color: string;          // Calendar display color
  isActive: boolean;      // Whether employees can use it
}
```

## Public Holidays

### SEA Country Support

- **MY**: Malaysia
- **SG**: Singapore
- **ID**: Indonesia
- **PH**: Philippines
- **TH**: Thailand
- **VN**: Vietnam

### Holiday Types

1. **System Holidays**: Pre-loaded for each country/year
2. **Custom Holidays**: Business-specific (e.g., company anniversary)

### Holiday Properties

```typescript
{
  date: string;           // ISO date (YYYY-MM-DD)
  name: string;           // Holiday name
  countryCode: string;    // Country identifier
  year: number;           // Year
  isCustom: boolean;      // System vs custom
  businessId?: string;    // For custom holidays
}
```

## Approval Routing

### Manager Hierarchy

Uses `business_memberships.managerId` with fallback logic:

```
1. Check assigned manager (managerId on membership)
   → Route to assigned manager if active with approval permissions

2. Self-approval for managers/admins without assignment
   → Route to self

3. Fallback to any admin
4. Fallback to any manager
```

### Permission Levels

```
owner > finance_admin > manager > employee

- Owners/Finance Admins: Approve any request in business
- Managers: Approve requests where they are assigned approver
- Employees: Submit own requests only
```

## API & Hooks Reference

### useLeaveRequests Hook

```typescript
// Get my leave requests
const myRequests = useMyLeaveRequests(businessId);

// Get pending requests for approval (managers)
const pendingRequests = usePendingLeaveRequests(businessId);

// CRUD operations
const { createLeaveRequest, isLoading, error } = useCreateLeaveRequest();
const { updateLeaveRequest } = useUpdateLeaveRequest();
const { submitLeaveRequest } = useSubmitLeaveRequest();
const { approveLeaveRequest } = useApproveLeaveRequest();
const { rejectLeaveRequest } = useRejectLeaveRequest();
const { cancelLeaveRequest } = useCancelLeaveRequest();
```

### useLeaveBalances Hook

```typescript
// Get all balances for user
const balances = useLeaveBalances(userId, businessId, year);

// Get single balance for leave type
const balance = useLeaveBalance(userId, businessId, leaveTypeId, year);
```

### useLeaveTypes Hook

```typescript
// Active leave types (for employees)
const leaveTypes = useLeaveTypes(businessId);

// All leave types (for admins)
const allTypes = useAllLeaveTypes(businessId);

// CRUD operations
const { createLeaveType, updateLeaveType, isLoading } = useLeaveTypeOperations();
```

### usePublicHolidays Hook

```typescript
// Get holidays for business (system + custom)
const holidays = useBusinessHolidays(businessId, year);

// Get holiday dates as strings (for calculations)
const holidayDates = useHolidayDates(businessId, year);

// Admin operations
const { addCustomHoliday, removeCustomHoliday } = useHolidayOperations();
```

### useTeamCalendar Hook

```typescript
// Get calendar events for date range
const events = useTeamCalendar(businessId, startDate, endDate);

// Get upcoming absences (next 30 days)
const upcoming = useUpcomingAbsences(businessId);
```

## Pages & Routes

### Employee Pages

- `/[locale]/leave` - Main leave page with request form and history

### Manager Pages

- `/[locale]/manager-approval` - "Leave Requests" tab in approval dashboard

### Admin Pages

- `/[locale]/business-settings` - "Leave Management" tab for configuration

### Team Pages

- `/[locale]/team-calendar` - Organization-wide calendar view

## Component Patterns

### Leave Request Card

```typescript
<Card className="bg-card border-border">
  <CardContent className="p-4">
    <div className="flex justify-between items-start">
      <div>
        <Badge className={getStatusBadgeClass(request.status)}>
          {request.status}
        </Badge>
        <p className="text-foreground font-medium">{request.leaveType.name}</p>
        <p className="text-muted-foreground text-sm">
          {formatBusinessDate(request.startDate)} - {formatBusinessDate(request.endDate)}
        </p>
      </div>
      <div className="text-right">
        <span className="text-2xl font-semibold">{request.totalDays}</span>
        <span className="text-muted-foreground text-sm"> days</span>
      </div>
    </div>
  </CardContent>
</Card>
```

### Status Badge Colors

```typescript
const statusColors = {
  draft: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  submitted: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  approved: 'bg-green-500/10 text-green-600 dark:text-green-400',
  rejected: 'bg-red-500/10 text-red-600 dark:text-red-400',
  cancelled: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
};
```

## Testing Scenarios

### Business Day Calculation

1. **Single day leave** - Should count as 1 day if not weekend/holiday
2. **Week-long leave** - Should exclude 2 weekend days = 5 business days
3. **Leave spanning public holiday** - Should exclude holiday
4. **Leave on weekend only** - Should show 0 days error
5. **Leave including both weekend and holiday** - Should exclude all

### Approval Flow

1. Employee submits → Manager sees in pending queue
2. Manager approves → Balance deducted, status = approved
3. Manager rejects → Balance not affected, status = rejected
4. Employee cancels submitted → Balance not affected
5. Employee cancels approved (future) → Balance restored

### Balance Tracking

1. Approval of deductible leave → Balance decreases
2. Cancellation of approved leave → Balance restores
3. Non-deductible leave (UL) → Balance unchanged
4. Year boundary → Separate balances per year

## Troubleshooting

### Common Issues

1. **"0 business days" error**
   - User selected only weekends/holidays
   - Solution: Select different dates

2. **"Not authorized to approve"**
   - User is not the assigned approver
   - Check `business_memberships.managerId` assignment

3. **"Cannot cancel leave that has started"**
   - Leave start date is today or past
   - Approved leave can only be cancelled if future

4. **Balance not updating**
   - Check if leave type has `deductsBalance: true`
   - Verify balance record exists for year

### Debug Logging

```typescript
// Enable in browser console
localStorage.setItem('debug', 'leave-management:*');
```

## Integration Points

### With Expense Claims

Both modules share the same Manager Approval dashboard (`expense-approval-dashboard.tsx`) with separate tabs for expenses and leave requests.

### With Business Settings

Leave Management tab integrates into the existing tabbed settings interface alongside Business Profile, Category Management, Team Management.

### With Team Calendar

The team calendar aggregates approved leave requests from all team members, displayed alongside public holidays.

## Configuration

### Environment Variables

No additional environment variables required. Uses existing:
- `CONVEX_DEPLOYMENT` - Convex backend URL
- AWS SES configuration for email notifications (if implemented)

### Feature Flags

None currently. All leave management features are enabled by default.
