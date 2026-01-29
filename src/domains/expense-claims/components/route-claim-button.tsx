/**
 * Route Claim Button
 * Allows designated approvers to route/reassign expense claims to another approver
 */

'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowRightLeft, Loader2, X } from 'lucide-react'

interface RouteClaimButtonProps {
  claimId: string
  businessId: string
  currentApproverId?: string
  onRouted?: () => void
  disabled?: boolean
}

export default function RouteClaimButton({
  claimId,
  businessId,
  currentApproverId,
  onRouted,
  disabled = false,
}: RouteClaimButtonProps) {
  const [open, setOpen] = useState(false)
  const [selectedApproverId, setSelectedApproverId] = useState<string>('')
  const [reason, setReason] = useState('')
  const [routing, setRouting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch eligible approvers when dialog is open
  const eligibleApprovers = useQuery(
    api.functions.expenseClaims.getEligibleApprovers,
    open ? {
      businessId,
      excludeUserId: currentApproverId as Id<'users'> | undefined,
    } : 'skip'
  )

  // Route mutation
  const routeClaim = useMutation(api.functions.expenseClaims.routeClaim)

  const handleRoute = async () => {
    if (!selectedApproverId) {
      setError('Please select an approver')
      return
    }

    try {
      setRouting(true)
      setError(null)

      await routeClaim({
        claimId,
        newApproverId: selectedApproverId as Id<'users'>,
        reason: reason.trim() || undefined,
      })

      // Success - close dialog and notify parent
      handleClose()
      onRouted?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to route claim')
    } finally {
      setRouting(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setSelectedApproverId('')
    setReason('')
    setError(null)
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        <ArrowRightLeft className="w-4 h-4" />
        Route to...
      </Button>
    )
  }

  return (
    <>
      {/* Trigger button (hidden when dialog is open) */}
      <Button
        variant="outline"
        size="sm"
        disabled={true}
        className="gap-2"
      >
        <ArrowRightLeft className="w-4 h-4" />
        Route to...
      </Button>

      {/* Modal Overlay */}
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
        <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Route Claim</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={routing}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Select a manager or admin to reassign this expense claim for approval.
            </p>

            {/* Approver Selection */}
            <div className="space-y-2">
              <Label htmlFor="approver" className="text-foreground">Route to</Label>
              <Select
                value={selectedApproverId}
                onValueChange={setSelectedApproverId}
              >
                <SelectTrigger id="approver" className="bg-input border-border text-foreground">
                  <SelectValue placeholder="Select an approver" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {eligibleApprovers === undefined ? (
                    <SelectItem value="_loading" disabled className="text-muted-foreground">
                      Loading...
                    </SelectItem>
                  ) : eligibleApprovers.length === 0 ? (
                    <SelectItem value="_none" disabled className="text-muted-foreground">
                      No other approvers available
                    </SelectItem>
                  ) : (
                    eligibleApprovers.map((approver) => (
                      <SelectItem
                        key={approver._id}
                        value={approver._id}
                        className="text-foreground hover:bg-muted"
                      >
                        {approver.fullName} ({approver.role})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Reason (Optional) */}
            <div className="space-y-2">
              <Label htmlFor="reason" className="text-foreground">Reason (Optional)</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Add a note explaining why you're routing this claim..."
                rows={3}
                className="bg-input border-border text-foreground"
              />
            </div>

            {/* Error Message */}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-4 border-t border-border">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={routing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRoute}
              disabled={routing || !selectedApproverId}
            >
              {routing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Routing...
                </>
              ) : (
                'Route Claim'
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
