'use client';

import React from 'react';
import { AlertTriangle, Users, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatBusinessDate } from '@/lib/utils';

interface OverlappingMember {
  userId: string;
  userName: string;
  leaveTypeName: string;
  leaveStatus: string;
  overlapDates: string[];
}

interface OverlapWarningDialogProps {
  open: boolean;
  overlappingMembers: OverlappingMember[];
  totalOverlapDays: number;
  onApproveAnyway: () => void;
  onCancel: () => void;
  isApproving?: boolean;
}

export default function OverlapWarningDialog({
  open,
  overlappingMembers,
  totalOverlapDays,
  onApproveAnyway,
  onCancel,
  isApproving,
}: OverlapWarningDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 transition-opacity"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
        onClick={onCancel}
      />
      <div className="relative transform overflow-hidden rounded-xl bg-card shadow-2xl w-full max-w-lg border border-border max-h-[80vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Team Overlap Warning
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-medium text-yellow-600 dark:text-yellow-400">
                  {overlappingMembers.length} team member{overlappingMembers.length > 1 ? 's' : ''}
                </span>{' '}
                {overlappingMembers.length > 1 ? 'are' : 'is'} on leave during these dates
                ({totalOverlapDays} overlapping day{totalOverlapDays > 1 ? 's' : ''})
              </p>
            </div>
          </div>

          {/* Overlapping members list */}
          <div className="space-y-3">
            {overlappingMembers.map((member) => (
              <div
                key={member.userId + member.overlapDates[0]}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border"
              >
                <Users className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-sm truncate">
                      {member.userName}
                    </span>
                    <Badge
                      className={
                        member.leaveStatus === 'approved'
                          ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                          : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                      }
                    >
                      {member.leaveStatus}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {member.leaveTypeName}
                  </p>
                  <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    <span>
                      {member.overlapDates.length === 1
                        ? formatBusinessDate(member.overlapDates[0])
                        : `${formatBusinessDate(member.overlapDates[0])} - ${formatBusinessDate(member.overlapDates[member.overlapDates.length - 1])}`}
                    </span>
                    <span className="text-muted-foreground/60">
                      ({member.overlapDates.length} day{member.overlapDates.length > 1 ? 's' : ''})
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={onCancel}
              className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={onApproveAnyway}
              disabled={isApproving}
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isApproving ? 'Approving...' : 'Approve Anyway'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
