'use client';

/**
 * Leave Approvals Content Component
 *
 * Displays pending leave requests for manager approval
 * Used in the Manager Approval Dashboard as a tab
 */

import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  User,
  CalendarDays,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { formatBusinessDate } from '@/lib/utils';
import { usePendingLeaveRequests, useApproveLeaveRequest, useRejectLeaveRequest } from '../hooks/use-leave-requests';
import { useLeaveTypes } from '../hooks/use-leave-types';
import { useBusinessContext } from '@/contexts/business-context';
import { useUser } from '@clerk/nextjs';

// Helper to send leave notification email
async function sendLeaveNotification(data: {
  notificationType: 'approved' | 'rejected';
  recipientEmail: string;
  recipientName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  approverName?: string;
  reason?: string;
  businessName: string;
}) {
  try {
    const response = await fetch('/api/v1/leave-management/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!result.success) {
      console.warn('[Leave Notifications] Failed to send email:', result.error);
    } else {
      console.log('[Leave Notifications] Email sent successfully');
    }
  } catch (error) {
    console.warn('[Leave Notifications] Error sending notification:', error);
  }
}

interface LeaveApprovalsContentProps {
  onRefreshNeeded?: () => void;
}

export default function LeaveApprovalsContent({ onRefreshNeeded }: LeaveApprovalsContentProps) {
  const { activeContext, profile } = useBusinessContext();
  const { user } = useUser();
  const businessId = activeContext?.businessId;
  const businessName = profile?.name || 'Your Organization';
  const approverName = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Manager';

  const pendingRequests = usePendingLeaveRequests(businessId);
  const leaveTypes = useLeaveTypes(businessId);
  const { approveLeaveRequest, isLoading: isApproving } = useApproveLeaveRequest();
  const { rejectLeaveRequest, isLoading: isRejecting } = useRejectLeaveRequest();

  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  // Create leave type lookup map
  type LeaveTypeInfo = { _id: string; name: string; color?: string };
  const leaveTypeMap = React.useMemo((): Map<string, LeaveTypeInfo> => {
    if (!leaveTypes) return new Map<string, LeaveTypeInfo>();
    return new Map<string, LeaveTypeInfo>(
      leaveTypes.map((lt: LeaveTypeInfo) => [lt._id, lt] as [string, LeaveTypeInfo])
    );
  }, [leaveTypes]);

  const handleApprove = async () => {
    if (!selectedRequest || !pendingRequests) return;

    // Find the request to get details for notification
    const request = pendingRequests.find((r: { _id: string }) => r._id === selectedRequest);

    try {
      await approveLeaveRequest(selectedRequest, notes || undefined);

      // Send email notification (non-blocking)
      if (request?.user?.email) {
        const leaveType = leaveTypeMap.get(request.leaveTypeId);
        sendLeaveNotification({
          notificationType: 'approved',
          recipientEmail: request.user.email,
          recipientName: request.user.fullName || 'Employee',
          leaveType: leaveType?.name || 'Leave',
          startDate: formatBusinessDate(request.startDate),
          endDate: formatBusinessDate(request.endDate),
          totalDays: request.totalDays,
          approverName,
          reason: notes || undefined,
          businessName,
        });
      }

      setSelectedRequest(null);
      setActionType(null);
      setNotes('');
      onRefreshNeeded?.();
    } catch (error) {
      console.error('Failed to approve leave request:', error);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !rejectReason.trim() || !pendingRequests) return;

    // Find the request to get details for notification
    const request = pendingRequests.find((r: { _id: string }) => r._id === selectedRequest);

    try {
      await rejectLeaveRequest(selectedRequest, rejectReason);

      // Send email notification (non-blocking)
      if (request?.user?.email) {
        const leaveType = leaveTypeMap.get(request.leaveTypeId);
        sendLeaveNotification({
          notificationType: 'rejected',
          recipientEmail: request.user.email,
          recipientName: request.user.fullName || 'Employee',
          leaveType: leaveType?.name || 'Leave',
          startDate: formatBusinessDate(request.startDate),
          endDate: formatBusinessDate(request.endDate),
          totalDays: request.totalDays,
          approverName,
          reason: rejectReason,
          businessName,
        });
      }

      setSelectedRequest(null);
      setActionType(null);
      setRejectReason('');
      onRefreshNeeded?.();
    } catch (error) {
      console.error('Failed to reject leave request:', error);
    }
  };

  const openActionDialog = (requestId: string, action: 'approve' | 'reject') => {
    setSelectedRequest(requestId);
    setActionType(action);
    setNotes('');
    setRejectReason('');
  };

  // Loading state
  if (pendingRequests === undefined) {
    return (
      <div className="space-y-4">
        <Card className="bg-card border-border">
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-4 bg-muted/50 rounded-lg space-y-3">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Empty state
  if (!pendingRequests || pendingRequests.length === 0) {
    return (
      <Card className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-700/50">
        <CardContent className="p-12 text-center">
          <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
          <h3 className="text-xl font-semibold text-green-900 dark:text-white mb-2">All Caught Up!</h3>
          <p className="text-green-700 dark:text-gray-300">No pending leave requests to review.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/10 rounded-lg">
                <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-foreground">{pendingRequests.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Requests List */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <CalendarDays className="w-5 h-5" />
            Pending Leave Requests
          </CardTitle>
          <CardDescription>Review and approve or reject leave requests from your team</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {pendingRequests.map((request: {
              _id: string;
              leaveTypeId: string;
              startDate: string;
              endDate: string;
              totalDays: number;
              notes?: string;
              user?: { fullName?: string; email?: string } | null;
            }) => {
              const leaveType = leaveTypeMap.get(request.leaveTypeId);

              return (
                <div
                  key={request._id}
                  className="p-4 bg-muted/50 rounded-lg border border-border space-y-3"
                >
                  {/* Header with Leave Type */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: leaveType?.color || '#3B82F6' }}
                      />
                      <span className="font-medium text-foreground">
                        {leaveType?.name || 'Leave Request'}
                      </span>
                    </div>
                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20">
                      <Clock className="w-3 h-3 mr-1" />
                      Pending
                    </Badge>
                  </div>

                  {/* Employee Info */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="w-4 h-4" />
                    <span>{request.user?.fullName || request.user?.email || 'Unknown Employee'}</span>
                  </div>

                  {/* Date Range */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Start Date</p>
                      <p className="font-medium text-foreground">
                        {formatBusinessDate(request.startDate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">End Date</p>
                      <p className="font-medium text-foreground">
                        {formatBusinessDate(request.endDate)}
                      </p>
                    </div>
                  </div>

                  {/* Duration */}
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-foreground font-medium">
                      {request.totalDays} {request.totalDays === 1 ? 'day' : 'days'}
                    </span>
                  </div>

                  {/* Notes */}
                  {request.notes && (
                    <div className="text-sm">
                      <p className="text-muted-foreground">Notes</p>
                      <p className="text-foreground mt-1 line-clamp-2">{request.notes}</p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={() => openActionDialog(request._id, 'approve')}
                      className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => openActionDialog(request._id, 'reject')}
                      className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Approve Modal */}
      {actionType === 'approve' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 transition-opacity"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)'
            }}
            onClick={() => setActionType(null)}
          />
          <div className="relative transform overflow-hidden rounded-xl bg-card shadow-2xl w-full max-w-md border border-border">
            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Approve Leave Request</h3>
                <p className="text-sm text-muted-foreground mt-1">Add optional notes for this approval</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="approve-notes">Notes (Optional)</Label>
                <Textarea
                  id="approve-notes"
                  placeholder="Add any notes for the employee..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="bg-input border-border"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button onClick={() => setActionType(null)} className="bg-secondary hover:bg-secondary/80 text-secondary-foreground">
                  Cancel
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={isApproving}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {isApproving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Approving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {actionType === 'reject' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 transition-opacity"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)'
            }}
            onClick={() => setActionType(null)}
          />
          <div className="relative transform overflow-hidden rounded-xl bg-card shadow-2xl w-full max-w-md border border-border">
            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Reject Leave Request</h3>
                <p className="text-sm text-muted-foreground mt-1">Please provide a reason for rejecting this request</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reject-reason">Reason *</Label>
                <Textarea
                  id="reject-reason"
                  placeholder="Enter the reason for rejection..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="bg-input border-border"
                />
                {!rejectReason.trim() && (
                  <p className="text-sm text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Reason is required
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button onClick={() => setActionType(null)} className="bg-secondary hover:bg-secondary/80 text-secondary-foreground">
                  Cancel
                </Button>
                <Button
                  onClick={handleReject}
                  disabled={isRejecting || !rejectReason.trim()}
                  variant="destructive"
                >
                  {isRejecting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Rejecting...
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
