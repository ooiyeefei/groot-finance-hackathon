'use client'

// NOTE: Uncomment the Convex imports below when backend queries are ready:
// import { useQuery, useMutation } from 'convex/react'
// import { api } from '../../../../convex/_generated/api'
// import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

/**
 * Recurring Invoice Schedule shape for the UI layer.
 * Mirrors RecurringInvoiceSchedule from types but allows for
 * decorated fields fetched alongside the schedule.
 */
export interface RecurringScheduleListItem {
  _id: string
  customerName: string
  customerEmail: string
  frequency: string
  nextGenerationDate: string
  isActive: boolean
  generationCount: number
  lastGeneratedAt?: number
}

/**
 * Hook for listing recurring invoice schedules.
 *
 * The backend query (recurringInvoiceSchedules.list) does not exist yet,
 * so this returns a stable placeholder until the Convex function is wired up.
 */
export function useRecurringSchedules() {
  // Ensure business context is available (will throw if not in provider)
  const { businessId } = useActiveBusiness()

  // Placeholder: return empty list with loading false.
  // When the backend query is ready, replace with:
  //
  // const result = useQuery(
  //   api.functions.recurringInvoiceSchedules.list,
  //   businessId
  //     ? { businessId: businessId as Id<"businesses"> }
  //     : "skip"
  // )
  //
  // return {
  //   schedules: result?.schedules ?? [],
  //   isLoading: result === undefined,
  // }

  // Prevent unused variable lint error while keeping context check
  void businessId

  return {
    schedules: [] as RecurringScheduleListItem[],
    isLoading: false,
  }
}

/**
 * Hook for a single recurring schedule.
 *
 * Placeholder until the backend query is implemented.
 */
export function useRecurringSchedule(scheduleId: string | undefined) {
  const { businessId } = useActiveBusiness()

  // Prevent unused variable lint errors while keeping context check
  void businessId
  void scheduleId

  // Placeholder: backend query not yet available.
  return {
    schedule: null,
    isLoading: false,
  }
}

/**
 * Hook for recurring schedule mutations.
 *
 * Returns placeholder functions that log to console.
 * Replace with real Convex mutations when available.
 */
export function useRecurringScheduleMutations() {
  // Placeholder mutations
  const createSchedule = async (data: Record<string, unknown>) => {
    console.log('[RecurringSchedules] Create schedule (placeholder):', data)
  }

  const updateSchedule = async (id: string, data: Record<string, unknown>) => {
    console.log('[RecurringSchedules] Update schedule (placeholder):', id, data)
  }

  const pauseSchedule = async (id: string) => {
    console.log('[RecurringSchedules] Pause schedule (placeholder):', id)
  }

  const resumeSchedule = async (id: string) => {
    console.log('[RecurringSchedules] Resume schedule (placeholder):', id)
  }

  const deleteSchedule = async (id: string) => {
    console.log('[RecurringSchedules] Delete schedule (placeholder):', id)
  }

  return {
    createSchedule,
    updateSchedule,
    pauseSchedule,
    resumeSchedule,
    deleteSchedule,
  }
}
