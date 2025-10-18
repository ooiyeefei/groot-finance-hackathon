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
    className: 'bg-yellow-900/20 text-yellow-300 border-yellow-700/50'
  },
  paid: {
    icon: CheckCircle,
    className: 'bg-green-900/20 text-green-300 border-green-700/50'
  },
  overdue: {
    icon: AlertCircle,
    className: 'bg-red-900/20 text-red-300 border-red-700/50'
  },
  cancelled: {
    icon: Ban,
    className: 'bg-gray-900/20 text-gray-300 border-gray-700/50'
  },
  disputed: {
    icon: XCircle,
    className: 'bg-orange-900/20 text-orange-300 border-orange-700/50'
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
        className="flex items-center space-x-2 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-md border border-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-32"
        aria-label={`Change status from ${currentStatusOption.label}`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <CurrentIcon className={`w-4 h-4 ${currentStatusDisplay.className.split(' ').find(c => c.startsWith('text-')) || 'text-gray-400'}`} />
        <span className="text-gray-200 max-w-24 truncate">
          {isLoading ? 'Updating...' : currentStatusOption.label}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full mt-1 left-0 min-w-56 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50 max-h-80 overflow-y-auto" role="listbox">
          {TRANSACTION_STATUSES.map((statusOption) => {
            const StatusIcon = STATUS_DISPLAY_CONFIG[statusOption.value].icon
            return (
              <button
                key={statusOption.value}
                onClick={() => handleStatusSelect(statusOption.value)}
                className="flex items-center justify-between w-full px-4 py-3 text-sm hover:bg-gray-700 transition-colors focus:outline-none focus:bg-gray-700"
                role="option"
                aria-selected={currentStatus === statusOption.value}
              >
                <div className="flex items-center space-x-3">
                  <StatusIcon className="w-4 h-4 text-gray-400" />
                  <div className="text-left">
                    <div className="text-white font-medium">{statusOption.label}</div>
                    <div className="text-xs text-gray-400">{statusOption.description}</div>
                  </div>
                </div>
                {currentStatus === statusOption.value && (
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0 ml-2" />
                )}
              </button>
            )
          })}
          
          {/* Close button */}
          <div className="border-t border-gray-700">
            <button
              onClick={() => setIsOpen(false)}
              className="w-full px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors focus:outline-none focus:text-gray-200"
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