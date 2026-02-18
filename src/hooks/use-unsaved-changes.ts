/**
 * useUnsavedChanges Hook
 * 
 * Tracks form dirty state and warns users when navigating away with unsaved changes.
 * Works with Next.js App Router navigation and browser beforeunload events.
 */

'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'

interface UseUnsavedChangesOptions {
  isDirty: boolean
  message?: string
  onBeforeUnload?: () => boolean
}

export function useUnsavedChanges({
  isDirty,
  message = 'You have unsaved changes. Are you sure you want to leave?',
  onBeforeUnload
}: UseUnsavedChangesOptions) {
  const router = useRouter()
  const pathname = usePathname()
  const isDirtyRef = useRef(isDirty)
  const messageRef = useRef(message)

  // Keep refs in sync
  useEffect(() => {
    isDirtyRef.current = isDirty
    messageRef.current = message
  }, [isDirty, message])

  // Handle browser beforeunload event
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return

      // Custom handler can prevent the warning
      if (onBeforeUnload && !onBeforeUnload()) {
        return
      }

      // Standard browser beforeunload behavior
      e.preventDefault()
      e.returnValue = messageRef.current
      return messageRef.current
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [onBeforeUnload])

  // Handle Next.js navigation
  useEffect(() => {
    // Store original push and replace methods
    const originalPush = window.history.pushState
    const originalReplace = window.history.replaceState

    // Override pushState to check for unsaved changes
    window.history.pushState = function (...args) {
      if (isDirtyRef.current) {
        const confirmed = window.confirm(messageRef.current)
        if (!confirmed) {
          // Navigation cancelled
          return
        }
      }
      return originalPush.apply(this, args)
    }

    // Override replaceState to check for unsaved changes
    window.history.replaceState = function (...args) {
      if (isDirtyRef.current) {
        const confirmed = window.confirm(messageRef.current)
        if (!confirmed) {
          // Navigation cancelled
          return
        }
      }
      return originalReplace.apply(this, args)
    }

    // Handle link clicks
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a[href]') as HTMLAnchorElement | null
      
      if (!anchor) return

      // Skip external links, hashes, and download links
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('http') || anchor.hasAttribute('download')) {
        return
      }

      // Check for unsaved changes
      if (isDirtyRef.current) {
        const confirmed = window.confirm(messageRef.current)
        if (!confirmed) {
          e.preventDefault()
          e.stopPropagation()
        }
      }
    }

    // Use capture phase to intercept before Next.js router
    document.addEventListener('click', handleClick, true)

    return () => {
      window.history.pushState = originalPush
      window.history.replaceState = originalReplace
      document.removeEventListener('click', handleClick, true)
    }
  }, [])

  // Function to manually check before navigation
  const confirmNavigation = useCallback(() => {
    if (!isDirtyRef.current) return true
    return window.confirm(messageRef.current)
  }, [])

  return { confirmNavigation }
}

/**
 * useFormDirty Hook
 * 
 * Helper hook to track form dirty state by comparing current values to initial values.
 */

interface UseFormDirtyOptions<T> {
  initialValues: T
  currentValues: T
  isEqual?: (a: T, b: T) => boolean
}

export function useFormDirty<T>({
  initialValues,
  currentValues,
  isEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
}: UseFormDirtyOptions<T>) {
  const isDirty = !isEqual(initialValues, currentValues)
  return { isDirty }
}

export default useUnsavedChanges
