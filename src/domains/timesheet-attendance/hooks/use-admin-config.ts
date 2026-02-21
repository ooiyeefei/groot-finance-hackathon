'use client';

/**
 * Admin Configuration Hooks - Work Schedules, Overtime Rules, Pay Period, Payroll Adjustments
 *
 * Provides Convex real-time subscriptions and mutations for:
 * - Work schedule CRUD operations
 * - Overtime rule management
 * - Pay period configuration
 * - Payroll adjustment creation and listing
 */

import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { useState, useCallback } from 'react';

// ============================================
// TYPES
// ============================================

export interface CreateWorkScheduleInput {
  businessId: string;
  name: string;
  startTime: string;
  endTime: string;
  workDays: number[];
  breakMinutes: number;
  graceMinutes: number;
  overtimeRuleId?: string;
  isDefault: boolean;
}

export interface UpdateWorkScheduleInput {
  name?: string;
  startTime?: string;
  endTime?: string;
  workDays?: number[];
  breakMinutes?: number;
  graceMinutes?: number;
  overtimeRuleId?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface CreateOvertimeRuleInput {
  businessId: string;
  name: string;
  calculationBasis: 'daily' | 'weekly' | 'both';
  dailyThresholdHours?: number;
  weeklyThresholdHours?: number;
  requiresPreApproval: boolean;
  rateTiers: {
    label: string;
    multiplier: number;
    applicableOn: string;
  }[];
}

export interface UpdateOvertimeRuleInput {
  name?: string;
  calculationBasis?: 'daily' | 'weekly' | 'both';
  dailyThresholdHours?: number;
  weeklyThresholdHours?: number;
  requiresPreApproval?: boolean;
  rateTiers?: {
    label: string;
    multiplier: number;
    applicableOn: string;
  }[];
  isActive?: boolean;
}

export interface CreateOrUpdatePayPeriodInput {
  businessId: string;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  startDay: number;
  confirmationDeadlineDays: number;
}

export interface CreatePayrollAdjustmentInput {
  businessId: string;
  userId: string;
  originalTimesheetId: string;
  adjustmentType: 'hours_add' | 'hours_deduct' | 'ot_add' | 'ot_deduct';
  minutes: number;
  overtimeTier?: string;
  reason: string;
}

// ============================================
// WORK SCHEDULE QUERIES
// ============================================

/**
 * Get all work schedules for a business
 * Returns enriched schedules with linked overtime rule info
 */
export function useWorkSchedules(businessId: string | undefined) {
  return useQuery(
    api.functions.workSchedules.list,
    businessId ? { businessId } : 'skip'
  );
}

// ============================================
// WORK SCHEDULE MUTATIONS
// ============================================

/**
 * Hook for creating a new work schedule
 */
export function useCreateWorkSchedule() {
  const createMutation = useMutation(api.functions.workSchedules.create);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createWorkSchedule = useCallback(
    async (input: CreateWorkScheduleInput) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await createMutation({
          businessId: input.businessId as Id<'businesses'>,
          name: input.name,
          startTime: input.startTime,
          endTime: input.endTime,
          workDays: input.workDays,
          breakMinutes: input.breakMinutes,
          graceMinutes: input.graceMinutes,
          overtimeRuleId: input.overtimeRuleId
            ? (input.overtimeRuleId as Id<'overtime_rules'>)
            : undefined,
          isDefault: input.isDefault,
        });

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to create work schedule';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [createMutation]
  );

  return { createWorkSchedule, isLoading, error };
}

/**
 * Hook for updating an existing work schedule
 */
export function useUpdateWorkSchedule() {
  const updateMutation = useMutation(api.functions.workSchedules.update);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateWorkSchedule = useCallback(
    async (id: string, input: UpdateWorkScheduleInput) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await updateMutation({
          id: id as Id<'work_schedules'>,
          ...input,
          overtimeRuleId: input.overtimeRuleId
            ? (input.overtimeRuleId as Id<'overtime_rules'>)
            : undefined,
        });

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to update work schedule';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [updateMutation]
  );

  return { updateWorkSchedule, isLoading, error };
}

/**
 * Hook for deleting (soft-deleting) a work schedule
 */
export function useDeleteWorkSchedule() {
  const deleteMutation = useMutation(api.functions.workSchedules.remove);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteWorkSchedule = useCallback(
    async (id: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await deleteMutation({
          id: id as Id<'work_schedules'>,
        });

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to delete work schedule';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [deleteMutation]
  );

  return { deleteWorkSchedule, isLoading, error };
}

// ============================================
// OVERTIME RULE QUERIES
// ============================================

/**
 * Get all overtime rules for a business
 */
export function useOvertimeRules(businessId: string | undefined) {
  return useQuery(
    api.functions.overtimeRules.list,
    businessId ? { businessId } : 'skip'
  );
}

// ============================================
// OVERTIME RULE MUTATIONS
// ============================================

/**
 * Hook for creating a new overtime rule
 */
export function useCreateOvertimeRule() {
  const createMutation = useMutation(api.functions.overtimeRules.create);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createOvertimeRule = useCallback(
    async (input: CreateOvertimeRuleInput) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await createMutation({
          businessId: input.businessId as Id<'businesses'>,
          name: input.name,
          calculationBasis: input.calculationBasis,
          dailyThresholdHours: input.dailyThresholdHours,
          weeklyThresholdHours: input.weeklyThresholdHours,
          requiresPreApproval: input.requiresPreApproval,
          rateTiers: input.rateTiers,
        });

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to create overtime rule';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [createMutation]
  );

  return { createOvertimeRule, isLoading, error };
}

/**
 * Hook for updating an existing overtime rule
 */
export function useUpdateOvertimeRule() {
  const updateMutation = useMutation(api.functions.overtimeRules.update);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateOvertimeRule = useCallback(
    async (id: string, input: UpdateOvertimeRuleInput) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await updateMutation({
          id: id as Id<'overtime_rules'>,
          ...input,
        });

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to update overtime rule';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [updateMutation]
  );

  return { updateOvertimeRule, isLoading, error };
}

// ============================================
// PAY PERIOD CONFIG QUERIES
// ============================================

/**
 * Get the active pay period configuration for a business
 */
export function usePayPeriodConfig(businessId: string | undefined) {
  return useQuery(
    api.functions.payPeriodConfigs.getActive,
    businessId ? { businessId } : 'skip'
  );
}

// ============================================
// PAY PERIOD CONFIG MUTATIONS
// ============================================

/**
 * Hook for creating or updating pay period configuration
 * Deactivates the existing active config and creates a new one
 */
export function useCreateOrUpdatePayPeriod() {
  const createOrUpdateMutation = useMutation(api.functions.payPeriodConfigs.createOrUpdate);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createOrUpdatePayPeriod = useCallback(
    async (input: CreateOrUpdatePayPeriodInput) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await createOrUpdateMutation({
          businessId: input.businessId as Id<'businesses'>,
          frequency: input.frequency,
          startDay: input.startDay,
          confirmationDeadlineDays: input.confirmationDeadlineDays,
        });

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to update pay period configuration';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [createOrUpdateMutation]
  );

  return { createOrUpdatePayPeriod, isLoading, error };
}

// ============================================
// PAYROLL ADJUSTMENT QUERIES
// ============================================

/**
 * Get payroll adjustments for a business, filtered by period start date
 * Returns adjustments enriched with user info
 */
export function usePayrollAdjustments(
  businessId: string | undefined,
  periodStartDate: string
) {
  return useQuery(
    api.functions.payrollAdjustments.listForPeriod,
    businessId ? { businessId, periodStartDate } : 'skip'
  );
}

// ============================================
// PAYROLL ADJUSTMENT MUTATIONS
// ============================================

/**
 * Hook for creating a payroll adjustment on a locked timesheet
 */
export function useCreatePayrollAdjustment() {
  const createMutation = useMutation(api.functions.payrollAdjustments.create);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createPayrollAdjustment = useCallback(
    async (input: CreatePayrollAdjustmentInput) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await createMutation({
          businessId: input.businessId as Id<'businesses'>,
          userId: input.userId as Id<'users'>,
          originalTimesheetId: input.originalTimesheetId as Id<'timesheets'>,
          adjustmentType: input.adjustmentType,
          minutes: input.minutes,
          overtimeTier: input.overtimeTier,
          reason: input.reason,
        });

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to create payroll adjustment';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [createMutation]
  );

  return { createPayrollAdjustment, isLoading, error };
}

// ============================================
// ATTENDANCE TRACKING ADMIN
// ============================================

/**
 * Get all active members with their attendance tracking status
 */
export function useMembersAttendanceStatus(businessId: string | undefined) {
  return useQuery(
    api.functions.attendanceRecords.listMembersAttendanceStatus,
    businessId ? { businessId: businessId as Id<'businesses'> } : 'skip'
  );
}

/**
 * Hook for toggling attendance tracking on a membership
 */
export function useToggleAttendanceTracking() {
  const toggleMutation = useMutation(api.functions.attendanceRecords.toggleAttendanceTracking);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleAttendanceTracking = useCallback(
    async (membershipId: string, isAttendanceTracked: boolean) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await toggleMutation({
          membershipId: membershipId as Id<'business_memberships'>,
          isAttendanceTracked,
        });
        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to update attendance tracking';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [toggleMutation]
  );

  return { toggleAttendanceTracking, isLoading, error };
}
