'use client'

import { useState, useMemo } from 'react'
import { Settings, Save, Loader2, Eye, CreditCard } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { useActiveBusiness } from '@/contexts/business-context'
import {
  SUPPORTED_CURRENCIES,
  PAYMENT_TERMS_LABELS,
  TAX_MODES,
  INVOICE_TEMPLATES,
  type PaymentTerms,
  type TaxMode,
  type InvoiceTemplate,
} from '../types'
import { formatInvoiceNumber } from '../lib/invoice-number-format'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const PAYMENT_METHODS = [
  { id: 'bank_transfer', label: 'Bank Transfer' },
  { id: 'credit_card', label: 'Credit Card' },
  { id: 'paynow', label: 'PayNow (SG)' },
  { id: 'grabpay', label: 'GrabPay' },
  { id: 'promptpay', label: 'PromptPay (TH)' },
  { id: 'gcash', label: 'GCash (PH)' },
  { id: 'paypal', label: 'PayPal' },
  { id: 'cheque', label: 'Cheque' },
  { id: 'cash', label: 'Cash' },
] as const

interface InvoiceSettingsState {
  invoicePrefix: string
  nextNumber: number
  defaultCurrency: string
  defaultPaymentTerms: PaymentTerms
  defaultTaxMode: TaxMode
  defaultPaymentInstructions: string
  defaultNotes: string
  defaultTemplateId: InvoiceTemplate
  acceptedPaymentMethods: string[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InvoiceSettingsForm() {
  const { business } = useActiveBusiness()

  // Extract current invoice settings from business context if available
  const invoiceSettings = (business as unknown as Record<string, unknown>)?.invoiceSettings as Record<string, unknown> | undefined

  const [settings, setSettings] = useState<InvoiceSettingsState>({
    invoicePrefix: (invoiceSettings?.invoiceNumberPrefix as string) ?? 'INV',
    nextNumber: (invoiceSettings?.nextInvoiceNumber as number) ?? 1,
    defaultCurrency: (invoiceSettings?.defaultCurrency as string) ?? 'SGD',
    defaultPaymentTerms: (invoiceSettings?.defaultPaymentTerms as PaymentTerms) ?? 'net_30',
    defaultTaxMode: (invoiceSettings?.defaultTaxMode as TaxMode) ?? 'exclusive',
    defaultPaymentInstructions: (invoiceSettings?.defaultPaymentInstructions as string) ?? '',
    defaultNotes: (invoiceSettings?.defaultNotes as string) ?? '',
    defaultTemplateId: (invoiceSettings?.selectedTemplate as InvoiceTemplate) ?? 'modern',
    acceptedPaymentMethods: (invoiceSettings?.acceptedPaymentMethods as string[]) ?? ['bank_transfer'],
  })

  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Live preview of formatted invoice number
  const previewInvoiceNumber = useMemo(() => {
    const year = new Date().getFullYear()
    return formatInvoiceNumber(
      settings.invoicePrefix || 'INV',
      year,
      settings.nextNumber || 1
    )
  }, [settings.invoicePrefix, settings.nextNumber])

  const handleSave = async () => {
    setIsSaving(true)
    setSaveSuccess(false)

    try {
      // TODO: Persist settings to backend when Convex mutation is available
      console.log('[InvoiceSettings] Saving settings:', settings)

      // Simulate save delay for UX feedback
      await new Promise((resolve) => setTimeout(resolve, 500))

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      console.error('[InvoiceSettings] Failed to save settings:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const updateSetting = <K extends keyof InvoiceSettingsState>(
    key: K,
    value: InvoiceSettingsState[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Invoice Configuration</h2>
            <p className="text-sm text-muted-foreground">
              Set default values for new sales invoices
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : saveSuccess ? (
            <>
              <Save className="w-4 h-4 mr-2" />
              Saved
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Invoice Numbering */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-base">Invoice Numbering</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-foreground text-sm">Invoice Prefix</Label>
                  <Input
                    placeholder="INV"
                    value={settings.invoicePrefix}
                    onChange={(e) => updateSetting('invoicePrefix', e.target.value.toUpperCase())}
                    maxLength={10}
                    className="bg-input border-border text-foreground"
                  />
                  <p className="text-muted-foreground text-xs mt-1">
                    Prefix used in invoice numbers (e.g., INV, SI, SALE)
                  </p>
                </div>
                <div>
                  <Label className="text-foreground text-sm">Next Invoice Number</Label>
                  <Input
                    type="number"
                    min={1}
                    value={settings.nextNumber}
                    onChange={(e) => updateSetting('nextNumber', Math.max(1, parseInt(e.target.value) || 1))}
                    className="bg-input border-border text-foreground"
                  />
                  <p className="text-muted-foreground text-xs mt-1">
                    Sequence number for the next invoice
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Default Values */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-base">Default Values</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-foreground text-sm">Default Currency</Label>
                  <Select
                    value={settings.defaultCurrency}
                    onValueChange={(v) => updateSetting('defaultCurrency', v)}
                  >
                    <SelectTrigger className="bg-input border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {SUPPORTED_CURRENCIES.map((currency) => (
                        <SelectItem key={currency} value={currency} className="text-foreground">
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-foreground text-sm">Payment Terms</Label>
                  <Select
                    value={settings.defaultPaymentTerms}
                    onValueChange={(v) => updateSetting('defaultPaymentTerms', v as PaymentTerms)}
                  >
                    <SelectTrigger className="bg-input border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {Object.entries(PAYMENT_TERMS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value} className="text-foreground">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-foreground text-sm">Tax Mode</Label>
                  <Select
                    value={settings.defaultTaxMode}
                    onValueChange={(v) => updateSetting('defaultTaxMode', v as TaxMode)}
                  >
                    <SelectTrigger className="bg-input border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value={TAX_MODES.EXCLUSIVE} className="text-foreground">
                        Tax Exclusive
                      </SelectItem>
                      <SelectItem value={TAX_MODES.INCLUSIVE} className="text-foreground">
                        Tax Inclusive
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-foreground text-sm">Default Template</Label>
                <Select
                  value={settings.defaultTemplateId}
                  onValueChange={(v) => updateSetting('defaultTemplateId', v as InvoiceTemplate)}
                >
                  <SelectTrigger className="bg-input border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value={INVOICE_TEMPLATES.MODERN} className="text-foreground">
                      Modern
                    </SelectItem>
                    <SelectItem value={INVOICE_TEMPLATES.CLASSIC} className="text-foreground">
                      Classic
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs mt-1">
                  Default template applied to new invoices
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Accepted Payment Methods */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Accepted Payment Methods
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-muted-foreground text-xs">
                Select the payment methods your business accepts. These will be shown on invoices.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((method) => (
                  <label
                    key={method.id}
                    className="flex items-center gap-2.5 p-2.5 rounded-md border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={settings.acceptedPaymentMethods.includes(method.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          updateSetting('acceptedPaymentMethods', [
                            ...settings.acceptedPaymentMethods,
                            method.id,
                          ])
                        } else {
                          updateSetting(
                            'acceptedPaymentMethods',
                            settings.acceptedPaymentMethods.filter((m) => m !== method.id)
                          )
                        }
                      }}
                    />
                    <span className="text-sm text-foreground">{method.label}</span>
                  </label>
                ))}
              </div>
              {settings.acceptedPaymentMethods.length === 0 && (
                <p className="text-xs text-destructive">
                  Select at least one payment method
                </p>
              )}
            </CardContent>
          </Card>

          {/* Default Text Fields */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-base">Default Text</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-foreground text-sm">Payment Instructions</Label>
                <Textarea
                  placeholder="Bank account details, payment methods, QR codes..."
                  value={settings.defaultPaymentInstructions}
                  onChange={(e) => updateSetting('defaultPaymentInstructions', e.target.value)}
                  rows={3}
                  className="bg-input border-border text-foreground"
                />
                <p className="text-muted-foreground text-xs mt-1">
                  Automatically added to every new invoice
                </p>
              </div>
              <div>
                <Label className="text-foreground text-sm">Default Notes</Label>
                <Textarea
                  placeholder="Thank you for your business! Terms and conditions apply..."
                  value={settings.defaultNotes}
                  onChange={(e) => updateSetting('defaultNotes', e.target.value)}
                  rows={3}
                  className="bg-input border-border text-foreground"
                />
                <p className="text-muted-foreground text-xs mt-1">
                  Default notes section for new invoices
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Preview */}
        <div className="space-y-6">
          {/* Invoice Number Preview */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-base flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Live Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                  Next Invoice Number
                </Label>
                <div className="mt-1 p-3 bg-muted rounded-lg border border-border">
                  <span className="text-foreground font-mono text-lg font-semibold">
                    {previewInvoiceNumber}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs mt-2">
                  Format: {settings.invoicePrefix || 'INV'}-YYYY-NNN
                </p>
              </div>

              <div className="border-t border-border pt-4">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                  Preview Sequence
                </Label>
                <div className="mt-2 space-y-1">
                  {[0, 1, 2].map((offset) => {
                    const num = settings.nextNumber + offset
                    const year = new Date().getFullYear()
                    return (
                      <div
                        key={offset}
                        className={`text-sm font-mono px-2 py-1 rounded ${
                          offset === 0
                            ? 'text-primary bg-primary/5 font-medium'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {formatInvoiceNumber(settings.invoicePrefix || 'INV', year, num)}
                      </div>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-base">Current Defaults</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Currency</dt>
                  <dd className="text-foreground font-medium">{settings.defaultCurrency}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Payment Terms</dt>
                  <dd className="text-foreground font-medium">
                    {PAYMENT_TERMS_LABELS[settings.defaultPaymentTerms] ?? settings.defaultPaymentTerms}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tax Mode</dt>
                  <dd className="text-foreground font-medium capitalize">{settings.defaultTaxMode}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Template</dt>
                  <dd className="text-foreground font-medium capitalize">{settings.defaultTemplateId}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Has Instructions</dt>
                  <dd className="text-foreground font-medium">
                    {settings.defaultPaymentInstructions ? 'Yes' : 'No'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Has Notes</dt>
                  <dd className="text-foreground font-medium">
                    {settings.defaultNotes ? 'Yes' : 'No'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Payment Methods</dt>
                  <dd className="text-foreground font-medium">
                    {settings.acceptedPaymentMethods.length}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
