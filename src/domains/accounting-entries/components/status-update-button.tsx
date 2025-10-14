'use client'

import React, { useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import ActionButton from '@/components/ui/action-button'

type AccountingEntryStatus = 'pending' | 'awaiting_payment' | 'paid' | 'overdue' | 'cancelled' | 'disputed'

interface StatusUpdateButtonProps {
  currentStatus: AccountingEntryStatus
  accountingEntryId: string
  onStatusUpdate: (newStatus: AccountingEntryStatus) => Promise<void>
  disabled?: boolean
}

const STATUS_OPTIONS: { value: AccountingEntryStatus; label: string; color: string }[] = [
  { value: 'pending', label: 'Pending', color: 'text-yellow-300' },
  { value: 'awaiting_payment', label: 'Awaiting Payment', color: 'text-blue-300' },
  { value: 'paid', label: 'Paid', color: 'text-green-300' },
  { value: 'overdue', label: 'Overdue', color: 'text-red-300' },
  { value: 'cancelled', label: 'Cancelled', color: 'text-gray-300' },
  { value: 'disputed', label: 'Disputed', color: 'text-orange-300' }
]

export default function StatusUpdateButton({
  currentStatus,
  accountingEntryId,
  onStatusUpdate,
  disabled = false
}: StatusUpdateButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState<AccountingEntryStatus>(currentStatus)

  const handleStatusChange = async (newStatus: AccountingEntryStatus) => {
    if (newStatus === currentStatus || isUpdating) return

    setIsUpdating(true)
    try {
      await onStatusUpdate(newStatus)
      setSelectedStatus(newStatus)
      setIsOpen(false)
    } catch (error) {
      console.error('Failed to update accounting entry status:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  const currentStatusOption = STATUS_OPTIONS.find(option => option.value === selectedStatus)

  return (
    <div className="relative inline-block">
      <ActionButton
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || isUpdating}
        variant="secondary"
        className="flex items-center space-x-2 min-w-[140px]"
        aria-label="Update accounting entry status"
      >
        {isUpdating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Updating...</span>
          </>
        ) : (
          <>
            <span className={currentStatusOption?.color}>
              {currentStatusOption?.label}
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </>
        )}
      </ActionButton>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50">
          <div className="py-1">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleStatusChange(option.value)}
                disabled={isUpdating}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  option.value === selectedStatus
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                } ${isUpdating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span className={option.color}>{option.label}</span>
                {option.value === selectedStatus && (
                  <span className="ml-2 text-xs text-gray-500">(current)</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Backdrop to close dropdown */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}