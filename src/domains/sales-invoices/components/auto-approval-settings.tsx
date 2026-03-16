'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { AlertTriangle, CheckCircle, Settings2 } from 'lucide-react'
import { useActiveBusiness } from '@/contexts/business-context'
import { useAutoApprovalSettings } from '../hooks/use-reconciliation'
import { useToast } from '@/components/ui/toast'
import type { Id } from '../../../../convex/_generated/dataModel'

interface AutoApprovalSettingsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function AutoApprovalSettings({ open, onOpenChange }: AutoApprovalSettingsProps) {
  const { businessId } = useActiveBusiness()
  const { settings, updateSettings, isLoading } = useAutoApprovalSettings()
  const { addToast } = useToast()

  const [enabled, setEnabled] = useState(settings.enableAutoApprove)
  const [threshold, setThreshold] = useState(settings.autoApproveThreshold)
  const [minCycles, setMinCycles] = useState(settings.minLearningCycles)
  const [isSaving, setIsSaving] = useState(false)

  // Sync local state when settings load
  if (!isLoading && enabled !== settings.enableAutoApprove) {
    setEnabled(settings.enableAutoApprove)
    setThreshold(settings.autoApproveThreshold)
    setMinCycles(settings.minLearningCycles)
  }

  const handleSave = async () => {
    if (!businessId) return
    setIsSaving(true)
    try {
      await updateSettings({
        businessId: businessId as Id<"businesses">,
        enableAutoApprove: enabled,
        autoApproveThreshold: threshold,
        minLearningCycles: minCycles,
      })
      addToast({
        type: 'success',
        title: 'Auto-approval settings saved',
        description: enabled
          ? `Threshold: ${(threshold * 100).toFixed(0)}%, Min cycles: ${minCycles}`
          : 'Auto-approval is disabled',
        duration: 3000,
      })
      onOpenChange(false)
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Failed to save settings',
        description: error instanceof Error ? error.message : 'Unknown error',
        duration: 5000,
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md bg-background border-border overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Auto-Approval Settings
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Safety Valve Alert */}
          {settings.autoApproveDisabledReason && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Auto-approval paused</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {settings.autoApproveDisabledReason === 'critical_failures_exceeded'
                    ? '3+ critical failures detected in 30 days. Review reversed matches before re-enabling.'
                    : settings.autoApproveDisabledReason}
                </p>
              </div>
            </div>
          )}

          {/* Enable Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Enable Auto-Approval</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically approve and post high-confidence AI matches
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {enabled && (
            <>
              {/* Confidence Threshold */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Confidence Threshold
                </label>
                <p className="text-xs text-muted-foreground">
                  Minimum AI confidence score for auto-approval (0.90 - 1.00)
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="90"
                    max="100"
                    step="1"
                    value={threshold * 100}
                    onChange={(e) => setThreshold(parseInt(e.target.value) / 100)}
                    className="flex-1"
                  />
                  <span className="text-sm font-mono text-foreground w-12 text-right">
                    {(threshold * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Minimum Learning Cycles */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Minimum Learning Cycles
                </label>
                <p className="text-xs text-muted-foreground">
                  How many times the AI must correctly match a vendor/customer alias before auto-approving (1-50)
                </p>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={minCycles}
                  onChange={(e) => setMinCycles(Math.max(1, Math.min(50, parseInt(e.target.value) || 5)))}
                  className="w-24"
                />
              </div>

              {/* Triple-Lock Explanation */}
              <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Triple-Lock Gate
                </p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                    <span className="text-foreground">Lock 1: Auto-approve is enabled</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                    <span className="text-foreground">Lock 2: AI confidence ≥ {(threshold * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                    <span className="text-foreground">Lock 3: Alias matched correctly ≥ {minCycles} times</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  All three locks must pass for auto-approval. Split matches always require review.
                </p>
              </div>
            </>
          )}

          {/* Save Button */}
          <div className="flex gap-2 pt-4 border-t border-border">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </Button>
            <Button
              onClick={() => onOpenChange(false)}
              className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
            >
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
