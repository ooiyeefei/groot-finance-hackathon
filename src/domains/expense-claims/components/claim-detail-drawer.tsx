'use client'

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import {
  Loader2,
  FileText,
  Building,
  DollarSign,
  Calendar,
  Tag,
  Receipt,
  AlertCircle,
} from 'lucide-react'
import type { SubmissionClaim } from '../types/expense-claims'

interface ClaimDetailDrawerProps {
  claim: SubmissionClaim | null
  isOpen: boolean
  onClose: () => void
}

const STATUS_BADGES: Record<string, { className: string; label: string }> = {
  draft: { className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30', label: 'Draft' },
  uploading: { className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30', label: 'Uploading' },
  classifying: { className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30', label: 'Classifying' },
  analyzing: { className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30', label: 'Analyzing' },
  processing: { className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30', label: 'Processing' },
  submitted: { className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30', label: 'Submitted' },
  approved: { className: 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30', label: 'Approved' },
  rejected: { className: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30', label: 'Rejected' },
  reimbursed: { className: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30', label: 'Reimbursed' },
  failed: { className: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30', label: 'Failed' },
  classification_failed: { className: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30', label: 'Classification Failed' },
}

export function ClaimDetailDrawer({ claim, isOpen, onClose }: ClaimDetailDrawerProps) {
  const [signedImageUrl, setSignedImageUrl] = useState<string | null>(null)
  const [imageLoading, setImageLoading] = useState(false)

  // Generate signed URL for receipt image preview
  useEffect(() => {
    if (!claim || !isOpen) {
      setSignedImageUrl(null)
      return
    }

    const storagePath = claim.storagePath
    if (!storagePath) return

    const generateSignedUrl = async () => {
      try {
        setImageLoading(true)
        const response = await fetch(
          `/api/v1/expense-claims/${claim._id}/image-url?useRawFile=true&storagePath=${encodeURIComponent(storagePath)}`
        )
        if (!response.ok) {
          setSignedImageUrl(null)
          return
        }
        const result = await response.json()
        const imageUrl = result?.data?.imageUrl || null
        setSignedImageUrl(imageUrl)
      } catch {
        setSignedImageUrl(null)
      } finally {
        setImageLoading(false)
      }
    }

    generateSignedUrl()
  }, [claim?._id, claim?.storagePath, isOpen])

  const statusBadge = claim ? (STATUS_BADGES[claim.status] || STATUS_BADGES.draft) : STATUS_BADGES.draft

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Claim Details</SheetTitle>
          <SheetDescription>
            {claim?.vendorName || 'Expense claim details'}
          </SheetDescription>
        </SheetHeader>

        {!claim ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 mt-6">
            {/* Status */}
            <div className="flex items-center gap-2">
              <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
              {claim.confidenceScore != null && (
                <span className="text-xs text-muted-foreground">
                  {Math.round(claim.confidenceScore * 100)}% confidence
                </span>
              )}
            </div>

            {/* Receipt Image Preview */}
            <div className="rounded-lg border border-border overflow-hidden bg-muted">
              {imageLoading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="text-center text-muted-foreground">
                    <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                    <p className="text-xs">Loading preview...</p>
                  </div>
                </div>
              ) : signedImageUrl ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={signedImageUrl}
                    alt={claim.vendorName || 'Receipt'}
                    className="w-full max-h-64 object-contain bg-muted"
                  />
                </div>
              ) : claim.storagePath ? (
                <div className="flex items-center justify-center h-32">
                  <div className="text-center text-muted-foreground">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">Preview unavailable</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-32">
                  <div className="text-center text-muted-foreground">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">No receipt attached</p>
                  </div>
                </div>
              )}
            </div>

            {/* Key details */}
            <div className="space-y-4">
              {claim.vendorName && (
                <DetailRow icon={<Building className="h-4 w-4" />} label="Vendor" value={claim.vendorName} />
              )}
              {claim.totalAmount != null && claim.currency && (
                <DetailRow icon={<DollarSign className="h-4 w-4" />} label="Amount" value={formatCurrency(claim.totalAmount, claim.currency)} />
              )}
              {claim.transactionDate && (
                <DetailRow icon={<Calendar className="h-4 w-4" />} label="Date" value={formatBusinessDate(claim.transactionDate)} />
              )}
              {claim.expenseCategory && (
                <DetailRow icon={<Tag className="h-4 w-4" />} label="Category" value={claim.expenseCategory} />
              )}
              {claim.businessPurpose && (
                <DetailRow icon={<FileText className="h-4 w-4" />} label="Purpose" value={claim.businessPurpose} />
              )}
            </div>

            {/* Error for failed claims */}
            {(claim.status === 'failed' || claim.status === 'classification_failed') && (
              <div className="flex items-center gap-2 p-3 bg-red-500/5 border border-red-500/30 rounded-md">
                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-400">
                  {claim.status === 'classification_failed'
                    ? 'Document could not be classified as a receipt. Please upload a valid receipt.'
                    : 'Processing failed. Please try uploading again or enter details manually.'}
                </p>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground">{value}</p>
      </div>
    </div>
  )
}
