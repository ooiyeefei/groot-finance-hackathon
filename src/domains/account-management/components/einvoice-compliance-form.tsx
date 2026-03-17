'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { FileText, Mail, Bell } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { useBusinessProfile } from '@/contexts/business-context'
import { useRegisterUnsavedChanges } from '@/components/providers/unsaved-changes-provider'
import { MSIC_CODES } from '@/lib/data/msic-codes'

export default function EInvoiceComplianceForm() {
  const { profile, isLoading, updateProfile } = useBusinessProfile()
  const { addToast } = useToast()
  const [isUpdating, setIsUpdating] = useState(false)

  // e-Invoice field state
  const [lhdnTin, setLhdnTin] = useState('')
  const [businessRegistrationNumber, setBusinessRegistrationNumber] = useState('')
  const [msicCode, setMsicCode] = useState('')
  const [msicDescription, setMsicDescription] = useState('')
  const [sstRegistrationNumber, setSstRegistrationNumber] = useState('')
  const [lhdnClientId, setLhdnClientId] = useState('')
  const [lhdnClientSecret, setLhdnClientSecret] = useState('')
  const [peppolParticipantId, setPeppolParticipantId] = useState('')
  const [autoSelfBillExemptVendors, setAutoSelfBillExemptVendors] = useState(false)

  // Notification settings
  const [autoDelivery, setAutoDelivery] = useState(true)
  const [buyerNotifications, setBuyerNotifications] = useState(true)

  // MSIC combobox state
  const [msicSearch, setMsicSearch] = useState('')
  const [msicDropdownOpen, setMsicDropdownOpen] = useState(false)
  const msicDropdownRef = useRef<HTMLDivElement>(null)

  // Track initial values for dirty state
  const [initialValues, setInitialValues] = useState({
    lhdnTin: '',
    businessRegistrationNumber: '',
    msicCode: '',
    msicDescription: '',
    sstRegistrationNumber: '',
    lhdnClientId: '',
    lhdnClientSecret: '',
    peppolParticipantId: '',
  })

  // Initialize from profile
  useEffect(() => {
    if (profile) {
      const initial = {
        lhdnTin: profile.lhdn_tin || '',
        businessRegistrationNumber: profile.business_registration_number || '',
        msicCode: profile.msic_code || '',
        msicDescription: profile.msic_description || '',
        sstRegistrationNumber: profile.sst_registration_number || '',
        lhdnClientId: profile.lhdn_client_id || '',
        lhdnClientSecret: '',
        peppolParticipantId: profile.peppol_participant_id || '',
      }
      setInitialValues(initial)
      setLhdnTin(initial.lhdnTin)
      setBusinessRegistrationNumber(initial.businessRegistrationNumber)
      setMsicCode(initial.msicCode)
      setMsicDescription(initial.msicDescription)
      setSstRegistrationNumber(initial.sstRegistrationNumber)
      setLhdnClientId(initial.lhdnClientId)
      setLhdnClientSecret(initial.lhdnClientSecret)
      setPeppolParticipantId(initial.peppolParticipantId)
      setAutoSelfBillExemptVendors(profile.auto_self_bill_exempt_vendors === true)
      // Notification settings
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = profile as any
      setAutoDelivery(p.einvoice_auto_delivery !== false)
      setBuyerNotifications(p.einvoice_buyer_notifications !== false)
    }
  }, [profile])

  // Dirty state
  const isDirty = useMemo(() => {
    return lhdnTin !== initialValues.lhdnTin ||
      businessRegistrationNumber !== initialValues.businessRegistrationNumber ||
      msicCode !== initialValues.msicCode ||
      msicDescription !== initialValues.msicDescription ||
      sstRegistrationNumber !== initialValues.sstRegistrationNumber ||
      lhdnClientId !== initialValues.lhdnClientId ||
      lhdnClientSecret !== initialValues.lhdnClientSecret ||
      peppolParticipantId !== initialValues.peppolParticipantId
  }, [lhdnTin, businessRegistrationNumber, msicCode, msicDescription,
      sstRegistrationNumber, lhdnClientId, lhdnClientSecret, peppolParticipantId,
      initialValues])

  useRegisterUnsavedChanges('einvoice-compliance-form', isDirty)

  // MSIC search filtering
  const filteredMsicCodes = useMemo(() => {
    if (!msicSearch.trim()) return MSIC_CODES.slice(0, 50)
    const q = msicSearch.toLowerCase()
    return MSIC_CODES.filter(
      (m) => m.code.includes(q) || m.description.toLowerCase().includes(q)
    ).slice(0, 50)
  }, [msicSearch])

  // Close MSIC dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (msicDropdownRef.current && !msicDropdownRef.current.contains(event.target as Node)) {
        setMsicDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMsicSelect = (code: string, description: string) => {
    setMsicCode(code)
    setMsicDescription(description)
    setMsicSearch('')
    setMsicDropdownOpen(false)
  }

  const updateEinvoiceSettings = async () => {
    if (!profile) return

    try {
      setIsUpdating(true)

      const csrfResponse = await fetch('/api/v1/utils/security/csrf-token')
      if (!csrfResponse.ok) throw new Error('Failed to get CSRF token')
      const csrfData = await csrfResponse.json()
      if (!csrfData.success) throw new Error(csrfData.error || 'Failed to get CSRF token')

      const response = await fetch('/api/v1/account-management/businesses/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfData.data.csrfToken
        },
        body: JSON.stringify({
          lhdn_tin: lhdnTin.trim(),
          business_registration_number: businessRegistrationNumber.trim(),
          msic_code: msicCode.trim(),
          msic_description: msicDescription.trim(),
          sst_registration_number: sstRegistrationNumber.trim(),
          lhdn_client_id: lhdnClientId.trim(),
          peppol_participant_id: peppolParticipantId.trim(),
          auto_self_bill_exempt_vendors: autoSelfBillExemptVendors,
          einvoice_auto_delivery: autoDelivery,
          einvoice_buyer_notifications: buyerNotifications,
        })
      })

      const result = await response.json()

      if (result.success) {
        // Save LHDN client secret to AWS SSM Parameter Store (separate from Convex)
        if (lhdnClientSecret.trim() && lhdnClientSecret !== initialValues.lhdnClientSecret) {
          try {
            await fetch('/api/v1/account-management/businesses/lhdn-secret', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ client_secret: lhdnClientSecret.trim() }),
            })
          } catch (ssmError) {
            console.error('[e-Invoice Settings] Failed to save LHDN secret to SSM:', ssmError)
            addToast({
              type: 'error',
              title: 'Client Secret save failed',
              description: 'e-Invoice fields saved, but LHDN Client Secret failed to save. Please retry.'
            })
          }
        }

        updateProfile(result.data)
        setInitialValues({
          lhdnTin: lhdnTin.trim(),
          businessRegistrationNumber: businessRegistrationNumber.trim(),
          msicCode: msicCode.trim(),
          msicDescription: msicDescription.trim(),
          sstRegistrationNumber: sstRegistrationNumber.trim(),
          lhdnClientId: lhdnClientId.trim(),
          lhdnClientSecret: lhdnClientSecret.trim(),
          peppolParticipantId: peppolParticipantId.trim(),
        })
        addToast({
          type: 'success',
          title: 'e-Invoice settings updated',
          description: 'Your compliance details have been saved'
        })
      } else {
        addToast({
          type: 'error',
          title: 'Failed to update e-Invoice settings',
          description: result.error || 'Unable to update compliance details'
        })
      }
    } catch {
      addToast({
        type: 'error',
        title: 'Error updating e-Invoice settings',
        description: 'Unable to connect to server'
      })
    } finally {
      setIsUpdating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-6 bg-muted rounded w-48 mb-4"></div>
        <div className="space-y-4">
          <div className="h-10 bg-muted rounded"></div>
          <div className="h-10 bg-muted rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center space-x-3 mb-6">
        <FileText className="w-6 h-6 text-primary" />
        <h2 className="text-xl font-semibold text-foreground">e-Invoice Compliance</h2>
      </div>
      <div className="space-y-4">
        {/* LHDN TIN */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            LHDN TIN (Tax Identification Number)
          </label>
          <input
            type="text"
            value={lhdnTin}
            onChange={(e) => setLhdnTin(e.target.value)}
            placeholder="C21638015020"
            className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          />
        </div>

        {/* BRN + SST side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Business Registration Number (BRN)
            </label>
            <input
              type="text"
              value={businessRegistrationNumber}
              onChange={(e) => setBusinessRegistrationNumber(e.target.value)}
              placeholder="e.g. 202001234567"
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
              placeholder="e.g. B10-1234-56789012"
              className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>
        </div>

        {/* MSIC Code Combobox */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            MSIC Code (Business Activity)
          </label>
          <div className="relative" ref={msicDropdownRef}>
            <input
              type="text"
              value={msicDropdownOpen ? msicSearch : (msicCode ? `${msicCode} - ${msicDescription}` : '')}
              onChange={(e) => {
                setMsicSearch(e.target.value)
                setMsicDropdownOpen(true)
              }}
              onFocus={() => {
                setMsicSearch('')
                setMsicDropdownOpen(true)
              }}
              placeholder="Search by code or activity description..."
              className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
            {msicDropdownOpen && (
              <div className="absolute z-20 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredMsicCodes.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-muted-foreground">
                    No matching MSIC codes. You can enter a custom code below.
                  </div>
                ) : (
                  filteredMsicCodes.map((m) => (
                    <button
                      key={m.code}
                      type="button"
                      onClick={() => handleMsicSelect(m.code, m.description)}
                      className="w-full text-left px-4 py-2 hover:bg-muted/50 transition-colors text-sm border-b border-border last:border-b-0"
                    >
                      <span className="font-medium text-foreground">{m.code}</span>
                      <span className="text-muted-foreground ml-2">{m.description}</span>
                    </button>
                  ))
                )}
                {msicSearch.trim() && /^\d{5}$/.test(msicSearch.trim()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setMsicCode(msicSearch.trim())
                      setMsicDescription('')
                      setMsicSearch('')
                      setMsicDropdownOpen(false)
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-muted/50 transition-colors text-sm text-primary border-t border-border"
                  >
                    Use custom code: {msicSearch.trim()}
                  </button>
                )}
              </div>
            )}
          </div>
          {msicCode && msicDescription && (
            <p className="text-xs text-muted-foreground mt-1">
              Selected: {msicCode} — {msicDescription}
            </p>
          )}
        </div>

        {/* LHDN Client ID */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            LHDN Client ID
          </label>
          <input
            type="text"
            value={lhdnClientId}
            onChange={(e) => setLhdnClientId(e.target.value)}
            placeholder="LHDN MyInvois Client ID"
            className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          />
          <p className="text-xs text-muted-foreground mt-1">
            From your MyInvois portal &gt; Manage Application.
          </p>
        </div>

        {/* LHDN Client Secret */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            LHDN Client Secret
          </label>
          <input
            type="password"
            value={lhdnClientSecret}
            onChange={(e) => setLhdnClientSecret(e.target.value)}
            placeholder="LHDN MyInvois Client Secret"
            className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Stored securely in AWS. Required for automatic e-invoice retrieval.
          </p>
        </div>

        {/* Peppol Participant ID */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Peppol Participant ID
          </label>
          <input
            type="text"
            value={peppolParticipantId}
            onChange={(e) => setPeppolParticipantId(e.target.value)}
            placeholder="0195:T08GA1234A"
            className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          />
        </div>

        {/* Auto Self-Bill Setting */}
        <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
          <input
            type="checkbox"
            id="autoSelfBill"
            checked={autoSelfBillExemptVendors}
            onChange={(e) => setAutoSelfBillExemptVendors(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-ring"
          />
          <div>
            <label htmlFor="autoSelfBill" className="text-sm font-medium text-foreground cursor-pointer">
              Auto-generate self-billed e-invoices for exempt vendors
            </label>
            <p className="text-xs text-muted-foreground mt-1">
              When enabled, self-billed e-invoices will be automatically generated for approved expenses and AP invoices from LHDN-exempt vendors.
            </p>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="border-t border-border pt-4 mt-2">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">E-Invoice Notifications</span>
          </div>
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground">
                  Auto-deliver validated e-invoices to buyers
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically email the LHDN-validated PDF to the buyer after successful validation
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoDelivery}
                onClick={() => setAutoDelivery(!autoDelivery)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer ${autoDelivery ? 'bg-primary' : 'bg-muted'}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${autoDelivery ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </label>
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground">
                  Send buyer notification emails
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Notify buyers via email on validation, cancellation, and rejection events
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={buyerNotifications}
                onClick={() => setBuyerNotifications(!buyerNotifications)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer ${buyerNotifications ? 'bg-primary' : 'bg-muted'}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${buyerNotifications ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={updateEinvoiceSettings}
            disabled={isUpdating}
            className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed text-primary-foreground rounded-md font-medium transition-colors"
          >
            {isUpdating ? (
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
            ) : (
              'Save Details'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
