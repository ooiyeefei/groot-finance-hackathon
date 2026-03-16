'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { useBusinessContext } from '@/contexts/business-context'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Mail, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'

export default function EInvoiceNotificationSettings() {
  const { activeContext } = useBusinessContext()
  const businessId = activeContext?.businessId
  const { addToast } = useToast()

  // Load current business settings
  const business = useQuery(
    api.functions.businesses.getById,
    businessId ? { id: businessId } : 'skip'
  )

  // Local state for toggle values (defaults to true per spec)
  const [notifyOnValidation, setNotifyOnValidation] = useState(true)
  const [notifyOnCancellation, setNotifyOnCancellation] = useState(true)
  const [hasChanges, setHasChanges] = useState(false)

  // Update mutation
  const updateSettings = useMutation(api.functions.businesses.updateNotificationSettings)
  const [isSaving, setIsSaving] = useState(false)

  // Sync local state with loaded business data
  useEffect(() => {
    if (business) {
      // Settings default to true if undefined (per spec FR-014)
      setNotifyOnValidation(business.einvoiceNotifyBuyerOnValidation !== false)
      setNotifyOnCancellation(business.einvoiceNotifyBuyerOnCancellation !== false)
      setHasChanges(false)
    }
  }, [business])

  // Handle toggle changes
  const handleValidationChange = (checked: boolean) => {
    setNotifyOnValidation(checked)
    setHasChanges(true)
  }

  const handleCancellationChange = (checked: boolean) => {
    setNotifyOnCancellation(checked)
    setHasChanges(true)
  }

  // Save settings
  const handleSave = async () => {
    if (!businessId) return

    setIsSaving(true)
    try {
      await updateSettings({
        businessId: businessId as Id<'businesses'>,
        einvoiceNotifyBuyerOnValidation: notifyOnValidation,
        einvoiceNotifyBuyerOnCancellation: notifyOnCancellation,
      })

      addToast({
        type: 'success',
        title: 'Settings saved',
        description: 'E-invoice buyer notification preferences updated successfully',
      })

      setHasChanges(false)
    } catch (error) {
      console.error('[EInvoiceNotificationSettings] Save failed:', error)
      addToast({
        type: 'error',
        title: error instanceof Error ? error.message : 'Failed to update notification settings',
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Loading state
  if (!business) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading notification settings...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-blue-500/10">
          <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-foreground">
            E-Invoice Buyer Notifications
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Control which email notifications are sent to buyers when you issue e-invoices through LHDN
          </p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-foreground">
            <p className="font-medium mb-1">How buyer notifications work</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Notifications are sent to the buyer's email address from your customer records</li>
              <li>All emails include invoice details, amount, and a link to view on MyInvois</li>
              <li>Rejection notifications are always sent (buyer's own action, cannot be disabled)</li>
              <li>Changes take effect immediately for new invoices</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Settings Toggles */}
      <div className="space-y-6 bg-card border border-border rounded-lg p-6">
        {/* Validation Notification Toggle */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <Label htmlFor="notify-validation" className="text-base font-medium text-foreground">
              Notify buyer when e-invoice is validated by LHDN
            </Label>
            <p className="text-sm text-muted-foreground">
              Sends an email to the buyer when LHDN successfully validates your e-invoice, confirming it's officially recognized
            </p>
          </div>
          <Switch
            id="notify-validation"
            checked={notifyOnValidation}
            onCheckedChange={handleValidationChange}
            aria-label="Toggle validation notification"
          />
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Cancellation Notification Toggle */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <Label htmlFor="notify-cancellation" className="text-base font-medium text-foreground">
              Notify buyer when I cancel an e-invoice
            </Label>
            <p className="text-sm text-muted-foreground">
              Sends an email to the buyer when you cancel an e-invoice (within the 72-hour LHDN window), including your cancellation reason
            </p>
          </div>
          <Switch
            id="notify-cancellation"
            checked={notifyOnCancellation}
            onCheckedChange={handleCancellationChange}
            aria-label="Toggle cancellation notification"
          />
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Rejection Notification (Always On) */}
        <div className="flex items-start justify-between gap-4 opacity-60">
          <div className="flex-1 space-y-1">
            <Label className="text-base font-medium text-foreground flex items-center gap-2">
              Notify buyer when they reject an e-invoice
              <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded-md font-normal">
                Always enabled
              </span>
            </Label>
            <p className="text-sm text-muted-foreground">
              Sends a confirmation email to the buyer when LHDN processes their rejection (cannot be disabled as it confirms the buyer's own action)
            </p>
          </div>
          <Switch
            checked={true}
            disabled={true}
            aria-label="Rejection notification (always on)"
          />
        </div>
      </div>

      {/* Save Button */}
      {hasChanges && (
        <div className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <span>You have unsaved changes</span>
          </div>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      )}

      {/* Success Indicator */}
      {!hasChanges && !isSaving && business && (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <CheckCircle2 className="w-4 h-4" />
          <span>All changes saved</span>
        </div>
      )}
    </div>
  )
}
