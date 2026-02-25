/**
 * Reporting & Exports Page
 * CSV Template Builder and export functionality
 *
 * Role Access: All authenticated users (data filtered by role)
 * - Employees: Export own records
 * - Managers: Export team records
 * - Finance Admins/Owners: Export all business records
 */

import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/ui/sidebar';
import HeaderWithUser from '@/components/ui/header-with-user';
import { ClientProviders } from '@/components/providers/client-providers';
import ExportsPageContent from '@/domains/exports/components/exports-page-content';

interface ReportingPageProps {
  params: Promise<{ locale: string }>;
}

export default async function ReportingPage({ params }: ReportingPageProps) {
  // Server-side authentication check
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
          <HeaderWithUser
            title="Reporting & Exports"
            subtitle="Export expense claims and leave records to CSV"
          />

          {/* Main Content Area */}
          <main
            className="flex-1 overflow-auto p-4 sm:p-card-padding pb-24 sm:pb-4"
            style={{ contain: 'layout' }}
          >
            <div className="max-w-7xl mx-auto space-y-6">
              <ExportsPageContent />
            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  );
}
