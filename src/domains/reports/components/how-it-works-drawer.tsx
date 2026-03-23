'use client'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'

interface HowItWorksDrawerProps {
  open: boolean
  onClose: () => void
}

export default function HowItWorksDrawer({ open, onClose }: HowItWorksDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>How Aging Reports Work</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6 text-sm">
          <p className="text-muted-foreground">
            Aging reports show how much your customers owe you (AR) or how much you owe vendors (AP),
            broken down by how long each amount has been outstanding.
          </p>

          <div className="space-y-3">
            <h4 className="font-medium">Steps</h4>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">1</div>
              <div>
                <p className="font-medium">Generate a report</p>
                <p className="text-muted-foreground">Click "Generate Report", pick AR or AP, and select the reference date.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">2</div>
              <div>
                <p className="font-medium">Review debtor statements</p>
                <p className="text-muted-foreground">Each month, individual statements are generated per customer. Review them before sending.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">3</div>
              <div>
                <p className="font-medium">Send statements to debtors</p>
                <p className="text-muted-foreground">Select which debtors to notify and click "Send". They receive a professional PDF statement by email.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">4</div>
              <div>
                <p className="font-medium">Enable auto-send (optional)</p>
                <p className="text-muted-foreground">After a few months, enable auto-send for trusted debtors to skip manual review.</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">Aging Buckets</h4>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Current</Badge>
              <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">1-30 Days</Badge>
              <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/30">31-60 Days</Badge>
              <Badge className="bg-red-500/10 text-red-600 border-red-500/30">61-90 Days</Badge>
              <Badge className="bg-red-700/10 text-red-700 border-red-700/30">90+ Days</Badge>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">Monthly Automation</h4>
            <p className="text-muted-foreground">
              On the 1st of each month, reports are automatically generated. Before sending statements,
              the system checks for unreconciled bank payments that might affect accuracy.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">Good to Know</h4>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Reports use only outstanding balances (partially paid invoices show remaining amount)</li>
              <li>Reports are stored for 12 months and can be re-downloaded anytime</li>
              <li>AI insights highlight trends and concentration risks on consolidated reports</li>
              <li>Settings can be configured in Business Settings → Reports</li>
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
