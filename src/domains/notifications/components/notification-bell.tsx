'use client'

import { useState, useCallback } from 'react'
import { Bell } from 'lucide-react'
import { useQuery } from 'convex/react'
import { Button } from '@/components/ui/button'
import { NotificationPanel } from './notification-panel'
import { useNotifications } from '../hooks/use-notifications'
import { ClaimDetailDrawer } from '@/domains/expense-claims/components/claim-detail-drawer'
import { api } from '../../../../convex/_generated/api'

interface NotificationBellProps {
  businessId: string | null
}

export function NotificationBell({ businessId }: NotificationBellProps) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null)
  const { unreadCount } = useNotifications(businessId)

  // Fetch claim data when a claim is selected from a notification
  const claimData = useQuery(
    api.functions.expenseClaims.getById,
    selectedClaimId ? { id: selectedClaimId } : "skip"
  )

  const handleViewResource = useCallback((resourceType: string, resourceId: string): boolean => {
    if (resourceType === 'expense_claim') {
      setSelectedClaimId(resourceId)
      setPanelOpen(false) // Close notification panel
      return true // Handled — don't navigate
    }
    return false // Not handled — fall through to router.push
  }, [])

  const handleCloseClaimDrawer = useCallback(() => {
    setSelectedClaimId(null)
  }, [])

  if (!businessId) return null

  // Map Convex claim data to SubmissionClaim shape for the drawer
  const claimForDrawer = claimData ? {
    _id: claimData._id as unknown as string,
    vendorName: claimData.vendorName,
    totalAmount: claimData.totalAmount,
    currency: claimData.currency,
    expenseCategory: claimData.expenseCategory,
    transactionDate: claimData.transactionDate,
    status: claimData.status,
    businessPurpose: claimData.businessPurpose || '',
    confidenceScore: claimData.confidenceScore,
    storagePath: claimData.storagePath,
    convertedImagePath: claimData.convertedImagePath,
  } : null

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9"
        onClick={() => setPanelOpen(true)}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      <NotificationPanel
        businessId={businessId}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        onViewResource={handleViewResource}
      />

      <ClaimDetailDrawer
        claim={claimForDrawer}
        isOpen={selectedClaimId !== null}
        onClose={handleCloseClaimDrawer}
      />
    </>
  )
}
