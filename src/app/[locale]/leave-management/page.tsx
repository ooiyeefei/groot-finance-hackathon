/**
 * Leave Management Page
 * Combines leave requests and team calendar in a tabbed interface.
 *
 * Role Access: All authenticated users
 */

import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/ui/sidebar';
import HeaderWithUser from '@/components/ui/header-with-user';
import { ClientProviders } from '@/components/providers/client-providers';
import LeaveManagementPageContent from '@/domains/leave-management/components/leave-management-page-content';

interface LeaveManagementPageProps {
  params: Promise<{ locale: string }>;
}

export default async function LeaveManagementPage({ params }: LeaveManagementPageProps) {
  const { userId } = await auth();
  const { locale } = await params;

  if (!userId) {
    redirect('/sign-in');
  }

  // Get user info for display
  let user = null;
  try {
    user = await currentUser();
  } catch (error) {
    console.warn('Failed to fetch user details for display name:', error);
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        {/* Sidebar - hidden on mobile */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Header */}
          <HeaderWithUser title="Leave & Timesheet" subtitle="Manage leave, attendance, and timesheets" />

          {/* Main Content Area */}
          <main
            className="flex-1 overflow-auto p-4 sm:p-card-padding pb-24 sm:pb-4"
            style={{ contain: 'layout' }}
          >
            <div className="max-w-7xl mx-auto space-y-6">
              <LeaveManagementPageContent />
            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  );
}
