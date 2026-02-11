'use client'

import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

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
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary',
  isLoading = false
}: ConfirmationDialogProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
      <div className="relative transform overflow-hidden rounded-xl bg-card shadow-2xl text-left transition-all w-full max-w-md">
          {/* Content with proper spacing */}
          <div className="p-6 space-y-5">
            {/* Title Section */}
            <div className="text-center">
              <h3 className="text-lg font-semibold leading-6 text-foreground">
                {title}
              </h3>
            </div>

            {/* Message Section */}
            <div className="text-center">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {message}
              </p>
            </div>
            
            {/* Actions Section - Centered Layout */}
            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={onClose}
                disabled={isLoading}
                className="min-w-[100px] sm:min-w-[120px]"
              >
                {cancelText}
              </Button>
              <Button
                variant={confirmVariant === 'danger' ? 'destructive' : 'primary'}
                onClick={onConfirm}
                disabled={isLoading}
                className="min-w-[100px] sm:min-w-[120px]"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  confirmText
                )}
              </Button>
            </div>
          </div>
        </div>
    </div>
  )
}