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
import { Crown, ChevronDown, Building2, Loader2, AlertCircle, Check, PanelLeftClose, PanelLeftOpen, MoreVertical } from 'lucide-react'
import {
  useActiveBusiness,
  useBusinessMemberships,
  useBusinessSwitcher
} from '@/contexts/business-context'
import { useBusinessProfile } from '@/contexts/business-context'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
  const getRoleColors = (role: string, isOwner: boolean) => {
    if (isOwner) return 'bg-yellow-900/30 text-yellow-400 border-yellow-500/30' // Owner - dark theme
    switch (role) {
      case 'admin': return 'bg-purple-900/30 text-purple-400 border-purple-500/30'
      case 'manager': return 'bg-blue-900/30 text-blue-400 border-blue-500/30'
      default: return 'bg-gray-700/50 text-gray-300 border-gray-600/50' // Employee - dark theme
    }
  }

  const getRoleLabel = (role: string, isOwner: boolean) => {
    if (isOwner) return 'Owner'
    return role.charAt(0).toUpperCase() + role.slice(1)
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {isOwner && <Crown className={cn('text-yellow-400', size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3')} />}
      <Badge
        variant="outline"
        className={cn(
          getRoleColors(role, isOwner || false),
          size === 'xs' ? 'text-[10px] px-1.5 py-0.5 h-4' : 'text-xs px-2 py-1 h-5'
        )}
      >
        {getRoleLabel(role, isOwner || false)}
      </Badge>
    </div>
  )
}

// ============================================================================
// Material Design Workspace Logo Component
// ============================================================================

interface WorkspaceLogoProps {
  businessProfile: any
  isHydrated: boolean
  size?: 'standard' | 'compact'
}

function WorkspaceLogo({ businessProfile, isHydrated, size = 'standard' }: WorkspaceLogoProps) {
  // Material Design: Maximized logo sizes - 56px for standard, 48px for compact
  const dimensions = size === 'standard' ? { width: 56, height: 56, className: 'w-14 h-14' } : { width: 48, height: 48, className: 'w-12 h-12' }
  const { width, height, className } = dimensions

  const shouldShowLogo = isHydrated && businessProfile?.logo_url
  const getBusinessInitial = () => businessProfile?.name?.[0]?.toUpperCase() || 'B'

  if (shouldShowLogo) {
    return (
      <Image
        src={businessProfile.logo_url}
        alt="Workspace Logo"
        width={width}
        height={height}
        className={cn(className, 'rounded-xl object-cover')} // Material Design: 12px border radius for squircle
      />
    )
  }

  return (
    <div
      className={cn(
        className,
        'rounded-xl flex items-center justify-center text-white font-semibold',
        size === 'standard' ? 'text-lg' : 'text-base'
      )}
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
  onToggleSidebar: () => void
}

export default function EnhancedBusinessDisplay({
  isExpanded,
  isHydrated,
  locale,
  onToggleSidebar
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

  // Debug logging for error flash issue
  if (hasError && process.env.NODE_ENV === 'development') {
    console.log('[EnhancedBusinessDisplay] Error state detected:', {
      contextError,
      membershipsError,
      switchError,
      isLoading,
      business: business?.businessId || 'none'
    })
  }

  if (!isHydrated || isLoading) {
    return (
      <div className={cn('transition-all duration-300 ease-in-out', isExpanded ? 'p-4' : 'p-3')}>
        <div className={cn('flex items-center', isExpanded ? 'justify-between' : 'justify-center')}>
          <div className={cn('flex items-center', isExpanded ? 'space-x-3' : 'flex-col space-y-2')}>
            <WorkspaceLogo
              businessProfile={businessProfile}
              isHydrated={isHydrated}
              size={isExpanded ? 'standard' : 'compact'}
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
      <div className={cn('transition-all duration-300 ease-in-out', isExpanded ? 'p-4' : 'p-3')}>
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
  // Material Design: Single Workspace Display (No Switcher Needed)
  // ============================================================================

  if (memberships.length <= 1) {
    return (
      <div className={cn('transition-all duration-300 ease-in-out')}>
        {isExpanded ? (
          // Brainwave-style: Clean expanded workspace header
          <div className="p-3 border-b border-gray-700/50 relative">
            <button
              onClick={onToggleSidebar}
              className="absolute top-1/2 -translate-y-1/2 right-3 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="w-5 h-5" />
            </button>
            <Link href={`/${locale}`} className="flex items-center space-x-3 min-w-0 group rounded-lg hover:bg-gray-700/30 p-3 transition-colors mr-12">
              <div className="relative">
                <WorkspaceLogo
                  businessProfile={businessProfile}
                  isHydrated={isHydrated}
                  size="standard"
                />
                {/* Dropdown indicator for multiple businesses - only show if multiple */}
                {memberships.length > 1 && (
                  <Select value={business?.businessId} onValueChange={handleBusinessSwitch} disabled={isSwitching}>
                    <SelectTrigger className="absolute -bottom-1 -right-1 w-6 h-6 p-0 border-2 border-gray-600/50 bg-gray-600 hover:bg-gray-500 rounded-full flex items-center justify-center focus:ring-1 focus:ring-blue-500 focus:ring-offset-0 transition-colors [&>svg]:hidden">
                      <ChevronDown className="w-3 h-3 text-white" />
                    </SelectTrigger>
                    <SelectContent className="w-80 bg-gray-800 border border-gray-600/50 shadow-2xl backdrop-blur-sm"
                      style={{
                        boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.3), 0px 0px 0px 1px rgba(255, 255, 255, 0.1)'
                      }}>
                      {memberships.map((membership) => {
                        const isSelected = membership.id === business?.businessId
                        return (
                          <SelectItem
                            key={membership.id}
                            value={membership.id}
                            className={cn(
                              "focus:bg-gray-700 focus:text-gray-100 py-3 cursor-pointer",
                              isSelected && "bg-gray-100/10 backdrop-blur-sm"
                            )}
                          >
                            <div className="flex items-center gap-3 w-full">
                              <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                              <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-100 truncate">
                                    {membership.name}
                                  </span>
                                </div>
                                <span className="text-xs text-gray-400 truncate mt-1">
                                  {membership.country_code} • {membership.home_currency}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <RoleBadge
                                  role={membership.membership.role}
                                  isOwner={membership.isOwner}
                                  size="xs"
                                />
                                {/* MANAGE link placeholder for future implementation */}
                                <span className="text-xs text-blue-400 opacity-0">MANAGE</span>
                              </div>
                            </div>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {/* Brainwave-style: Clean business name with better typography */}
                <div className="flex items-center gap-2">
                  <h2
                    className="text-base font-bold text-white leading-tight group-hover:text-blue-300 transition-colors truncate"
                    suppressHydrationWarning={true}
                  >
                    {business.businessName}
                  </h2>
                </div>
                {/* Brainwave-style: Subtle role indicator */}
                <div className="mt-2">
                  <RoleBadge role={business.role} isOwner={business.isOwner} size="sm" />
                </div>
              </div>
            </Link>
          </div>
        ) : (
          // Collapsed state: Logo with Brainwave-style tooltip
          <div className="p-1 flex flex-col items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href={`/${locale}`} className="flex-shrink-0 rounded-lg hover:bg-gray-700/30 p-2 transition-colors">
                    <WorkspaceLogo
                      businessProfile={businessProfile}
                      isHydrated={isHydrated}
                      size="compact"
                    />
                  </Link>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="bg-gray-900 border-gray-700 text-white px-3 py-2 ml-2 max-w-xs"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{business.businessName}</span>
                    </div>
                    <RoleBadge role={business.role} isOwner={business.isOwner} size="xs" />
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <button
              onClick={onToggleSidebar}
              className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    )
  }

  // ============================================================================
  // Unified Business Display (Single and Multiple Businesses)
  // ============================================================================

  return (
    <div className={cn('transition-all duration-300 ease-in-out')}>
      {isExpanded ? (
        // Brainwave-style: Clean expanded workspace header with logo overlay dropdown
        <div className="p-3 border-b border-gray-700/50 relative">
          <button
            onClick={onToggleSidebar}
            className="absolute top-1/2 -translate-y-1/2 right-3 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="w-5 h-5" />
          </button>
          <Link href={`/${locale}`} className="flex items-center space-x-3 min-w-0 group rounded-lg hover:bg-gray-700/30 p-3 transition-colors mr-2">
            <div className="relative">
              <WorkspaceLogo
                businessProfile={businessProfile}
                isHydrated={isHydrated}
                size="standard"
              />
              {/* Dropdown indicator for multiple businesses - only show if multiple */}
              {memberships.length > 1 && (
                <Select value={business?.businessId} onValueChange={handleBusinessSwitch} disabled={isSwitching}>
                  <SelectTrigger className="absolute -bottom-1 -right-1 w-6 h-6 p-0 border-2 border-gray-600/50 bg-gray-600 hover:bg-gray-500 rounded-full flex items-center justify-center focus:ring-1 focus:ring-blue-500 focus:ring-offset-0 transition-colors [&>svg:first-child]:hidden">
                    <ChevronDown className="w-3 h-3 text-white" />
                  </SelectTrigger>
                  <SelectContent className="w-80 bg-gray-800 border border-gray-600/50 shadow-2xl backdrop-blur-sm"
                    style={{
                      boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.3), 0px 0px 0px 1px rgba(255, 255, 255, 0.1)'
                    }}>
                    {memberships.map((membership) => {
                      const isSelected = membership.id === business?.businessId
                      return (
                        <SelectItem
                          key={membership.id}
                          value={membership.id}
                          className={cn(
                            "focus:bg-gray-700 focus:text-gray-100 py-3 cursor-pointer",
                            isSelected && "bg-gray-100/10 backdrop-blur-sm"
                          )}
                        >
                          <div className="flex items-center gap-3 w-full">
                            <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <div className="flex flex-col min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-100 truncate">
                                  {membership.name}
                                </span>
                              </div>
                              <span className="text-xs text-gray-400 truncate mt-1">
                                {membership.country_code} • {membership.home_currency}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <RoleBadge
                                role={membership.membership.role}
                                isOwner={membership.isOwner}
                                size="xs"
                              />
                              {/* MANAGE link placeholder for future implementation */}
                              <span className="text-xs text-blue-400 opacity-0">MANAGE</span>
                            </div>
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="min-w-0 flex-1">
              {/* Brainwave-style: Clean business name with better typography */}
              <div className="flex items-center gap-2">
                <h2
                  className="text-base font-bold text-white leading-tight group-hover:text-blue-300 transition-colors truncate"
                  suppressHydrationWarning={true}
                >
                  {business.businessName}
                </h2>
              </div>
              {/* Brainwave-style: Subtle role indicator */}
              <div className="mt-2">
                <RoleBadge role={business.role} isOwner={business.isOwner} size="sm" />
              </div>
            </div>
          </Link>
        </div>
      ) : (
        // Collapsed state: Logo with tooltip and optional dropdown overlay
        <div className="p-1 flex flex-col items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Link href={`/${locale}`} className="flex-shrink-0 rounded-lg hover:bg-gray-700/30 p-2 transition-colors block">
                    <WorkspaceLogo
                      businessProfile={businessProfile}
                      isHydrated={isHydrated}
                      size="compact"
                    />
                  </Link>
                  {/* Dropdown indicator for multiple businesses in collapsed state */}
                  {memberships.length > 1 && (
                    <Select value={business?.businessId} onValueChange={handleBusinessSwitch} disabled={isSwitching}>
                      <SelectTrigger className="absolute -bottom-1 -right-1 w-5 h-5 p-0 border-2 border-gray-600/50 bg-gray-600 hover:bg-gray-500 rounded-full flex items-center justify-center focus:ring-1 focus:ring-blue-500 focus:ring-offset-0 transition-colors [&>svg:first-child]:hidden">
                        <ChevronDown className="w-2.5 h-2.5 text-white" />
                      </SelectTrigger>
                      <SelectContent className="w-80 bg-gray-800 border border-gray-600/50 shadow-2xl backdrop-blur-sm"
                        style={{
                          boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.3), 0px 0px 0px 1px rgba(255, 255, 255, 0.1)'
                        }}>
                        {memberships.map((membership) => {
                          const isSelected = membership.id === business?.businessId
                          return (
                            <SelectItem
                              key={membership.id}
                              value={membership.id}
                              className={cn(
                                "focus:bg-gray-700 focus:text-gray-100 py-3 cursor-pointer",
                                isSelected && "bg-gray-100/10 backdrop-blur-sm"
                              )}
                            >
                              <div className="flex items-center gap-3 w-full">
                                <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                                <div className="flex flex-col min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-100 truncate">
                                      {membership.name}
                                    </span>
                                  </div>
                                  <span className="text-xs text-gray-400 truncate mt-1">
                                    {membership.country_code} • {membership.home_currency}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <RoleBadge
                                    role={membership.membership.role}
                                    isOwner={membership.isOwner}
                                    size="xs"
                                  />
                                  {/* MANAGE link placeholder for future implementation */}
                                  <span className="text-xs text-blue-400 opacity-0">MANAGE</span>
                                </div>
                              </div>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="bg-gray-900 border-gray-700 text-white px-3 py-2 ml-2 max-w-xs"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{business.businessName}</span>
                  </div>
                  <RoleBadge role={business.role} isOwner={business.isOwner} size="xs" />
                  <div className="text-xs text-gray-400">
                    {memberships.length} workspace{memberships.length > 1 ? 's' : ''}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <button
            onClick={onToggleSidebar}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  )
}