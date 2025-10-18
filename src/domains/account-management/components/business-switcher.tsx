'use client'

/**
 * Business Switcher Component
 * Displays active business and allows switching between businesses
 */

import React from 'react'
import { Building2, Crown, ChevronDown, Loader2, AlertCircle } from 'lucide-react'
import {
  useActiveBusiness,
  useBusinessMemberships,
  useBusinessSwitcher,
  useBusinessState
} from '@/contexts/business-context'
import { NoBusinessFallbackCompact } from '@/components/ui/no-business-fallback'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Role Badge Component

interface RoleBadgeProps {
  role: 'admin' | 'manager' | 'employee'
  isOwner?: boolean
  className?: string
}

function RoleBadge({ role, isOwner, className }: RoleBadgeProps) {
  const getRoleVariant = (role: string, isOwner: boolean) => {
    if (isOwner) return 'default'
    if (role === 'admin') return 'secondary'
    if (role === 'manager') return 'outline'
    return 'outline'
  }

  const getRoleLabel = (role: string, isOwner: boolean) => {
    if (isOwner) return 'Owner'
    return role.charAt(0).toUpperCase() + role.slice(1)
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {isOwner && <Crown className="h-3 w-3 text-yellow-500" />}
      <Badge variant={getRoleVariant(role, isOwner || false)} className="text-xs">
        {getRoleLabel(role, isOwner || false)}
      </Badge>
    </div>
  )
}

// Business Display Component

interface BusinessDisplayProps {
  businessName: string
  role: 'admin' | 'manager' | 'employee'
  isOwner: boolean
  isCompact?: boolean
}

function BusinessDisplay({ businessName, role, isOwner, isCompact }: BusinessDisplayProps) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-white truncate">
          {businessName}
        </span>
        {!isCompact && (
          <div className="flex items-center gap-2">
            <RoleBadge role={role} isOwner={isOwner} />
          </div>
        )}
      </div>
    </div>
  )
}

// Main Business Switcher Component

export default function BusinessSwitcher() {
  const { business, isLoading: contextLoading, error: contextError } = useActiveBusiness()
  const { memberships, isLoading: membershipsLoading, error: membershipsError } = useBusinessMemberships()
  const { switchBusiness, isSwitching, error: switchError } = useBusinessSwitcher()
  const { state, hasActualError, isInitialLoading, hasNoBusinessAccess } = useBusinessState()

  // Event Handlers

  const handleBusinessSwitch = async (businessId: string) => {
    if (businessId === business?.businessId) return

    const success = await switchBusiness(businessId)
    if (!success) {
      console.error('[BusinessSwitcher] Failed to switch business')
    }
  }

  // Loading and Error States

  if (isInitialLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-300">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading businesses...</span>
      </div>
    )
  }

  if (hasActualError) {
    return (
      <div className="flex items-center gap-2 text-red-400">
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm">Error loading businesses</span>
      </div>
    )
  }

  if (hasNoBusinessAccess) {
    return <NoBusinessFallbackCompact />
  }

  if (!business) {
    return (
      <div className="flex items-center gap-2 text-yellow-400">
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm">No active business</span>
      </div>
    )
  }

  // Single Business Case

  if (memberships.length <= 1) {
    return (
      <BusinessDisplay
        businessName={business.businessName}
        role={business.role}
        isOwner={business.isOwner}
      />
    )
  }

  // Multiple Business Case - Show Switcher

  return (
    <div className="relative">
      <Select
        value={business.businessId}
        onValueChange={handleBusinessSwitch}
        disabled={isSwitching}
      >
        <SelectTrigger className="w-auto min-w-[250px] border-gray-600 bg-gray-700 text-white hover:bg-gray-600 focus:ring-blue-500">
          <div className="flex items-center gap-3 min-w-0">
            <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <div className="flex flex-col min-w-0 text-left">
              <span className="text-sm font-medium truncate">
                {business.businessName}
              </span>
              <RoleBadge role={business.role} isOwner={business.isOwner} />
            </div>
            {isSwitching && (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            )}
          </div>
        </SelectTrigger>

        <SelectContent className="w-[300px]">
          {memberships.map((membership) => (
            <SelectItem
              key={membership.id}
              value={membership.id}
              className="cursor-pointer"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">
                    {membership.name}
                  </span>
                  <span className="text-xs text-gray-500 truncate">
                    {membership.country_code} • {membership.home_currency}
                  </span>
                </div>
                <div className="flex-shrink-0 ml-3">
                  <RoleBadge
                    role={membership.membership.role}
                    isOwner={membership.isOwner}
                  />
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Error Display */}
      {switchError && (
        <div className="absolute top-full left-0 right-0 mt-1 p-2 bg-red-900 border border-red-700 rounded text-red-100 text-xs z-50">
          {switchError}
        </div>
      )}
    </div>
  )
}

// Compact Version for Smaller Spaces

export function BusinessSwitcherCompact() {
  const { business, isLoading: contextLoading } = useActiveBusiness()
  const { memberships, isLoading: membershipsLoading } = useBusinessMemberships()
  const { switchBusiness, isSwitching } = useBusinessSwitcher()

  const handleBusinessSwitch = async (businessId: string) => {
    if (businessId === business?.businessId) return
    await switchBusiness(businessId)
  }

  if (contextLoading || membershipsLoading || !business) {
    return (
      <div className="flex items-center gap-1">
        <Building2 className="h-4 w-4 text-gray-400" />
        <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
      </div>
    )
  }

  if (memberships.length <= 1) {
    return (
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-gray-400" />
        <span className="text-sm text-white truncate max-w-[120px]">
          {business.businessName}
        </span>
        <RoleBadge role={business.role} isOwner={business.isOwner} />
      </div>
    )
  }

  return (
    <Select
      value={business.businessId}
      onValueChange={handleBusinessSwitch}
      disabled={isSwitching}
    >
      <SelectTrigger className="w-auto border-gray-600 bg-gray-700 text-white hover:bg-gray-600 h-8 px-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-3 w-3 text-gray-400" />
          <span className="text-xs truncate max-w-[100px]">
            {business.businessName}
          </span>
          {isSwitching && (
            <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
          )}
        </div>
      </SelectTrigger>

      <SelectContent>
        {memberships.map((membership) => (
          <SelectItem
            key={membership.id}
            value={membership.id}
            className="text-xs"
          >
            <div className="flex items-center justify-between w-full">
              <span className="truncate">{membership.name}</span>
              <RoleBadge
                role={membership.membership.role}
                isOwner={membership.isOwner}
                className="ml-2"
              />
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}