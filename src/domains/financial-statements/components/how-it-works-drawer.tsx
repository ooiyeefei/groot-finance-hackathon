'use client'

import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

export function HowItWorksDrawer() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Info className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>How Financial Statements Work</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-6 text-sm text-muted-foreground">
          <section>
            <h3 className="text-base font-semibold text-foreground mb-2">
              1. Trial Balance
            </h3>
            <p>
              Lists every account with its total debits and credits. The totals
              must always be equal — if they&apos;re not, something is wrong
              with your journal entries.
            </p>
            <p className="mt-1 text-xs">
              Use it to: Verify your books are balanced before generating other
              reports.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-foreground mb-2">
              2. Profit & Loss (Income Statement)
            </h3>
            <p>
              Shows your revenue minus expenses for a period. Tells you whether
              your business made or lost money.
            </p>
            <p className="mt-1 text-xs">
              Use it to: Understand profitability, compare periods, and identify
              spending trends.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-foreground mb-2">
              3. Balance Sheet
            </h3>
            <p>
              A snapshot of what your business owns (assets), owes
              (liabilities), and the owners&apos; stake (equity) at a specific
              date. Assets must always equal Liabilities + Equity.
            </p>
            <p className="mt-1 text-xs">
              Use it to: Assess financial health, apply for loans, or report to
              investors.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-foreground mb-2">
              4. Cash Flow Statement
            </h3>
            <p>
              Shows where cash came from and where it went, categorized into
              Operating (day-to-day), Investing (assets), and Financing
              (loans/equity) activities.
            </p>
            <p className="mt-1 text-xs">
              Use it to: Understand liquidity and ensure you have enough cash to
              operate.
            </p>
          </section>

          <section className="border-t border-border pt-4">
            <h3 className="text-base font-semibold text-foreground mb-2">
              Tips
            </h3>
            <ul className="list-disc pl-4 space-y-1">
              <li>All reports are generated from your posted journal entries.</li>
              <li>Draft and voided entries are excluded automatically.</li>
              <li>
                Use &quot;Export PDF&quot; to share reports with your accountant
                or auditor.
              </li>
              <li>
                The P&L supports period comparison — toggle it to see how this
                period compares to the last.
              </li>
              <li>
                You can also ask the chat agent: &quot;Show me P&L for last
                quarter&quot;
              </li>
            </ul>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
