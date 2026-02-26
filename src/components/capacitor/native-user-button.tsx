'use client'

/**
 * Native User Button for Capacitor
 *
 * Replaces Clerk's <UserButton> when running in Capacitor WKWebView.
 * Clerk's built-in sign-out mechanism hangs in WKWebView because it
 * can't properly clear cookies. This component uses useClerk().signOut()
 * with explicit window.location.href redirect instead.
 */

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useUser, useClerk } from '@clerk/nextjs'
import { useLocale } from 'next-intl'
import { LogOut, Loader2 } from 'lucide-react'

export function NativeUserButton() {
  const { user } = useUser()
  const { signOut } = useClerk()
  const locale = useLocale()
  const [isOpen, setIsOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
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
      // Force redirect even if signOut fails — clear the WKWebView state
      window.location.href = `/${locale}/sign-in`
    }
  }

  const initials = user?.firstName?.charAt(0)
    || user?.emailAddresses?.[0]?.emailAddress?.charAt(0)
    || '?'
  const imageUrl = user?.imageUrl

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
          <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-lg shadow-lg z-50 py-1">
            {user?.emailAddresses?.[0]?.emailAddress && (
              <div className="px-3 py-2 border-b border-border">
                <p className="text-xs text-muted-foreground truncate">
                  {user.emailAddresses[0].emailAddress}
                </p>
              </div>
            )}
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
