import { SignUp } from '@clerk/nextjs'

interface SignUpPageProps {
  params: Promise<{
    locale: string
  }>
}

export default async function SignUpPage({ params }: SignUpPageProps) {
  const { locale } = await params

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            FinanSEAL
          </h1>
          <p className="text-gray-400">
            Your Financial Co-Pilot for Southeast Asia
          </p>
        </div>
        <SignUp
          afterSignInUrl={`/${locale}`}
          afterSignUpUrl={`/${locale}`}
          signInUrl={`/${locale}/sign-in`}
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "bg-gray-800 border border-gray-700",
              headerTitle: "text-white",
              headerSubtitle: "text-gray-400",
              socialButtonsBlockButton: "bg-gray-700 border-gray-600 text-white hover:bg-gray-600",
              socialButtonsBlockButtonText: "text-white",
              formButtonPrimary: "bg-blue-600 hover:bg-blue-700",
              formFieldInput: "bg-gray-700 border-gray-600 text-white",
              formFieldLabel: "text-gray-300",
              dividerLine: "bg-gray-600",
              dividerText: "text-gray-400",
              footerActionLink: "text-blue-400 hover:text-blue-300",
            }
          }}
        />
      </div>
    </div>
  )
}