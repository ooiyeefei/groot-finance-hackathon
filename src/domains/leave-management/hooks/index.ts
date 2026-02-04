/**
 * Leave Management Hooks - Public API
 *
 * Re-exports all leave management hooks for easy importing
 */

// Leave Requests
export {
  useMyLeaveRequests,
  useLeaveRequest,
  usePendingLeaveRequests,
  useLeaveRequestsList,
  useCreateLeaveRequest,
  useUpdateLeaveRequest,
  useSubmitLeaveRequest,
  useApproveLeaveRequest,
  useRejectLeaveRequest,
  useCancelLeaveRequest,
  useLeaveRequestOperations,
  useLeaveApprovalOperations,
  type CreateLeaveRequestInput,
  type UpdateLeaveRequestInput,
} from './use-leave-requests';

// Leave Balances
export {
  useMyBalances,
  useUserBalances,
  useTeamBalances,
  useBalanceSummary,
  useBalanceByType,
  useAllEmployeeBalances,
  useInitializeAllBalances,
  useAdjustBalance,
  useUpdateEntitled,
  useUpdateLeaveEntitlements,
  useReinitializeUserBalances,
  useBalanceOperations,
  type LeaveBalanceWithType,
} from './use-leave-balances';

// Leave Types
export {
  useLeaveTypes,
  useAllLeaveTypes,
  useLeaveType,
  useCreateLeaveType,
  useUpdateLeaveType,
  useToggleLeaveType,
  useDeleteLeaveType,
  useLeaveTypeOperations,
  type CreateLeaveTypeInput,
  type UpdateLeaveTypeInput,
} from './use-leave-types';

// Public Holidays
export {
  useBusinessHolidays,
  useHolidayDates,
  useCountryHolidays,
  useCustomHolidays,
  useAddCustomHoliday,
  useRemoveCustomHoliday,
  useUpdateCustomHoliday,
  useHolidayLookup,
  useHolidayOperations,
  type Holiday,
} from './use-public-holidays';

// Team Calendar
export {
  useTeamCalendar,
  useUpcomingAbsences,
  useCurrentMonthCalendar,
  useMonthCalendar,
  useCalendarEventsByDate,
  useFilteredCalendarEvents,
  type CalendarLeaveEvent,
  type CalendarHoliday,
  type CalendarResponse,
} from './use-team-calendar';
