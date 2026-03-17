'use client'

import BusinessProfileForm from './business-profile-form'
import EInvoiceComplianceForm from './einvoice-compliance-form'
import CurrencyPreferences from './currency-preferences'

interface BusinessProfileSettingsProps {
  section?: 'profile' | 'einvoice' | 'currency'
}

/**
 * Orchestrator component for Business settings sub-tabs.
 *
 * All 3 sub-components stay mounted at all times (using `hidden` attribute)
 * so form state is preserved when switching between Business sub-tabs.
 * Unsaved changes warnings only fire on page-level navigation, not sub-tab switches.
 */
export default function BusinessProfileSettings({ section }: BusinessProfileSettingsProps) {
  const showAll = !section

  return (
    <div>
      <div hidden={!showAll && section !== 'profile'}>
        <BusinessProfileForm />
      </div>
      <div hidden={!showAll && section !== 'einvoice'}>
        <EInvoiceComplianceForm />
      </div>
      <div hidden={!showAll && section !== 'currency'}>
        <CurrencyPreferences />
      </div>
    </div>
  )
}
