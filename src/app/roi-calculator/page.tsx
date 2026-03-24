import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ROICalculatorWrapper } from './roi-calculator-wrapper'
import { getCatalog } from '@/lib/stripe/plans'
import { FALLBACK_PLANS } from '@/lib/stripe/catalog'

export const metadata: Metadata = {
  title: 'ROI Calculator | Groot Finance',
  description:
    'Calculate how much time and money your business can save with Groot Finance. Enter your business metrics to see estimated savings instantly.',
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: 'ROI Calculator | Groot Finance',
    description:
      'See how much your business can save with AI-powered financial automation.',
    type: 'website',
  },
}

export default async function ROICalculatorPage() {
  // Fetch live pricing from Stripe (server-side, cached 1hr)
  // Falls back to FALLBACK_PLANS if Stripe is unreachable
  let plans
  try {
    const catalog = await getCatalog()
    plans = catalog.plans
  } catch {
    plans = FALLBACK_PLANS
  }

  // Serialize plan data for the client
  const pick = (p: typeof plans.starter) => ({
    name: p.name,
    teamLimit: p.teamLimit,
    ocrLimit: p.ocrLimit,
    aiMessageLimit: p.aiMessageLimit,
    invoiceLimit: p.invoiceLimit,
    einvoiceLimit: p.einvoiceLimit,
    currencyOptions: p.currencyOptions,
    price: p.price,
    currency: p.currency,
    features: p.features,
    highlightFeatures: p.highlightFeatures,
  })

  const planData = {
    starter: pick(plans.starter),
    pro: pick(plans.pro),
    enterprise: pick(plans.enterprise),
  }

  return (
    <Suspense>
      <ROICalculatorWrapper planData={planData} />
    </Suspense>
  )
}
