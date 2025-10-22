'use client'

import { Clock, CheckCircle, XCircle, AlertCircle, CreditCard, Ban } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface AccountingEntryStatusBadgeProps {
  status: 'pending' | 'awaiting_payment' | 'paid' | 'overdue' | 'cancelled' | 'disputed'
  animated?: boolean
  showIcon?: boolean
}

export default function AccountingEntryStatusBadge({ 
  status, 
  animated = true,
  showIcon = true 
}: AccountingEntryStatusBadgeProps) {
  
  const getStatusConfig = () => {
    switch (status) {
      case 'pending':
        return {
          icon: Clock,
          text: 'Pending',
          variant: 'warning' as const,
          animate: false
        }
      case 'awaiting_payment':
        return {
          icon: CreditCard,
          text: 'Awaiting Payment',
          variant: 'info' as const,
          animate: true
        }
      case 'paid':
        return {
          icon: CheckCircle,
          text: 'Paid',
          variant: 'success' as const,
          animate: false
        }
      case 'overdue':
        return {
          icon: AlertCircle,
          text: 'Overdue',
          variant: 'error' as const,
          animate: true
        }
      case 'cancelled':
        return {
          icon: Ban,
          text: 'Cancelled',
          variant: 'default' as const,
          animate: false
        }
      case 'disputed':
        return {
          icon: XCircle,
          text: 'Disputed',
          variant: 'error' as const,
          animate: false
        }
      default:
        return {
          icon: Clock,
          text: 'Unknown',
          variant: 'default' as const,
          animate: false
        }
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon

  return (
    <Badge variant={config.variant} className="flex items-center">
      {showIcon && (
        <Icon
          className={`w-3 h-3 mr-1 ${
            config.animate && animated ? 'animate-pulse' : ''
          }`}
        />
      )}
      {config.text}
    </Badge>
  )
}