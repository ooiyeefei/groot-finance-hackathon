'use client';

/**
 * Export Schedules Hooks
 *
 * Hooks for managing automated export schedules.
 */

import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import type { ExportFrequency, ScheduleFilters } from '../types';

// ============================================
// SCHEDULE LIST HOOKS
// ============================================

/**
 * List export schedules for a business
 */
export function useExportSchedules(
  businessId: string | undefined,
  options?: {
    isEnabled?: boolean;
  }
) {
  const result = useQuery(
    api.functions.exportSchedules.list,
    businessId
      ? {
          businessId,
          isEnabled: options?.isEnabled,
        }
      : 'skip'
  );

  return {
    schedules: result?.schedules || [],
    isLoading: result === undefined,
    error: null,
  };
}

/**
 * Get a single schedule
 */
export function useExportSchedule(scheduleId: Id<'export_schedules'> | undefined) {
  const schedule = useQuery(
    api.functions.exportSchedules.get,
    scheduleId ? { scheduleId } : 'skip'
  );

  return {
    schedule,
    isLoading: schedule === undefined,
    error: null,
  };
}

// ============================================
// SCHEDULE MUTATION HOOKS
// ============================================

/**
 * Create a new schedule
 */
export function useCreateSchedule() {
  const createMutation = useMutation(api.functions.exportSchedules.create);

  const createSchedule = async (input: {
    businessId: string;
    templateId?: Id<'export_templates'>;
    prebuiltTemplateId?: string;
    frequency: ExportFrequency;
    hourUtc: number;
    minuteUtc?: number;
    dayOfWeek?: number;
    dayOfMonth?: number;
    filters?: ScheduleFilters;
  }) => {
    return await createMutation(input);
  };

  return { createSchedule };
}

/**
 * Update an existing schedule
 */
export function useUpdateSchedule() {
  const updateMutation = useMutation(api.functions.exportSchedules.update);

  const updateSchedule = async (input: {
    scheduleId: Id<'export_schedules'>;
    frequency?: ExportFrequency;
    hourUtc?: number;
    minuteUtc?: number;
    dayOfWeek?: number;
    dayOfMonth?: number;
    filters?: ScheduleFilters;
  }) => {
    return await updateMutation(input);
  };

  return { updateSchedule };
}

/**
 * Toggle schedule enabled/disabled
 */
export function useToggleSchedule() {
  const toggleMutation = useMutation(api.functions.exportSchedules.setEnabled);

  const toggleSchedule = async (
    scheduleId: Id<'export_schedules'>,
    isEnabled: boolean
  ) => {
    return await toggleMutation({ scheduleId, isEnabled });
  };

  return { toggleSchedule };
}

/**
 * Delete a schedule
 */
export function useDeleteSchedule() {
  const deleteMutation = useMutation(api.functions.exportSchedules.remove);

  const deleteSchedule = async (scheduleId: Id<'export_schedules'>) => {
    return await deleteMutation({ scheduleId });
  };

  return { deleteSchedule };
}
