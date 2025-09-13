/**
 * Invitation Acceptance Page
 * Handles invitation validation and redirects to signup or processes acceptance
 */

'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth, useUser } from '@clerk/nextjs'
import { Loader2, CheckCircle, AlertCircle, UserPlus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface InvitationData {
  email: string
  role: string
  businessName: string
}

function AcceptInvitationContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const token = searchParams.get('token')

  const handleAcceptInvitation = async () => {
    if (!token) return

    setAccepting(true)
    setError(null)

    try {
      const response = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to accept invitation')
      }

      setSuccess(true)
      
      // Redirect to dashboard after successful acceptance
      setTimeout(() => {
        router.push('/')
      }, 2000)

    } catch (err) {
      console.error('Invitation acceptance error:', err)
      setError(err instanceof Error ? err.message : 'Failed to accept invitation')
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
        const response = await fetch(`/api/invitations/accept?token=${token}`)
        const result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to validate invitation')
        }

        setInvitation(result.invitation)
      } catch (err) {
        console.error('Invitation validation error:', err)
        setError(err instanceof Error ? err.message : 'Failed to validate invitation')
      } finally {
        setLoading(false)
      }
    }

    validateInvitation()
  }, [token])

  // Auto-accept invitation if user is already signed in and email matches
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user || !invitation || accepting || success) return

    const userEmail = user.emailAddresses[0]?.emailAddress
    
    if (userEmail?.toLowerCase() === invitation.email.toLowerCase()) {
      handleAcceptInvitation()
    } else if (userEmail) {
      setError(`This invitation is for ${invitation.email}, but you are signed in as ${userEmail}. Please sign out and create an account with the invited email.`)
    }
  }, [isLoaded, isSignedIn, user, invitation, accepting, success, handleAcceptInvitation])

  const handleSignUp = () => {
    // Redirect to signup with pre-filled email and return URL
    const signupUrl = `/sign-up?email=${encodeURIComponent(invitation?.email || '')}&redirect_url=${encodeURIComponent(window.location.href)}`
    router.push(signupUrl)
  }

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/signout', { method: 'POST' })
      router.refresh()
    } catch (err) {
      console.error('Sign out error:', err)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-gray-700">
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
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              Invitation Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert className="bg-red-900/20 border-red-700 mb-4">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription className="text-red-400">
                {error}
              </AlertDescription>
            </Alert>
            <Button 
              onClick={() => router.push('/')}
              variant="outline"
              className="w-full border-gray-600 text-gray-300"
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
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-gray-700">
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

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-gray-800 border-gray-700">
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
                Already have an account? Sign in with the invited email address.
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
                    onClick={handleAcceptInvitation}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    Accept Invitation
                  </Button>
                  <Button 
                    onClick={handleSignOut}
                    variant="outline"
                    className="w-full border-gray-600 text-gray-300"
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
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-gray-700">
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