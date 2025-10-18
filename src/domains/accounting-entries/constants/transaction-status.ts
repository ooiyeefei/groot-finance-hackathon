/**
 * Centralized Transaction Status Constants
 * Single source of truth for all accounting entry status definitions
 * Ensures consistency across list views, edit forms, and API endpoints
 */

export type TransactionStatus = 'pending' | 'paid' | 'overdue' | 'cancelled' | 'disputed'

export interface TransactionStatusOption {
  value: TransactionStatus
  label: string
  description?: string
  color?: 'gray' | 'green' | 'yellow' | 'red' | 'blue'
}

/**
 * All valid transaction statuses matching database constraint:
 * transactions_status_check check ((status)::text = any (array[
 *   ('pending'::character varying)::text,
 *   ('paid'::character varying)::text,
 *   ('overdue'::character varying)::text,
 *   ('cancelled'::character varying)::text,
 *   ('disputed'::character varying)::text
 * ]))
 */
export const TRANSACTION_STATUSES: TransactionStatusOption[] = [
  {
    value: 'pending',
    label: 'Pending',
    description: 'Transaction is being processed',
    color: 'gray'
  },
  {
    value: 'paid',
    label: 'Paid',
    description: 'Payment has been completed',
    color: 'green'
  },
  {
    value: 'overdue',
    label: 'Overdue',
    description: 'Payment is past due date',
    color: 'red'
  },
  {
    value: 'cancelled',
    label: 'Cancelled',
    description: 'Transaction has been cancelled',
    color: 'gray'
  },
  {
    value: 'disputed',
    label: 'Disputed',
    description: 'Transaction is under dispute',
    color: 'yellow'
  }
] as const

/**
 * Get status option by value
 */
export function getTransactionStatusOption(status: TransactionStatus): TransactionStatusOption | undefined {
  return TRANSACTION_STATUSES.find(option => option.value === status)
}

/**
 * Get status label by value
 */
export function getTransactionStatusLabel(status: TransactionStatus): string {
  const option = getTransactionStatusOption(status)
  return option?.label || status
}

/**
 * Get status color by value
 */
export function getTransactionStatusColor(status: TransactionStatus): string {
  const option = getTransactionStatusOption(status)
  return option?.color || 'gray'
}

/**
 * Check if status is valid
 */
export function isValidTransactionStatus(status: string): status is TransactionStatus {
  return TRANSACTION_STATUSES.some(option => option.value === status)
}