'use client'

import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { ROICalculatorClient } from './roi-calculator-client'

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export function ROICalculatorWrapper() {
  return (
    <ConvexProvider client={convex}>
      <ROICalculatorClient />
    </ConvexProvider>
  )
}
