'use client';

/**
 * Leave Management Page Content - Tabbed Interface
 *
 * Combines My Leave and Team Calendar in a single tabbed view.
 * Supports hash-based tab routing (e.g. /leave-management#team-calendar).
 */

import { useState, useEffect, lazy, Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, CalendarDays, Loader2 } from 'lucide-react';
import LeavePageContent from './leave-page-content';

const TeamCalendarContent = lazy(() => import('./team-calendar-content'));

const TAB_HASH_MAP: Record<string, string> = {
  'my-leave': '',
  'team-calendar': 'team-calendar',
};

function getTabFromHash(): string {
  if (typeof window === 'undefined') return 'my-leave';
  const hash = window.location.hash.replace('#', '');
  if (hash === 'team-calendar') return 'team-calendar';
  return 'my-leave';
}

export default function LeaveManagementPageContent() {
  const [activeTab, setActiveTab] = useState('my-leave');

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
        <TabsList className="grid w-full grid-cols-2 h-auto p-1 gap-1 bg-muted border border-border lg:w-[400px]">
          <TabsTrigger
            value="my-leave"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex items-center gap-2"
          >
            <Calendar className="h-4 w-4" />
            <span>My Leave</span>
          </TabsTrigger>
          <TabsTrigger
            value="team-calendar"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex items-center gap-2"
          >
            <CalendarDays className="h-4 w-4" />
            <span>Team Calendar</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my-leave" className="mt-6">
          <LeavePageContent />
        </TabsContent>

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
      </Tabs>
    </div>
  );
}
