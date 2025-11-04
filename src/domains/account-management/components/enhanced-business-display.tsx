'use client'

/**
 * Enhanced Business Display Component for Sidebar
 * Combines business profile display with multi-tenant switching capability
 */

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronDown, Building2, Loader2, AlertCircle, Check, PanelLeftClose, PanelLeftOpen, MoreVertical } from 'lucide-react'
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
import { RoleBadge } from '@/components/ui/role-badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// Workspace Logo Component

interface WorkspaceLogoProps {
  businessProfile: any
  isHydrated: boolean
  size?: 'standard' | 'compact'
}

function WorkspaceLogo({ businessProfile, isHydrated, size = 'standard' }: WorkspaceLogoProps) {
  // Logo sizes - 56px for standard, 48px for compact
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
        className={cn(className, 'rounded-xl object-cover')}
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

// Main Enhanced Business Display Component

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

    // Switching to business

    const success = await switchBusiness(businessId)
    if (success) {
      // Successfully switched business
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
                <div className="h-4 bg-record-layer-2 rounded w-24 animate-pulse"></div>
                <div className="h-3 bg-record-layer-2 rounded w-16 mt-1 animate-pulse"></div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // CRITICAL FIX: Only show error state if there's an actual error AND we're not still loading
  // This prevents the transient "Error loading business" flash during normal initialization
  if (hasError && !isLoading) {
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

  // If no business context but still loading, show loading state instead of error
  if (!business && isLoading) {
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
                <div className="h-4 bg-record-layer-2 rounded w-24 animate-pulse"></div>
                <div className="h-3 bg-record-layer-2 rounded w-16 mt-1 animate-pulse"></div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // If no business context and not loading, this could be a genuine no-business state
  // (new user case) - still show loading to let context provider handle redirect
  if (!business) {
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
                <div className="h-4 bg-record-layer-2 rounded w-24 animate-pulse"></div>
                <div className="h-3 bg-record-layer-2 rounded w-16 mt-1 animate-pulse"></div>
              </div>
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
          <div className="p-3 relative">
            <button
              onClick={onToggleSidebar}
              className="absolute top-1/2 -translate-y-1/2 right-3 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="w-5 h-5" />
            </button>
            <Link href={`/${locale}`} className="flex items-center space-x-3 min-w-0 group rounded-lg hover:bg-accent p-3 transition-colors mr-12">
              <div className="relative">
                <WorkspaceLogo
                  businessProfile={businessProfile}
                  isHydrated={isHydrated}
                  size="standard"
                />
                {/* Dropdown indicator for multiple businesses - only show if multiple */}
                {memberships.length > 1 && (
                  <Select value={business?.businessId} onValueChange={handleBusinessSwitch} disabled={isSwitching}>
                    <SelectTrigger className="absolute -bottom-1 -right-1 w-6 h-6 p-0 border-2 border-border bg-background hover:bg-accent rounded-full flex items-center justify-center focus:ring-1 focus:ring-ring focus:ring-offset-0 transition-colors [&>svg]:hidden">
                      <ChevronDown className="w-3 h-3 text-foreground" />
                    </SelectTrigger>
                    <SelectContent className="w-80 bg-background text-foreground border border-border shadow-lg">
                      {memberships.map((membership) => {
                        const isSelected = membership.id === business?.businessId
                        return (
                          <SelectItem
                            key={membership.id}
                            value={membership.id}
                            className="py-3 cursor-pointer hover:bg-accent/50 focus:bg-accent/50"
                          >
                            <div className="flex items-center gap-3 w-full">
                              <Building2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                              <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium truncate text-foreground">
                                    {membership.name}
                                  </span>
                                </div>
                                <span className="text-xs text-muted-foreground truncate mt-1">
                                  {membership.country_code} • {membership.home_currency}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <RoleBadge
                                  roleType={membership.isOwner ? 'owner' : membership.membership.role}
                                  size="sm"
                                />
                                {/* MANAGE link placeholder for future implementation */}
                                <span className="text-xs text-primary opacity-0">MANAGE</span>
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
                    className="text-base font-bold text-foreground leading-tight group-hover:text-primary transition-colors truncate"
                    suppressHydrationWarning={true}
                  >
                    {business.businessName}
                  </h2>
                </div>
                {/* Brainwave-style: Subtle role indicator */}
                <div className="mt-2">
                  <RoleBadge roleType={business.isOwner ? 'owner' : business.role} />
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
                  <Link href={`/${locale}`} className="flex-shrink-0 rounded-lg hover:bg-accent p-2 transition-colors">
                    <WorkspaceLogo
                      businessProfile={businessProfile}
                      isHydrated={isHydrated}
                      size="compact"
                    />
                  </Link>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="px-3 py-2 ml-2 max-w-xs"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{business.businessName}</span>
                    </div>
                    <RoleBadge roleType={business.isOwner ? 'owner' : business.role} size="sm" />
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <button
              onClick={onToggleSidebar}
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
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
        <div className="p-3 relative">
          <button
            onClick={onToggleSidebar}
            className="absolute top-1/2 -translate-y-1/2 right-3 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="w-5 h-5" />
          </button>
          <Link href={`/${locale}`} className="flex items-center space-x-3 min-w-0 group rounded-lg hover:bg-accent p-3 transition-colors mr-2">
            <div className="relative">
              <WorkspaceLogo
                businessProfile={businessProfile}
                isHydrated={isHydrated}
                size="standard"
              />
              {/* Dropdown indicator for multiple businesses - only show if multiple */}
              {memberships.length > 1 && (
                <Select value={business?.businessId} onValueChange={handleBusinessSwitch} disabled={isSwitching}>
                  <SelectTrigger className="absolute -bottom-1 -right-1 w-6 h-6 p-0 border-2 border-border bg-background hover:bg-accent rounded-full flex items-center justify-center focus:ring-1 focus:ring-ring focus:ring-offset-0 transition-colors [&>svg:first-child]:hidden">
                    <ChevronDown className="w-3 h-3 text-foreground" />
                  </SelectTrigger>
                  <SelectContent className="w-80 bg-background text-foreground border border-border shadow-lg">
                    {memberships.map((membership) => {
                      const isSelected = membership.id === business?.businessId
                      return (
                        <SelectItem
                          key={membership.id}
                          value={membership.id}
                          className="py-3 cursor-pointer hover:bg-accent/50 focus:bg-accent/50"
                        >
                          <div className="flex items-center gap-3 w-full">
                            <Building2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            <div className="flex flex-col min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium truncate text-foreground">
                                  {membership.name}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground truncate mt-1">
                                {membership.country_code} • {membership.home_currency}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <RoleBadge
                                roleType={membership.isOwner ? 'owner' : membership.membership.role}
                                size="sm"
                              />
                              {/* MANAGE link placeholder for future implementation */}
                              <span className="text-xs text-primary opacity-0">MANAGE</span>
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
                  className="text-base font-bold text-foreground leading-tight group-hover:text-primary transition-colors truncate"
                  suppressHydrationWarning={true}
                >
                  {business.businessName}
                </h2>
              </div>
              {/* Brainwave-style: Subtle role indicator */}
              <div className="mt-2">
                <RoleBadge roleType={business.isOwner ? 'owner' : business.role} />
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
                  <Link href={`/${locale}`} className="flex-shrink-0 rounded-lg hover:bg-accent p-2 transition-colors block">
                    <WorkspaceLogo
                      businessProfile={businessProfile}
                      isHydrated={isHydrated}
                      size="compact"
                    />
                  </Link>
                  {/* Dropdown indicator for multiple businesses in collapsed state */}
                  {memberships.length > 1 && (
                    <Select value={business?.businessId} onValueChange={handleBusinessSwitch} disabled={isSwitching}>
                      <SelectTrigger className="absolute -bottom-1 -right-1 w-5 h-5 p-0 border-2 border-border bg-background hover:bg-accent rounded-full flex items-center justify-center focus:ring-1 focus:ring-ring focus:ring-offset-0 transition-colors [&>svg:first-child]:hidden">
                        <ChevronDown className="w-2.5 h-2.5 text-foreground" />
                      </SelectTrigger>
                      <SelectContent className="w-80 bg-background text-foreground border border-border shadow-lg">
                        {memberships.map((membership) => {
                          const isSelected = membership.id === business?.businessId
                          return (
                            <SelectItem
                              key={membership.id}
                              value={membership.id}
                              className="py-3 cursor-pointer hover:bg-accent/50 focus:bg-accent/50"
                            >
                              <div className="flex items-center gap-3 w-full">
                                <Building2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                <div className="flex flex-col min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium truncate text-foreground">
                                      {membership.name}
                                    </span>
                                  </div>
                                  <span className="text-xs text-muted-foreground truncate mt-1">
                                    {membership.country_code} • {membership.home_currency}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <RoleBadge
                                    roleType={membership.isOwner ? 'owner' : membership.membership.role}
                                    size="sm"
                                  />
                                  {/* MANAGE link placeholder for future implementation */}
                                  <span className="text-xs text-primary opacity-0">MANAGE</span>
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
                className="px-3 py-2 ml-2 max-w-xs"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{business.businessName}</span>
                  </div>
                  <RoleBadge roleType={business.isOwner ? 'owner' : business.role} size="sm" />
                  <div className="text-xs text-muted-foreground">
                    {memberships.length} workspace{memberships.length > 1 ? 's' : ''}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <button
            onClick={onToggleSidebar}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  )
}