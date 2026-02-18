/**
 * Invitation Acceptance Page
 * Handles invitation validation and redirects to signup or processes acceptance
 */

'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter, useParams } from 'next/navigation'
import { useAuth, useUser, useSession } from '@clerk/nextjs'
import { Loader2, CheckCircle, AlertCircle, UserPlus, User } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface InvitationData {
  email: string
  role: string
  businessName: string
}

function AcceptInvitationContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const params = useParams()
  const { isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const { session } = useSession()

  const locale = (params.locale as string) || 'en'
  
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showNameForm, setShowNameForm] = useState(false)
  const [fullName, setFullName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)

  const token = searchParams.get('token')

  // Helper function to retry API calls with exponential backoff on auth errors
  const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 3): Promise<Response> => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const response = await fetch(url, options)

      // If 401 and not last attempt, retry with exponential backoff
      if (response.status === 401 && attempt < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 4000) // Max 4 seconds
        console.log(`[Invitation Accept] Auth not ready, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      return response
    }

    // This should never be reached but TypeScript needs it
    return fetch(url, options)
  }

  const handleAcceptInvitation = async (name?: string) => {
    if (!token) return

    setAccepting(true)
    setError(null)
    setNameError(null)

    try {
      const response = await fetchWithRetry('/api/v1/account-management/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          fullName: name || fullName
        })
      })

      // Check if response is JSON before trying to parse
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        // If not JSON, it might be an HTML redirect to login page
        if (response.status === 401 || response.status === 302) {
          throw new Error('Authentication required. Please sign in to continue.')
        }
        throw new Error('Invalid response from server. Please try again later.')
      }

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to accept invitation')
      }

      setSuccess(true)

      // CRITICAL FIX: Reload Clerk session to get updated JWT with new business association
      // before redirecting. This ensures the backend can verify the user's business membership.
      if (session) {
        console.log('[Invitation Accept] Reloading Clerk session before redirect...')
        try {
          await session.reload()
          console.log('[Invitation Accept] Session reloaded successfully')
        } catch (sessionError) {
          console.warn('[Invitation Accept] Session reload failed, proceeding anyway:', sessionError)
        }
      }

      // Force full page reload to ensure Clerk middleware runs properly
      // Use window.location.href instead of router.push to avoid auth timing issues
      setTimeout(() => {
        window.location.href = `/${locale}`
      }, 2000)

    } catch (err) {
      console.error('Invitation acceptance error:', err)
      // Handle JSON parse errors specifically
      if (err instanceof SyntaxError && err.message.includes('JSON')) {
        setError('Server returned an invalid response. This might happen if you need to sign in first.')
      } else {
        setError(err instanceof Error ? err.message : 'Failed to accept invitation')
      }
    } finally {
      setAccepting(false)
    }
  }

  // Validate invitation token
  useEffect(() => {
    if (!token) {
      setError('Invalid invitation link - missing token')
      setLoading(false)
      return
    }

    const validateInvitation = async () => {
      try {
        const response = await fetch(`/api/v1/account-management/invitations/accept?token=${token}`)

        // Check if response is JSON before trying to parse
        const contentType = response.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          // If not JSON, it might be an HTML redirect to login page
          if (response.status === 401 || response.status === 302) {
            throw new Error('Authentication required. Please sign in to continue.')
          }
          // Try to get text content for debugging
          const text = await response.text()
          console.error('Non-JSON response received:', text.substring(0, 200))
          throw new Error('Invalid response from server. Please try again later.')
        }

        const result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to validate invitation')
        }

        setInvitation(result.invitation)
      } catch (err) {
        console.error('Invitation validation error:', err)
        // Handle JSON parse errors specifically
        if (err instanceof SyntaxError && err.message.includes('JSON')) {
          setError('Server returned an invalid response. This might happen if you need to sign in first.')
        } else {
          setError(err instanceof Error ? err.message : 'Failed to validate invitation')
        }
      } finally {
        setLoading(false)
      }
    }

    validateInvitation()
  }, [token])

  const handleSignUp = () => {
    // Use direct browser navigation to avoid CORS issues with Clerk redirects
    // Use locale-aware sign-up route
    const signupUrl = `/${locale}/sign-up?email=${encodeURIComponent(invitation?.email || '')}&redirect_url=${encodeURIComponent(window.location.href)}`
    window.location.href = signupUrl
  }

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/signout', { method: 'POST' })
      router.refresh()
    } catch (err) {
      console.error('Sign out error:', err)
    }
  }

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setNameError(null)

    if (!fullName.trim()) {
      setNameError('Please enter your full name')
      return
    }

    if (fullName.trim().length < 2) {
      setNameError('Name must be at least 2 characters long')
      return
    }

    handleAcceptInvitation(fullName.trim())
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-border">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
            <h2 className="text-lg font-semibold text-white mb-2">
              Validating Invitation
            </h2>
            <p className="text-gray-400 text-center">
              Please wait while we verify your invitation...
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-border">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              Invitation Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert className="bg-red-900/20 border-red-700 mb-4">
              <AlertDescription className="text-gray-300">
                {error}
              </AlertDescription>
            </Alert>
            <Button
              onClick={() => router.push(`/${locale}`)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-border">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">
              Welcome to {invitation?.businessName}!
            </h2>
            <p className="text-gray-400 text-center mb-4">
              Your invitation has been accepted successfully. You now have {invitation?.role} access to the organization.
            </p>
            <p className="text-sm text-gray-500">
              Redirecting to dashboard...
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (showNameForm && isSignedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-border">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <User className="w-5 h-5 text-blue-500" />
              Complete Your Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleNameSubmit} className="space-y-4">
              <div className="text-gray-300 mb-4">
                <p className="mb-2">Welcome to <strong>{invitation?.businessName}</strong>!</p>
                <p className="text-sm text-gray-400">Please enter your full name to complete your profile setup.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-gray-300">
                  Full Name
                </Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                  autoFocus
                />
                {nameError && (
                  <Alert className="bg-red-900/20 border-red-700">
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription className="text-red-400">
                      {nameError}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="space-y-3">
                {accepting ? (
                  <Button disabled className="w-full">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Completing Setup...
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    Complete Profile & Join Team
                  </Button>
                )}
                <Button
                  onClick={handleSignOut}
                  className="w-full bg-red-600 hover:bg-red-700 text-white"
                  type="button"
                >
                  Sign Out & Use Different Account
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-gray-800 border-border">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-500" />
            Join {invitation?.businessName}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-gray-300">
            <p className="mb-2">You&apos;ve been invited to join <strong>{invitation?.businessName}</strong> as a <strong>{invitation?.role}</strong>.</p>
            <p className="text-sm text-gray-400">Email: {invitation?.email}</p>
          </div>

          {!isSignedIn ? (
            <div className="space-y-3">
              <Button
                onClick={handleSignUp}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Sign Up to Accept Invitation
              </Button>
              <p className="text-xs text-gray-500 text-center">
                Already have an account?{' '}
                <button
                  onClick={() => {
                    const signInUrl = `/${locale}/sign-in?email=${encodeURIComponent(invitation?.email || '')}&redirect_url=${encodeURIComponent(window.location.href)}`
                    window.location.href = signInUrl
                  }}
                  className="text-blue-500 hover:text-blue-400 underline font-medium"
                >
                  Sign in
                </button>{' '}
                with the invited email address.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {accepting ? (
                <Button disabled className="w-full">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Accepting Invitation...
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() => handleAcceptInvitation()}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    Accept Invitation
                  </Button>
                  <Button
                    onClick={handleSignOut}
                    className="w-full bg-red-600 hover:bg-red-700 text-white"
                  >
                    Sign Out & Use Different Account
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-border">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
            <h2 className="text-lg font-semibold text-white mb-2">
              Loading Invitation
            </h2>
            <p className="text-gray-400 text-center">
              Please wait while we load your invitation...
            </p>
          </CardContent>
        </Card>
      </div>
    }>
      <AcceptInvitationContent />
    </Suspense>
  )
}