'use client'

import { useState, useEffect } from 'react'
import { useBusinessProfile } from '@/contexts/business-context'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { Mail, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'

// Simple toggle switch
function Toggle({ checked, onChange, disabled, id }: { checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-primary' : 'bg-muted'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

export default function EInvoiceNotificationSettings() {
  const { profile, updateProfile } = useBusinessProfile()
  const { addToast } = useToast()

  const [autoDelivery, setAutoDelivery] = useState(true)
  const [buyerNotifications, setBuyerNotifications] = useState(true)
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (profile) {
      // These fields may be present from the API even if not typed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = profile as any
      setAutoDelivery(p.einvoice_auto_delivery !== false)
      setBuyerNotifications(p.einvoice_buyer_notifications !== false)
      setHasChanges(false)
    }
  }, [profile])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const csrfResponse = await fetch('/api/v1/utils/security/csrf-token')
      const csrfData = await csrfResponse.json()
      if (!csrfData.success) throw new Error('Failed to get CSRF token')

      const response = await fetch('/api/v1/account-management/businesses/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfData.data.csrfToken,
        },
        body: JSON.stringify({
          einvoice_auto_delivery: autoDelivery,
          einvoice_buyer_notifications: buyerNotifications,
        }),
      })
      const result = await response.json()
      if (!result.success) throw new Error(result.error || 'Failed to save')
      updateProfile(result.data)
      addToast({ type: 'success', title: 'Settings saved', description: 'Notification preferences updated.' })
      setHasChanges(false)
    } catch (error) {
      addToast({ type: 'error', title: error instanceof Error ? error.message : 'Failed to save' })
    } finally {
      setIsSaving(false)
    }
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading notification settings...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-blue-500/10">
          <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-foreground">E-Invoice Notifications</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Control email notifications for e-invoice events
          </p>
        </div>
      </div>

      <div className="space-y-6 bg-card border border-border rounded-lg p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <Label htmlFor="auto-delivery" className="text-base font-medium text-foreground">
              Auto-deliver validated e-invoices to buyers
            </Label>
            <p className="text-sm text-muted-foreground">
              Automatically email the LHDN-validated PDF to the buyer after successful validation
            </p>
          </div>
          <Toggle
            id="auto-delivery"
            checked={autoDelivery}
            onChange={(v) => { setAutoDelivery(v); setHasChanges(true) }}
          />
        </div>

        <div className="border-t border-border" />

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <Label htmlFor="buyer-notif" className="text-base font-medium text-foreground">
              Send buyer notification emails
            </Label>
            <p className="text-sm text-muted-foreground">
              Notify buyers via email on validation, cancellation, and rejection events
            </p>
          </div>
          <Toggle
            id="buyer-notif"
            checked={buyerNotifications}
            onChange={(v) => { setBuyerNotifications(v); setHasChanges(true) }}
          />
        </div>
      </div>

      {hasChanges && (
        <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>You have unsaved changes</span>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      )}

      {!hasChanges && !isSaving && profile && (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <CheckCircle2 className="w-4 h-4" />
          <span>All changes saved</span>
        </div>
      )}
    </div>
  )
}
