'use client';

/**
 * Team Calendar Content Component
 *
 * Displays a calendar view of team absences:
 * - Monthly calendar with leave indicators
 * - List of upcoming absences
 * - Public holidays highlighted
 */

import React, { useState, useMemo } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  User,
  CalendarDays,
  Sun,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useBusinessContext } from '@/contexts/business-context';
import { useTeamCalendar, useUpcomingAbsences } from '../hooks/use-team-calendar';
import { useBusinessHolidays } from '../hooks/use-public-holidays';
import { useLeaveTypes } from '../hooks/use-leave-types';

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface TeamCalendarContentProps {
  businessId?: string;
}

export default function TeamCalendarContent({ businessId: propBusinessId }: TeamCalendarContentProps) {
  const { activeContext } = useBusinessContext();
  const businessId = propBusinessId || activeContext?.businessId;

  const [currentDate, setCurrentDate] = useState(new Date());
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  // Data hooks
  const startOfMonth = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
  const endOfMonth = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${lastDay}`;

  const calendarEvents = useTeamCalendar(businessId, startOfMonth, endOfMonth);
  const upcomingAbsences = useUpcomingAbsences(businessId);
  const holidays = useBusinessHolidays(businessId, currentYear);
  const leaveTypes = useLeaveTypes(businessId);

  // Create leave type lookup map
  type LeaveTypeInfo = { _id: string; name: string; color?: string };
  const leaveTypeMap = useMemo((): Map<string, LeaveTypeInfo> => {
    if (!leaveTypes) return new Map<string, LeaveTypeInfo>();
    return new Map<string, LeaveTypeInfo>(
      leaveTypes.map((lt: LeaveTypeInfo) => [lt._id, lt] as [string, LeaveTypeInfo])
    );
  }, [leaveTypes]);

  // Create holiday date set for quick lookup
  const holidayDates = useMemo(() => {
    if (!holidays) return new Set<string>();
    return new Set(holidays.map((h: { date: string }) => h.date));
  }, [holidays]);

  // Create events by date map
  const eventsByDate = useMemo(() => {
    type LeaveEvent = {
      requestId: string;
      userId: string;
      userName: string;
      leaveType: string;
      leaveTypeColor?: string;
      startDate: string;
      endDate: string;
      status: string;
    };
    const map = new Map<string, LeaveEvent[]>();
    if (!calendarEvents?.leaveEvents) return map;

    calendarEvents.leaveEvents.forEach((event) => {
      // Add event to each date in its range
      const start = new Date(event.startDate + 'T00:00:00');
      const end = new Date(event.endDate + 'T00:00:00');

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        if (!map.has(dateStr)) {
          map.set(dateStr, []);
        }
        map.get(dateStr)!.push(event);
      }
    });

    return map;
  }, [calendarEvents]);

  // Generate calendar grid
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const days: Array<{ date: Date | null; dateStr: string }> = [];

    // Add empty cells for days before the first of the month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push({ date: null, dateStr: '' });
    }

    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({ date, dateStr });
    }

    return days;
  }, [currentYear, currentMonth]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const isToday = (dateStr: string) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return dateStr === todayStr;
  };

  const isWeekend = (date: Date | null) => {
    if (!date) return false;
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  // Loading state
  if (calendarEvents === undefined) {
    return (
      <div className="space-y-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Calendar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6" />
            Team Calendar
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            View team absences and public holidays
          </p>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => navigateMonth('prev')}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm sm:text-lg font-medium text-foreground min-w-[140px] sm:min-w-[180px] text-center">
            {MONTHS[currentMonth]} {currentYear}
          </span>
          <Button variant="outline" size="icon" onClick={() => navigateMonth('next')}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-3">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              {/* Days of week header */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAYS_OF_WEEK.map((day) => (
                  <div
                    key={day}
                    className="text-center text-sm font-medium text-muted-foreground py-2"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((dayInfo, index) => {
                  const { date, dateStr } = dayInfo;
                  const dayEvents = eventsByDate.get(dateStr) || [];
                  const isHoliday = holidayDates.has(dateStr);
                  const weekend = isWeekend(date);

                  return (
                    <div
                      key={index}
                      className={`min-h-[80px] p-1 rounded-lg border ${
                        date
                          ? isToday(dateStr)
                            ? 'border-primary bg-primary/5'
                            : isHoliday
                              ? 'border-red-500/30 bg-red-500/5'
                              : weekend
                                ? 'border-border/50 bg-muted/30'
                                : 'border-border bg-muted/50'
                          : 'border-transparent'
                      }`}
                    >
                      {date && (
                        <>
                          <div className={`text-sm font-medium mb-1 ${
                            isToday(dateStr)
                              ? 'text-primary'
                              : isHoliday
                                ? 'text-red-500'
                                : weekend
                                  ? 'text-muted-foreground'
                                  : 'text-foreground'
                          }`}>
                            {date.getDate()}
                          </div>
                          <div className="space-y-0.5">
                            {isHoliday && (
                              <div className="flex items-center gap-1">
                                <Sun className="w-3 h-3 text-red-500" />
                                <span className="text-[10px] text-red-500 truncate">Holiday</span>
                              </div>
                            )}
                            {dayEvents.slice(0, 2).map((event) => {
                              return (
                                <div
                                  key={event.requestId}
                                  className="flex items-center gap-1 text-[10px] truncate"
                                  title={`${event.userName || 'Employee'} - ${event.leaveType || 'Leave'}`}
                                >
                                  <div
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: event.leaveTypeColor || '#3B82F6' }}
                                  />
                                  <span className="truncate text-foreground">
                                    {event.userName?.split(' ')[0] || 'Employee'}
                                  </span>
                                </div>
                              );
                            })}
                            {dayEvents.length > 2 && (
                              <div className="text-[10px] text-muted-foreground">
                                +{dayEvents.length - 2} more
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Absences Sidebar */}
        <div className="lg:col-span-1">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Upcoming
              </CardTitle>
              <CardDescription>Next 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingAbsences === undefined ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : upcomingAbsences.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No upcoming absences</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingAbsences.map((absence: {
                    requestId: string;
                    userId: string;
                    userName: string;
                    leaveType: string;
                    leaveTypeColor?: string;
                    startDate: string;
                    endDate: string;
                    totalDays: number;
                  }) => {
                    const startDate = new Date(absence.startDate + 'T00:00:00');

                    return (
                      <div
                        key={absence.requestId}
                        className="p-3 bg-muted/50 rounded-lg border border-border"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: absence.leaveTypeColor || '#3B82F6' }}
                          />
                          <span className="text-sm font-medium text-foreground truncate">
                            {absence.userName || 'Employee'}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {absence.leaveType || 'Leave'} · {absence.totalDays} {absence.totalDays === 1 ? 'day' : 'days'}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {startDate.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                          {absence.startDate !== absence.endDate && (
                            <> - {new Date(absence.endDate + 'T00:00:00').toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}</>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Legend */}
          <Card className="bg-card border-border mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Legend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Sun className="w-4 h-4 text-red-500" />
                  <span className="text-muted-foreground">Public Holiday</span>
                </div>
                {leaveTypes?.slice(0, 5).map((lt: LeaveTypeInfo) => (
                  <div key={lt._id} className="flex items-center gap-2 text-sm">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: lt.color || '#3B82F6' }}
                    />
                    <span className="text-muted-foreground">{lt.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
