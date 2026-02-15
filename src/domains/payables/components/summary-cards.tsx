'use client'

import { DollarSign, AlertTriangle, Calendar, CalendarClock } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format-number'

interface SummaryCardsProps {
  totalOutstanding: number
  amountOverdue: number
  dueThisWeek: number
  dueThisMonth: number
  isLoading: boolean
  currency?: string
}

export default function SummaryCards({
  totalOutstanding,
  amountOverdue,
  dueThisWeek,
  dueThisMonth,
  isLoading,
  currency = 'SGD',
}: SummaryCardsProps) {
  const cards = [
    {
      label: 'Total Outstanding',
      value: totalOutstanding,
      icon: DollarSign,
      accent: 'text-foreground',
      iconColor: 'text-muted-foreground',
    },
    {
      label: 'Overdue',
      value: amountOverdue,
      icon: AlertTriangle,
      accent: 'text-destructive',
      iconColor: 'text-destructive',
    },
    {
      label: 'Due This Week',
      value: dueThisWeek,
      icon: Calendar,
      accent: 'text-amber-600 dark:text-amber-400',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Due This Month',
      value: dueThisMonth,
      icon: CalendarClock,
      accent: 'text-foreground',
      iconColor: 'text-muted-foreground',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-card-gap">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-card border border-border rounded-lg p-4 min-h-[100px] transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
            <card.icon className={`w-4 h-4 ${card.iconColor}`} />
          </div>
          <div className="h-8 flex items-center">
            {isLoading ? (
              <div className="h-7 w-full bg-muted rounded animate-pulse" />
            ) : (
              <p className={`text-2xl font-bold ${card.accent}`}>
                {formatCurrency(card.value, currency)}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
