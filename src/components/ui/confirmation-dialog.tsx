'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [isOpen])

  if (!isOpen || !mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop — covers entire viewport including sidebar */}
      <div
        className="fixed inset-0"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)'
        }}
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative transform overflow-hidden rounded-xl bg-card shadow-2xl text-left transition-all w-full max-w-md">
          <div className="p-6 space-y-5">
            <div className="text-center">
              <h3 className="text-lg font-semibold leading-6 text-foreground">
                {title}
              </h3>
            </div>

            <div className="text-center">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {message}
              </p>
            </div>

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
    </div>,
    document.body
  )
}
