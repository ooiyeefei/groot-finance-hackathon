import { redirect } from 'next/navigation'

interface SignUpPageProps {
  params: Promise<{
    locale: string
  }>
}

/**
 * Sign-up page that redirects to centralized Clerk Account Portal
 * Using Satellite Domain architecture: accounts.hellogroot.com
 *
 * After registration, Clerk automatically redirects back to finance.hellogroot.com
 */
export default async function SignUpPage({ params }: SignUpPageProps) {
  const { locale } = await params

  // Build return URL for post-registration redirect
  const returnUrl = `https://finance.hellogroot.com/${locale}`

  // Redirect to centralized Account Portal with return URL
  redirect(
    `https://accounts.hellogroot.com/sign-up?redirect_url=${encodeURIComponent(returnUrl)}`
  )
}