'use client'

import { X, Eye, EyeOff, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface InvoiceEditorHeaderProps {
  mode: 'create' | 'edit'
  lastSavedAt?: Date
  isSaving: boolean
  isPreviewVisible: boolean
  onTogglePreview: () => void
  onReviewInvoice: () => void
  onClose: () => void
  isValid: boolean
}

export function InvoiceEditorHeader({
  mode,
  lastSavedAt,
  isSaving,
  isPreviewVisible,
  onTogglePreview,
  onReviewInvoice,
  onClose,
  isValid,
}: InvoiceEditorHeaderProps) {
  const formatSaveTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface shrink-0">
      {/* Left: Close + Title */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose} title="Close editor">
          <X className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-sm font-semibold text-foreground">
            {mode === 'create' ? 'Create invoice' : 'Edit invoice'}
          </h1>
        </div>
      </div>

      {/* Center: Auto-save status */}
      <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
        {isSaving ? (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
            Saving...
          </span>
        ) : lastSavedAt ? (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Draft saved at {formatSaveTime(lastSavedAt)}
          </span>
        ) : (
          <span className="text-muted-foreground/60">Not saved yet</span>
        )}
      </div>

      {/* Right: Preview toggle + Review */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onTogglePreview}
          className="hidden md:flex text-muted-foreground"
        >
          {isPreviewVisible ? (
            <>
              <EyeOff className="h-4 w-4 mr-1.5" />
              Hide preview
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 mr-1.5" />
              Show preview
            </>
          )}
        </Button>

        <Button
          size="sm"
          onClick={onReviewInvoice}
          disabled={!isValid}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Send className="h-4 w-4 mr-1.5" />
          Review invoice
        </Button>
      </div>
    </header>
  )
}
