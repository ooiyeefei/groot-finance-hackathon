'use client'

import { SignIn, useAuth } from '@clerk/nextjs'
import { useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'

/**
 * Sign-in page using Clerk's built-in component
 *
 * For Account Portal flow, Clerk handles the redirect and session establishment.
 * The SignIn component properly processes the callback from Account Portal
 * and establishes the client-side session.
 *
 * CRITICAL: Using Clerk's component instead of raw redirect ensures
 * the __clerk_db_jwt token is properly processed and session is established.
 */
export default function SignInPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const locale = params?.locale || 'en'

  // Get redirect URL from query params or default to dashboard
  const redirectUrl = searchParams.get('redirect_url') || `/${locale}`

  // If already signed in, redirect to the intended destination
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      // Use router.push for client-side navigation to preserve session
      router.push(redirectUrl)
    }
  }, [isLoaded, isSignedIn, redirectUrl, router])

  // Show loading state while checking auth
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // If already signed in, show redirect message
  if (isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    )
  }

  // Show Clerk's SignIn component - handles Account Portal redirect automatically
  // NOTE: Appearance is configured globally in ClerkProviderWrapper.tsx for consistent dark theme
  // Do NOT add local appearance overrides here as they conflict with the global dark theme
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <SignIn
        routing="path"
        path={`/${locale}/sign-in`}
        signUpUrl={`/${locale}/sign-up`}
        afterSignInUrl={redirectUrl}
      />
    </div>
  )
}
