/**
 * Mobile Approval Card Component
 *
 * T041: Mobile-optimized approval card with compact layout
 * T042: Swipe gestures for approve/reject
 * T044: 2-tap approval flow (tap → slide to confirm)
 *
 * Features:
 * - Compact single-column layout for mobile
 * - Swipe left to reject, swipe right to approve
 * - Tap to expand with slide-to-confirm action
 * - Haptic feedback on actions
 * - Touch targets meet 48px minimum
 */

'use client'

import { useState, useRef, useCallback } from 'react'
import {
  CheckCircle,
  XCircle,
  DollarSign,
  Calendar,
  User,
  ChevronRight,
  Loader2
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatBusinessDate } from '@/lib/utils'
import { formatNumber } from '@/lib/utils/format-number'
import { hapticApprove, hapticReject, hapticTap, hapticPress } from '@/lib/utils/haptics'
import { getCategoryName, type DynamicExpenseCategory } from '../hooks/use-expense-categories'

// Swipe threshold in pixels
const SWIPE_THRESHOLD = 80
// Animation duration in ms
const ANIMATION_DURATION = 200

interface ExpenseClaim {
  id: string
  business_id: string
  description: string
  vendor_name: string
  total_amount: string | number
  currency: string
  home_currency_amount?: string | number
  home_currency?: string
  transaction_date: string
  expense_category?: string
  employee_name?: string
  employee?: {
    full_name?: string
  }
  employee_id?: string
  created_at: string
  status: string
}

interface MobileApprovalCardProps {
  claim: ExpenseClaim
  categories: DynamicExpenseCategory[]
  onApprove: (claimId: string) => Promise<void>
  onReject: (claimId: string) => Promise<void>
  onViewDetails: (claim: ExpenseClaim) => void
  isProcessing?: boolean
}

