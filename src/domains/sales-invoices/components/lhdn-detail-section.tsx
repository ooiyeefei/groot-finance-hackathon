'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ComingSoonBadge } from '@/components/ui/coming-soon-badge'
import { FeatureInterestButton } from '@/components/ui/feature-interest-button'

export function LhdnDetailSection() {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            LHDN e-Invoice
          </CardTitle>
          <ComingSoonBadge />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Submit e-Invoices to LHDN MyInvois for Malaysian tax compliance.
          Be among the first to try it — request early access below.
        </p>
        <FeatureInterestButton featureName="LHDN e-Invoice" />
      </CardContent>
    </Card>
  )
}
