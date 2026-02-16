'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useLocale } from 'next-intl'
import { ArrowLeft, Settings, Save, Loader2, Eye, CreditCard, Mail } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/toast'
import { useActiveBusiness, useBusinessProfile } from '@/contexts/business-context'
import { useInvoiceDefaults, useInvoiceDefaultsMutation } from '../hooks/use-sales-invoices'
import type { Id } from '../../../../convex/_generated/dataModel'
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
  bccOutgoingEmails: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InvoiceSettingsForm() {
  const locale = useLocale()
  const { addToast } = useToast()
  const { businessId, business } = useActiveBusiness()
  const { profile: businessProfile } = useBusinessProfile()
  const invoiceDefaults = useInvoiceDefaults()
  const { updateDefaults } = useInvoiceDefaultsMutation()

  const contactEmail = businessProfile?.contact_email || (business as unknown as Record<string, unknown>)?.contactEmail as string | undefined

  const [settings, setSettings] = useState<InvoiceSettingsState>({
    invoicePrefix: 'INV',
    nextNumber: 1,
    defaultCurrency: 'SGD',
    defaultPaymentTerms: 'net_30',
    defaultTaxMode: 'exclusive',
    defaultPaymentInstructions: '',
    defaultNotes: '',
    defaultTemplateId: 'modern',
    acceptedPaymentMethods: ['bank_transfer'],
    bccOutgoingEmails: true,
  })

  // Sync state when Convex data loads
  const hasInitialized = useRef(false)
  useEffect(() => {
    if (invoiceDefaults && !hasInitialized.current) {
      hasInitialized.current = true
      setSettings({
        invoicePrefix: invoiceDefaults.invoiceNumberPrefix ?? 'INV',
        nextNumber: invoiceDefaults.nextInvoiceNumber ?? 1,
        defaultCurrency: invoiceDefaults.defaultCurrency ?? 'SGD',
        defaultPaymentTerms: (invoiceDefaults.defaultPaymentTerms as PaymentTerms) ?? 'net_30',
        defaultTaxMode: (invoiceDefaults.defaultTaxMode as TaxMode) ?? 'exclusive',
        defaultPaymentInstructions: invoiceDefaults.defaultPaymentInstructions ?? '',
        defaultNotes: invoiceDefaults.defaultNotes ?? '',
        defaultTemplateId: (invoiceDefaults.selectedTemplate as InvoiceTemplate) ?? 'modern',
        acceptedPaymentMethods: invoiceDefaults.acceptedPaymentMethods ?? ['bank_transfer'],
        bccOutgoingEmails: invoiceDefaults.bccOutgoingEmails ?? true,
      })
    }
  }, [invoiceDefaults])

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
    if (!businessId) return
    setIsSaving(true)
    setSaveSuccess(false)

    try {
      await updateDefaults({
        businessId: businessId as Id<'businesses'>,
        invoiceNumberPrefix: settings.invoicePrefix || undefined,
        nextInvoiceNumber: settings.nextNumber,
        defaultCurrency: settings.defaultCurrency,
        defaultPaymentTerms: settings.defaultPaymentTerms,
        defaultTaxMode: settings.defaultTaxMode,
        selectedTemplate: settings.defaultTemplateId,
        defaultPaymentInstructions: settings.defaultPaymentInstructions || undefined,
        defaultNotes: settings.defaultNotes || undefined,
        acceptedPaymentMethods: settings.acceptedPaymentMethods,
        bccOutgoingEmails: settings.bccOutgoingEmails,
      })

      setSaveSuccess(true)
      addToast({ type: 'success', title: 'Invoice settings saved' })
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      console.error('[InvoiceSettings] Failed to save settings:', error)
      addToast({
        type: 'error',
        title: 'Failed to save settings',
        description: error instanceof Error ? error.message : 'Please try again.',
      })
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
          <Link href={`/${locale}/invoices#sales-invoices`}>
            <Button variant="outline" size="icon" title="Back to Sales Invoices">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
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
        <Button variant="primary" onClick={handleSave} disabled={isSaving}>
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

          {/* Email Settings */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-base flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-start gap-3 p-3 rounded-md border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                <Checkbox
                  checked={settings.bccOutgoingEmails}
                  onCheckedChange={(checked) => updateSetting('bccOutgoingEmails', !!checked)}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-sm font-medium text-foreground">
                    Send me a copy of outgoing invoice emails
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">
                    {contactEmail
                      ? `A BCC copy will be sent to ${contactEmail}`
                      : 'Set a contact email in your business profile to receive copies'}
                  </p>
                </div>
              </label>
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
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">BCC Emails</dt>
                  <dd className="text-foreground font-medium">
                    {settings.bccOutgoingEmails ? 'On' : 'Off'}
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
