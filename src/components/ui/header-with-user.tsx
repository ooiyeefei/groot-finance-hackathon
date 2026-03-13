'use client'

import React, { useState, useEffect, useRef } from 'react'
import { UserButton } from '@clerk/nextjs'
import { useLocale } from 'next-intl'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ThemeToggle } from '@/domains/utilities/components/theme-toggle'
import { FeedbackButton } from '@/domains/feedback'
import { NotificationBell } from '@/domains/notifications/components/notification-bell'
import { useActiveBusiness } from '@/contexts/business-context'
import { useBusinessMemberships, useBusinessContext } from '@/contexts/business-context'
import { isNativePlatform } from '@/lib/capacitor/platform'
import { NativeUserButton } from '@/components/capacitor/native-user-button'
import { EarnHeaderButton } from '@/domains/referral/components/earn-header-button'
import { Check, ChevronDown, Loader2 } from 'lucide-react'

interface HeaderWithUserProps {
  title?: string
  subtitle?: string
  actions?: React.ReactNode
}

/**
 * Compact business switcher for mobile header.
 * Only visible on mobile (sm:hidden) when user has multiple businesses.
 * On desktop, the sidebar's EnhancedBusinessDisplay handles this.
 */
function MobileBusinessSwitcher() {
  const locale = useLocale()
  const { memberships } = useBusinessMemberships()
  const { switchActiveBusiness, activeContext } = useBusinessContext()
  const activeBusinessId = activeContext?.businessId || null
  const activeBusiness = memberships.find(b => b.id === activeBusinessId)

  const [isOpen, setIsOpen] = useState(false)
  const [isSwitching, setIsSwitching] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  if (memberships.length <= 1) return null

  const handleSwitch = async (businessId: string) => {
    if (businessId === activeBusinessId) { setIsOpen(false); return }
    setIsSwitching(businessId)
    try {
      const success = await switchActiveBusiness(businessId)
      if (success) {
        setIsOpen(false)
        window.location.href = `/${locale}`
      }
    } catch (error) {
      console.error('[MobileBusinessSwitcher] Error:', error)
    } finally {
      setIsSwitching(null)
    }
  }

  return (
    <div className="relative sm:hidden" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/50 hover:bg-muted transition-colors max-w-[120px]"
      >
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
          style={{ backgroundColor: activeBusiness?.logo_fallback_color || '#6366f1' }}
        >
          {activeBusiness?.name.charAt(0).toUpperCase() || '?'}
        </div>
        <span className="text-xs text-foreground truncate">{activeBusiness?.name || 'Business'}</span>
        <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-56 bg-card border border-border rounded-lg shadow-lg z-50 py-1">
          <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Switch Business
          </p>
          {memberships.map((biz) => {
            const isActive = biz.id === activeBusinessId
            const isLoading = isSwitching === biz.id
            return (
              <button
                key={biz.id}
                onClick={() => handleSwitch(biz.id)}
                disabled={isActive || isSwitching !== null}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-70"
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: biz.logo_fallback_color || '#6366f1' }}
                >
                  {biz.name.charAt(0).toUpperCase()}
                </div>
                <span className="flex-1 text-left text-foreground truncate">{biz.name}</span>
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground flex-shrink-0" />
                ) : isActive ? (
                  <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                ) : null}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function HeaderWithUser({ title, subtitle, actions }: HeaderWithUserProps) {
  const { businessId } = useActiveBusiness()
  const [isNative, setIsNative] = useState(false)

  useEffect(() => {
    setIsNative(isNativePlatform())
  }, [])

  return (
    <header className="bg-card border-b border-border px-4 sm:px-6 py-3 sm:py-4" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 0.75rem)' }}>
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Business switcher (mobile) + Title */}
        <div className="flex-1 min-w-0">
          <MobileBusinessSwitcher />
          <h1 className="text-xl sm:text-3xl font-bold text-foreground truncate">{title}</h1>
          {subtitle && (
            <p className="text-muted-foreground text-sm sm:text-base truncate">{subtitle}</p>
          )}
        </div>

        {/* Center: Actions */}
        {actions && (
          <div className="flex items-center gap-2 sm:gap-3">
            {actions}
          </div>
        )}

        {/* Right: Notifications, feedback, theme toggle, language switcher and user button */}
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          <NotificationBell businessId={businessId} />
          {!isNative && <EarnHeaderButton />}
          <span className="hidden sm:inline-flex"><FeedbackButton /></span>
          <ThemeToggle />
          <span className="hidden sm:inline-flex"><LanguageSwitcher /></span>
          {isNative ? (
            <NativeUserButton />
          ) : (
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  avatarBox: "w-8 h-8",
                }
              }}
            />
          )}
        </div>
      </div>
    </header>
  )
}