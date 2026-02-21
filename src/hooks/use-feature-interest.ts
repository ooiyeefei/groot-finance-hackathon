'use client'

import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@clerk/nextjs'

const STORAGE_PREFIX = 'feature-interest:'

export function useFeatureInterest(featureName: string) {
  const { user } = useUser()
  const [hasRegistered, setHasRegistered] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const storageKey = `${STORAGE_PREFIX}${featureName}`

  useEffect(() => {
    try {
      setHasRegistered(localStorage.getItem(storageKey) === 'true')
    } catch {
      // localStorage unavailable (SSR, private browsing)
    }
  }, [storageKey])

  const registerInterest = useCallback(async () => {
    if (hasRegistered || isLoading) return

    setIsLoading(true)
    try {
      await fetch('/api/v1/features/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          featureName,
          userEmail: user?.primaryEmailAddress?.emailAddress,
        }),
      })

      // Mark as registered regardless of API outcome
      setHasRegistered(true)
      try {
        localStorage.setItem(storageKey, 'true')
      } catch {
        // localStorage unavailable
      }
    } finally {
      setIsLoading(false)
    }
  }, [featureName, user, hasRegistered, isLoading, storageKey])

  return { registerInterest, hasRegistered, isLoading }
}
