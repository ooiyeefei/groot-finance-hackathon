'use client'

import { useState, useEffect } from 'react'
import { Building2, DollarSign, Tag, Shield, CheckCircle, AlertCircle, ArrowRight, Users, Settings, FileText } from 'lucide-react'
import { useBusinessContext } from '@/contexts/business-context'
import { usePermissions } from '@/contexts/business-context'
import { SupportedCurrency, CURRENCY_SYMBOLS, CURRENCY_NAMES } from '@/lib/types/currency'
import Link from 'next/link'

// Create array of all supported currencies from the centralized type definition
const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  'USD', 'SGD', 'MYR', 'THB', 'IDR', 'VND', 'PHP', 'CNY', 'EUR', 'INR'
]

interface BusinessSettingsSectionProps {
  className?: string
}

export default function BusinessSettingsSection({ className }: BusinessSettingsSectionProps) {
  const { profile, isLoadingProfile } = useBusinessContext()
  const { isManager, isOwner } = usePermissions()

  // Only show business management cards to owners and managers
  const canManageBusiness = isOwner || isManager

  if (isLoadingProfile) {
    return (
      <div className={`bg-card rounded-lg border border-border p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-muted rounded w-48 mb-4"></div>
          <div className="space-y-4">
            <div className="h-4 bg-muted rounded w-32"></div>
            <div className="h-10 bg-muted rounded w-full"></div>
          </div>
        </div>
      </div>
    )
  }

  // Navigation cards for business management (only visible to managers/admins)
  const managementCards = [
    {
      title: 'Business Profile',
      description: 'Company information, logo, and basic settings',
      icon: Building2,
      href: '/settings/business',
      color: 'blue',
      available: true
    },
    {
      title: 'Currency & Finance',
      description: 'Functional currency and operational currencies',
      icon: DollarSign,
      href: '/manager/categories',
      color: 'green',
      available: true
    },
    {
      title: 'Team Management',
      description: 'Invite members, manage roles and permissions',
      icon: Users,
      href: '/manager/teams',
      color: 'purple',
      available: true,
      ownerOnly: true  // Only business owners can manage team
    },
    {
      title: 'Approval Workflows',
      description: 'Review and approve expense claims',
      icon: FileText,
      href: '/manager/approvals',
      color: 'orange',
      available: true
    }
  ]

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Business Management Navigation Cards */}
      {canManageBusiness && (
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <Settings className="w-5 h-5 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">Business Management</h3>
              <p className="text-sm text-muted-foreground">Quick access to advanced business settings</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {managementCards.map((card) => {
              // Hide owner-only cards for non-owners
              if (card.ownerOnly && !isOwner) return null

              const IconComponent = card.icon
              const colorClasses = {
                blue: 'from-blue-600/20 to-blue-800/20 border-blue-500/30 hover:border-blue-400',
                green: 'from-green-600/20 to-green-800/20 border-green-500/30 hover:border-green-400',
                purple: 'from-purple-600/20 to-purple-800/20 border-purple-500/30 hover:border-purple-400',
                orange: 'from-orange-600/20 to-orange-800/20 border-orange-500/30 hover:border-orange-400'
              }

              return (
                <Link
                  key={card.title}
                  href={card.href}
                  className={`
                    group relative p-4 rounded-lg border transition-all duration-200
                    bg-gradient-to-br ${colorClasses[card.color as keyof typeof colorClasses]}
                    hover:scale-105 hover:shadow-lg
                  `}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`
                          p-2 rounded-lg
                          ${card.color === 'blue' ? 'bg-blue-500/20 text-blue-600 dark:text-blue-300' : ''}
                          ${card.color === 'green' ? 'bg-green-500/20 text-green-600 dark:text-green-300' : ''}
                          ${card.color === 'purple' ? 'bg-purple-500/20 text-purple-600 dark:text-purple-300' : ''}
                          ${card.color === 'orange' ? 'bg-orange-500/20 text-orange-600 dark:text-orange-300' : ''}
                        `}>
                          <IconComponent className="w-5 h-5" />
                        </div>
                        <h4 className="text-foreground font-semibold">{card.title}</h4>
                        {card.ownerOnly && (
                          <span className="px-2 py-1 bg-purple-500/20 text-purple-600 dark:text-purple-300 text-xs rounded-md">
                            Owner
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground text-sm">{card.description}</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Info message for non-managers */}
      {!canManageBusiness && (
        <div className="bg-card/50 rounded-lg border border-border p-6">
          <div className="text-center py-4">
            <AlertCircle className="w-8 h-8 text-yellow-600 dark:text-yellow-400 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">
              Business management settings are available to managers and administrators
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

