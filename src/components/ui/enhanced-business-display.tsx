'use client'

/**
 * Enhanced Business Display Component for Sidebar
 *
 * Combines business profile display (logo, name) with multi-tenant switching capability.
 * Designed specifically for sidebar integration to reduce header crowding.
 *
 * Features:
 * - Shows business logo/fallback and name
 * - Displays user role with ownership indicators
 * - Dropdown business switcher (only when multiple businesses available)
 * - Responsive behavior for expanded/collapsed sidebar states
 * - Integrates seamlessly with existing sidebar styling
 */

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Crown, ChevronDown, ChevronUp, Building2, Loader2, AlertCircle } from 'lucide-react'
import {
  useActiveBusiness,
  useBusinessMemberships,
  useBusinessSwitcher
} from '@/contexts/business-context'
import { useBusinessProfile } from '@/contexts/business-profile-context'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ============================================================================
// Role Badge Component
// ============================================================================

interface RoleBadgeProps {
  role: 'admin' | 'manager' | 'employee'
  isOwner?: boolean
  className?: string
  size?: 'sm' | 'xs'
}

function RoleBadge({ role, isOwner, className, size = 'xs' }: RoleBadgeProps) {
  const getRoleVariant = (role: string, isOwner: boolean) => {
    if (isOwner) return 'default' // Primary color for owners
    if (role === 'admin') return 'secondary'
    if (role === 'manager') return 'outline'
    return 'outline' // Employee
  }

  const getRoleLabel = (role: string, isOwner: boolean) => {
    if (isOwner) return 'Owner'
    return role.charAt(0).toUpperCase() + role.slice(1)
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {isOwner && <Crown className={cn('text-yellow-500', size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3')} />}
      <Badge
        variant={getRoleVariant(role, isOwner || false)}
        className={cn(size === 'xs' ? 'text-[10px] px-1.5 py-0.5 h-4' : 'text-xs px-2 py-1 h-5')}
      >
        {getRoleLabel(role, isOwner || false)}
      </Badge>
    </div>
  )
}

// ============================================================================
// Business Logo Display
// ============================================================================

interface BusinessLogoProps {
  businessProfile: any
  isHydrated: boolean
  isExpanded: boolean
  size?: 'sm' | 'md' | 'lg'
}

function BusinessLogo({ businessProfile, isHydrated, isExpanded, size = 'md' }: BusinessLogoProps) {
  const getSizes = () => {
    if (size === 'sm') return { width: 32, height: 32, className: 'w-8 h-8' }
    if (size === 'lg') return { width: 56, height: 56, className: 'w-14 h-14' }
    return { width: isExpanded ? 48 : 43, height: isExpanded ? 48 : 43, className: isExpanded ? 'w-12 h-12' : 'w-[43px] h-[43px]' }
  }

  const { width, height, className } = getSizes()
  const shouldShowLogo = isHydrated && businessProfile?.logo_url
  const getBusinessInitial = () => businessProfile?.name?.[0]?.toUpperCase() || 'B'

  if (shouldShowLogo) {
    return (
      <Image
        src={businessProfile.logo_url}
        alt="Business Logo"
        width={width}
        height={height}
        className={cn(className, 'rounded-lg object-cover')}
      />
    )
  }

  return (
    <div
      className={cn(className, 'rounded-lg flex items-center justify-center text-white font-bold', size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-lg')}
      style={{ backgroundColor: businessProfile?.logo_fallback_color || '#3b82f6' }}
      suppressHydrationWarning={true}
    >
      {isHydrated ? getBusinessInitial() : 'B'}
    </div>
  )
}

// ============================================================================
// Main Enhanced Business Display Component
// ============================================================================

interface EnhancedBusinessDisplayProps {
  isExpanded: boolean
  isHydrated: boolean
  locale: string
  onToggleExpand?: () => void
}

export default function EnhancedBusinessDisplay({
  isExpanded,
  isHydrated,
  locale,
  onToggleExpand
}: EnhancedBusinessDisplayProps) {

  // Business context hooks
  const { business, isLoading: contextLoading, error: contextError } = useActiveBusiness()
  const { memberships, isLoading: membershipsLoading, error: membershipsError } = useBusinessMemberships()
  const { switchBusiness, isSwitching, error: switchError } = useBusinessSwitcher()

  // Business profile context (for logo/display)
  const { profile: businessProfile, isLoading: profileLoading } = useBusinessProfile()

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const handleBusinessSwitch = async (businessId: string) => {
    if (businessId === business?.businessId || isSwitching) return

    console.log('[EnhancedBusinessDisplay] Switching to business:', businessId)

    const success = await switchBusiness(businessId)
    if (success) {
      console.log('[EnhancedBusinessDisplay] Successfully switched business')
    } else {
      console.error('[EnhancedBusinessDisplay] Failed to switch business')
    }
  }

  // ============================================================================
  // Loading and Error States
  // ============================================================================

  const isLoading = contextLoading || membershipsLoading || profileLoading || isSwitching
  const hasError = contextError || membershipsError || switchError

  if (!isHydrated || isLoading) {
    return (
      <div className={cn('transition-all duration-300 ease-in-out', isExpanded ? 'p-6' : 'p-4')}>
        <div className={cn('flex items-center', isExpanded ? 'justify-between' : 'justify-center')}>
          <div className={cn('flex items-center', isExpanded ? 'space-x-3' : 'flex-col space-y-2')}>
            <BusinessLogo
              businessProfile={businessProfile}
              isHydrated={isHydrated}
              isExpanded={isExpanded}
            />
            {isExpanded && (
              <div className="flex flex-col">
                <div className="h-4 bg-gray-600 rounded w-24 animate-pulse"></div>
                <div className="h-3 bg-gray-600 rounded w-16 mt-1 animate-pulse"></div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (hasError || !business) {
    return (
      <div className={cn('transition-all duration-300 ease-in-out', isExpanded ? 'p-6' : 'p-4')}>
        <div className={cn('flex items-center', isExpanded ? 'justify-between' : 'justify-center')}>
          <div className={cn('flex items-center text-red-400', isExpanded ? 'space-x-3' : 'flex-col space-y-2')}>
            <AlertCircle className="w-8 h-8" />
            {isExpanded && (
              <span className="text-sm">Error loading business</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ============================================================================
  // Single Business Case - No Dropdown Needed
  // ============================================================================

  if (memberships.length <= 1) {
    return (
      <div className={cn('transition-all duration-300 ease-in-out', isExpanded ? 'p-6' : 'p-4')}>
        <div className={cn('flex items-center', isExpanded ? 'justify-between' : 'justify-center')}>
          {isExpanded ? (
            <>
              <Link href={`/${locale}`} className="flex items-center space-x-3 min-w-0 flex-1">
                <BusinessLogo
                  businessProfile={businessProfile}
                  isHydrated={isHydrated}
                  isExpanded={isExpanded}
                />
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-white whitespace-nowrap truncate" suppressHydrationWarning={true}>
                    {business.businessName}
                  </h2>
                  <div className="flex items-center mt-0.5">
                    <RoleBadge role={business.role} isOwner={business.isOwner} />
                  </div>
                </div>
              </Link>
              {onToggleExpand && (
                <button
                  onClick={onToggleExpand}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors flex-shrink-0 ml-3"
                  aria-label="Toggle sidebar"
                >
                  <ChevronUp className="w-5 h-5 rotate-90" />
                </button>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center space-y-2">
              <Link href={`/${locale}`} className="flex-shrink-0">
                <BusinessLogo
                  businessProfile={businessProfile}
                  isHydrated={isHydrated}
                  isExpanded={isExpanded}
                />
              </Link>
              {onToggleExpand && (
                <button
                  onClick={onToggleExpand}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                  aria-label="Toggle sidebar"
                >
                  <ChevronDown className="w-4 h-4 rotate-90" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ============================================================================
  // Multiple Business Case - Show Select Switcher
  // ============================================================================

  return (
    <div className={cn('transition-all duration-300 ease-in-out', isExpanded ? 'p-6' : 'p-4')}>
      <div className={cn('flex items-center', isExpanded ? 'justify-between' : 'justify-center')}>
        {isExpanded ? (
          <>
            <div className="flex items-center space-x-3 min-w-0 flex-1">
              <Select value={business?.businessId} onValueChange={handleBusinessSwitch} disabled={isSwitching}>
                <SelectTrigger className="border-none bg-transparent hover:bg-gray-700/50 p-2 h-auto min-h-0 focus:ring-0 focus:ring-offset-0">
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <BusinessLogo
                      businessProfile={businessProfile}
                      isHydrated={isHydrated}
                      isExpanded={isExpanded}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-white whitespace-nowrap truncate" suppressHydrationWarning={true}>
                          {business.businessName}
                        </h2>
                        <ChevronDown className="w-4 h-4 text-gray-400 ml-2 flex-shrink-0" />
                      </div>
                      <div className="flex items-center mt-0.5">
                        <RoleBadge role={business.role} isOwner={business.isOwner} />
                      </div>
                    </div>
                  </div>
                </SelectTrigger>
                <SelectContent className="w-80">
                  {memberships.map((membership) => (
                    <SelectItem key={membership.id} value={membership.id}>
                      <div className="flex items-center gap-3 w-full">
                        <Building2 className="h-4 w-4 text-gray-500 flex-shrink-0" />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="font-medium text-gray-900 truncate">
                            {membership.name}
                          </span>
                          <span className="text-xs text-gray-500 truncate">
                            {membership.country_code} • {membership.home_currency}
                          </span>
                        </div>
                        <div className="flex-shrink-0">
                          <RoleBadge
                            role={membership.membership.role}
                            isOwner={membership.isOwner}
                            size="xs"
                          />
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {onToggleExpand && (
              <button
                onClick={onToggleExpand}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors flex-shrink-0 ml-3"
                aria-label="Toggle sidebar"
              >
                <ChevronUp className="w-5 h-5 rotate-90" />
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center space-y-2">
            <div className="relative">
              <Select value={business?.businessId} onValueChange={handleBusinessSwitch} disabled={isSwitching}>
                <SelectTrigger className="border-none bg-transparent hover:bg-gray-700/50 p-1 h-auto min-h-0 focus:ring-0 focus:ring-offset-0 w-auto">
                  <div className="relative">
                    <BusinessLogo
                      businessProfile={businessProfile}
                      isHydrated={isHydrated}
                      isExpanded={isExpanded}
                    />
                    <div className="absolute -bottom-0.5 -right-0.5 bg-gray-800 rounded-full p-0.5">
                      <ChevronDown className="w-3 h-3 text-gray-400" />
                    </div>
                  </div>
                </SelectTrigger>
                <SelectContent className="w-80">
                  {memberships.map((membership) => (
                    <SelectItem key={membership.id} value={membership.id}>
                      <div className="flex items-center gap-3 w-full">
                        <Building2 className="h-4 w-4 text-gray-500 flex-shrink-0" />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="font-medium text-gray-900 truncate">
                            {membership.name}
                          </span>
                          <span className="text-xs text-gray-500 truncate">
                            {membership.country_code} • {membership.home_currency}
                          </span>
                        </div>
                        <div className="flex-shrink-0">
                          <RoleBadge
                            role={membership.membership.role}
                            isOwner={membership.isOwner}
                            size="xs"
                          />
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {onToggleExpand && (
              <button
                onClick={onToggleExpand}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                aria-label="Toggle sidebar"
              >
                <ChevronDown className="w-4 h-4 rotate-90" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}