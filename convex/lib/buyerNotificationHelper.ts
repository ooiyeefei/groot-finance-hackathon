/**
 * Buyer Notification Helper
 *
 * Provides idempotency checks, business settings validation, and email validation
 * for buyer notification system.
 */

import { z } from 'zod'
import type { Doc } from '../_generated/dataModel'

// ============================================
// TYPES
// ============================================

export type EventType = 'validation' | 'cancellation' | 'rejection'
export type SendStatus = 'sent' | 'skipped' | 'failed'

export interface NotificationLogEntry {
  eventType: EventType
  recipientEmail: string
  timestamp: number
  sendStatus: SendStatus
  skipReason?: string
  errorMessage?: string
  sesMessageId?: string
}

// ============================================
// EMAIL VALIDATION
// ============================================

/**
 * Zod schema for RFC 5322 email validation
 */
const emailSchema = z.string().email().min(3).max(255)

/**
 * Validates an email address using Zod RFC 5322 validation
 *
 * @param email - Email address to validate
 * @returns true if valid, false otherwise
 */
export function validateBuyerEmail(email: string | null | undefined): boolean {
  if (!email) return false

  try {
    emailSchema.parse(email)
    return true
  } catch {
    return false
  }
}

// ============================================
// IDEMPOTENCY CHECKS
// ============================================

/**
 * Checks if a notification has already been successfully sent for a given event type
 *
 * Prevents duplicate emails by checking the buyerNotificationLog for existing
 * "sent" entries matching the event type.
 *
 * @param invoice - Sales invoice document from Convex
 * @param eventType - Type of notification event
 * @returns true if notification already sent, false otherwise
 */
export function hasAlreadySent(
  invoice: Doc<'sales_invoices'>,
  eventType: EventType
): boolean {
  if (!invoice.buyerNotificationLog) return false

  return invoice.buyerNotificationLog.some(
    (entry) => entry.eventType === eventType && entry.sendStatus === 'sent'
  )
}

// ============================================
// BUSINESS SETTINGS CHECKS
// ============================================

/**
 * Determines whether a buyer notification should be sent based on business settings
 *
 * Business settings control validation and cancellation notifications.
 * Rejection confirmations always send (buyer-initiated action).
 *
 * Default behavior: If settings are undefined, notifications are enabled (true).
 *
 * @param business - Business document from Convex
 * @param eventType - Type of notification event
 * @returns true if notification should be sent, false otherwise
 */
export function shouldNotifyBuyer(
  business: Doc<'businesses'>,
  eventType: EventType
): boolean {
  if (eventType === 'validation') {
    // undefined = true (default enabled)
    return business.einvoiceNotifyBuyerOnValidation !== false
  }

  if (eventType === 'cancellation') {
    // undefined = true (default enabled)
    return business.einvoiceNotifyBuyerOnCancellation !== false
  }

  // Rejection confirmation: always send (not configurable)
  // This confirms the buyer's own action, so no settings control
  return true
}

// ============================================
// SKIP REASON HELPERS
// ============================================

/**
 * Standard skip reasons for notification log
 */
export const SkipReasons = {
  NO_EMAIL: 'no_email',
  INVALID_FORMAT: 'invalid_format',
  BUSINESS_SETTINGS_DISABLED: 'business_settings_disabled',
  ALREADY_SENT: 'already_sent',
} as const

/**
 * Determines the appropriate skip reason based on validation and settings checks
 *
 * @param email - Buyer email address
 * @param business - Business document from Convex
 * @param invoice - Sales invoice document from Convex
 * @param eventType - Type of notification event
 * @returns skip reason string or null if should proceed with send
 */
export function getSkipReason(
  email: string | null | undefined,
  business: Doc<'businesses'>,
  invoice: Doc<'sales_invoices'>,
  eventType: EventType
): string | null {
  // Check idempotency first
  if (hasAlreadySent(invoice, eventType)) {
    return SkipReasons.ALREADY_SENT
  }

  // Check email presence
  if (!email) {
    return SkipReasons.NO_EMAIL
  }

  // Check email format
  if (!validateBuyerEmail(email)) {
    return SkipReasons.INVALID_FORMAT
  }

  // Check business settings
  if (!shouldNotifyBuyer(business, eventType)) {
    return SkipReasons.BUSINESS_SETTINGS_DISABLED
  }

  // All checks passed - proceed with send
  return null
}
