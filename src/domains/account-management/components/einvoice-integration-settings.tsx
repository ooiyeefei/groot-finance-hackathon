'use client'

import { AlertCircle } from 'lucide-react'

export default function EInvoiceIntegrationSettings() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-foreground">LHDN MyInvois Integration</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your LHDN MyInvois API credentials and Peppol network settings
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-foreground">
            <p className="font-medium mb-1">How to get your LHDN credentials</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Log in to your <a href="https://myinvois.hasil.gov.my" target="_blank" rel="noopener noreferrer" className="text-primary underline">MyInvois portal</a></li>
              <li>Navigate to <strong>Settings → Manage Applications</strong></li>
              <li>Create a new application or select an existing one</li>
              <li>Copy the Client ID and Client Secret</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Content Placeholder */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-6 text-center">
        <p className="text-sm text-muted-foreground">
          ⚠️ This section is being refactored. The integration settings form will be extracted from Business Settings here.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          <strong>Temporary workaround</strong>: Use Business → e-Invoice Settings section for now
        </p>
      </div>

      {/* TODO: Extract LHDN Client ID, Client Secret, Peppol ID fields from business-profile-settings.tsx */}
      {/* This placeholder ensures the UI doesn't break during incremental refactoring */}
    </div>
  )
}
