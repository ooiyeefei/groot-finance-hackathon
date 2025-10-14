/**
 * Slot Status Calculator Utility
 * Pure functions for calculating document slot status
 */

import type {
  SlotStatus,
  RequiredDocument,
  ApplicationDocument
} from '../types/application.types'

/**
 * Calculates slot status for all required documents in an application
 * Extracted from route.ts:272-316 for centralized logic
 *
 * @param requiredDocuments - Array of required document configurations from application_types
 * @param applicationDocuments - Array of uploaded documents for this application
 * @returns Array of slot status objects with completion status
 */
export function calculateSlotStatus(
  requiredDocuments: RequiredDocument[],
  applicationDocuments: ApplicationDocument[]
): SlotStatus[] {
  return requiredDocuments.map((reqDoc: RequiredDocument) => {
    // Handle grouped documents (like payslip_group with multiple payslip slots)
    if (reqDoc.group_slots && Array.isArray(reqDoc.group_slots)) {
      // Find all documents that belong to this group
      const groupDocuments = reqDoc.group_slots
        .map((slot: string) =>
          applicationDocuments.find((doc: ApplicationDocument) => doc.document_slot === slot)
        )
        .filter(Boolean) as ApplicationDocument[]

      // Check if all documents in group are completed
      const allCompleted =
        groupDocuments.length === reqDoc.group_slots.length &&
        groupDocuments.every((doc: ApplicationDocument) => doc.processing_status === 'completed')

      return {
        slot: reqDoc.slot,
        display_name: reqDoc.display_name,
        is_critical: reqDoc.is_critical,
        status: allCompleted ? 'completed' : 'empty',
        document_id: null,
        uploaded_at: null,
        group_slots: reqDoc.group_slots,
        group_documents: groupDocuments
      }
    }

    // Handle individual documents
    const document = applicationDocuments.find(
      (doc: ApplicationDocument) => doc.document_slot === reqDoc.slot
    )

    const isCompleted = document && document.processing_status === 'completed'
    const status = document ? document.processing_status : 'empty'

    return {
      slot: reqDoc.slot,
      display_name: reqDoc.display_name,
      is_critical: reqDoc.is_critical,
      status: status as any,
      document_id: document?.id || null,
      uploaded_at: document?.created_at || null,
      document: document || null
    }
  })
}

/**
 * Counts completed slots from slot status array
 *
 * @param slotStatus - Array of slot status objects
 * @returns Number of completed slots
 */
export function countCompletedSlots(slotStatus: SlotStatus[]): number {
  return slotStatus.filter(slot => slot.status === 'completed').length
}
