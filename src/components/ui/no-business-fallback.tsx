'use client'

/**
 * No Business Fallback Component
 *
 * Provides a user-friendly experience for users who don't have
 * an active business association. Offers clear guidance and
 * actionable steps to resolve the situation.
 */

import React from 'react'
import { Building2, UserPlus, Mail, ExternalLink, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useBusinessContext } from '@/contexts/business-context'

interface NoBusinessFallbackProps {
  className?: string
}

export default function NoBusinessFallback({ className }: NoBusinessFallbackProps) {
  const { refreshMemberships, refreshContext, isLoadingMemberships, isLoadingContext } = useBusinessContext()

  const isRefreshing = isLoadingMemberships || isLoadingContext

  const handleRefresh = async () => {
    console.log('[NoBusinessFallback] Refreshing business data...')
    await Promise.all([refreshMemberships(), refreshContext()])
  }

  const handleCreateBusiness = () => {
    // Navigate to business creation flow
    window.location.href = '/en/onboarding/business'
  }

  const handleContactSupport = () => {
    // Open email client or support system
    const subject = encodeURIComponent('Request Business Access - FinanSEAL')
    const body = encodeURIComponent(
      'Hello FinanSEAL Support,\n\n' +
      'I am unable to access any businesses in my account. Could you please help me:\n\n' +
      '1. Check if I have pending business invitations\n' +
      '2. Connect me with the appropriate business owner\n' +
      '3. Set up a new business account if needed\n\n' +
      'Thank you for your assistance.\n\n' +
      'Best regards'
    )
    window.open(`mailto:support@finanseal.com?subject=${subject}&body=${body}`)
  }

  return (
    <div className={`flex items-center justify-center min-h-[60vh] p-4 ${className}`}>
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 bg-blue-100 rounded-full w-fit">
            <Building2 className="h-8 w-8 text-blue-600" />
          </div>
          <CardTitle className="text-xl">No Business Access</CardTitle>
          <CardDescription className="text-base">
            You currently don't have access to any business accounts.
            Let's get you connected to start using FinanSEAL.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-green-600" />
                New to FinanSEAL?
              </h4>
              <p className="text-sm text-gray-600 mb-3">
                Create your first business account to get started with our financial co-pilot.
              </p>
              <Button
                onClick={handleCreateBusiness}
                className="w-full"
                size="sm"
              >
                Create New Business
              </Button>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <Mail className="h-4 w-4 text-blue-600" />
                Invited by a Business Owner?
              </h4>
              <p className="text-sm text-gray-600 mb-3">
                Check your email for invitation links or contact your business owner to resend the invitation.
              </p>
              <Button
                onClick={handleRefresh}
                variant="outline"
                size="sm"
                className="w-full"
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Check for Invitations
                  </>
                )}
              </Button>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-purple-600" />
                Need Help?
              </h4>
              <p className="text-sm text-gray-600 mb-3">
                Our support team can help you connect to the right business or set up a new account.
              </p>
              <Button
                onClick={handleContactSupport}
                variant="outline"
                size="sm"
                className="w-full"
              >
                Contact Support
              </Button>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              Once you have business access, you'll be able to manage financial documents,
              track transactions, and use our AI-powered financial guidance.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Compact version for header/sidebar use
 */
export function NoBusinessFallbackCompact() {
  const { refreshMemberships, refreshContext, isLoadingMemberships, isLoadingContext } = useBusinessContext()

  const isRefreshing = isLoadingMemberships || isLoadingContext

  const handleRefresh = async () => {
    await Promise.all([refreshMemberships(), refreshContext()])
  }

  return (
    <div className="flex items-center gap-2 text-gray-300">
      <Building2 className="h-4 w-4 text-yellow-500" />
      <span className="text-sm">No business access</span>
      <Button
        onClick={handleRefresh}
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs text-gray-400 hover:text-white"
        disabled={isRefreshing}
      >
        {isRefreshing ? (
          <RefreshCw className="h-3 w-3 animate-spin" />
        ) : (
          'Refresh'
        )}
      </Button>
    </div>
  )
}