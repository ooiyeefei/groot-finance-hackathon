'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Home, FileText, CreditCard, Receipt, MessageSquare, Settings, Menu, Users, CheckCircle, Tag, FileCheck, CalendarDays, FileSpreadsheet } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import EnhancedBusinessDisplay from '@/domains/account-management/components/enhanced-business-display'
import { fetchUserRoleWithCache, clearUserRoleCache } from '@/lib/cache-utils'
import { useTranslations, useLocale } from 'next-intl'
import { useActiveBusiness } from '@/contexts/business-context'
import { useSubscription } from '@/domains/billing/hooks/use-subscription'
import { TrialCountdown } from '@/domains/billing/components/trial-countdown'

interface UserRole {
  employee: boolean
  manager: boolean
  finance_admin: boolean
}

export default function Sidebar() {
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations('navigation')
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth()
  // CRITICAL CLS FIX: Initialize with null to prevent layout shift until hydration
  const [isExpanded, setIsExpanded] = useState<boolean | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false) // Track hydration completion
  const [hasInitialLoad, setHasInitialLoad] = useState(false) // Track if initial role load completed

  // CLS FIX: Initialize user role from localStorage cache to prevent nav expansion on load
  // This prevents the flash where nav items appear after role loads
  const [userRole, setUserRole] = useState<UserRole>(() => {
    // SSR-safe: return default on server
    if (typeof window === 'undefined') {
      return { employee: true, manager: false, finance_admin: false }
    }
    // Try to restore cached role from localStorage
    try {
      const cached = localStorage.getItem('sidebar-user-role')
      if (cached) {
        return JSON.parse(cached)
      }
    } catch {
      // Ignore parse errors
    }
    return { employee: true, manager: false, finance_admin: false }
  })

  // CRITICAL FIX: Listen to active business context changes
  const { business, businessId } = useActiveBusiness()

  // Fetch subscription data for trial countdown
  const { data: subscriptionData } = useSubscription()

  // Helper function to create localized hrefs (our i18n feature)
  const localizedHref = (path: string) => `/${locale}${path}`

  // Check if user is employee-only (not manager or finance_admin)
  const isEmployeeOnly = userRole.employee && !userRole.manager && !userRole.finance_admin

  // Check if user is finance_admin (owner or finance_admin role - has full access)
  const isAdmin = userRole.finance_admin

  // === Navigation Groups ===
  // Items are organized into visual groups separated by subtle dividers.
  // Empty groups (e.g. financeGroup for non-admins) are filtered out so no orphan dividers appear.

  // Group 1: Finance (admin/owner only) — core financial management tools
  const financeGroup = isAdmin ? [
    { name: t('dashboard'), href: localizedHref('/'), icon: Home },
    { name: t('invoices'), href: localizedHref('/invoices'), icon: FileText },
    { name: t('transactions'), href: localizedHref('/accounting'), icon: CreditCard },
  ] : []

  // Group 2: Workspace (all users) — day-to-day work items + conditional manager tools
  const workspaceGroup = [
    { name: t('expenseClaims'), href: localizedHref('/expense-claims'), icon: Receipt },
    { name: t('leaveManagement') || 'Leave Management', href: localizedHref('/leave-management'), icon: CalendarDays },
    ...(userRole.manager || userRole.finance_admin ? [
      { name: t('managerApprovals'), href: localizedHref('/manager/approvals'), icon: FileCheck },
    ] : []),
    { name: t('reporting') || 'Reporting & Exports', href: localizedHref('/reporting'), icon: FileSpreadsheet },
  ]

  // Group 3: Utility (all users) — settings only (AI Assistant removed, now floating widget)
  const utilityGroup = [
    { name: t('settings') || 'Settings', href: localizedHref('/business-settings'), icon: Settings },
  ]

  // Filter out empty groups, then render with separators between them
  const navigationGroups = [financeGroup, workspaceGroup, utilityGroup].filter(g => g.length > 0)

  // Load saved state from localStorage and fetch user role
  useEffect(() => {
    // Mark as hydrated - prevents hydration mismatch
    setIsHydrated(true)

    // Load cached user role to prevent hydration mismatch (synchronous cache check)
    // fetchUserRoleWithCache will be called in loadUserRole for full functionality

    // CRITICAL CLS FIX: Determine initial sidebar state without layout shift
    let initialExpanded = true // Desktop default
    const savedState = localStorage.getItem('sidebar-expanded')

    // Check if mobile first to avoid flash
    const isMobileDevice = window.innerWidth < 768
    setIsMobile(isMobileDevice)

    if (isMobileDevice) {
      // Mobile: always start collapsed
      initialExpanded = false
    } else if (savedState !== null) {
      // Desktop: use saved preference
      initialExpanded = JSON.parse(savedState)
    }

    // Set initial state only once to prevent CLS
    setIsExpanded(initialExpanded)

    // Setup responsive handler for future resizes
    const checkMobile = () => {
      const nowMobile = window.innerWidth < 768
      setIsMobile(nowMobile)
      // Only auto-collapse if transitioning to mobile
      if (nowMobile && !isMobileDevice) {
        setIsExpanded(false)
        localStorage.setItem('sidebar-expanded', JSON.stringify(false))
      }
    }

    window.addEventListener('resize', checkMobile)

    // Load user role using optimized cache-first approach
    // Wait for Clerk auth to be ready before making API calls
    const loadUserRole = async () => {
      // Don't fetch until auth is fully loaded and user is signed in
      if (!isAuthLoaded || !isSignedIn) {
        return
      }

      try {
        // Check cache first for instant loading (prefetched data should be available)
        const roleData = await fetchUserRoleWithCache()

        if (roleData && roleData.permissions) {
          setUserRole(roleData.permissions)
          // CLS FIX: Cache role in localStorage for instant restore on next page load
          try {
            localStorage.setItem('sidebar-user-role', JSON.stringify(roleData.permissions))
          } catch {
            // Ignore storage errors (quota exceeded, etc.)
          }
        }
      } catch (error) {
        console.error('[Sidebar] Failed to load user role:', error)
        // Fallback to default permissions on error
        setUserRole({ employee: true, manager: false, finance_admin: false })
      }

      // Mark initial load as completed to prevent duplicate calls
      setHasInitialLoad(true)
    }

    loadUserRole()

    return () => {
      window.removeEventListener('resize', checkMobile)
    }
  }, [isAuthLoaded, isSignedIn])


  // Fetch user role using centralized cache-first approach
  const fetchUserRole = useCallback(async () => {
    try {
      const roleData = await fetchUserRoleWithCache()

      if (roleData && roleData.permissions) {
        setUserRole(roleData.permissions)
        // CLS FIX: Cache role in localStorage for instant restore on next page load
        try {
          localStorage.setItem('sidebar-user-role', JSON.stringify(roleData.permissions))
        } catch {
          // Ignore storage errors
        }
      }
    } catch (error) {
      console.error('[Sidebar] Failed to fetch user role:', error)
    }
  }, [])

  // CRITICAL FIX: Re-fetch user role when active business context changes (but not on initial load)
  useEffect(() => {
    // Skip if this is the initial business context load (prevents duplicate API calls)
    if (!hasInitialLoad) {
      console.log('[Sidebar] Skipping business change effect - waiting for initial load completion')
      return
    }

    if (businessId) {
      console.log('[Sidebar] Active business changed, refreshing user role:', businessId)

      // Clear stale cached permissions when business changes
      clearUserRoleCache()

      // Fetch fresh permissions for new business context
      fetchUserRole()
    }
  }, [businessId, fetchUserRole, hasInitialLoad])

  // Save state to localStorage
  const toggleSidebar = () => {
    const newState = !isExpanded
    setIsExpanded(newState)
    localStorage.setItem('sidebar-expanded', JSON.stringify(newState))
  }

  // CRITICAL CLS FIX: Don't render sidebar until hydration determines proper width
  if (isExpanded === null) {
    // Return a stable placeholder that matches the final desktop collapsed width
    // Uses exact same dimensions as loaded sidebar to prevent any layout shift
    // Hidden on mobile - mobile uses bottom nav instead
    return (
      <div className="hidden sm:flex w-sidebar-collapsed bg-card border-r border-border flex-col relative min-h-screen">
        <div className="p-4 border-b border-border h-[68px] flex items-center">
          <div className="w-8 h-8 bg-muted rounded animate-pulse"></div>
        </div>
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {/* CLS FIX: Show 9 items to reserve space for manager/admin nav items */}
        {Array.from({ length: 9 }).map((_, i) => (
              <li key={i}>
                <div className="w-8 h-8 bg-muted rounded animate-pulse"></div>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    )
  }

  // Mobile: hide sidebar when collapsed (users use bottom nav)
  // Desktop: always show sidebar
  const shouldHideSidebar = isMobile && !isExpanded

  return (
    <TooltipProvider>
      <div className={`
        ${isExpanded ? 'w-sidebar' : 'w-sidebar-collapsed'}
        bg-card border-r border-border flex flex-col
        transition-all duration-300 ease-in-out
        ${isMobile ? 'fixed left-0 top-0 h-full z-50' : 'relative'}
        ${shouldHideSidebar ? '-translate-x-full' : 'translate-x-0'}
      `}>
        {/* Material Design Workspace Header */}
        <EnhancedBusinessDisplay
          isExpanded={isExpanded}
          isHydrated={isHydrated}
          locale={locale}
          onToggleSidebar={toggleSidebar}
        />
        
        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navigationGroups.map((group, groupIndex) => {
              const renderItem = (item: typeof group[number]) => {
                const isActive = item.href === `/${locale}`
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`)
                const NavItem = (
                  <Link
                    href={item.href}
                    className={`
                      flex items-center rounded-lg transition-colors relative
                      ${isExpanded ? 'p-3' : 'p-3 justify-center'}
                      ${isActive
                        ? 'bg-accent/70 text-accent-foreground font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }
                    `}
                  >
                    <item.icon className={`w-5 h-5 ${isExpanded ? 'mr-3' : ''} flex-shrink-0`} />
                    <span className={`
                      transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap flex-1
                      ${isExpanded ? 'opacity-100 max-w-none' : 'opacity-0 max-w-0'}
                    `}>
                      {item.name}
                    </span>
                    {/* Badge for notifications */}
                    {'badge' in item && (item as any).badge && (
                      <Badge
                        variant="destructive"
                        className={`
                          text-xs px-1.5 py-0.5 min-w-[20px] h-5 flex items-center justify-center
                          ${isExpanded ? 'ml-2' : 'absolute -top-1 -right-1 scale-75'}
                          ${isExpanded ? 'opacity-100' : 'opacity-100'}
                        `}
                      >
                        {(item as any).badge}
                      </Badge>
                    )}
                  </Link>
                )

                return (
                  <li key={item.name}>
                    {!isExpanded ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {NavItem}
                        </TooltipTrigger>
                        <TooltipContent side="right" className="ml-2">
                          <div className="flex items-center gap-2">
                            {item.name}
                            {'badge' in item && (item as any).badge && (
                              <Badge variant="destructive" className="text-xs">
                                {(item as any).badge}
                              </Badge>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      NavItem
                    )}
                  </li>
                )
              }

              return (
                <li key={`group-${groupIndex}`} className="list-none">
                  {/* Separator between groups (not before the first group) */}
                  {groupIndex > 0 && (
                    <div className="my-2 mx-1 border-t border-border/50" />
                  )}
                  <ul className="space-y-1">
                    {group.map(renderItem)}
                  </ul>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Trial Countdown - shown only for trial users */}
        {subscriptionData?.trial?.isOnTrial && (
          <div className="px-4 pb-3">
            {isExpanded ? (
              <TrialCountdown
                trial={subscriptionData.trial}
                compact={false}
                showUpgradeButton={true}
              />
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <TrialCountdown
                      trial={subscriptionData.trial}
                      compact={true}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[200px]">
                  <p className="text-sm font-medium">
                    {subscriptionData.trial.daysRemaining} days left in trial
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* AI Disclaimer */}
        <div className="px-4 pb-3">
          <div className="text-xs text-muted-foreground">
            {isExpanded ? (
              <p className="leading-relaxed">
                AI models may make mistakes, double-check outputs.
              </p>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex justify-center">
                    <MessageSquare className="w-4 h-4 opacity-60" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[200px]">
                  AI models may make mistakes, double-check outputs.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

      </div>

      {/* Mobile overlay */}
      {isMobile && isExpanded && (
        <div
          className="fixed inset-0 bg-background/50 backdrop-blur-sm z-40"
          onClick={() => setIsExpanded(false)}
        />
      )}
    </TooltipProvider>
  )
}