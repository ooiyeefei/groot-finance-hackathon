'use client'

import { useState } from 'react'
import { Eye, EyeOff, Building2 } from 'lucide-react'

interface BankDetails {
  bankName?: string
  accountNumber?: string
  routingCode?: string
  accountHolderName?: string
}

interface VendorBankDetailsProps {
  bankDetails?: BankDetails
}

function maskValue(value: string | undefined): string {
  if (!value || value.length <= 4) return value ?? '—'
  return '••••' + value.slice(-4)
}

export default function VendorBankDetails({ bankDetails }: VendorBankDetailsProps) {
  const [revealed, setRevealed] = useState(false)

  if (!bankDetails || (!bankDetails.bankName && !bankDetails.accountNumber)) {
    return (
      <div className="text-sm text-muted-foreground italic">
        No bank details on file
      </div>
    )
  }

  const fields = [
    { label: 'Bank', value: bankDetails.bankName, sensitive: false },
    { label: 'Account Holder', value: bankDetails.accountHolderName, sensitive: false },
    { label: 'Account Number', value: bankDetails.accountNumber, sensitive: true },
    { label: 'Routing Code', value: bankDetails.routingCode, sensitive: true },
  ].filter((f) => f.value)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Building2 className="w-3.5 h-3.5" />
          Bank Details
        </div>
        <button
          onClick={() => setRevealed(!revealed)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      </div>
      <div className="bg-muted rounded-md p-3 space-y-1.5">
        {fields.map((field) => (
          <div key={field.label} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{field.label}</span>
            <span className="text-foreground font-mono">
              {field.sensitive && !revealed ? maskValue(field.value) : (field.value ?? '—')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
