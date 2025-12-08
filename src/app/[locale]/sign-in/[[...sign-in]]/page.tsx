import { redirect } from 'next/navigation'

interface SignInPageProps {
  params: Promise<{
    locale: string
  }>
}

/**
 * Sign-in page that redirects to centralized Clerk Account Portal
 * Using Satellite Domain architecture: accounts.hellogroot.com
 *
 * After authentication, Clerk automatically redirects back to finance.hellogroot.com
 */
export default async function SignInPage({ params }: SignInPageProps) {
  const { locale } = await params

  // Build return URL for post-authentication redirect
  const returnUrl = `https://finance.hellogroot.com/${locale}`

  // Redirect to centralized Account Portal with return URL
  redirect(
    `https://accounts.hellogroot.com/sign-in?redirect_url=${encodeURIComponent(returnUrl)}`
  )
}