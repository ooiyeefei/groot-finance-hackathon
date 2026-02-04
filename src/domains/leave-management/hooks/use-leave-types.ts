'use client';

/**
 * Leave Types Hooks - Convex real-time subscriptions and mutations
 *
 * Provides hooks for:
 * - Listing active leave types (for employee form)
 * - Managing leave types (admin CRUD)
 */

import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useCallback, useState } from 'react';

// ============================================
// TYPES
// ============================================

export interface CreateLeaveTypeInput {
  businessId: string;
  name: string;
  code: string;
  description?: string;
  defaultDays: number;
  requiresApproval?: boolean;
  deductsBalance?: boolean;
  color?: string;
}

export interface UpdateLeaveTypeInput {
  name?: string;
  description?: string;
  defaultDays?: number;
  requiresApproval?: boolean;
  deductsBalance?: boolean;
  color?: string;
  sortOrder?: number;
  carryoverCap?: number;
  carryoverPolicy?: 'none' | 'cap' | 'unlimited';
  prorationEnabled?: boolean;
}

// ============================================
// QUERIES
// ============================================

/**
 * Get active leave types for a business
 * Used in employee leave request form
 */
export function useLeaveTypes(businessId: string | undefined) {
  return useQuery(
    api.functions.leaveTypes.list,
    businessId ? { businessId, activeOnly: true } : 'skip'
  );
}

/**
 * Get all leave types including inactive (admin view)
 */
export function useAllLeaveTypes(businessId: string | undefined) {
  return useQuery(
    api.functions.leaveTypes.list,
    businessId ? { businessId, activeOnly: false } : 'skip'
  );
}

/**
 * Get a single leave type by ID
 */
export function useLeaveType(id: string | undefined) {
  return useQuery(
    api.functions.leaveTypes.getById,
    id ? { id: id as Id<'leave_types'> } : 'skip'
  );
}

// ============================================
// MUTATIONS
// ============================================

/**
 * Hook for creating a new leave type (admin)
 */
export function useCreateLeaveType() {
  const createMutation = useMutation(api.functions.leaveTypes.create);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLeaveType = useCallback(
    async (input: CreateLeaveTypeInput) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await createMutation({
          businessId: input.businessId as Id<'businesses'>,
          name: input.name,
          code: input.code,
          description: input.description,
          defaultDays: input.defaultDays,
          requiresApproval: input.requiresApproval,
          deductsBalance: input.deductsBalance,
          color: input.color,
        });

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create leave type';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [createMutation]
  );

  return { createLeaveType, isLoading, error };
}

/**
 * Hook for updating a leave type (admin)
 */
export function useUpdateLeaveType() {
  const updateMutation = useMutation(api.functions.leaveTypes.update);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateLeaveType = useCallback(
    async (id: string, input: UpdateLeaveTypeInput) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await updateMutation({
          id: id as Id<'leave_types'>,
          ...input,
        });

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to update leave type';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [updateMutation]
  );

  return { updateLeaveType, isLoading, error };
}

/**
 * Hook for toggling leave type active status (admin)
 */
export function useToggleLeaveType() {
  const toggleMutation = useMutation(api.functions.leaveTypes.toggleActive);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleLeaveType = useCallback(
    async (id: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await toggleMutation({
          id: id as Id<'leave_types'>,
        });

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to toggle leave type';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [toggleMutation]
  );

  return { toggleLeaveType, isLoading, error };
}

/**
 * Hook for deleting a leave type (admin, only if unused)
 */
export function useDeleteLeaveType() {
  const deleteMutation = useMutation(api.functions.leaveTypes.remove);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteLeaveType = useCallback(
    async (id: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await deleteMutation({
          id: id as Id<'leave_types'>,
        });

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to delete leave type';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [deleteMutation]
  );

  return { deleteLeaveType, isLoading, error };
}

// ============================================
// COMBINED HOOKS
// ============================================

/**
 * Combined hook for leave type admin operations
 */
export function useLeaveTypeOperations() {
  const { createLeaveType, isLoading: createLoading, error: createError } = useCreateLeaveType();
  const { updateLeaveType, isLoading: updateLoading, error: updateError } = useUpdateLeaveType();
  const { toggleLeaveType, isLoading: toggleLoading, error: toggleError } = useToggleLeaveType();
  const { deleteLeaveType, isLoading: deleteLoading, error: deleteError } = useDeleteLeaveType();

  return {
    createLeaveType,
    updateLeaveType,
    toggleLeaveType,
    deleteLeaveType,
    isLoading: createLoading || updateLoading || toggleLoading || deleteLoading,
    error: createError || updateError || toggleError || deleteError,
  };
}
