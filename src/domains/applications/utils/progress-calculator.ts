/**
 * Progress Calculator Utility
 * Pure functions for calculating application progress metrics
 * Extracted from route.ts:183-198 for centralized logic
 */

import type { ProgressStats, SlotStatus } from '../types/application.types'

/**
 * Calculates progress statistics from slot status array
 * Logic extracted from /src/app/api/applications/[id]/route.ts:183-198
 *
 * @param slotDetails - Array of slot status objects
 * @returns Progress statistics including completion metrics
 */
export function calculateProgressStats(
  slotDetails: SlotStatus[]
): ProgressStats {
  // Count completed slots
  const completedSlots = slotDetails.filter(
    (slot: SlotStatus) => slot.status === 'completed'
  ).length

  // Identify critical slots
  const criticalSlots = slotDetails.filter((slot: SlotStatus) => slot.is_critical)

  // Count completed critical slots
  const completedCriticalSlots = criticalSlots.filter(
    (slot: SlotStatus) => slot.status === 'completed'
  ).length

  // Determine if application can be submitted (all critical slots completed)
  const canSubmit = completedCriticalSlots === criticalSlots.length

  // Calculate progress percentage
  const progressPercentage =
    slotDetails.length > 0
      ? Math.round((completedSlots / slotDetails.length) * 100)
      : 0

  return {
    total_slots: slotDetails.length,
    completed_slots: completedSlots,
    critical_slots: criticalSlots.length,
    completed_critical_slots: completedCriticalSlots,
    can_submit: canSubmit,
    progress_percentage: progressPercentage
  }
}
