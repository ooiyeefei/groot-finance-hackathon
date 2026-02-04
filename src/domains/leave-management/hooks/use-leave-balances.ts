'use client';

/**
 * Leave Balance Hooks - Convex real-time subscriptions and mutations
 *
 * Provides hooks for:
 * - Viewing personal leave balances
 * - Team balance overview (managers)
 * - Balance by leave type
 * - Admin balance management
 */

import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useCallback, useState } from 'react';

// ============================================
// TYPES
// ============================================

export interface LeaveBalanceWithType {
  _id: string;
  businessId: string;
  userId: string;
  leaveTypeId: string;
  year: number;
  entitled: number;
  used: number;
  adjustments: number;
  carryover?: number;
  remaining: number;
  leaveType: {
    _id: string;
    name: string;
    code: string;
    color?: string;
    deductsBalance: boolean;
  } | null;
}

// ============================================
// QUERIES
// ============================================

/**
 * Get current user's leave balances for the current year
 */
export function useMyBalances(businessId: string | undefined, year?: number) {
  return useQuery(
    api.functions.leaveBalances.getMyBalances,
    businessId ? { businessId, year } : 'skip'
  );
}

/**
 * Get balances for a specific user (admin/manager view)
 */
export function useUserBalances(
  businessId: string | undefined,
  userId: string | undefined,
  year: number
) {
  return useQuery(
    api.functions.leaveBalances.getByUser,
    businessId && userId ? { businessId, userId, year } : 'skip'
  );
}

/**
 * Get team balances (manager/admin view)
 */
export function useTeamBalances(businessId: string | undefined, year: number) {
  return useQuery(
    api.functions.leaveBalances.getTeamBalances,
    businessId ? { businessId, year } : 'skip'
  );
}

// ============================================
// DERIVED HOOKS
// ============================================

/**
 * Get balance summary for current user
 * Computes total entitled, used, and remaining across all leave types
 */
export function useBalanceSummary(businessId: string | undefined, year?: number) {
  const balances = useMyBalances(businessId, year);

  if (!balances) {
    return {
      balances: undefined,
      totalEntitled: 0,
      totalUsed: 0,
      totalRemaining: 0,
      isLoading: balances === undefined,
    };
  }

  const totalEntitled = balances.reduce((sum, b) => sum + b.entitled, 0);
  const totalUsed = balances.reduce((sum, b) => sum + b.used, 0);
  const totalRemaining = balances.reduce((sum, b) => sum + b.remaining, 0);

  return {
    balances,
    totalEntitled,
    totalUsed,
    totalRemaining,
    isLoading: false,
  };
}

/**
 * Get balance for a specific leave type
 */
export function useBalanceByType(
  businessId: string | undefined,
  leaveTypeId: string | undefined,
  year?: number
) {
  const balances = useMyBalances(businessId, year);

  if (!balances || !leaveTypeId) {
    return {
      balance: undefined,
      isLoading: balances === undefined,
    };
  }

  const balance = balances.find((b) => b.leaveTypeId === leaveTypeId);

  return {
    balance,
    isLoading: false,
  };
}

// ============================================
// ADMIN QUERIES
// ============================================

/**
 * Get all employees with their balances for admin view
 */
export function useAllEmployeeBalances(businessId: string | undefined, year: number) {
  return useQuery(
    api.functions.leaveBalances.getAllEmployeeBalances,
    businessId ? { businessId, year } : 'skip'
  );
}

// ============================================
// MUTATIONS
// ============================================

/**
 * Hook for initializing all employee balances
 */
export function useInitializeAllBalances() {
  const initMutation = useMutation(api.functions.leaveBalances.initializeAllEmployees);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initializeAll = useCallback(
    async (businessId: string, year: number) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await initMutation({
          businessId: businessId as Id<'businesses'>,
          year,
        });
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize balances';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [initMutation]
  );

  return { initializeAll, isLoading, error };
}

/**
 * Hook for adjusting a balance
 */
export function useAdjustBalance() {
  const adjustMutation = useMutation(api.functions.leaveBalances.adjust);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adjustBalance = useCallback(
    async (balanceId: string, adjustment: number, reason: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await adjustMutation({
          balanceId: balanceId as Id<'leave_balances'>,
          adjustment,
          reason,
        });
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to adjust balance';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [adjustMutation]
  );

  return { adjustBalance, isLoading, error };
}

/**
 * Hook for updating entitled days
 */
export function useUpdateEntitled() {
  const updateMutation = useMutation(api.functions.leaveBalances.updateEntitled);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateEntitled = useCallback(
    async (balanceId: string, entitled: number) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await updateMutation({
          balanceId: balanceId as Id<'leave_balances'>,
          entitled,
        });
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to update entitlement';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [updateMutation]
  );

  return { updateEntitled, isLoading, error };
}

/**
 * Hook for updating per-employee leave entitlements
 */
export function useUpdateLeaveEntitlements() {
  const updateMutation = useMutation(api.functions.memberships.updateLeaveEntitlements);
  const reinitMutation = useMutation(api.functions.leaveBalances.reinitializeUserBalances);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateLeaveEntitlements = useCallback(
    async (membershipId: string, leaveEntitlements: Record<string, number>, reinitializeBalances = true) => {
      setIsLoading(true);
      setError(null);

      try {
        // Update entitlements on membership
        const result = await updateMutation({
          membershipId: membershipId as Id<'business_memberships'>,
          leaveEntitlements,
        });

        // Reinitialize balances to reflect new entitlements
        if (reinitializeBalances) {
          await reinitMutation({
            membershipId: membershipId as Id<'business_memberships'>,
          });
        }

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to update entitlements';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [updateMutation, reinitMutation]
  );

  return { updateLeaveEntitlements, isLoading, error };
}

/**
 * Hook for reinitializing user balances
 */
export function useReinitializeUserBalances() {
  const reinitMutation = useMutation(api.functions.leaveBalances.reinitializeUserBalances);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reinitializeBalances = useCallback(
    async (membershipId: string, year?: number) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await reinitMutation({
          membershipId: membershipId as Id<'business_memberships'>,
          year,
        });
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to reinitialize balances';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [reinitMutation]
  );

  return { reinitializeBalances, isLoading, error };
}

/**
 * Combined hook for balance admin operations
 */
export function useBalanceOperations() {
  const { initializeAll, isLoading: initLoading, error: initError } = useInitializeAllBalances();
  const { adjustBalance, isLoading: adjustLoading, error: adjustError } = useAdjustBalance();
  const { updateEntitled, isLoading: updateLoading, error: updateError } = useUpdateEntitled();
  const { updateLeaveEntitlements, isLoading: entitlementLoading, error: entitlementError } = useUpdateLeaveEntitlements();

  return {
    initializeAll,
    adjustBalance,
    updateEntitled,
    updateLeaveEntitlements,
    isLoading: initLoading || adjustLoading || updateLoading || entitlementLoading,
    error: initError || adjustError || updateError || entitlementError,
  };
}
