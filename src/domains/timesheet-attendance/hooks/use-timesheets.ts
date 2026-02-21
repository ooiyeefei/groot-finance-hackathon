'use client';

/**
 * Timesheet Hooks - Convex real-time subscriptions and mutations
 *
 * Provides hooks for:
 * - Viewing personal timesheets (employee)
 * - Viewing a single timesheet by ID
 * - Viewing pending timesheets for manager approval
 * - Viewing all business timesheets (admin)
 * - Confirming timesheets (employee)
 * - Editing timesheet entries (employee)
 * - Approving/rejecting timesheets (manager)
 */

import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { useState, useCallback } from 'react';

// ============================================
// QUERIES
// ============================================

/**
 * Get current user's timesheets for a business.
 * Optionally filtered by year. Sorted by periodStartDate descending.
 */
export function useMyTimesheets(
  businessId: string | undefined,
  year?: number,
  limit?: number
) {
  return useQuery(
    api.functions.timesheets.getMyTimesheets,
    businessId ? { businessId, year, limit } : 'skip'
  );
}

/**
 * Get a single timesheet by ID, enriched with user and approver info.
 * Skips the query when id is undefined.
 */
export function useTimesheetById(id: string | undefined) {
  return useQuery(
    api.functions.timesheets.getById,
    id ? { id } : 'skip'
  );
}

/**
 * Get timesheets pending manager review.
 * Returns confirmed timesheets with anomalies assigned to the current user.
 */
export function usePendingTimesheets(businessId: string | undefined) {
  return useQuery(
    api.functions.timesheets.getPendingForManager,
    businessId ? { businessId } : 'skip'
  );
}

/**
 * Get all timesheets for a business (admin view).
 * Optionally filtered by periodStartDate and status.
 */
export function useBusinessTimesheets(
  businessId: string | undefined,
  periodStartDate?: string,
  status?: string
) {
  return useQuery(
    api.functions.timesheets.getBusinessTimesheets,
    businessId ? { businessId, periodStartDate, status } : 'skip'
  );
}

// ============================================
// MUTATIONS
// ============================================

/**
 * Hook for confirming a timesheet (draft -> confirmed or auto-approved).
 * If no anomalies, the timesheet is auto-approved.
 * If anomalies exist, it routes to the assigned approver for review.
 */
export function useConfirmTimesheet() {
  const confirmMutation = useMutation(api.functions.timesheets.confirm);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmTimesheet = useCallback(
    async (id: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await confirmMutation({
          id: id as Id<'timesheets'>,
        });

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to confirm timesheet';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [confirmMutation]
  );

  return { confirmTimesheet, isLoading, error };
}

/**
 * Hook for editing a daily entry within a timesheet.
 * Only allowed in draft or confirmed status. If confirmed, resets to draft.
 */
export function useEditTimesheetEntry() {
  const editEntryMutation = useMutation(api.functions.timesheets.editEntry);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editTimesheetEntry = useCallback(
    async (input: {
      id: string;
      date: string;
      checkInTime?: number;
      checkOutTime?: number;
      reason: string;
    }) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await editEntryMutation({
          id: input.id as Id<'timesheets'>,
          date: input.date,
          checkInTime: input.checkInTime,
          checkOutTime: input.checkOutTime,
          reason: input.reason,
        });

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to edit timesheet entry';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [editEntryMutation]
  );

  return { editTimesheetEntry, isLoading, error };
}

/**
 * Hook for approving a timesheet (confirmed -> approved).
 * Access: Assigned approver, owner, or finance_admin.
 */
export function useApproveTimesheet() {
  const approveMutation = useMutation(api.functions.timesheets.approve);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approveTimesheet = useCallback(
    async (id: string, notes?: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await approveMutation({
          id: id as Id<'timesheets'>,
          notes,
        });

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to approve timesheet';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [approveMutation]
  );

  return { approveTimesheet, isLoading, error };
}

/**
 * Hook for rejecting a timesheet (confirmed -> draft).
 * Sends it back to the employee for corrections.
 * Access: Assigned approver, owner, or finance_admin.
 */
export function useRejectTimesheet() {
  const rejectMutation = useMutation(api.functions.timesheets.reject);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rejectTimesheet = useCallback(
    async (id: string, reason: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await rejectMutation({
          id: id as Id<'timesheets'>,
          reason,
        });

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to reject timesheet';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [rejectMutation]
  );

  return { rejectTimesheet, isLoading, error };
}
