'use client'

import React, { useState, useEffect } from 'react'
import { UserButton } from '@clerk/nextjs'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ThemeToggle } from '@/domains/utilities/components/theme-toggle'
import { FeedbackButton } from '@/domains/feedback'
import { NotificationBell } from '@/domains/notifications/components/notification-bell'
import { useActiveBusiness } from '@/contexts/business-context'
import { isNativePlatform } from '@/lib/capacitor/platform'
import { NativeUserButton } from '@/components/capacitor/native-user-button'

interface HeaderWithUserProps {
  title?: string
  subtitle?: string
  actions?: React.ReactNode
}

export default function HeaderWithUser({ title, subtitle, actions }: HeaderWithUserProps) {
  const { businessId } = useActiveBusiness()
  const [isNative, setIsNative] = useState(false)

  useEffect(() => {
    setIsNative(isNativePlatform())
  }, [])

  return (
    <header className="bg-card border-b border-border px-4 sm:px-6 py-3 sm:py-4">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Title and subtitle */}
        <div className="flex-1 min-w-0">
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