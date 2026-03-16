'use client'

import { AlertCircle } from 'lucide-react'

export default function EInvoiceComplianceSettings() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-foreground">Compliance Information</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Mandatory tax and business registration details for LHDN e-invoice compliance
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-foreground">
            <p className="font-medium mb-1">Required for LHDN e-invoicing</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li><strong>TIN</strong>: Your Tax Identification Number from LHDN</li>
              <li><strong>BRN</strong>: Business Registration Number from SSM</li>
              <li><strong>SST</strong>: Sales and Service Tax registration (if applicable)</li>
              <li><strong>MSIC Code</strong>: Malaysia Standard Industrial Classification for your business activity</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Content Placeholder */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-6 text-center">
        <p className="text-sm text-muted-foreground">
          ⚠️ This section is being refactored. The compliance fields form will be extracted from Business Settings here.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          <strong>Temporary workaround</strong>: Use Business → e-Invoice Settings section for now
        </p>
      </div>

      {/* TODO: Extract TIN, BRN, SST, MSIC, Auto self-bill toggle from business-profile-settings.tsx */}
      {/* This placeholder ensures the UI doesn't break during incremental refactoring */}
    </div>
  )
}
