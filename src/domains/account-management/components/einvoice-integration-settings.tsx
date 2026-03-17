'use client'

import { useState, useEffect, useCallback } from 'react'
import { useBusinessProfile } from '@/contexts/business-context'
import { useToast } from '@/components/ui/toast'
import { CheckCircle2, AlertCircle, Loader2, ChevronRight, ExternalLink, Shield, XCircle } from 'lucide-react'

export default function EInvoiceIntegrationSettings() {
  const { profile, updateProfile } = useBusinessProfile()
  const { addToast } = useToast()

  // Form state
  const [lhdnClientId, setLhdnClientId] = useState('')
  const [lhdnClientSecret, setLhdnClientSecret] = useState('')
  const [peppolParticipantId, setPeppolParticipantId] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Connection status
  const [secretExists, setSecretExists] = useState<boolean | null>(null)
  const [checkingSecret, setCheckingSecret] = useState(false)

  // Initialize from profile
  useEffect(() => {
    if (profile) {
      setLhdnClientId(profile.lhdn_client_id || '')
      setPeppolParticipantId(profile.peppol_participant_id || '')
    }
  }, [profile])

  // Check if secret exists in SSM
  const checkSecretStatus = useCallback(async () => {
    setCheckingSecret(true)
    try {
      const res = await fetch('/api/v1/account-management/businesses/lhdn-secret')
      const data = await res.json()
      if (data.success) {
        setSecretExists(data.data.exists)
      }
    } catch {
      setSecretExists(null)
    } finally {
      setCheckingSecret(false)
    }
  }, [])

  useEffect(() => {
    if (profile) {
      checkSecretStatus()
    }
  }, [profile, checkSecretStatus])

  // Save handler — validates credentials against LHDN OAuth before saving
  const handleSave = async () => {
    setIsSaving(true)
    setValidationError(null)

    try {
      // Step 1: If new credentials provided, validate them against LHDN first
      if (lhdnClientId.trim() && lhdnClientSecret.trim()) {
        const validateRes = await fetch('/api/v1/account-management/businesses/lhdn-validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: lhdnClientId.trim(),
            client_secret: lhdnClientSecret.trim(),
            tin: profile?.lhdn_tin || undefined,
          }),
        })
        const validateData = await validateRes.json()

        if (!validateData.success) {
          throw new Error(validateData.error || 'Validation request failed')
        }

        if (!validateData.data.valid) {
          setValidationError(validateData.data.error || 'Invalid credentials')
          addToast({
            type: 'error',
            title: 'Invalid LHDN credentials',
            description: validateData.data.error || 'Client ID or Secret is incorrect. Please check and try again.',
          })
          setIsSaving(false)
          return // Don't save invalid credentials
        }
      }

      // Step 2: Get CSRF token
      const csrfResponse = await fetch('/api/v1/utils/security/csrf-token')
      const csrfData = await csrfResponse.json()
      if (!csrfData.success) throw new Error('Failed to get CSRF token')

      // Step 3: Save Client ID and Peppol to Convex via profile API
      const response = await fetch('/api/v1/account-management/businesses/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfData.data.csrfToken,
        },
        body: JSON.stringify({
          lhdn_client_id: lhdnClientId.trim(),
          peppol_participant_id: peppolParticipantId.trim(),
        }),
      })

      const result = await response.json()
      if (!result.success) throw new Error(result.error || 'Failed to save')

      // Step 4: Save secret to SSM if provided
      if (lhdnClientSecret.trim()) {
        const ssmRes = await fetch('/api/v1/account-management/businesses/lhdn-secret', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_secret: lhdnClientSecret.trim() }),
        })
        const ssmData = await ssmRes.json()
        if (ssmData.success) {
          setSecretExists(true)
          setLhdnClientSecret('') // Clear input after save
        } else {
          throw new Error(ssmData.error || 'Failed to save secret')
        }
      }

      updateProfile(result.data)

      addToast({
        type: 'success',
        title: 'Connected to LHDN MyInvois',
        description: 'Credentials validated and saved. Polling will start within 5 minutes.',
      })
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Failed to save',
        description: error instanceof Error ? error.message : 'Unable to save integration settings',
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Connection status
  const isConnected = !!(lhdnClientId.trim() && secretExists)

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">LHDN MyInvois Integration</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your LHDN MyInvois API credentials and Peppol network settings
        </p>
      </div>

      {/* Connection Status */}
      <div className={`flex items-center gap-3 rounded-lg border p-4 ${
        isConnected
          ? 'bg-green-500/10 border-green-500/30'
          : 'bg-muted/50 border-border'
      }`}>
        {checkingSecret ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : isConnected ? (
          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
        ) : (
          <AlertCircle className="w-5 h-5 text-muted-foreground" />
        )}
        <div className="flex-1">
          <p className={`text-sm font-medium ${isConnected ? 'text-green-700 dark:text-green-300' : 'text-foreground'}`}>
            {isConnected ? 'Connected to LHDN MyInvois' : 'Not connected'}
          </p>
          <p className="text-xs text-muted-foreground">
            {isConnected
              ? 'E-invoices are being polled automatically every 5 minutes.'
              : 'Enter your Client ID and Secret below to connect.'}
          </p>
        </div>
        {isConnected && (
          <span className="inline-flex items-center rounded-full bg-green-500/20 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-300">
            Active
          </span>
        )}
      </div>

      {/* Setup Guide */}
      <details className="group bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <summary className="cursor-pointer p-4 flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200">
          <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
          How to get your LHDN credentials
          <a href="https://sdk.myinvois.hasil.gov.my/faq/" target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1">
            LHDN FAQ <ExternalLink className="w-3 h-3" />
          </a>
        </summary>
        <div className="px-4 pb-4 space-y-3 text-xs text-muted-foreground">
          <div className="bg-muted/50 border border-border rounded p-2.5">
            <p className="font-medium text-foreground mb-1.5">Portal URLs:</p>
            <ul className="space-y-1">
              <li><strong>Production:</strong>{' '}<a href="https://mytax.hasil.gov.my" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">mytax.hasil.gov.my</a> → MyInvois (live)</li>
              <li><strong>Sandbox:</strong>{' '}<a href="https://preprod-mytax.hasil.gov.my" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">preprod-mytax.hasil.gov.my</a> → Preprod (testing)</li>
            </ul>
          </div>

          <div>
            <p className="font-medium text-foreground">Step 1: Access Taxpayer Profile</p>
            <ul className="list-disc list-inside ml-2 mt-1 space-y-0.5">
              <li>Log in to the MyInvois Portal</li>
              <li>Top-right profile dropdown → <strong>&quot;View Taxpayer Profile&quot;</strong></li>
            </ul>
          </div>

          <div>
            <p className="font-medium text-foreground">Step 2: Register ERP</p>
            <ul className="list-disc list-inside ml-2 mt-1 space-y-0.5">
              <li>Scroll to <strong>Representatives</strong> → <strong>ERP</strong> tab</li>
              <li>Click <strong>&quot;Register ERP&quot;</strong> → Enter name &quot;Groot Finance&quot; → <strong>Save</strong></li>
            </ul>
          </div>

          <div>
            <p className="font-medium text-foreground">Step 3: Copy Credentials</p>
            <ul className="list-disc list-inside ml-2 mt-1 space-y-0.5">
              <li>Dialog shows: <strong>Client ID</strong> + <strong>Client Secret 1</strong> + <strong>Client Secret 2</strong></li>
              <li>Copy all values immediately — <strong>secrets shown only once!</strong></li>
              <li>Tick confirm checkbox → Click <strong>&quot;Done&quot;</strong></li>
              <li>Enter Client ID and either Secret below</li>
            </ul>
          </div>

          <div className="bg-muted/50 border border-border rounded p-2">
            <p className="text-xs text-foreground">
              <strong>Two secrets?</strong> Both are valid — enter either one. Rotate via ERP tab → &quot;Regenerate Secrets&quot;.
            </p>
          </div>
        </div>
      </details>

      {/* Form Fields */}
      <div className="space-y-4">
        {/* LHDN Client ID */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
            LHDN Client ID
            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">Required</span>
          </label>
          <input
            type="text"
            value={lhdnClientId}
            onChange={(e) => setLhdnClientId(e.target.value)}
            placeholder="e.g., 3cec36d3-bf94-4e82-a4ca-b2614e56c77e"
            className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          />
          <p className="text-xs text-muted-foreground mt-1">
            From MyInvois portal → Taxpayer Profile → ERP tab
          </p>
        </div>

        {/* LHDN Client Secret */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
            LHDN Client Secret (Secret 1 or 2)
            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">Required</span>
          </label>
          {secretExists && !lhdnClientSecret ? (
            <div className="w-full bg-input border border-input rounded-md px-3 py-2 flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-muted-foreground font-mono text-sm">••••••••••••••••••••••••</span>
              <button
                type="button"
                onClick={() => setLhdnClientSecret(' ')}
                className="ml-auto text-xs text-primary hover:text-primary/80"
              >
                Update secret
              </button>
            </div>
          ) : (
            <input
              type="password"
              value={lhdnClientSecret}
              onChange={(e) => setLhdnClientSecret(e.target.value)}
              placeholder="Enter either Client Secret 1 or 2..."
              className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Stored securely (encrypted at rest). Required for automatic e-invoice retrieval.
          </p>
          {validationError && (
            <div className="flex items-center gap-2 mt-2 text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">
              <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span><strong>Invalid credentials:</strong> {validationError}</span>
            </div>
          )}
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
          <p className="text-xs text-muted-foreground mt-1">
            Optional — for Peppol e-invoicing network
          </p>
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
            'Save Integration Settings'
          )}
        </button>
      </div>
    </div>
  )
}
