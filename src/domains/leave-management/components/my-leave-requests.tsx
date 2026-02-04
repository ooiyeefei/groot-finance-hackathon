'use client';

/**
 * My Leave Requests Component
 *
 * Displays the employee's own leave requests with:
 * - Status badges
 * - Date information
 * - Quick actions (cancel, view)
 */

import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  FileText,
  XCircle,
  CheckCircle,
  Loader2,
  Send,
  Ban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatBusinessDate } from '@/lib/utils';
import { useMyLeaveRequests, useCancelLeaveRequest, useSubmitLeaveRequest } from '../hooks/use-leave-requests';
import { useLeaveTypes } from '../hooks/use-leave-types';
import { canCancelRequest } from '../lib/leave-workflow';
import type { LeaveRequestStatus } from '../types';

interface MyLeaveRequestsProps {
  businessId: string;
  onRequestClick?: (requestId: string) => void;
  showHeader?: boolean;
  limit?: number;
}

// Status badge styling
const statusStyles: Record<LeaveRequestStatus, { bg: string; text: string; icon: React.ElementType }> = {
  draft: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    icon: FileText,
  },
  submitted: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-600 dark:text-yellow-400',
    icon: Clock,
  },
  approved: {
    bg: 'bg-green-500/10',
    text: 'text-green-600 dark:text-green-400',
    icon: CheckCircle,
  },
  rejected: {
    bg: 'bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    icon: XCircle,
  },
  cancelled: {
    bg: 'bg-gray-500/10',
    text: 'text-gray-600 dark:text-gray-400',
    icon: Ban,
  },
};

function StatusBadge({ status }: { status: LeaveRequestStatus }) {
  const style = statusStyles[status] || statusStyles.draft;
  const Icon = style.icon;

  return (
    <Badge className={`${style.bg} ${style.text} border border-current/20 capitalize`}>
      <Icon className="w-3 h-3 mr-1" />
      {status}
    </Badge>
  );
}

export default function MyLeaveRequests({
  businessId,
  onRequestClick,
  showHeader = true,
  limit,
}: MyLeaveRequestsProps) {
  const requests = useMyLeaveRequests(businessId);
  const leaveTypes = useLeaveTypes(businessId);
  const { cancelLeaveRequest, isLoading: isCancelling } = useCancelLeaveRequest();
  const { submitLeaveRequest, isLoading: isSubmitting } = useSubmitLeaveRequest();

  const [actioningId, setActioningId] = useState<string | null>(null);

  // Create leave type lookup map
  type LeaveTypeInfo = { _id: string; name: string; color?: string };
  const leaveTypeMap = React.useMemo((): Map<string, LeaveTypeInfo> => {
    if (!leaveTypes) return new Map<string, LeaveTypeInfo>();
    return new Map<string, LeaveTypeInfo>(
      leaveTypes.map((lt: LeaveTypeInfo) => [lt._id, lt] as [string, LeaveTypeInfo])
    );
  }, [leaveTypes]);

  // Handle cancel action
  const handleCancel = async (requestId: string) => {
    setActioningId(requestId);
    try {
      await cancelLeaveRequest(requestId);
    } finally {
      setActioningId(null);
    }
  };

  // Handle submit action (for drafts)
  const handleSubmit = async (requestId: string) => {
    setActioningId(requestId);
    try {
      await submitLeaveRequest(requestId);
    } finally {
      setActioningId(null);
    }
  };

  // Loading state
  if (requests === undefined) {
    return (
      <Card className="bg-card border-border">
        {showHeader && (
          <CardHeader>
            <CardTitle className="text-foreground">My Leave Requests</CardTitle>
          </CardHeader>
        )}
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // Apply limit if specified
  const displayRequests = limit ? requests.slice(0, limit) : requests;

  return (
    <Card className="bg-card border-border">
      {showHeader && (
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5" />
            My Leave Requests
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {requests.length} {requests.length === 1 ? 'request' : 'requests'}
          </CardDescription>
        </CardHeader>
      )}
      <CardContent>
        {displayRequests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No leave requests yet</p>
            <p className="text-sm mt-1">Apply for leave using the form above</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayRequests.map((request: {
              _id: string;
              leaveTypeId: string;
              status: LeaveRequestStatus;
              startDate: string;
              endDate: string;
              totalDays: number;
              approverNotes?: string;
            }) => {
              const leaveType = leaveTypeMap.get(request.leaveTypeId);
              const canCancel = canCancelRequest(request.status, request.startDate);
              const isActioning = actioningId === request._id;

              return (
                <div
                  key={request._id}
                  className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg border border-border hover:bg-muted/80 transition-colors cursor-pointer"
                  onClick={() => onRequestClick?.(request._id)}
                >
                  {/* Leave Type Color Indicator */}
                  <div
                    className="w-1 h-12 rounded-full flex-shrink-0"
                    style={{ backgroundColor: leaveType?.color || '#3B82F6' }}
                  />

                  {/* Main Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">
                        {leaveType?.name || 'Unknown Type'}
                      </span>
                      <StatusBadge status={request.status} />
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatBusinessDate(request.startDate)} - {formatBusinessDate(request.endDate)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {request.totalDays} {request.totalDays === 1 ? 'day' : 'days'}
                      </span>
                    </div>
                    {request.approverNotes && (
                      <p className="text-sm text-muted-foreground mt-1 italic truncate">
                        "{request.approverNotes}"
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                    {request.status === 'draft' && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSubmit(request._id)}
                              disabled={isActioning}
                              className="text-primary hover:text-primary hover:bg-primary/10"
                            >
                              {isActioning ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Send className="w-4 h-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Submit for Approval</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {canCancel && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancel(request._id)}
                              disabled={isActioning}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              {isActioning && actioningId === request._id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <XCircle className="w-4 h-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Cancel Request</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Show more indicator */}
            {limit && requests.length > limit && (
              <div className="text-center pt-2">
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  View all {requests.length} requests
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
