'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Pencil,
  Save,
  Send,
  X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import { useDebtorDetail } from '../hooks/use-debtor-management'
import { useActiveBusiness } from '@/contexts/business-context'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { DebtorChangeLog } from './debtor-change-log'
import { useUser } from '@clerk/nextjs'

interface DebtorDetailProps {
  customerId: string
  onBack?: () => void
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  overdue: 'bg-destructive/10 text-destructive',
  partially_paid: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  void: 'bg-muted text-muted-foreground line-through',
}

const ID_TYPE_OPTIONS = [
  { value: 'BRN', label: 'Business Registration No (BRN)' },
  { value: 'NRIC', label: 'NRIC' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'ARMY', label: 'Army ID' },
]

const PAYMENT_TERMS_OPTIONS = [
  { value: 'COD', label: 'Cash on Delivery' },
  { value: 'NET7', label: 'Net 7 Days' },
  { value: 'NET14', label: 'Net 14 Days' },
  { value: 'NET30', label: 'Net 30 Days' },
  { value: 'NET45', label: 'Net 45 Days' },
  { value: 'NET60', label: 'Net 60 Days' },
  { value: 'NET90', label: 'Net 90 Days' },
]

export default function DebtorDetail({ customerId, onBack }: DebtorDetailProps) {
  const router = useRouter()
  const params = useParams()
  const locale = params?.locale as string ?? 'en'
  const { businessId } = useActiveBusiness()
  const { user } = useUser()
  const { detail, isLoading } = useDebtorDetail(customerId)
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null)
  const [selfServiceOpen, setSelfServiceOpen] = useState(false)
  const [isSendingEmailRequest, setIsSendingEmailRequest] = useState(false)
  const tokenStatusForEmail = useQuery(
    api.functions.debtorSelfService.getTokenStatus,
    businessId ? { businessId, customerId } : "skip"
  )
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const updateCustomer = useMutation(api.functions.customers.update)

  // Form state for editing
  const [editForm, setEditForm] = useState<Record<string, string | number | undefined>>({})

  const handleBack = () => {
    if (onBack) {
      onBack()
    } else {
      router.push(`/${locale}/invoices?tab=ar&sub=debtors`)
    }
  }

  const startEditing = () => {
    if (!detail) return
    const { customer } = detail
    setEditForm({
      customerCode: customer.customerCode ?? '',
      contactPerson: customer.contactPerson ?? '',
      contactPersonPosition: customer.contactPersonPosition ?? '',
      phone: customer.phone ?? '',
      phone2: customer.phone2 ?? '',
      fax: customer.fax ?? '',
      email2: customer.email2 ?? '',
      website: customer.website ?? '',
      businessNature: customer.businessNature ?? '',
      paymentTerms: customer.paymentTerms ?? '',
      creditLimit: customer.creditLimit ?? 0,
      currencyCode: customer.currencyCode ?? '',
      tin: customer.tin ?? '',
      brn: customer.brn ?? '',
      idType: customer.idType ?? '',
      sstRegistration: customer.sstRegistration ?? '',
      addressLine1: customer.addressLine1 ?? '',
      addressLine2: customer.addressLine2 ?? '',
      addressLine3: customer.addressLine3 ?? '',
      city: customer.city ?? '',
      stateCode: customer.stateCode ?? '',
      postalCode: customer.postalCode ?? '',
      countryCode: customer.countryCode ?? '',
      notes: customer.notes ?? '',
    })
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditForm({})
  }

  const handleSave = async () => {
    if (!businessId) return
    setIsSaving(true)
    try {
      // Build update payload, only include non-empty strings
      const payload: Record<string, string | number | undefined> = {}
      for (const [key, value] of Object.entries(editForm)) {
        if (key === 'creditLimit') {
          payload[key] = typeof value === 'number' ? value : Number(value) || 0
        } else {
          payload[key] = typeof value === 'string' && value.trim() ? value.trim() : undefined
        }
      }

      await updateCustomer({
        id: customerId as Id<"customers">,
        businessId: businessId as Id<"businesses">,
        ...payload,
      })
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to update customer:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const updateField = (field: string, value: string | number) => {
    setEditForm((prev) => ({ ...prev, [field]: value }))
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="text-center py-24">
        <p className="text-muted-foreground">Debtor not found</p>
      </div>
    )
  }

  const { customer, summary, invoices, runningBalance } = detail

  return (
    <div className="space-y-6">
      {/* Header with back navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h2 className="text-xl font-semibold text-foreground">{customer.name}</h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {customer.email}
              {customer.customerCode && (
                <Badge variant="outline" className="text-xs">
                  {customer.customerCode}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing ? (
            <>
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={!customer.email || isSendingEmailRequest}
                title={!customer.email ? 'No email address on file. Add an email first.' : 'Send email requesting debtor to update their info'}
                onClick={async () => {
                  if (!businessId) return
                  // Check if email was sent within last 24 hours
                  if (tokenStatusForEmail?.emailSentAt) {
                    const hoursSince = Math.round((Date.now() - tokenStatusForEmail.emailSentAt) / (1000 * 60 * 60))
                    if (hoursSince < 24) {
                      const confirmed = window.confirm(
                        `An email was sent ${hoursSince} hour${hoursSince !== 1 ? 's' : ''} ago. Send again?`
                      )
                      if (!confirmed) return
                    }
                  }
                  setIsSendingEmailRequest(true)
                  try {
                    const res = await fetch('/api/v1/debtor-info-request', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ businessId, customerId }),
                    })
                    if (res.ok) {
                      alert('Email sent successfully!')
                    } else {
                      alert('Failed to send email. Please try again.')
                    }
                  } catch {
                    alert('Failed to send email.')
                  } finally {
                    setIsSendingEmailRequest(false)
                  }
                }}
              >
                {isSendingEmailRequest ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-1" />
                )}
                Request Info Update
              </Button>
              <Button variant="outline" size="sm" onClick={startEditing}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit Details
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={cancelEditing} disabled={isSaving}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Total Invoiced</p>
            <p className="text-lg font-semibold text-foreground">
              {formatCurrency(summary.totalInvoiced, summary.currency)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Total Paid</p>
            <p className="text-lg font-semibold text-green-600 dark:text-green-400">
              {formatCurrency(summary.totalPaid, summary.currency)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="text-lg font-semibold text-foreground">
              {formatCurrency(summary.totalOutstanding, summary.currency)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Overdue Invoices</p>
            <p className="text-lg font-semibold text-destructive">
              {summary.overdueCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Customer Particulars */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-foreground">
            Customer Particulars
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Contact Information */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Contact Person</Label>
                <Input
                  value={(editForm.contactPerson as string) ?? ''}
                  onChange={(e) => updateField('contactPerson', e.target.value)}
                  placeholder="Contact name"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Position / Title</Label>
                <Input
                  value={(editForm.contactPersonPosition as string) ?? ''}
                  onChange={(e) => updateField('contactPersonPosition', e.target.value)}
                  placeholder="e.g. Accounts Manager"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Phone (Primary)</Label>
                <Input
                  value={(editForm.phone as string) ?? ''}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="+60 12-345 6789"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Phone (Secondary)</Label>
                <Input
                  value={(editForm.phone2 as string) ?? ''}
                  onChange={(e) => updateField('phone2', e.target.value)}
                  placeholder="+60 12-345 6789"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fax</Label>
                <Input
                  value={(editForm.fax as string) ?? ''}
                  onChange={(e) => updateField('fax', e.target.value)}
                  placeholder="Fax number"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Email (Secondary)</Label>
                <Input
                  value={(editForm.email2 as string) ?? ''}
                  onChange={(e) => updateField('email2', e.target.value)}
                  placeholder="secondary@email.com"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Website</Label>
                <Input
                  value={(editForm.website as string) ?? ''}
                  onChange={(e) => updateField('website', e.target.value)}
                  placeholder="https://example.com"
                />
              </div>

              {/* Business Information */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Customer Code</Label>
                <Input
                  value={(editForm.customerCode as string) ?? ''}
                  onChange={(e) => updateField('customerCode', e.target.value)}
                  placeholder="D-001"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Business Nature</Label>
                <Input
                  value={(editForm.businessNature as string) ?? ''}
                  onChange={(e) => updateField('businessNature', e.target.value)}
                  placeholder="e.g. Trading, Manufacturing"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Default Currency</Label>
                <Input
                  value={(editForm.currencyCode as string) ?? ''}
                  onChange={(e) => updateField('currencyCode', e.target.value.toUpperCase())}
                  placeholder="MYR"
                  maxLength={3}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Payment Terms</Label>
                <Select
                  value={(editForm.paymentTerms as string) ?? ''}
                  onValueChange={(v) => updateField('paymentTerms', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select terms" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Credit Limit</Label>
                <Input
                  type="number"
                  value={editForm.creditLimit ?? 0}
                  onChange={(e) => updateField('creditLimit', Number(e.target.value))}
                  placeholder="0.00"
                  min={0}
                  step={100}
                />
              </div>

              {/* Tax & Registration */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">ID Type</Label>
                <Select
                  value={(editForm.idType as string) ?? ''}
                  onValueChange={(v) => updateField('idType', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select ID type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ID_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">TIN</Label>
                <Input
                  value={(editForm.tin as string) ?? ''}
                  onChange={(e) => updateField('tin', e.target.value)}
                  placeholder="Tax Identification Number"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">BRN / Registration No</Label>
                <Input
                  value={(editForm.brn as string) ?? ''}
                  onChange={(e) => updateField('brn', e.target.value)}
                  placeholder="Business Registration No"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">SST Registration</Label>
                <Input
                  value={(editForm.sstRegistration as string) ?? ''}
                  onChange={(e) => updateField('sstRegistration', e.target.value)}
                  placeholder="SST Registration No"
                />
              </div>

              {/* Address */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Address Line 1</Label>
                <Input
                  value={(editForm.addressLine1 as string) ?? ''}
                  onChange={(e) => updateField('addressLine1', e.target.value)}
                  placeholder="Street address"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Address Line 2</Label>
                <Input
                  value={(editForm.addressLine2 as string) ?? ''}
                  onChange={(e) => updateField('addressLine2', e.target.value)}
                  placeholder="Suite, floor, etc."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Address Line 3</Label>
                <Input
                  value={(editForm.addressLine3 as string) ?? ''}
                  onChange={(e) => updateField('addressLine3', e.target.value)}
                  placeholder="Area / District"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">City</Label>
                <Input
                  value={(editForm.city as string) ?? ''}
                  onChange={(e) => updateField('city', e.target.value)}
                  placeholder="City"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Postal Code</Label>
                <Input
                  value={(editForm.postalCode as string) ?? ''}
                  onChange={(e) => updateField('postalCode', e.target.value)}
                  placeholder="Postal code"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">State</Label>
                <Input
                  value={(editForm.stateCode as string) ?? ''}
                  onChange={(e) => updateField('stateCode', e.target.value)}
                  placeholder="State code"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Country</Label>
                <Input
                  value={(editForm.countryCode as string) ?? ''}
                  onChange={(e) => updateField('countryCode', e.target.value.toUpperCase())}
                  placeholder="MY"
                  maxLength={2}
                />
              </div>
              <div className="md:col-span-2 lg:col-span-3 space-y-1">
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <Input
                  value={(editForm.notes as string) ?? ''}
                  onChange={(e) => updateField('notes', e.target.value)}
                  placeholder="Internal notes about this customer"
                />
              </div>
            </div>
          ) : (
            <CustomerParticularsReadOnly customer={customer} currency={summary.currency} />
          )}
        </CardContent>
      </Card>

      {/* Statement Link */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/${locale}/invoices/debtors/${customerId}/statement`)}
        >
          <FileText className="h-4 w-4 mr-2" />
          Generate Statement
        </Button>
      </div>

      {/* Self-Service Updates & Token Management */}
      <Card className="bg-card border-border">
        <CardHeader className="cursor-pointer" onClick={() => setSelfServiceOpen(!selfServiceOpen)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-foreground">
              Self-Service Updates
            </CardTitle>
            {selfServiceOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </CardHeader>
        {selfServiceOpen && businessId && (
          <CardContent className="space-y-6">
            {/* Token Management */}
            <TokenManagement businessId={businessId} customerId={customerId} />
            {/* Change History */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-3">Change History</h4>
              <DebtorChangeLog
                businessId={businessId}
                customerId={customerId}
                userId={user?.id ?? ''}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Invoice Table */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-foreground">
            Invoice History ({invoices.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No invoices found</p>
          ) : (
            <div className="divide-y divide-border">
              {invoices.map((inv) => (
                <div key={inv._id}>
                  <div
                    className="py-3 flex items-center justify-between cursor-pointer hover:bg-muted/50 -mx-2 px-2 rounded"
                    onClick={() => setExpandedInvoice(expandedInvoice === inv._id ? null : inv._id)}
                  >
                    <div className="flex items-center gap-3">
                      {expandedInvoice === inv._id ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-foreground">{inv.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatBusinessDate(inv.issueDate)} &bull; Due {formatBusinessDate(inv.dueDate)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge className={STATUS_COLORS[inv.status] ?? 'bg-muted text-muted-foreground'}>
                        {inv.status.replace(/_/g, ' ')}
                      </Badge>
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">
                          {formatCurrency(inv.totalAmount, summary.currency)}
                        </p>
                        {inv.balanceDue > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Due: {formatCurrency(inv.balanceDue, summary.currency)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Expanded: per-invoice payments */}
                  {expandedInvoice === inv._id && inv.payments && inv.payments.length > 0 && (
                    <div className="ml-8 mb-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payments</p>
                      {inv.payments.map((pmt, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 bg-muted/30 rounded">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={pmt.type === 'reversal' ? 'destructive' : 'secondary'}
                              className="text-xs"
                            >
                              {pmt.type}
                            </Badge>
                            <span className="text-muted-foreground">{formatBusinessDate(pmt.paymentDate)}</span>
                            {pmt.paymentMethod && (
                              <span className="text-muted-foreground">&bull; {pmt.paymentMethod}</span>
                            )}
                          </div>
                          <span className="font-medium text-foreground">
                            {pmt.type === 'reversal' ? '-' : ''}{formatCurrency(pmt.allocatedAmount, summary.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Running Balance Ledger */}
      {runningBalance.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-foreground">Running Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Date</th>
                    <th className="pb-2 font-medium text-muted-foreground">Description</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Debit</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Credit</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {runningBalance.map((entry, i) => (
                    <tr key={i}>
                      <td className="py-2 text-foreground">{formatBusinessDate(entry.date)}</td>
                      <td className="py-2 text-foreground">{entry.description}</td>
                      <td className="py-2 text-right text-foreground">
                        {entry.debit > 0 ? formatCurrency(entry.debit, summary.currency) : ''}
                      </td>
                      <td className="py-2 text-right text-green-600 dark:text-green-400">
                        {entry.credit > 0 ? formatCurrency(entry.credit, summary.currency) : ''}
                      </td>
                      <td className="py-2 text-right font-medium text-foreground">
                        {formatCurrency(entry.balance, summary.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Token management sub-component
function TokenManagement({ businessId, customerId }: { businessId: string; customerId: string }) {
  const tokenStatus = useQuery(api.functions.debtorSelfService.getTokenStatus, { businessId, customerId })
  const regenerate = useMutation(api.functions.debtorSelfService.regenerateToken)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleRegenerate = async () => {
    setIsRegenerating(true)
    try {
      await regenerate({ businessId, customerId })
    } finally {
      setIsRegenerating(false)
    }
  }

  const selfServiceUrl = tokenStatus?.token
    ? `https://finance.hellogroot.com/en/debtor-update/${tokenStatus.token}`
    : null

  const handleCopy = () => {
    if (selfServiceUrl) {
      navigator.clipboard.writeText(selfServiceUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (tokenStatus === undefined) {
    return <div className="flex items-center gap-2 py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /><span className="text-sm text-muted-foreground">Loading token...</span></div>
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-foreground">Self-Service Link</h4>
      {tokenStatus ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge className={tokenStatus.isActive
              ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30'
              : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30'
            }>
              {tokenStatus.isActive ? 'Active' : 'Expired'}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Created {new Date(tokenStatus.createdAt!).toLocaleDateString()} &middot; Expires {new Date(tokenStatus.expiresAt!).toLocaleDateString()}
            </span>
          </div>
          {selfServiceUrl && (
            <div className="flex items-center gap-2">
              <code className="text-xs bg-muted px-2 py-1 rounded truncate max-w-[400px]">{selfServiceUrl}</code>
              <Button size="sm" className="bg-secondary hover:bg-secondary/80 text-secondary-foreground" onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={handleRegenerate} disabled={isRegenerating}>
              {isRegenerating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Regenerate Link
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm text-muted-foreground mb-2">No self-service link generated yet.</p>
          <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={handleRegenerate} disabled={isRegenerating}>
            {isRegenerating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Generate Link
          </Button>
        </div>
      )}
    </div>
  )
}

// Read-only display of customer particulars
function CustomerParticularsReadOnly({
  customer,
  currency,
}: {
  customer: Record<string, unknown>
  currency: string
}) {
  const fields: { label: string; value: string | undefined }[] = [
    { label: 'Customer Code', value: customer.customerCode as string },
    { label: 'Contact Person', value: customer.contactPerson as string },
    { label: 'Position', value: customer.contactPersonPosition as string },
    { label: 'Phone', value: customer.phone as string },
    { label: 'Phone (2)', value: customer.phone2 as string },
    { label: 'Fax', value: customer.fax as string },
    { label: 'Email (2)', value: customer.email2 as string },
    { label: 'Website', value: customer.website as string },
    { label: 'Business Nature', value: customer.businessNature as string },
    { label: 'Default Currency', value: customer.currencyCode as string },
    { label: 'Payment Terms', value: customer.paymentTerms as string },
    {
      label: 'Credit Limit',
      value:
        typeof customer.creditLimit === 'number' && customer.creditLimit > 0
          ? formatCurrency(customer.creditLimit as number, currency)
          : undefined,
    },
    { label: 'ID Type', value: customer.idType as string },
    { label: 'TIN', value: customer.tin as string },
    { label: 'BRN', value: customer.brn as string },
    { label: 'SST Registration', value: customer.sstRegistration as string },
  ]

  // Build address string
  const addressParts = [
    customer.addressLine1,
    customer.addressLine2,
    customer.addressLine3,
    [customer.postalCode, customer.city].filter(Boolean).join(' '),
    customer.stateCode,
    customer.countryCode,
  ].filter(Boolean) as string[]

  const filledFields = fields.filter((f) => f.value)

  if (filledFields.length === 0 && addressParts.length === 0 && !customer.notes) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No additional details recorded. Click &quot;Edit Details&quot; to add customer information.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
        {filledFields.map((f) => (
          <div key={f.label}>
            <p className="text-xs text-muted-foreground">{f.label}</p>
            <p className="text-sm text-foreground">{f.value}</p>
          </div>
        ))}
      </div>
      {addressParts.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground">Address</p>
          <p className="text-sm text-foreground">{addressParts.join(', ')}</p>
        </div>
      )}
      {typeof customer.notes === 'string' && customer.notes && (
        <div>
          <p className="text-xs text-muted-foreground">Notes</p>
          <p className="text-sm text-foreground">{customer.notes}</p>
        </div>
      )}
    </div>
  )
}
