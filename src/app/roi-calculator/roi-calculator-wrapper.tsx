'use client'

import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { ROICalculatorClient } from './roi-calculator-client'
import type { ROIPlanMap } from '@/lib/roi-calculator/constants'

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export function ROICalculatorWrapper({ planData }: { planData: ROIPlanMap }) {
  return (
    <ConvexProvider client={convex}>
      <ROICalculatorClient planData={planData} />
    </ConvexProvider>
  )
}
