'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes'

/**
 * Theme Provider for Groot Finance
 *
 * Wraps the next-themes provider to provide theme switching capabilities
 * across the application. Supports light/dark/system themes with no FOUC.
 *
 * Features:
 * - Automatic system theme detection
 * - Persistent theme preference storage
 * - Smooth theme transitions
 * - SSR/Hydration safe implementation
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}