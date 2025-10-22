'use client'

import { useState } from 'react'
import { Check, ChevronDown, Clock, CheckCircle, XCircle, AlertCircle, CreditCard, Ban } from 'lucide-react'
import { TRANSACTION_STATUSES, TransactionStatus } from '@/domains/accounting-entries/constants/transaction-status'

interface StatusSelectorProps {
  accountingEntryId: string
  currentStatus: TransactionStatus | null
  onStatusUpdate?: (newStatus: TransactionStatus) => void
  className?: string
}

// Status option interface with icon and styling
interface StatusOptionDisplay {
  icon: React.ComponentType<{ className?: string }>
  className: string
}

// Map status values to display properties (icons, colors)
const STATUS_DISPLAY_CONFIG: Record<TransactionStatus, StatusOptionDisplay> = {
  pending: {
    icon: Clock,
    className: 'text-yellow-600 dark:text-yellow-400'
  },
  paid: {
    icon: CheckCircle,
    className: 'text-green-600 dark:text-green-400'
  },
  overdue: {
    icon: AlertCircle,
    className: 'text-red-600 dark:text-red-400'
  },
  cancelled: {
    icon: Ban,
    className: 'text-gray-600 dark:text-gray-400'
  },
  disputed: {
    icon: XCircle,
    className: 'text-orange-600 dark:text-orange-400'
  }
}

export default function StatusSelector({
  accountingEntryId,
  currentStatus,
  onStatusUpdate,
  className = ''
}: StatusSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Get current status configuration from centralized constants
  const currentStatusOption = TRANSACTION_STATUSES.find(
    opt => opt.value === currentStatus
  ) || TRANSACTION_STATUSES[0] // Default to pending if not found

  const currentStatusDisplay = STATUS_DISPLAY_CONFIG[currentStatusOption.value]

  const handleStatusSelect = async (newStatus: TransactionStatus) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/v1/accounting-entries/${accountingEntryId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update status')
      }

      const result = await response.json()

      // Call parent callback if provided
      onStatusUpdate?.(newStatus)
      
      setIsOpen(false)
    } catch (error) {
      console.error('Error updating status:', error)
      alert(error instanceof Error ? error.message : 'Failed to update status')
    } finally {
      setIsLoading(false)
    }
  }

  const CurrentIcon = currentStatusDisplay.icon

  return (
    <div className={`relative ${className}`}>
      {/* Status Selector Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center space-x-2 px-3 py-1.5 text-sm bg-record-layer-2 hover:bg-record-hover rounded-md border border-record-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-32"
        aria-label={`Change status from ${currentStatusOption.label}`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <CurrentIcon className={`w-4 h-4 ${currentStatusDisplay.className}`} />
        <span className="text-record-title max-w-24 truncate">
          {isLoading ? 'Updating...' : currentStatusOption.label}
        </span>
        <ChevronDown className={`w-4 h-4 text-record-supporting transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full mt-1 left-0 min-w-56 bg-record-layer-1 border border-record-border rounded-md shadow-lg z-50 max-h-80 overflow-y-auto" role="listbox">
          {TRANSACTION_STATUSES.map((statusOption) => {
            const StatusIcon = STATUS_DISPLAY_CONFIG[statusOption.value].icon
            return (
              <button
                key={statusOption.value}
                onClick={() => handleStatusSelect(statusOption.value)}
                className="flex items-center justify-between w-full px-4 py-3 text-sm hover:bg-record-hover transition-colors focus:outline-none focus:bg-record-hover"
                role="option"
                aria-selected={currentStatus === statusOption.value}
              >
                <div className="flex items-center space-x-3">
                  <StatusIcon className={`w-4 h-4 ${STATUS_DISPLAY_CONFIG[statusOption.value].className}`} />
                  <div className="text-left">
                    <div className="text-record-title font-medium">{statusOption.label}</div>
                    <div className="text-xs text-record-supporting">{statusOption.description}</div>
                  </div>
                </div>
                {currentStatus === statusOption.value && (
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0 ml-2" />
                )}
              </button>
            )
          })}
          
          {/* Close button */}
          <div className="border-t border-record-border">
            <button
              onClick={() => setIsOpen(false)}
              className="w-full px-4 py-2 text-sm text-record-supporting hover:text-record-title transition-colors focus:outline-none focus:text-record-title"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Click outside overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}