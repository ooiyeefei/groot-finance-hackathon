/**
 * useFeatureFlags - Simple feature flag system for gradual rollout
 * Supports environment variables, localStorage, and default configurations
 * Use for testing new components alongside existing ones during migration
 */

'use client'

import { useState, useEffect } from 'react'

// Feature flag configuration interface
interface FeatureFlags {
  // Hook-based EditExpenseModal (for migration testing)
  useNewEditExpenseModal: boolean

  // Hook-based CreateExpenseForm (for future migration)
  useNewCreateExpenseForm: boolean

  // Enhanced AI suggestions (for A/B testing)
  enhancedAiSuggestions: boolean

  // Debug mode (for development)
  debugMode: boolean
}

// Default feature flag values - Migration completed, new components enabled by default
const DEFAULT_FLAGS: FeatureFlags = {
  useNewEditExpenseModal: true,   // Migration completed - use new hook-based modal
  useNewCreateExpenseForm: true,  // Migration completed - use new hook-based form
  enhancedAiSuggestions: true,
  debugMode: process.env.NODE_ENV === 'development'
}

// Environment variable overrides
const ENV_FLAG_OVERRIDES: Partial<FeatureFlags> = {
  // Allow environment variable overrides
  useNewEditExpenseModal: process.env.NEXT_PUBLIC_USE_NEW_EDIT_MODAL === 'true',
  useNewCreateExpenseForm: process.env.NEXT_PUBLIC_USE_NEW_CREATE_FORM === 'true',
  enhancedAiSuggestions: process.env.NEXT_PUBLIC_ENHANCED_AI_SUGGESTIONS !== 'false',
  debugMode: process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_DEBUG_MODE === 'true'
}

// Hook return interface
export interface UseFeatureFlagsReturn {
  flags: FeatureFlags
  updateFlag: (flagName: keyof FeatureFlags, value: boolean) => void
  resetFlags: () => void
  isLoading: boolean
}

export function useFeatureFlags(): UseFeatureFlagsReturn {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS)
  const [isLoading, setIsLoading] = useState(true)

  // Initialize flags on mount (client-side only)
  useEffect(() => {
    // Merge default flags with environment overrides
    let initialFlags = { ...DEFAULT_FLAGS }

    // Apply environment variable overrides
    Object.entries(ENV_FLAG_OVERRIDES).forEach(([key, value]) => {
      if (value !== undefined) {
        initialFlags[key as keyof FeatureFlags] = value
      }
    })

    // Apply localStorage overrides (for developer testing)
    try {
      const savedFlags = localStorage.getItem('feature-flags')
      if (savedFlags) {
        const parsedFlags = JSON.parse(savedFlags)
        initialFlags = { ...initialFlags, ...parsedFlags }
      }
    } catch (error) {
      console.warn('Failed to load feature flags from localStorage:', error)
    }

    setFlags(initialFlags)
    setIsLoading(false)
  }, [])

  // Update specific flag
  const updateFlag = (flagName: keyof FeatureFlags, value: boolean) => {
    const newFlags = { ...flags, [flagName]: value }
    setFlags(newFlags)

    // Persist to localStorage for developer convenience
    try {
      // Only save non-default values to localStorage
      const flagsToSave: Partial<FeatureFlags> = {}
      Object.entries(newFlags).forEach(([key, flagValue]) => {
        if (flagValue !== DEFAULT_FLAGS[key as keyof FeatureFlags]) {
          flagsToSave[key as keyof FeatureFlags] = flagValue
        }
      })

      if (Object.keys(flagsToSave).length > 0) {
        localStorage.setItem('feature-flags', JSON.stringify(flagsToSave))
      } else {
        localStorage.removeItem('feature-flags')
      }
    } catch (error) {
      console.warn('Failed to save feature flags to localStorage:', error)
    }
  }

  // Reset all flags to defaults
  const resetFlags = () => {
    setFlags(DEFAULT_FLAGS)
    try {
      localStorage.removeItem('feature-flags')
    } catch (error) {
      console.warn('Failed to clear feature flags from localStorage:', error)
    }
  }

  return {
    flags,
    updateFlag,
    resetFlags,
    isLoading
  }
}

// Convenience hook for specific flags
export function useNewEditExpenseModal(): boolean {
  const { flags, isLoading } = useFeatureFlags()

  // During loading, default to false for safety
  if (isLoading) return false

  return flags.useNewEditExpenseModal
}

export function useNewCreateExpenseForm(): boolean {
  const { flags, isLoading } = useFeatureFlags()

  if (isLoading) return false

  return flags.useNewCreateExpenseForm
}

// Debug utility for development
export function logFeatureFlags() {
  const { flags } = useFeatureFlags()

  if (flags.debugMode) {
    console.log('🚩 Feature Flags Status:', flags)
  }
}

// Manual flag override for testing (developer utility)
export function enableNewEditModal() {
  try {
    localStorage.setItem('feature-flags', JSON.stringify({
      useNewEditExpenseModal: true
    }))
    window.location.reload()
  } catch (error) {
    console.error('Failed to enable new edit modal flag:', error)
  }
}

export function disableNewEditModal() {
  try {
    localStorage.removeItem('feature-flags')
    window.location.reload()
  } catch (error) {
    console.error('Failed to disable new edit modal flag:', error)
  }
}