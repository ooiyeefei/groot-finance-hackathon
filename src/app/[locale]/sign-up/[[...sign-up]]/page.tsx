'use client'

import { SignUp, useAuth } from '@clerk/nextjs'
import { useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'

/**
 * Sign-up page using Clerk's built-in component
 *
 * For Account Portal flow, Clerk handles the redirect and session establishment.
 * The SignUp component properly processes the callback from Account Portal
 * and establishes the client-side session.
 */
export default function SignUpPage() {
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

  // Show Clerk's SignUp component
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <SignUp
        routing="path"
        path={`/${locale}/sign-up`}
        signInUrl={`/${locale}/sign-in`}
        afterSignUpUrl={redirectUrl}
        appearance={{
          elements: {
            rootBox: 'mx-auto',
            card: 'bg-card border border-border shadow-lg',
          }
        }}
      />
    </div>
  )
}
