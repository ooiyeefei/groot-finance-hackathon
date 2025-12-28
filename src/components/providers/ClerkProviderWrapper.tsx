'use client'

import { ClerkProvider } from '@clerk/nextjs'
import { ReactNode } from 'react'

/**
 * Client-side ClerkProvider wrapper - SINGLE SOURCE OF TRUTH for Clerk config
 *
 * This wrapper allows us to use regex patterns for allowedRedirectOrigins,
 * which can't be serialized from Server Components to Client Components.
 *
 * IMPORTANT: We use the PRODUCTION Clerk instance for both local dev and production.
 * This ensures consistent user IDs across environments (same Supabase user records).
 *
 * Auth Flow:
 * 1. User visits app (localhost:3000 or finance.hellogroot.com)
 * 2. Middleware redirects unauthenticated users to /sign-in
 * 3. Clerk Account Portal (accounts.hellogroot.com) handles authentication
 * 4. After auth, redirects back to the app origin (localhost or production)
 */
export function ClerkProviderWrapper({ children }: { children: ReactNode }) {
  // Define allowed redirect origins for Clerk authentication
  // These are the domains Clerk can redirect BACK to after authentication
  // Using regex patterns to match any path under each origin
  const allowedRedirectOrigins = [
    // Local development (uses Clerk dev instance)
    /^http:\/\/localhost:3000(\/.*)?$/,
    /^http:\/\/localhost:3001(\/.*)?$/,

    // Production domains (uses Clerk prod instance)
    /^https:\/\/finance\.hellogroot\.com(\/.*)?$/,
    /^https:\/\/hellogroot\.com(\/.*)?$/,

    // Clerk Account Portal domain
    /^https:\/\/accounts\.hellogroot\.com(\/.*)?$/,
  ]

  // Groot brand appearance configuration for Clerk components
  // Uses dark theme colors matching globals.css semantic tokens
  const appearance = {
    variables: {
      // Groot's primary brand color (HSL(221, 83%, 53%) from globals.css --primary)
      colorPrimary: '#4A7CFF',

      // Dark mode background (HSL(220, 16%, 8%) from globals.css --background dark mode)
      colorBackground: '#0F1114',

      // Card/Surface background for better contrast in modals
      colorInputBackground: '#1A1D23',

      // Input text color (white for readability in dark mode)
      colorInputText: '#FFFFFF',

      // Main text color (white for maximum visibility)
      colorText: '#FFFFFF',

      // Secondary/descriptive text (HSL(220, 9%, 46%) from globals.css --muted-foreground)
      colorTextSecondary: '#6C7281',

      // Button text color (white on primary blue)
      colorTextOnPrimaryBackground: '#FFFFFF',

      // Error/danger color (Tailwind red-500 from status colors)
      colorDanger: '#EF4444',

      // Success color (Tailwind green-500 from status colors)
      colorSuccess: '#22C55E',

      // Warning color (Tailwind yellow-500 from status colors)
      colorWarning: '#EAB308',

      // Border color for inputs and cards
      colorBorder: '#27272A',
    },
    elements: {
      // Fix for "Email code to..." button text visibility
      alternativeMethodsBlockButton: {
        color: '#FFFFFF',
        backgroundColor: 'transparent',
        borderColor: '#27272A',
        '&:hover': {
          color: '#FFFFFF',
          backgroundColor: '#1A1D23',
        },
      },
      // Ensure all buttons have visible text
      button: {
        color: '#FFFFFF',
      },
      // OTP input styling with dark theme
      formFieldInput__phoneNumber: {
        backgroundColor: '#1A1D23',
        color: '#FFFFFF',
        borderColor: '#27272A',
        '&:focus': {
          borderColor: '#4A7CFF',
        },
      },
      formFieldInput__emailAddress: {
        backgroundColor: '#1A1D23',
        color: '#FFFFFF',
        borderColor: '#27272A',
        '&:focus': {
          borderColor: '#4A7CFF',
        },
      },
      // OTP code input boxes
      formFieldInput__identifier: {
        backgroundColor: '#1A1D23',
        color: '#FFFFFF',
        borderColor: '#27272A',
        '&:focus': {
          borderColor: '#4A7CFF',
        },
      },
      // General input styling for consistency
      formFieldInput: {
        backgroundColor: '#1A1D23',
        color: '#FFFFFF',
        borderColor: '#27272A',
        '&:focus': {
          borderColor: '#4A7CFF',
        },
      },
      // OTP verification code inputs specifically
      otpCodeFieldInput: {
        backgroundColor: '#1A1D23 !important',
        color: '#FFFFFF !important',
        borderColor: '#27272A !important',
        '&:focus': {
          borderColor: '#4A7CFF !important',
        },
      },
      // Card backgrounds
      card: {
        backgroundColor: '#1A1D23',
        borderColor: '#27272A',
      },
      // Modal backgrounds
      modalContent: {
        backgroundColor: '#1A1D23',
        borderColor: '#27272A',
      },
      // Headers and titles
      headerTitle: {
        color: '#FFFFFF',
      },
      headerSubtitle: {
        color: '#6C7281',
      },
      // Form labels
      formFieldLabel: {
        color: '#FFFFFF',
      },
      // Links
      link: {
        color: '#4A7CFF',
        '&:hover': {
          color: '#6B9AFF',
        },
      },
      // Footer links
      footerActionLink: {
        color: '#4A7CFF',
        '&:hover': {
          color: '#6B9AFF',
        },
      },
    },
  }

  return (
    <ClerkProvider
      allowedRedirectOrigins={allowedRedirectOrigins}
      appearance={appearance}
    >
      {children}
    </ClerkProvider>
  )
}
