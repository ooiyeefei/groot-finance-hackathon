'use client'

import { useState, useEffect } from 'react'
import { ArrowRightLeft, RefreshCw } from 'lucide-react'
import { SupportedCurrency } from '@/domains/accounting-entries/types'

interface CurrencyConverterProps {
  amount: number
  fromCurrency: SupportedCurrency
  toCurrency: SupportedCurrency
  onConvert?: (convertedAmount: number, exchangeRate: number) => void
  className?: string
  showControls?: boolean
  formatDisplay?: boolean
}

interface ConversionResult {
  converted_amount: number
  exchange_rate: number
  rate_source: string
}

export default function CurrencyConverter({
  amount,
  fromCurrency,
  toCurrency,
  onConvert,
  className = '',
  showControls = false,
  formatDisplay = true
}: CurrencyConverterProps) {
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null)
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const convertCurrency = async () => {
    // If same currency, no conversion needed
    if (fromCurrency === toCurrency) {
      setConvertedAmount(amount)
      setExchangeRate(1)
      setLastUpdated(new Date())
      onConvert?.(amount, 1)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/v1/utils/currency/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          from: fromCurrency,
          to: toCurrency
        })
      })

      if (!response.ok) {
        throw new Error('Failed to convert currency')
      }

      const result: ConversionResult = await response.json()
      setConvertedAmount(result.converted_amount)
      setExchangeRate(result.exchange_rate)
      setLastUpdated(new Date())
      onConvert?.(result.converted_amount, result.exchange_rate)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed')
      setConvertedAmount(null)
      setExchangeRate(null)
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-convert when props change
  useEffect(() => {
    if (amount > 0) {
      convertCurrency()
    }
  }, [amount, fromCurrency, toCurrency])

  const formatCurrency = (value: number, currency: SupportedCurrency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)
  }

  const formatCompactCurrency = (value: number, currency: SupportedCurrency) => {
    if (value >= 1000000) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        notation: 'compact',
        compactDisplay: 'short'
      }).format(value)
    }
    return formatCurrency(value, currency)
  }

  if (error) {
    return (
      <div className={`text-red-400 text-sm ${className}`}>
        <span>Conversion error</span>
        {showControls && (
          <button
            onClick={convertCurrency}
            className="ml-2 text-red-300 hover:text-red-200"
            title="Retry conversion"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={`text-gray-400 text-sm animate-pulse ${className}`}>
        <span>Converting...</span>
      </div>
    )
  }

  if (convertedAmount === null) {
    return (
      <div className={`text-gray-500 text-sm ${className}`}>
        <span>-</span>
      </div>
    )
  }

  const displayAmount = formatDisplay ? formatCompactCurrency(convertedAmount, toCurrency) : convertedAmount.toFixed(2)

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="font-medium text-white">
          {displayAmount}
        </span>
        {showControls && (
          <button
            onClick={convertCurrency}
            disabled={isLoading}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh exchange rate"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>
      
      {exchangeRate && exchangeRate !== 1 && (
        <div className="text-xs text-gray-400 space-y-0.5">
          <div className="flex items-center gap-1">
            <span>{formatCurrency(amount, fromCurrency)}</span>
            <ArrowRightLeft className="w-3 h-3" />
            <span>{displayAmount}</span>
          </div>
          <div>
            Rate: 1 {fromCurrency} = {exchangeRate.toFixed(6)} {toCurrency}
          </div>
          {lastUpdated && (
            <div>
              Updated: {lastUpdated.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Utility function for simple conversions without component
export async function convertCurrencyAmount(
  amount: number,
  from: SupportedCurrency,
  to: SupportedCurrency
): Promise<{ convertedAmount: number; exchangeRate: number } | null> {
  if (from === to) {
    return { convertedAmount: amount, exchangeRate: 1 }
  }

  try {
    const response = await fetch('/api/v1/utils/currency/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, from, to })
    })

    if (!response.ok) {
      return null
    }

    const result: ConversionResult = await response.json()
    return {
      convertedAmount: result.converted_amount,
      exchangeRate: result.exchange_rate
    }
  } catch {
    return null
  }
}