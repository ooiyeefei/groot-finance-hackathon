'use client'

import { useState } from 'react'
import { Check, ChevronDown, Clock, CheckCircle, XCircle, AlertCircle, CreditCard, Ban } from 'lucide-react'

interface StatusSelectorProps {
  transactionId: string
  currentStatus: string | null
  onStatusUpdate?: (newStatus: string) => void
  className?: string
}

interface StatusOption {
  value: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  className: string
  description: string
}

const STATUS_OPTIONS: StatusOption[] = [
  {
    value: 'pending',
    label: 'Pending',
    icon: Clock,
    className: 'bg-yellow-900/20 text-yellow-300 border-yellow-700/50',
    description: 'Transaction is being processed'
  },
  {
    value: 'awaiting_payment',
    label: 'Awaiting Payment',
    icon: CreditCard,
    className: 'bg-blue-900/20 text-blue-300 border-blue-700/50',
    description: 'Waiting for payment to be received'
  },
  {
    value: 'paid',
    label: 'Paid',
    icon: CheckCircle,
    className: 'bg-green-900/20 text-green-300 border-green-700/50',
    description: 'Payment has been completed'
  },
  {
    value: 'overdue',
    label: 'Overdue',
    icon: AlertCircle,
    className: 'bg-red-900/20 text-red-300 border-red-700/50',
    description: 'Payment is past due date'
  },
  {
    value: 'cancelled',
    label: 'Cancelled',
    icon: Ban,
    className: 'bg-gray-900/20 text-gray-300 border-gray-700/50',
    description: 'Transaction has been cancelled'
  },
  {
    value: 'disputed',
    label: 'Disputed',
    icon: XCircle,
    className: 'bg-orange-900/20 text-orange-300 border-orange-700/50',
    description: 'Payment is being disputed'
  }
]

export default function StatusSelector({
  transactionId,
  currentStatus,
  onStatusUpdate,
  className = ''
}: StatusSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const currentStatusConfig = STATUS_OPTIONS.find(
    opt => opt.value === currentStatus
  ) || STATUS_OPTIONS[0] // Default to pending if not found

  const handleStatusSelect = async (newStatus: string) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/transactions/${transactionId}/status`, {
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
      console.log('Status updated successfully:', result)
      
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

  const CurrentIcon = currentStatusConfig.icon

  return (
    <div className={`relative ${className}`}>
      {/* Status Selector Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center space-x-2 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-md border border-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-32"
        aria-label={`Change status from ${currentStatusConfig.label}`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <CurrentIcon className={`w-4 h-4 ${currentStatusConfig.className.split(' ').find(c => c.startsWith('text-')) || 'text-gray-400'}`} />
        <span className="text-gray-200 max-w-24 truncate">
          {isLoading ? 'Updating...' : currentStatusConfig.label}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full mt-1 left-0 min-w-56 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50 max-h-80 overflow-y-auto" role="listbox">
          {STATUS_OPTIONS.map((statusOption) => {
            const StatusIcon = statusOption.icon
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