'use client'

import { AlertTriangle, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface VoidConfirmationDialogProps {
  invoiceNumber: string
  onConfirm: () => void
  onCancel: () => void
  isVoiding: boolean
}

export function VoidConfirmationDialog({
  invoiceNumber,
  onConfirm,
  onCancel,
  isVoiding,
}: VoidConfirmationDialogProps) {
  return (
    <Card className="border-destructive bg-destructive/5">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Void Invoice {invoiceNumber}?
            </p>
            <p className="text-sm text-muted-foreground">
              This will permanently cancel the invoice and reverse any associated
              accounting entries. Voided invoices cannot be edited, sent, or
              restored. This action cannot be undone.
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                variant="destructive"
                size="sm"
                onClick={onConfirm}
                disabled={isVoiding}
              >
                {isVoiding ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Voiding...
                  </>
                ) : (
                  'Yes, Void Invoice'
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
                disabled={isVoiding}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
