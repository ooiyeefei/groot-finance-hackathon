'use client'

/**
 * Native User Button for Capacitor
 *
 * Replaces Clerk's <UserButton> when running in Capacitor WKWebView.
 * Clerk's built-in sign-out mechanism hangs in WKWebView because it
 * can't properly clear cookies. This component uses useClerk().signOut()
 * with explicit window.location.href redirect instead.
 *
 * Also includes business switching (multi-tenant) since the sidebar
 * business switcher is not accessible on mobile.
 */

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useUser, useClerk } from '@clerk/nextjs'
import { useLocale } from 'next-intl'
import { useBusinessMemberships, useBusinessContext } from '@/contexts/business-context'
import { LogOut, Loader2, Check } from 'lucide-react'

export function NativeUserButton() {
  const { user } = useUser()
  const { signOut } = useClerk()
  const locale = useLocale()
  const { memberships } = useBusinessMemberships()
  const { switchActiveBusiness, activeContext } = useBusinessContext()
  const activeBusinessId = activeContext?.businessId || null

  const [isOpen, setIsOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isSwitching, setIsSwitching] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      await signOut()
      window.location.href = `/${locale}/sign-in`
    } catch (error) {
      console.error('[NativeUserButton] Sign out error:', error)
      window.location.href = `/${locale}/sign-in`
    }
  }

  const handleSwitchBusiness = async (businessId: string) => {
    if (businessId === activeBusinessId) return
    setIsSwitching(businessId)
    try {
      const success = await switchActiveBusiness(businessId)
      if (success) {
        setIsOpen(false)
        window.location.href = `/${locale}`
      }
    } catch (error) {
      console.error('[NativeUserButton] Switch business error:', error)
    } finally {
      setIsSwitching(null)
    }
  }

  const initials = user?.firstName?.charAt(0)
    || user?.emailAddresses?.[0]?.emailAddress?.charAt(0)
    || '?'
  const imageUrl = user?.imageUrl
  const hasMultipleBusinesses = memberships.length > 1

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-8 h-8 rounded-full overflow-hidden border-2 border-border focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {imageUrl ? (
            <img src={imageUrl} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium">
              {initials.toUpperCase()}
            </div>
          )}
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full mt-2 w-64 bg-card border border-border rounded-lg shadow-lg z-50 py-1">
            {/* User email */}
            {user?.emailAddresses?.[0]?.emailAddress && (
              <div className="px-3 py-2 border-b border-border">
                <p className="text-xs text-muted-foreground truncate">
                  {user.emailAddresses[0].emailAddress}
                </p>
              </div>
            )}

            {/* Business switcher */}
            {hasMultipleBusinesses && (
              <div className="border-b border-border py-1">
                <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Businesses
                </p>
                {memberships.map((biz) => {
                  const isActive = biz.id === activeBusinessId
                  const isLoading = isSwitching === biz.id
                  return (
                    <button
                      key={biz.id}
                      onClick={() => handleSwitchBusiness(biz.id)}
                      disabled={isActive || isSwitching !== null}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-70"
                    >
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: biz.logo_fallback_color || '#6366f1' }}
                      >
                        {biz.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="flex-1 text-left text-foreground truncate">
                        {biz.name}
                      </span>
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

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {isSigningOut ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        )}
      </div>

      {/* Full-screen overlay during sign-out to prevent landing page flash */}
      {isSigningOut && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Signing out...</p>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
