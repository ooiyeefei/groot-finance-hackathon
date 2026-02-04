'use client';

/**
 * Leave Request Hooks - Convex real-time subscriptions and mutations
 *
 * Provides hooks for:
 * - Creating and submitting leave requests
 * - Viewing personal leave requests
 * - Approving/rejecting requests (managers)
 * - Cancelling requests
 */

import { useQuery, useMutation, useConvex } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useCallback, useState } from 'react';

// ============================================
// TYPES
// ============================================

export interface CreateLeaveRequestInput {
  businessId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  notes?: string;
}

export interface UpdateLeaveRequestInput {
  startDate?: string;
  endDate?: string;
  totalDays?: number;
  notes?: string;
}

// ============================================
// QUERIES
// ============================================

/**
 * Get current user's leave requests
 */
export function useMyLeaveRequests(businessId: string | undefined) {
  return useQuery(
    api.functions.leaveRequests.getMyRequests,
    businessId ? { businessId } : 'skip'
  );
}

/**
 * Get a single leave request by ID
 */
export function useLeaveRequest(id: string | undefined) {
  return useQuery(
    api.functions.leaveRequests.getById,
    id ? { id: id as Id<'leave_requests'> } : 'skip'
  );
}

/**
 * Get pending leave requests for manager approval
 */
export function usePendingLeaveRequests(businessId: string | undefined) {
  return useQuery(
    api.functions.leaveRequests.getPendingForManager,
    businessId ? { businessId } : 'skip'
  );
}

/**
 * Get all leave requests for a business (admin view)
 */
export function useLeaveRequestsList(
  businessId: string | undefined,
  options?: { status?: string; userId?: string }
) {
  return useQuery(
    api.functions.leaveRequests.list,
    businessId
      ? {
          businessId,
          status: options?.status,
          userId: options?.userId
        }
      : 'skip'
  );
}

// ============================================
// MUTATIONS
// ============================================

/**
 * Hook for creating a new leave request
 */
export function useCreateLeaveRequest() {
  const createMutation = useMutation(api.functions.leaveRequests.create);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLeaveRequest = useCallback(
    async (input: CreateLeaveRequestInput) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await createMutation({
          businessId: input.businessId as Id<'businesses'>,
          leaveTypeId: input.leaveTypeId as Id<'leave_types'>,
          startDate: input.startDate,
          endDate: input.endDate,
          totalDays: input.totalDays,
          notes: input.notes,
        });

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create leave request';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [createMutation]
  );

  return { createLeaveRequest, isLoading, error };
}

/**
 * Hook for updating a leave request (draft only)
 */
export function useUpdateLeaveRequest() {
  const updateMutation = useMutation(api.functions.leaveRequests.update);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateLeaveRequest = useCallback(
    async (id: string, input: UpdateLeaveRequestInput) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await updateMutation({
          id: id as Id<'leave_requests'>,
          ...input,
        });

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to update leave request';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [updateMutation]
  );

  return { updateLeaveRequest, isLoading, error };
}

/**
 * Hook for submitting a leave request for approval
 */
export function useSubmitLeaveRequest() {
  const submitMutation = useMutation(api.functions.leaveRequests.submit);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitLeaveRequest = useCallback(
    async (id: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await submitMutation({
          id: id as Id<'leave_requests'>,
        });

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to submit leave request';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [submitMutation]
  );

  return { submitLeaveRequest, isLoading, error };
}

/**
 * Hook for approving a leave request (manager)
 */
export function useApproveLeaveRequest() {
  const approveMutation = useMutation(api.functions.leaveRequests.approve);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approveLeaveRequest = useCallback(
    async (id: string, notes?: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await approveMutation({
          id: id as Id<'leave_requests'>,
          notes,
        });

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to approve leave request';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [approveMutation]
  );

  return { approveLeaveRequest, isLoading, error };
}

/**
 * Hook for rejecting a leave request (manager)
 */
export function useRejectLeaveRequest() {
  const rejectMutation = useMutation(api.functions.leaveRequests.reject);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rejectLeaveRequest = useCallback(
    async (id: string, reason: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await rejectMutation({
          id: id as Id<'leave_requests'>,
          reason,
        });

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to reject leave request';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [rejectMutation]
  );

  return { rejectLeaveRequest, isLoading, error };
}

/**
 * Hook for cancelling a leave request (employee)
 */
export function useCancelLeaveRequest() {
  const cancelMutation = useMutation(api.functions.leaveRequests.cancel);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelLeaveRequest = useCallback(
    async (id: string, reason?: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await cancelMutation({
          id: id as Id<'leave_requests'>,
          reason,
        });

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to cancel leave request';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cancelMutation]
  );

  return { cancelLeaveRequest, isLoading, error };
}

// ============================================
// COMBINED HOOKS
// ============================================

/**
 * Combined hook for employee leave request operations
 * Provides all operations needed for the leave request form
 */
export function useLeaveRequestOperations() {
  const { createLeaveRequest, isLoading: createLoading, error: createError } = useCreateLeaveRequest();
  const { submitLeaveRequest, isLoading: submitLoading, error: submitError } = useSubmitLeaveRequest();
  const { cancelLeaveRequest, isLoading: cancelLoading, error: cancelError } = useCancelLeaveRequest();

  return {
    createLeaveRequest,
    submitLeaveRequest,
    cancelLeaveRequest,
    isLoading: createLoading || submitLoading || cancelLoading,
    error: createError || submitError || cancelError,
  };
}

/**
 * Combined hook for manager approval operations
 * Provides approve/reject operations for the approval queue
 */
export function useLeaveApprovalOperations() {
  const { approveLeaveRequest, isLoading: approveLoading, error: approveError } = useApproveLeaveRequest();
  const { rejectLeaveRequest, isLoading: rejectLoading, error: rejectError } = useRejectLeaveRequest();

  return {
    approveLeaveRequest,
    rejectLeaveRequest,
    isLoading: approveLoading || rejectLoading,
    error: approveError || rejectError,
  };
}
