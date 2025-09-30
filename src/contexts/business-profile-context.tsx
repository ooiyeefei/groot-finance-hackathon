'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

interface BusinessProfile {
  id: string
  name: string
  logo_url?: string
  logo_fallback_color?: string
}

interface BusinessProfileContextType {
  profile: BusinessProfile | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  updateProfile: (updatedProfile: BusinessProfile) => void
}

const BusinessProfileContext = createContext<BusinessProfileContextType | undefined>(undefined)

export const useBusinessProfile = () => {
  const context = useContext(BusinessProfileContext)
  if (!context) {
    throw new Error('useBusinessProfile must be used within a BusinessProfileProvider')
  }
  return context
}

interface BusinessProfileProviderProps {
  children: React.ReactNode
  initialProfile?: BusinessProfile | null
}

export const BusinessProfileProvider: React.FC<BusinessProfileProviderProps> = ({
  children,
  initialProfile = null
}) => {
  // Start with null to ensure server/client consistency
  // Client-side data will be loaded in useEffect
  const [profile, setProfile] = useState<BusinessProfile | null>(initialProfile)
  const [isLoading, setIsLoading] = useState(!profile) // Only loading if no cached data
  const [error, setError] = useState<string | null>(null)

  const fetchProfile = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch('/api/business-profile')
      const result = await response.json()

      if (result.success) {
        setProfile(result.data)
        // Cache the result for instant loading on future visits
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('business-profile', JSON.stringify(result.data))
          } catch (error) {
            console.warn('Failed to cache business profile:', error)
          }
        }
      } else {
        setError(result.error || 'Failed to fetch business profile')
      }
    } catch (err) {
      setError('Unable to connect to server')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const updateProfile = useCallback((updatedProfile: BusinessProfile) => {
    setProfile(updatedProfile)
    // Update cache when profile is updated
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('business-profile', JSON.stringify(updatedProfile))
      } catch (error) {
        console.warn('Failed to update cached business profile:', error)
      }
    }
  }, [])

  // Load cached profile on client-side after hydration
  useEffect(() => {
    if (!initialProfile && !profile) {
      try {
        const cached = localStorage.getItem('business-profile')
        if (cached) {
          const cachedProfile = JSON.parse(cached)
          setProfile(cachedProfile)
          setIsLoading(false)
          return // Skip API fetch if we have cached data
        }
      } catch (error) {
        console.warn('Failed to parse cached business profile:', error)
      }
    }

    // Only fetch from API if we don't have initial or cached profile data
    if (!initialProfile && !profile) {
      fetchProfile()
    }
  }, [fetchProfile, initialProfile, profile])

  return (
    <BusinessProfileContext.Provider value={{
      profile,
      isLoading,
      error,
      refetch: fetchProfile,
      updateProfile
    }}>
      {children}
    </BusinessProfileContext.Provider>
  )
}