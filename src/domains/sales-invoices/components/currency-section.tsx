'use client'

import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SUPPORTED_CURRENCIES, type TaxMode } from '../types'

interface CurrencySectionProps {
  currency: string
  onCurrencyChange: (currency: string) => void
  taxMode: TaxMode
  onTaxModeChange: (mode: TaxMode) => void
  hasLineItems: boolean
}

export function CurrencySection({
  currency,
  onCurrencyChange,
  taxMode,
  onTaxModeChange,
  hasLineItems,
}: CurrencySectionProps) {
  const [showWarning, setShowWarning] = useState(false)
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null)

  const handleCurrencyChange = (newCurrency: string) => {
    if (hasLineItems && newCurrency !== currency) {
      setPendingCurrency(newCurrency)
      setShowWarning(true)
    } else {
      onCurrencyChange(newCurrency)
    }
  }

  const confirmCurrencyChange = () => {
    if (pendingCurrency) {
      onCurrencyChange(pendingCurrency)
    }
    setShowWarning(false)
    setPendingCurrency(null)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Currency */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Currency</label>
          <Select value={currency} onValueChange={handleCurrencyChange}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tax Mode */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Tax Mode</label>
          <Select value={taxMode} onValueChange={(v) => onTaxModeChange(v as TaxMode)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exclusive">Tax Exclusive</SelectItem>
              <SelectItem value="inclusive">Tax Inclusive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Currency change warning */}
      {showWarning && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            Changing currency may affect line item prices. Continue?
          </p>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={confirmCurrencyChange}
              className="px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Change currency
            </button>
            <button
              type="button"
              onClick={() => { setShowWarning(false); setPendingCurrency(null) }}
              className="px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
