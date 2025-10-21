'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Building2, DollarSign, Users, FileText, ArrowRight } from 'lucide-react'
import { usePermissions } from '@/contexts/business-context'

interface ManagementCard {
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  color: 'blue' | 'green' | 'purple' | 'orange'
  available: boolean
  adminOnly?: boolean
}

export default function BusinessManagementCards() {
  const { isAdmin, isManager } = usePermissions()
  const params = useParams()
  const locale = params.locale as string

  // Only show business management cards to managers and admins
  const canManageBusiness = isAdmin || isManager

  // Helper function to create localized href
  const localizedHref = (path: string) => `/${locale}${path}`

  // Navigation cards for business management
  const managementCards: ManagementCard[] = [
    {
      title: 'Business Profile',
      description: 'Company information, logo, currency preferences, and basic settings',
      icon: Building2,
      href: localizedHref('/settings/business'),
      color: 'blue',
      available: true
    },
    {
      title: 'Category Management',
      description: 'Manage expense and COGS categories for your organization',
      icon: DollarSign,
      href: localizedHref('/manager/categories'),
      color: 'green',
      available: true
    },
    {
      title: 'Team Management',
      description: 'Invite members, manage roles and permissions',
      icon: Users,
      href: localizedHref('/manager/teams'),
      color: 'purple',
      available: true,
      adminOnly: true
    },
    {
      title: 'Approval Workflows',
      description: 'Review and approve expense claims',
      icon: FileText,
      href: localizedHref('/manager/approvals'),
      color: 'orange',
      available: true
    }
  ]

  if (!canManageBusiness) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-400">
          Business management settings are available to managers and administrators only.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {managementCards.map((card) => {
        // Hide admin-only cards for non-admins
        if (card.adminOnly && !isAdmin) return null

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
              bg-gradient-to-br ${colorClasses[card.color]}
              hover:scale-105 hover:shadow-lg
            `}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`
                    p-2 rounded-lg
                    ${card.color === 'blue' ? 'bg-blue-500/20 text-blue-300' : ''}
                    ${card.color === 'green' ? 'bg-green-500/20 text-green-300' : ''}
                    ${card.color === 'purple' ? 'bg-purple-500/20 text-purple-300' : ''}
                    ${card.color === 'orange' ? 'bg-orange-500/20 text-orange-300' : ''}
                  `}>
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <h4 className="text-white font-semibold">{card.title}</h4>
                  {card.adminOnly && (
                    <span className="px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-md">
                      Admin
                    </span>
                  )}
                </div>
                <p className="text-gray-400 text-sm">{card.description}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
            </div>
          </Link>
        )
      })}
    </div>
  )
}