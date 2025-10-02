'use client'

import { Clock, CheckCircle, XCircle, AlertCircle, CreditCard, Ban } from 'lucide-react'

interface TransactionStatusBadgeProps {
  status: 'pending' | 'awaiting_payment' | 'paid' | 'overdue' | 'cancelled' | 'disputed'
  animated?: boolean
  showIcon?: boolean
}

export default function TransactionStatusBadge({ 
  status, 
  animated = true,
  showIcon = true 
}: TransactionStatusBadgeProps) {
  
  const getStatusConfig = () => {
    switch (status) {
      case 'pending':
        return {
          icon: Clock,
          text: 'Pending',
          className: 'bg-yellow-900/20 text-yellow-300 border-yellow-700/50',
          animate: false
        }
      case 'awaiting_payment':
        return {
          icon: CreditCard,
          text: 'Awaiting Payment',
          className: 'bg-blue-900/20 text-blue-300 border-blue-700/50',
          animate: true
        }
      case 'paid':
        return {
          icon: CheckCircle,
          text: 'Paid',
          className: 'bg-green-900/20 text-green-300 border-green-700/50',
          animate: false
        }
      case 'overdue':
        return {
          icon: AlertCircle,
          text: 'Overdue',
          className: 'bg-red-900/20 text-red-300 border-red-700/50',
          animate: true
        }
      case 'cancelled':
        return {
          icon: Ban,
          text: 'Cancelled',
          className: 'bg-gray-900/20 text-gray-300 border-gray-700/50',
          animate: false
        }
      case 'disputed':
        return {
          icon: XCircle,
          text: 'Disputed',
          className: 'bg-orange-900/20 text-orange-300 border-orange-700/50',
          animate: false
        }
      default:
        return {
          icon: Clock,
          text: 'Unknown',
          className: 'bg-gray-900/20 text-gray-300 border-gray-700/50',
          animate: false
        }
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon

  return (
    <span 
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}
    >
      {showIcon && (
        <Icon 
          className={`w-3 h-3 mr-1 ${
            config.animate && animated ? 'animate-pulse' : ''
          }`} 
        />
      )}
      {config.text}
    </span>
  )
}