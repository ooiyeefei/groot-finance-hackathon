import { auth } from '@clerk/nextjs/server'
import { headers } from 'next/headers'
import Link from 'next/link'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import { ClientProviders } from '@/components/providers/client-providers'
import { PricingTable } from '@/domains/billing/components/pricing-table'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { COUNTRY_TO_CURRENCY } from '@/lib/stripe/catalog'

export const metadata = {
  title: 'Pricing - FinanSEAL',
  description: 'Choose the right plan for your business',
}

export default async function PricingPage() {
  // Check if user is authenticated (optional for pricing page)
  const { userId } = await auth()

  // Detect default currency from geo-IP
  const headersList = await headers()
  const country = headersList.get('x-vercel-ip-country')
  const defaultCurrency = (country && COUNTRY_TO_CURRENCY[country]) || undefined

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <HeaderWithUser
            title="Pricing"
            subtitle="Choose the plan that fits your business needs"
          />

          {/* Main Content Area */}
          <main className="flex-1 p-6 overflow-auto pb-24 sm:pb-6">
            <div className="max-w-5xl mx-auto">
              {/* Back Button */}
              <div className="mb-6">
                <Link href="/en/settings/billing">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Billing
                  </Button>
                </Link>
              </div>

              {/* Header Section */}
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-foreground mb-1">
                  Pricing
                </h1>
                <p className="text-muted-foreground">
                  Start free, upgrade as you grow.
                </p>
              </div>

              {/* Pricing Table */}
              <PricingTable
                showCurrentPlan={!!userId}
                defaultCurrency={defaultCurrency}
              />

              {/* FAQ or Additional Info */}
              <div className="mt-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Prices shown in your selected currency. Billed monthly.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Need a custom plan?{' '}
                  <a href="mailto:support@hellogroot.com" className="text-primary hover:underline">
                    Contact us
                  </a>
                </p>
              </div>
            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}
