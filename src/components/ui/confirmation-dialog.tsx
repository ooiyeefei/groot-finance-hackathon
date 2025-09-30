'use client'

import { useTranslations } from 'next-intl'

interface ConfirmationDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmVariant?: 'danger' | 'primary'
  isLoading?: boolean
}

export default function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  confirmVariant = 'primary',
  isLoading = false
}: ConfirmationDialogProps) {
  const tCommon = useTranslations('common')

  const defaultConfirmText = confirmText || tCommon('confirm')
  const defaultCancelText = cancelText || tCommon('cancel')
  if (!isOpen) return null

  const confirmButtonClasses = confirmVariant === 'danger'
    ? 'bg-red-600 hover:bg-red-500 focus:ring-red-500 shadow-red-600/25'
    : 'bg-blue-600 hover:bg-blue-500 focus:ring-blue-500 shadow-blue-600/25'

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Enhanced Backdrop for Better Visibility */}
      <div 
        className="fixed inset-0 transition-opacity"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)'
        }}
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:items-center sm:p-6">
        <div className="relative transform overflow-hidden rounded-xl bg-gray-800 shadow-2xl text-left transition-all sm:my-8 w-full max-w-md">
          {/* Content with proper spacing */}
          <div className="p-6 space-y-5">
            {/* Title Section */}
            <div className="text-center">
              <h3 className="text-lg font-semibold leading-6 text-white">
                {title}
              </h3>
            </div>
            
            {/* Message Section */}
            <div className="text-center">
              <p className="text-sm leading-relaxed text-gray-300">
                {message}
              </p>
            </div>
            
            {/* Actions Section - Centered Layout */}
            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="inline-flex justify-center rounded-xl bg-gray-700 px-6 py-3 text-sm font-medium text-gray-200 shadow-sm ring-1 ring-inset ring-gray-600 hover:bg-gray-600 hover:text-white transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px] sm:min-w-[120px]"
              >
                {defaultCancelText}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isLoading}
                className={`inline-flex justify-center rounded-xl px-6 py-3 text-sm font-medium text-white shadow-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px] sm:min-w-[120px] ${confirmButtonClasses}`}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Loading...</span>
                  </div>
                ) : (
                  defaultConfirmText
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}