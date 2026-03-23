'use client';

/**
 * Leave & Timesheet Page Content - Tabbed Interface
 *
 * Combines Team Calendar, My Leave, and Timesheet in a single tabbed view.
 * Supports hash-based tab routing (e.g. /leave-management#my-leave).
 * Default tab: team-calendar (no hash).
 */

import { useState, useEffect, lazy, Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, CalendarDays, Clock, BarChart3, Loader2 } from 'lucide-react';
import { useBusinessContext } from '@/contexts/business-context';
import LeavePageContent from './leave-page-content';

const TeamCalendarContent = lazy(() => import('./team-calendar-content'));
const TimesheetPageContent = lazy(() => import('@/domains/timesheet-attendance/components/timesheet-page-content'));
const LeaveReportsContent = lazy(() => import('./leave-reports-content'));

const TAB_HASH_MAP: Record<string, string> = {
  'team-calendar': '',
  'my-leave': 'my-leave',
  'timesheet': 'timesheet',
  'reports': 'reports',
};

function getTabFromHash(): string {
  if (typeof window === 'undefined') return 'team-calendar';
  const hash = window.location.hash.replace('#', '');
  if (hash === 'my-leave') return 'my-leave';
  if (hash === 'timesheet') return 'timesheet';
  if (hash === 'reports') return 'reports';
  return 'team-calendar';
}

export default function LeaveManagementPageContent() {
  const { activeContext } = useBusinessContext();
  const role = activeContext?.role;
  const canViewReports = role === 'owner' || role === 'finance_admin' || role === 'manager';
  const [activeTab, setActiveTab] = useState('team-calendar');

  // Sync tab from URL hash on mount
  useEffect(() => {
    setActiveTab(getTabFromHash());

    const handleHashChange = () => {
      setActiveTab(getTabFromHash());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Update URL hash when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const hash = TAB_HASH_MAP[value];
    if (hash) {
      window.history.replaceState(null, '', `#${hash}`);
    } else {
      // Remove hash for default tab
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className={`grid w-full ${canViewReports ? 'grid-cols-4' : 'grid-cols-3'} h-auto p-1 gap-1 bg-muted border border-border lg:w-[${canViewReports ? '720' : '560'}px]`}>
          <TabsTrigger
            value="team-calendar"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex items-center gap-2"
          >
            <CalendarDays className="h-4 w-4" />
            <span>Team Calendar</span>
          </TabsTrigger>
          <TabsTrigger
            value="my-leave"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex items-center gap-2"
          >
            <Calendar className="h-4 w-4" />
            <span>My Leave</span>
          </TabsTrigger>
          <TabsTrigger
            value="timesheet"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex items-center gap-2"
          >
            <Clock className="h-4 w-4" />
            <span>Timesheet</span>
          </TabsTrigger>
          {canViewReports && (
            <TabsTrigger
              value="reports"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex items-center gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              <span>Reports</span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="team-calendar" className="mt-6">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <TeamCalendarContent />
          </Suspense>
        </TabsContent>

        <TabsContent value="my-leave" className="mt-6">
          <LeavePageContent />
        </TabsContent>

        <TabsContent value="timesheet" className="mt-6">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <TimesheetPageContent />
          </Suspense>
        </TabsContent>

        {canViewReports && (
          <TabsContent value="reports" className="mt-6">
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <LeaveReportsContent />
            </Suspense>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
