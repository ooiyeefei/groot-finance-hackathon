'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useBusinessProfile } from '@/contexts/business-context'
import { useToast } from '@/components/ui/toast'
import { Loader2, AlertCircle } from 'lucide-react'
import { MSIC_CODES } from '@/lib/data/msic-codes'

export default function EInvoiceComplianceSettings() {
  const { profile, updateProfile } = useBusinessProfile()
  const { addToast } = useToast()

  // Form state
  const [lhdnTin, setLhdnTin] = useState('')
  const [businessRegistrationNumber, setBusinessRegistrationNumber] = useState('')
  const [sstRegistrationNumber, setSstRegistrationNumber] = useState('')
  const [msicCode, setMsicCode] = useState('')
  const [msicDescription, setMsicDescription] = useState('')
  const [autoSelfBillExemptVendors, setAutoSelfBillExemptVendors] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // MSIC combobox
  const [msicSearch, setMsicSearch] = useState('')
  const [msicDropdownOpen, setMsicDropdownOpen] = useState(false)
  const msicDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (profile) {
      setLhdnTin(profile.lhdn_tin || '')
      setBusinessRegistrationNumber(profile.business_registration_number || '')
      setSstRegistrationNumber(profile.sst_registration_number || '')
      setMsicCode(profile.msic_code || '')
      setMsicDescription(profile.msic_description || '')
      setAutoSelfBillExemptVendors(profile.auto_self_bill_exempt_vendors ?? false)
    }
  }, [profile])

  const filteredMsicCodes = useMemo(() => {
    if (!msicSearch.trim()) return MSIC_CODES.slice(0, 50)
    const q = msicSearch.toLowerCase()
    return MSIC_CODES.filter(
      (m) => m.code.includes(q) || m.description.toLowerCase().includes(q)
    ).slice(0, 50)
  }, [msicSearch])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (msicDropdownRef.current && !msicDropdownRef.current.contains(event.target as Node)) {
        setMsicDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSave = async () => {
    setIsSaving(true)

    try {
      // Get CSRF token
      const csrfResponse = await fetch('/api/v1/system/csrf-token')
      const csrfData = await csrfResponse.json()
      if (!csrfData.success) throw new Error('Failed to get CSRF token')

      const response = await fetch('/api/v1/account-management/businesses/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfData.data.csrfToken,
        },
        body: JSON.stringify({
          lhdn_tin: lhdnTin.trim(),
          business_registration_number: businessRegistrationNumber.trim(),
          sst_registration_number: sstRegistrationNumber.trim(),
          msic_code: msicCode.trim(),
          msic_description: msicDescription.trim(),
          auto_self_bill_exempt_vendors: autoSelfBillExemptVendors,
        }),
      })

      const result = await response.json()
      if (!result.success) throw new Error(result.error || 'Failed to save')

      updateProfile(result.data)

      addToast({
        type: 'success',
        title: 'Compliance settings saved',
        description: 'Tax and business registration details updated.',
      })
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Failed to save',
        description: error instanceof Error ? error.message : 'Unable to save compliance settings',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Compliance Information</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Mandatory tax and business registration details for LHDN e-invoice compliance
        </p>
      </div>

      {/* Info */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Required for LHDN e-invoicing</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li><strong>TIN</strong>: Tax Identification Number from LHDN</li>
              <li><strong>BRN</strong>: Business Registration Number from SSM</li>
              <li><strong>MSIC Code</strong>: Your business activity classification</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Form Fields */}
      <div className="space-y-4">
        {/* TIN */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
            LHDN TIN (Tax Identification Number)
            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">Required</span>
          </label>
          <input
            type="text"
            value={lhdnTin}
            onChange={(e) => setLhdnTin(e.target.value)}
            placeholder="e.g., IG24210777100"
            className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          />
        </div>

        {/* BRN + SST side by side */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              Business Registration Number (BRN)
              <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">Required</span>
            </label>
            <input
              type="text"
              value={businessRegistrationNumber}
              onChange={(e) => setBusinessRegistrationNumber(e.target.value)}
              placeholder="e.g., 202001234567"
              className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              SST Registration Number
            </label>
            <input
              type="text"
              value={sstRegistrationNumber}
              onChange={(e) => setSstRegistrationNumber(e.target.value)}
              placeholder="e.g., B10-1234-56789012"
              className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>
        </div>

        {/* MSIC Code */}
        <div ref={msicDropdownRef} className="relative">
          <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
            MSIC Code (Business Activity)
            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">Required</span>
          </label>
          <input
            type="text"
            value={msicSearch || (msicCode ? `${msicCode} - ${msicDescription}` : '')}
            onChange={(e) => {
              setMsicSearch(e.target.value)
              setMsicDropdownOpen(true)
            }}
            onFocus={() => setMsicDropdownOpen(true)}
            placeholder="Search by code or description..."
            className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          />
          {msicDropdownOpen && filteredMsicCodes.length > 0 && (
            <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-card border border-border rounded-md shadow-lg">
              {filteredMsicCodes.map((m) => (
                <button
                  key={m.code}
                  type="button"
                  onClick={() => {
                    setMsicCode(m.code)
                    setMsicDescription(m.description)
                    setMsicSearch('')
                    setMsicDropdownOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm text-foreground border-b border-border last:border-0"
                >
                  <span className="font-mono text-xs text-primary">{m.code}</span>
                  <span className="ml-2 text-muted-foreground">{m.description}</span>
                </button>
              ))}
            </div>
          )}
          {msicCode && msicDescription && (
            <p className="text-xs text-muted-foreground mt-1">
              Selected: {msicCode} — {msicDescription}
            </p>
          )}
        </div>

        {/* Auto Self-Bill */}
        <div className="border-t border-border pt-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSelfBillExemptVendors}
              onChange={(e) => setAutoSelfBillExemptVendors(e.target.checked)}
              className="mt-0.5 rounded border-border"
            />
            <div>
              <p className="text-sm font-medium text-foreground">
                Auto-generate self-billed e-invoices for exempt vendors
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                When enabled, self-billed e-invoices will be automatically generated for approved expenses and AP invoices from LHDN-exempt vendors.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Compliance Settings'
          )}
        </button>
      </div>
    </div>
  )
}
