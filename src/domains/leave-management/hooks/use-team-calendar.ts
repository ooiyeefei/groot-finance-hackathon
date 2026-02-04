'use client';

/**
 * Team Calendar Hooks - Convex real-time subscriptions
 *
 * Provides hooks for:
 * - Team calendar events (leave + holidays)
 * - Upcoming absences widget
 * - Conflict detection
 */

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useMemo } from 'react';

// ============================================
// TYPES
// ============================================

export interface CalendarLeaveEvent {
  requestId: string;
  userId: string;
  userName: string;
  leaveType: string;
  leaveTypeColor?: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface CalendarHoliday {
  _id: string;
  date: string;
  name: string;
  countryCode: string;
  isCustom: boolean;
}

export interface CalendarResponse {
  leaveEvents: CalendarLeaveEvent[];
  holidays: CalendarHoliday[];
  conflicts: string[]; // Array of conflict dates
}

// ============================================
// QUERIES
// ============================================

/**
 * Get team calendar events for a date range
 * Returns leave events, holidays, and conflict dates
 */
export function useTeamCalendar(
  businessId: string | undefined,
  startDate: string,
  endDate: string
) {
  return useQuery(
    api.functions.teamCalendar.getEvents,
    businessId ? { businessId, startDate, endDate } : 'skip'
  );
}

/**
 * Get upcoming team absences (next 30 days)
 * Useful for dashboard widget
 */
export function useUpcomingAbsences(businessId: string | undefined) {
  return useQuery(
    api.functions.teamCalendar.getUpcomingAbsences,
    businessId ? { businessId } : 'skip'
  );
}

// ============================================
// DERIVED HOOKS
// ============================================

/**
 * Get calendar data for current month
 */
export function useCurrentMonthCalendar(businessId: string | undefined) {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];

  return useTeamCalendar(businessId, startDate, endDate);
}

/**
 * Get calendar data for a specific month
 */
export function useMonthCalendar(
  businessId: string | undefined,
  year: number,
  month: number // 0-indexed
) {
  const startDate = new Date(year, month, 1).toISOString().split('T')[0];
  const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

  return useTeamCalendar(businessId, startDate, endDate);
}

/**
 * Get events organized by date for easy rendering
 * Returns a Map<date, events[]> for O(1) lookup
 */
export function useCalendarEventsByDate(
  businessId: string | undefined,
  startDate: string,
  endDate: string
) {
  const calendarData = useTeamCalendar(businessId, startDate, endDate);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarLeaveEvent[]>();

    if (!calendarData?.leaveEvents) return map;

    for (const event of calendarData.leaveEvents) {
      // Add event to each date in its range
      const start = new Date(event.startDate);
      const end = new Date(event.endDate);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const existing = map.get(dateStr) || [];
        existing.push(event);
        map.set(dateStr, existing);
      }
    }

    return map;
  }, [calendarData?.leaveEvents]);

  const holidaysByDate = useMemo(() => {
    const map = new Map<string, CalendarHoliday>();

    if (!calendarData?.holidays) return map;

    for (const holiday of calendarData.holidays) {
      map.set(holiday.date, holiday);
    }

    return map;
  }, [calendarData?.holidays]);

  const conflictDates = useMemo(() => {
    if (!calendarData?.conflicts) return new Set<string>();
    return new Set(calendarData.conflicts);
  }, [calendarData?.conflicts]);

  return {
    eventsByDate,
    holidaysByDate,
    conflictDates,
    isLoading: calendarData === undefined,
  };
}

/**
 * Filter calendar events by criteria
 */
export function useFilteredCalendarEvents(
  businessId: string | undefined,
  startDate: string,
  endDate: string,
  filters?: {
    leaveType?: string;
    userId?: string;
    status?: 'approved' | 'submitted' | 'all';
  }
) {
  const calendarData = useTeamCalendar(businessId, startDate, endDate);

  const filteredEvents = useMemo(() => {
    if (!calendarData?.leaveEvents) return [];

    return calendarData.leaveEvents.filter((event) => {
      if (filters?.leaveType && event.leaveType !== filters.leaveType) {
        return false;
      }
      if (filters?.userId && event.userId !== filters.userId) {
        return false;
      }
      if (filters?.status && filters.status !== 'all' && event.status !== filters.status) {
        return false;
      }
      return true;
    });
  }, [calendarData?.leaveEvents, filters]);

  return {
    events: filteredEvents,
    holidays: calendarData?.holidays ?? [],
    conflicts: calendarData?.conflicts ?? [],
    isLoading: calendarData === undefined,
  };
}
