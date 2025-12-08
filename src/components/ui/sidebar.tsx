'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { Home, FileText, CreditCard, Receipt, MessageSquare, Settings, Menu, Users, CheckCircle, Tag, Building2, FileCheck } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import EnhancedBusinessDisplay from '@/domains/account-management/components/enhanced-business-display'
import { fetchUserRoleWithCache, clearUserRoleCache } from '@/lib/cache-utils'
import { useTranslations, useLocale } from 'next-intl'
import { useActiveBusiness } from '@/contexts/business-context'

interface UserRole {
  employee: boolean
  manager: boolean
  admin: boolean
}

export default function Sidebar() {
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations('navigation')
  // CRITICAL CLS FIX: Initialize with null to prevent layout shift until hydration
  const [isExpanded, setIsExpanded] = useState<boolean | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false) // Track hydration completion
  const [hasInitialLoad, setHasInitialLoad] = useState(false) // Track if initial role load completed

  // Initialize user role with default state to prevent hydration mismatch
  const [userRole, setUserRole] = useState<UserRole>({ employee: true, manager: false, admin: false })

  // CRITICAL FIX: Listen to active business context changes
  const { business, businessId } = useActiveBusiness()

  // Helper function to create localized hrefs (our i18n feature)
  const localizedHref = (path: string) => `/${locale}${path}`
  // Core navigation items (available to everyone) - Part 1
  const coreNavigationPart1 = [
    { name: t('dashboard'), href: localizedHref('/'), icon: Home },
    { name: t('invoices'), href: localizedHref('/invoices'), icon: FileText },
    { name: t('transactions'), href: localizedHref('/accounting'), icon: CreditCard },
    { name: t('expenseClaims'), href: localizedHref('/expense-claims'), icon: Receipt },
  ]

  // Manager/Admin navigation items (approvals between expense claims and AI assistant)
  const managerNavigation = userRole.manager || userRole.admin ? [
    { name: t('managerApprovals'), href: localizedHref('/manager/approvals'), icon: FileCheck },
  ] : []

  // Core navigation items (available to everyone) - Part 2
  const coreNavigationPart2 = [
    { name: t('aiAssistant'), href: localizedHref('/ai-assistant'), icon: MessageSquare },
  ]

  // Business management navigation (managers and admins only)
  const businessNavigation = userRole.manager || userRole.admin ? [
    { name: t('businessSettings'), href: localizedHref('/business-settings'), icon: Building2 },
  ] : []

  // Personal settings (available to everyone)
  const settingsNavigation = [
    { name: t('settings'), href: localizedHref('/settings'), icon: Settings }
  ]

  // Build complete navigation based on role
  const navigation = [
    ...coreNavigationPart1,
    ...managerNavigation,
    ...coreNavigationPart2,
    ...businessNavigation,
    ...settingsNavigation
  ]

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
    const loadUserRole = async () => {
      try {
        // Check cache first for instant loading (prefetched data should be available)
        const roleData = await fetchUserRoleWithCache()

        if (roleData && roleData.permissions) {
          setUserRole(roleData.permissions)
        }
      } catch (error) {
        console.error('[Sidebar] Failed to load user role:', error)
        // Fallback to default permissions on error
        setUserRole({ employee: true, manager: false, admin: false })
      }

      // Mark initial load as completed to prevent duplicate calls
      setHasInitialLoad(true)
    }

    loadUserRole()

    return () => {
      window.removeEventListener('resize', checkMobile)
    }
  }, [])


  // Fetch user role using centralized cache-first approach
  const fetchUserRole = useCallback(async () => {
    try {
      const roleData = await fetchUserRoleWithCache()

      if (roleData && roleData.permissions) {
        setUserRole(roleData.permissions)
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
    return (
      <div className="w-sidebar-collapsed bg-card border-r border-border flex flex-col relative">
        <div className="p-4 border-b border-border">
          <div className="w-8 h-8 bg-record-layer-2 rounded animate-pulse"></div>
        </div>
        <div className="flex-1 p-4">
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-8 h-8 bg-record-layer-2 rounded animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className={`
        ${isExpanded ? 'w-sidebar' : 'w-sidebar-collapsed'}
        bg-card border-r border-border flex flex-col
        transition-all duration-300 ease-in-out
        ${isMobile ? 'fixed left-0 top-0 h-full z-50' : 'relative'}
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
            {navigation.map((item) => {
              const isActive = pathname === item.href
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
                      variant="secondary" 
                      className={`
                        bg-red-600 text-white text-xs px-1.5 py-0.5 min-w-[20px] h-5 flex items-center justify-center
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
                            <Badge variant="secondary" className="bg-red-600 text-white text-xs">
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
            })}
          </ul>
        </nav>

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

        {/* Powered by FinanSEAL */}
        <div className="p-4">
          {isExpanded ? (
            <div className="flex items-center justify-center space-x-2 text-muted-foreground text-sm">
              <span>Powered by</span>
              <Image
                src="https://ohxwghdgsuyabgsndfzc.supabase.co/storage/v1/object/public/business-profiles/cc5fdbbc-1459-43ad-9736-3cc65649d23b/logo_1760635116031.png"
                alt="FinanSEAL"
                width={27}
                height={27}
                className="rounded opacity-80"
              />
              <span className="font-medium">FinanSEAL</span>
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="relative group">
                <Image
                  src="https://ohxwghdgsuyabgsndfzc.supabase.co/storage/v1/object/public/business-profiles/cc5fdbbc-1459-43ad-9736-3cc65649d23b/logo_1760635116031.png"
                  alt="Powered by FinanSEAL"
                  width={23}
                  height={23}
                  className="rounded opacity-60 hover:opacity-80 transition-opacity"
                />
                {/* Tooltip for collapsed state */}
                <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                  Powered by FinanSEAL
                </div>
              </div>
            </div>
          )}
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