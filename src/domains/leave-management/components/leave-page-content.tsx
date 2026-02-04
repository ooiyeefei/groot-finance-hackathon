'use client';

/**
 * Leave Page Content - Client Component
 *
 * Main content for the Leave page including:
 * - Leave balance widget
 * - Leave request form
 * - My leave requests list
 */

import React, { useState } from 'react';
import { useActiveBusiness } from '@/contexts/business-context';
import LeaveBalanceWidget from './leave-balance-widget';
import LeaveRequestForm from './leave-request-form';
import MyLeaveRequests from './my-leave-requests';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function LeavePageContent() {
  const { businessId, isLoading: isBusinessLoading } = useActiveBusiness();
  const [showForm, setShowForm] = useState(true);

  // Handle successful form submission
  const handleFormSuccess = (requestId: string) => {
    // Optionally hide form or show success message
    console.log('Leave request created:', requestId);
  };

  // Loading state
  if (isBusinessLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // No business selected
  if (!businessId) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-8">
          <Alert className="bg-yellow-500/10 border-yellow-500/30">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-foreground">
              Please select a business to view and manage your leave requests.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Leave Balance Widget */}
      <LeaveBalanceWidget businessId={businessId} />

      {/* Two column layout on larger screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leave Request Form */}
        {showForm && (
          <LeaveRequestForm
            businessId={businessId}
            onSuccess={handleFormSuccess}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* My Leave Requests */}
        <MyLeaveRequests
          businessId={businessId}
          showHeader={true}
        />
      </div>
    </div>
  );
}
