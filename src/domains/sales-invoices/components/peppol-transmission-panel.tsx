'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ComingSoonBadge } from '@/components/ui/coming-soon-badge'
import { FeatureInterestButton } from '@/components/ui/feature-interest-button'

export function PeppolTransmissionPanel() {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Peppol InvoiceNow
          </CardTitle>
          <ComingSoonBadge />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Transmit invoices to Singapore recipients via the Peppol network.
          Be among the first to try it — request early access below.
        </p>
        <FeatureInterestButton featureName="Peppol InvoiceNow" />
      </CardContent>
    </Card>
  )
}
