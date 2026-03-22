'use client'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'

interface HowItWorksDrawerProps {
  onClose: () => void
}

export function HowItWorksDrawer({ onClose }: HowItWorksDrawerProps) {
  return (
    <Sheet open onOpenChange={() => onClose()}>
      <SheetContent className="bg-card border-border overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground">How Inventory Tracking Works</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          <p className="text-muted-foreground text-sm">
            Track what you buy, where you store it, and what you sell — all connected to your accounting.
          </p>

          {/* Steps */}
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium shrink-0">1</div>
              <div>
                <h4 className="text-foreground font-medium">Set up locations</h4>
                <p className="text-muted-foreground text-sm">Create warehouses, offices, or retail outlets where you store stock.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium shrink-0">2</div>
              <div>
                <h4 className="text-foreground font-medium">Receive from AP invoices</h4>
                <p className="text-muted-foreground text-sm">When you review a purchase invoice, click &quot;Receive to Inventory&quot; to stock in items at a location.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium shrink-0">3</div>
              <div>
                <h4 className="text-foreground font-medium">Track stock levels</h4>
                <p className="text-muted-foreground text-sm">See current quantities per product per location, with low-stock alerts.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium shrink-0">4</div>
              <div>
                <h4 className="text-foreground font-medium">Auto-deduct on sales</h4>
                <p className="text-muted-foreground text-sm">When you issue a sales invoice, stock is automatically deducted from the selected location.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium shrink-0">5</div>
              <div>
                <h4 className="text-foreground font-medium">Adjust for discrepancies</h4>
                <p className="text-muted-foreground text-sm">Manual adjustments for damaged goods, stocktake corrections, or samples.</p>
              </div>
            </div>
          </div>

          {/* Status Legend */}
          <div>
            <h4 className="text-foreground font-medium mb-2">Movement Types</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30">Stock In</Badge>
                <span className="text-muted-foreground text-sm">Goods received from purchase</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30">Stock Out</Badge>
                <span className="text-muted-foreground text-sm">Goods sold via sales invoice</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30">Adjustment</Badge>
                <span className="text-muted-foreground text-sm">Manual correction (damage, stocktake)</span>
              </div>
            </div>
          </div>

          {/* Tips */}
          <div className="bg-muted rounded-lg p-4">
            <h4 className="text-foreground font-medium mb-2">Tips</h4>
            <ul className="space-y-1 text-muted-foreground text-sm">
              <li>Start with one default location — you can add more later.</li>
              <li>Service items are automatically excluded from inventory tracking.</li>
              <li>Draft sales invoices don&apos;t affect stock — only issued invoices do.</li>
              <li>Voiding an invoice automatically reverses the stock deduction.</li>
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
