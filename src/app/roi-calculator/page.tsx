import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ROICalculatorClient } from './roi-calculator-client'

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

export default function ROICalculatorPage() {
  return (
    <Suspense>
      <ROICalculatorClient />
    </Suspense>
  )
}