export function MobileApprovalCard({
  claim,
  categories,
  onApprove,
  onReject,
  onViewDetails,
  isProcessing = false
}: MobileApprovalCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [isConfirming, setIsConfirming] = useState<'approve' | 'reject' | null>(null)
  const [sliderValue, setSliderValue] = useState(0)

  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const isHorizontalSwipe = useRef(false)
  const cardRef = useRef<HTMLDivElement>(null)

  // Extract display values
  const employeeName = claim.employee?.full_name || claim.employee_name || `Employee ${claim.employee_id?.slice(0, 8) || 'Unknown'}`
  const amount = parseFloat(String(claim.home_currency_amount || claim.total_amount || 0))
  const formattedAmount = `$${formatNumber(amount, 2)}`
  const category = getCategoryName(claim.expense_category, categories)

  // Handle touch start
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isConfirming || isProcessing) return

    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    isHorizontalSwipe.current = false
  }, [isConfirming, isProcessing])

  // Handle touch move for swipe gesture
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isConfirming || isProcessing) return

    const deltaX = e.touches[0].clientX - touchStartX.current
    const deltaY = e.touches[0].clientY - touchStartY.current

    // Determine if this is a horizontal swipe (first significant movement)
    if (!isHorizontalSwipe.current && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY)
    }

    // Only track horizontal swipes
    if (isHorizontalSwipe.current) {
      e.preventDefault()
      // Limit swipe offset with resistance
      const resistance = 0.5
      const resistedOffset = deltaX > 0
        ? Math.min(deltaX * resistance, SWIPE_THRESHOLD * 1.2)
        : Math.max(deltaX * resistance, -SWIPE_THRESHOLD * 1.2)
      setSwipeOffset(resistedOffset)
    }
  }, [isConfirming, isProcessing])

  // Handle touch end
  const handleTouchEnd = useCallback(() => {
    if (isConfirming || isProcessing) return

    const offset = swipeOffset

    // Reset swipe offset with animation
    setSwipeOffset(0)

    // Check if swipe exceeded threshold
    if (Math.abs(offset) >= SWIPE_THRESHOLD) {
      if (offset > 0) {
        // Swipe right = approve
        hapticPress()
        setIsConfirming('approve')
        setIsExpanded(true)
      } else {
        // Swipe left = reject
        hapticPress()
        setIsConfirming('reject')
        setIsExpanded(true)
      }
    }
  }, [swipeOffset, isConfirming, isProcessing])

  // Handle card tap
  const handleCardTap = useCallback(() => {
    if (isConfirming || isProcessing) return
    hapticTap()
    setIsExpanded(!isExpanded)
  }, [isExpanded, isConfirming, isProcessing])

  // Handle slider change for confirmation
  const handleSliderChange = useCallback((value: number) => {
    setSliderValue(value)

    // Trigger action when slider reaches end
    if (value >= 95) {
      if (isConfirming === 'approve') {
        hapticApprove()
        onApprove(claim.id)
      } else if (isConfirming === 'reject') {
        hapticReject()
        onReject(claim.id)
      }
      // Reset state
      setIsConfirming(null)
      setSliderValue(0)
      setIsExpanded(false)
    }
  }, [isConfirming, claim.id, onApprove, onReject])

  // Cancel confirmation
  const handleCancelConfirm = useCallback(() => {
    setIsConfirming(null)
    setSliderValue(0)
  }, [])

  // Quick action buttons
  const handleQuickApprove = useCallback(() => {
    hapticPress()
    setIsConfirming('approve')
  }, [])

  const handleQuickReject = useCallback(() => {
    hapticPress()
    setIsConfirming('reject')
  }, [])

  // Get swipe indicator styles
  const getSwipeIndicatorStyle = () => {
    if (swipeOffset > SWIPE_THRESHOLD * 0.5) {
      return { opacity: Math.min((swipeOffset - SWIPE_THRESHOLD * 0.5) / (SWIPE_THRESHOLD * 0.5), 1) }
    }
    if (swipeOffset < -SWIPE_THRESHOLD * 0.5) {
      return { opacity: Math.min((Math.abs(swipeOffset) - SWIPE_THRESHOLD * 0.5) / (SWIPE_THRESHOLD * 0.5), 1) }
    }
    return { opacity: 0 }
  }

  return (
    <div className="relative overflow-hidden">
      {/* Swipe indicators behind card */}
      <div
        className="absolute inset-y-0 left-0 w-20 bg-green-500/20 flex items-center justify-center"
        style={swipeOffset > 0 ? getSwipeIndicatorStyle() : { opacity: 0 }}
      >
        <CheckCircle className="w-8 h-8 text-green-500" />
      </div>
      <div
        className="absolute inset-y-0 right-0 w-20 bg-red-500/20 flex items-center justify-center"
        style={swipeOffset < 0 ? getSwipeIndicatorStyle() : { opacity: 0 }}
      >
        <XCircle className="w-8 h-8 text-red-500" />
      </div>

      {/* Main card */}
      <div
        ref={cardRef}
        className={`
          relative bg-card border border-border rounded-lg shadow-sm
          transition-transform duration-${ANIMATION_DURATION}
          ${isProcessing ? 'opacity-50 pointer-events-none' : ''}
        `}
        style={{ transform: `translateX(${swipeOffset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleCardTap}
      >
        {/* Compact card content */}
        <div className="p-3">
          {/* Top row: Employee name + Amount */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground truncate">
                {employeeName}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <span className="text-base font-semibold text-foreground">
                {formattedAmount}
              </span>
              {!isExpanded && (
                <ChevronRight className="w-4 h-4 text-muted-foreground ml-1" />
              )}
            </div>
          </div>

          {/* Middle row: Description + Category badge */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-sm text-muted-foreground truncate flex-1">
              {claim.description || claim.vendor_name || 'Expense claim'}
            </p>
            <Badge
              variant="secondary"
              className="text-xs flex-shrink-0 bg-muted text-muted-foreground border-0"
            >
              {category}
            </Badge>
          </div>

          {/* Bottom row: Vendor + Date */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate">{claim.vendor_name}</span>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Calendar className="w-3 h-3" />
              <span>{formatBusinessDate(claim.transaction_date)}</span>
            </div>
          </div>
        </div>

        {/* Expanded section with actions */}
        {isExpanded && (
          <div className="border-t border-border bg-muted/30">
            {isConfirming ? (
              /* Slide to confirm UI */
              <div className="p-3">
                <p className="text-sm text-center text-muted-foreground mb-3">
                  Slide to {isConfirming === 'approve' ? 'approve' : 'reject'}
                </p>

                {/* Slider track */}
                <div
                  className={`
                    relative h-12 rounded-full overflow-hidden
                    ${isConfirming === 'approve' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}
                  `}
                >
                  {/* Slider fill */}
                  <div
                    className={`
                      absolute inset-y-0 left-0 transition-all
                      ${isConfirming === 'approve' ? 'bg-green-500/30' : 'bg-red-500/30'}
                    `}
                    style={{ width: `${sliderValue}%` }}
                  />

                  {/* Slider input */}
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={sliderValue}
                    onChange={(e) => handleSliderChange(Number(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    style={{ WebkitAppearance: 'none' }}
                  />

                  {/* Slider thumb */}
                  <div
                    className={`
                      absolute top-1 bottom-1 w-10 rounded-full flex items-center justify-center
                      transition-all shadow-md
                      ${isConfirming === 'approve' ? 'bg-green-500' : 'bg-red-500'}
                    `}
                    style={{ left: `calc(${sliderValue}% - ${sliderValue * 0.4}px)` }}
                  >
                    {isConfirming === 'approve' ? (
                      <CheckCircle className="w-5 h-5 text-white" />
                    ) : (
                      <XCircle className="w-5 h-5 text-white" />
                    )}
                  </div>
                </div>

                {/* Cancel button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCancelConfirm()
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              /* Quick action buttons */
              <div className="p-3 flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 h-12 text-primary hover:text-primary hover:bg-primary/10"
                  onClick={(e) => {
                    e.stopPropagation()
                    onViewDetails(claim)
                  }}
                  disabled={isProcessing}
                >
                  View Details
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-12 bg-green-500 hover:bg-green-600 text-white"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleQuickApprove()
                  }}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Approve
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1 h-12"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleQuickReject()
                  }}
                  disabled={isProcessing}
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Reject
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Processing overlay */}
      {isProcessing && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-lg">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}
    </div>
  )
}

export default MobileApprovalCard
