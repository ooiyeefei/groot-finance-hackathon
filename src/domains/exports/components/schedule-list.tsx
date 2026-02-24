'use client';

/**
 * Schedule List Component
 *
 * Displays list of export schedules with enable/disable and delete actions.
 */

import { Clock, Trash2, Calendar, CalendarDays, Loader2, Power, PowerOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ExportFrequency } from '../types';
import type { Id } from '../../../../convex/_generated/dataModel';

const MODULE_LABELS: Record<string, string> = {
  expense: 'Expense Claims',
  invoice: 'Invoices',
  leave: 'Leave Records',
  accounting: 'Accounting Records',
};

interface ScheduleItem {
  _id: Id<'export_schedules'>;
  templateName: string;
  module: 'expense' | 'invoice' | 'leave' | 'accounting';
  frequency: ExportFrequency;
  hourUtc: number;
  minuteUtc?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  isEnabled: boolean;
  nextRunAt: number;
  lastRunAt?: number;
}

interface ScheduleListProps {
  schedules: ScheduleItem[];
  onToggle: (scheduleId: Id<'export_schedules'>, isEnabled: boolean) => void;
  onDelete: (scheduleId: Id<'export_schedules'>) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime(hourUtc: number, minuteUtc?: number): string {
  const hour = hourUtc % 12 || 12;
  const ampm = hourUtc >= 12 ? 'PM' : 'AM';
  const minute = String(minuteUtc ?? 0).padStart(2, '0');
  return `${hour}:${minute} ${ampm} UTC`;
}

function formatSchedule(schedule: ScheduleItem): string {
  const time = formatTime(schedule.hourUtc, schedule.minuteUtc);

  switch (schedule.frequency) {
    case 'daily':
      return `Daily at ${time}`;
    case 'weekly':
      const day = schedule.dayOfWeek !== undefined ? DAYS_OF_WEEK[schedule.dayOfWeek] : 'Day';
      return `Every ${day} at ${time}`;
    case 'monthly':
      const date = schedule.dayOfMonth ?? 1;
      const suffix = getOrdinalSuffix(date);
      return `Monthly on the ${date}${suffix} at ${time}`;
    default:
      return time;
  }
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function formatNextRun(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = timestamp - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (diff < 0) {
    return 'Overdue';
  } else if (hours < 1) {
    return 'Less than an hour';
  } else if (hours < 24) {
    return `In ${hours} hour${hours !== 1 ? 's' : ''}`;
  } else if (days < 7) {
    return `In ${days} day${days !== 1 ? 's' : ''}`;
  } else {
    return date.toLocaleDateString();
  }
}

export function ScheduleList({
  schedules,
  onToggle,
  onDelete,
  isLoading,
  emptyMessage = 'No schedules configured',
}: ScheduleListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">Loading schedules...</p>
      </div>
    );
  }

  if (schedules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Clock className="h-12 w-12 text-muted-foreground/50" />
        <p className="mt-4 text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {schedules.map((schedule) => (
        <div
          key={schedule._id}
          className={cn(
            'flex items-center justify-between rounded-lg border border-border p-4 transition-all',
            schedule.isEnabled ? 'bg-card' : 'bg-muted/30 opacity-60'
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg',
                schedule.frequency === 'daily'
                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                  : schedule.frequency === 'weekly'
                  ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                  : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
              )}
            >
              {schedule.frequency === 'daily' ? (
                <Clock className="h-5 w-5" />
              ) : schedule.frequency === 'weekly' ? (
                <Calendar className="h-5 w-5" />
              ) : (
                <CalendarDays className="h-5 w-5" />
              )}
            </div>
            <div>
              <h4 className="font-medium text-foreground">{schedule.templateName}</h4>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{MODULE_LABELS[schedule.module] || schedule.module}</span>
                <span>•</span>
                <span>{formatSchedule(schedule)}</span>
              </div>
              {schedule.isEnabled && (
                <p className="text-xs text-muted-foreground mt-1">
                  Next run: {formatNextRun(schedule.nextRunAt)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={schedule.isEnabled ? 'outline' : 'secondary'}
              size="sm"
              className={cn(
                'h-8 px-3',
                schedule.isEnabled
                  ? 'text-green-600 hover:text-green-700 border-green-200 hover:border-green-300 dark:text-green-400 dark:border-green-800'
                  : 'text-muted-foreground'
              )}
              onClick={() => onToggle(schedule._id, !schedule.isEnabled)}
            >
              {schedule.isEnabled ? (
                <>
                  <Power className="h-4 w-4 mr-1" />
                  Enabled
                </>
              ) : (
                <>
                  <PowerOff className="h-4 w-4 mr-1" />
                  Disabled
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              onClick={() => onDelete(schedule._id)}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete schedule</span>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
