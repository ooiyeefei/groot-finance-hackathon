// Force dynamic rendering - required for authentication
export const dynamic = 'force-dynamic'

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, ArrowLeft, Mail } from 'lucide-react'

interface AccessDeniedPageProps {
  params: Promise<{ locale: string }>
}

/**
 * Access Denied Page
 *
 * Displayed when a user is authenticated with Clerk but doesn't have
 * access to the Groot Finance app (no record in Supabase users table).
 *
 * Common scenarios:
 * - User signed up on staff.hellogroot.com, trying to access finance.hellogroot.com
 * - User account was removed from Groot Finance but still has Clerk session
 */
export default async function AccessDeniedPage({ params }: AccessDeniedPageProps) {
  const { userId } = await auth()
  const { locale } = await params

  // If not authenticated at all, redirect to sign-in
  if (!userId) {
    redirect(`/${locale}/sign-in`)
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md bg-card border-border">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            Access Denied
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="text-center space-y-2">
            <p className="text-muted-foreground">
              You don't have access to Groot Finance.
            </p>
            <p className="text-sm text-muted-foreground">
              Your account is authenticated, but you're not registered for the Groot Finance application.
            </p>
          </div>

          <div className="bg-muted rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-foreground">
              Possible reasons:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>You signed up for a different application (e.g., Staff Portal)</li>
              <li>Your Groot Finance account has been deactivated</li>
              <li>You haven't completed the sign-up process</li>
            </ul>
          </div>

          <div className="space-y-3">
            <Button
              asChild
              className="w-full"
              variant="default"
            >
              <a href={`/${locale}/sign-up`}>
                Create Groot Finance Account
              </a>
            </Button>

            <Button
              asChild
              className="w-full"
              variant="outline"
            >
              <a href="mailto:support@hellogroot.com">
                <Mail className="w-4 h-4 mr-2" />
                Contact Support
              </a>
            </Button>

            <Button
              asChild
              className="w-full"
              variant="ghost"
            >
              <a href={`/${locale}/sign-in`}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Sign In
              </a>
            </Button>
          </div>

          <div className="pt-4 border-t border-border">
            <p className="text-xs text-center text-muted-foreground">
              If you believe this is an error, please contact our support team.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
