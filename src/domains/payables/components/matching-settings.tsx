'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, Settings } from 'lucide-react'
import { useMatchingSettings } from '../hooks/use-matching-settings'

interface MatchingSettingsProps {
  isOpen: boolean
  onClose: () => void
}

export default function MatchingSettings({ isOpen, onClose }: MatchingSettingsProps) {
  const { settings, isLoading, updateSettings } = useMatchingSettings()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [quantityTolerance, setQuantityTolerance] = useState(10)
  const [priceTolerance, setPriceTolerance] = useState(5)
  const [poPrefix, setPoPrefix] = useState('PO')
  const [grnPrefix, setGrnPrefix] = useState('GRN')
  const [autoMatch, setAutoMatch] = useState(true)

  // Sync from settings
  useEffect(() => {
    if (settings) {
      setQuantityTolerance(settings.quantityTolerancePercent ?? 10)
      setPriceTolerance(settings.priceTolerancePercent ?? 5)
      setPoPrefix(settings.poNumberPrefix ?? 'PO')
      setGrnPrefix(settings.grnNumberPrefix ?? 'GRN')
      setAutoMatch(settings.autoMatchEnabled ?? true)
    }
  }, [settings])

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      await updateSettings({
        quantityTolerancePercent: quantityTolerance,
        priceTolerancePercent: priceTolerance,
        poNumberPrefix: poPrefix,
        grnNumberPrefix: grnPrefix,
        autoMatchEnabled: autoMatch,
      })
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 transition-opacity"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(12px)' }}
        onClick={!isSaving ? onClose : undefined}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-card rounded-xl shadow-2xl w-full max-w-md flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-base font-semibold text-foreground">Matching Settings</h3>
            </div>
            <button
              onClick={onClose}
              disabled={isSaving}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-5">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-md p-3 text-sm text-red-600 dark:text-red-400">
                    {error}
                  </div>
                )}

                {/* Quantity Tolerance */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-foreground">Quantity Tolerance</label>
                    <span className="text-sm font-semibold text-foreground">{quantityTolerance}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="1"
                    value={quantityTolerance}
                    onChange={(e) => setQuantityTolerance(Number(e.target.value))}
                    className="w-full accent-primary"
                    disabled={isSaving}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Variances below this threshold are auto-approved
                  </p>
                </div>

                {/* Price Tolerance */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-foreground">Price Tolerance</label>
                    <span className="text-sm font-semibold text-foreground">{priceTolerance}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="1"
                    value={priceTolerance}
                    onChange={(e) => setPriceTolerance(Number(e.target.value))}
                    className="w-full accent-primary"
                    disabled={isSaving}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Price differences below this threshold are auto-approved
                  </p>
                </div>

                {/* Number Prefixes */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">PO Number Prefix</label>
                    <input
                      type="text"
                      value={poPrefix}
                      onChange={(e) => setPoPrefix(e.target.value)}
                      className="w-full bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm"
                      maxLength={10}
                      disabled={isSaving}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">GRN Number Prefix</label>
                    <input
                      type="text"
                      value={grnPrefix}
                      onChange={(e) => setGrnPrefix(e.target.value)}
                      className="w-full bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm"
                      maxLength={10}
                      disabled={isSaving}
                    />
                  </div>
                </div>

                {/* Auto-match toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-foreground">Auto-match</label>
                    <p className="text-xs text-muted-foreground">Automatically match invoices to POs by reference number</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoMatch}
                    onClick={() => setAutoMatch(!autoMatch)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      autoMatch ? 'bg-primary' : 'bg-muted'
                    }`}
                    disabled={isSaving}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-card transition-transform ${
                        autoMatch ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-3 justify-end p-4 border-t border-border">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-md text-sm font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
