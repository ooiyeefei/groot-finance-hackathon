'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { hapticTap } from '@/lib/utils/haptics'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export interface BottomNavItem {
  icon: React.ComponentType<{ className?: string }>
  label: string
  href: string
  /** Badge count to show (optional) */
  badge?: number
}

export interface BottomNavProps {
  items: BottomNavItem[]
  className?: string
}

/**
 * Mobile Bottom Navigation Component
 *
 * Features:
 * - Fixed position at bottom with safe area padding for notched devices
 * - 44x44px minimum touch targets per Material Design guidelines
 * - Semantic tokens for light/dark mode compatibility
 * - Active state with primary color indicator
 * - Haptic feedback on tap
 * - Badge support for notification counts
 */
export function BottomNav({ items, className }: BottomNavProps) {
  const pathname = usePathname()

  const handleNavClick = () => {
    hapticTap()
  }

  return (
    <TooltipProvider delayDuration={300}>
      <nav
        className={cn(
          // Fixed position at bottom
          'fixed bottom-0 left-0 right-0 z-40',
          // Background with blur effect
          'bg-surface/95 backdrop-blur-md',
          // Border and shadow
          'border-t border-border',
          // Safe area padding for notched devices (iPhone X+)
          'pb-safe-area-inset-bottom',
          // Hide on larger screens
          'sm:hidden',
          className
        )}
        style={{
          // Fallback for browsers without env() support
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0px)'
        }}
      >
        {/* Horizontally scrollable container for overflow items */}
        <div
          className="flex items-center h-16 overflow-x-auto scrollbar-hide"
          style={{
            // Hide scrollbar but allow scrolling
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
            const Icon = item.icon

            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    onClick={handleNavClick}
                    className={cn(
                      // Base styles - relative needed for active indicator dot positioning
                      'relative flex flex-col items-center justify-center',
                      // Fixed width for each nav item (allows scrolling)
                      'min-w-[72px] w-[72px] h-full flex-shrink-0',
                      // Padding for tap area
                      'px-1 py-1',
                      // Transition
                      'transition-colors duration-200',
                      // Focus state
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      // Active/inactive states
                      isActive
                        ? 'text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {/* Icon with badge container */}
                    <div className="relative">
                      <Icon
                        className={cn(
                          'w-6 h-6 transition-transform duration-200',
                          isActive && 'scale-110'
                        )}
                      />
                      {/* Badge for notifications */}
                      {item.badge !== undefined && item.badge > 0 && (
                        <span
                          className={cn(
                            'absolute -top-1 -right-1',
                            'min-w-[16px] h-4 px-1',
                            'flex items-center justify-center',
                            'text-[10px] font-bold',
                            'bg-destructive text-destructive-foreground',
                            'rounded-full'
                          )}
                        >
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      )}
                    </div>

                    {/* Label */}
                    <span
                      className={cn(
                        'text-[10px] mt-0.5 font-medium',
                        'truncate max-w-full text-center'
                      )}
                    >
                      {item.label}
                    </span>

                    {/* Active indicator dot */}
                    {isActive && (
                      <span
                        className={cn(
                          'absolute top-0 left-1/2 -translate-x-1/2',
                          'w-1 h-1 rounded-full bg-primary'
                        )}
                      />
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="top" className="mb-1">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </nav>
    </TooltipProvider>
  )
}

/**
 * Spacer component to prevent content from being hidden behind bottom nav
 * Add this at the bottom of page content on mobile
 */
export function BottomNavSpacer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'h-20 sm:h-0', // 80px on mobile, 0 on larger screens
        className
      )}
      aria-hidden="true"
    />
  )
}

export default BottomNav
