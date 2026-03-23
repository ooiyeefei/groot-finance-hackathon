'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Calculator,
  Clock,
  DollarSign,
  TrendingUp,
  Users,
  Share2,
  Check,
  Info,
  FileText,
  Receipt,
  ShoppingCart,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { formatCurrency, formatNumber } from '@/lib/utils/format-number'
import {
  calculateROI,
  type CalculationInput,
} from '@/lib/roi-calculator/calculation'
import { getPartner } from '@/lib/roi-calculator/partners'
import {
  SUPPORTED_CURRENCIES,
  INPUT_LIMITS,
  GROOT_MONTHLY_PRICE,
  type SupportedCurrency,
} from '@/lib/roi-calculator/constants'

function clampInt(value: string, min: number, max: number): number {
  const n = parseInt(value, 10)
  if (isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}

function clampFloat(value: string, min: number, max: number): number {
  const n = parseFloat(value)
  if (isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}

export function ROICalculatorClient() {
  const searchParams = useSearchParams()

  // Parse initial values from URL query params (for shared links)
  const [purchaseInvoices, setPurchaseInvoices] = useState(
    searchParams.get('pi') || ''
  )
  const [salesInvoices, setSalesInvoices] = useState(
    searchParams.get('si') || ''
  )
  const [expenseReceipts, setExpenseReceipts] = useState(
    searchParams.get('er') || ''
  )
  const [financeStaff, setFinanceStaff] = useState(
    searchParams.get('staff') || ''
  )
  const [monthlySalary, setMonthlySalary] = useState(
    searchParams.get('salary') || ''
  )
  const [currency, setCurrency] = useState<SupportedCurrency>(
    (searchParams.get('currency') as SupportedCurrency) || 'MYR'
  )
  const [copied, setCopied] = useState(false)

  // Partner branding
  const partnerCode = searchParams.get('partner')
  const partner = useMemo(() => getPartner(partnerCode), [partnerCode])

  // Calculate ROI in real-time
  const input: CalculationInput = useMemo(
    () => ({
      purchaseInvoices: clampInt(
        purchaseInvoices,
        INPUT_LIMITS.minDocuments,
        INPUT_LIMITS.maxDocuments
      ),
      salesInvoices: clampInt(
        salesInvoices,
        INPUT_LIMITS.minDocuments,
        INPUT_LIMITS.maxDocuments
      ),
      expenseReceipts: clampInt(
        expenseReceipts,
        INPUT_LIMITS.minDocuments,
        INPUT_LIMITS.maxDocuments
      ),
      financeStaff: clampInt(
        financeStaff,
        INPUT_LIMITS.minStaff,
        INPUT_LIMITS.maxStaff
      ),
      monthlySalary: clampFloat(
        monthlySalary,
        INPUT_LIMITS.minSalary,
        INPUT_LIMITS.maxSalary
      ),
      currency,
    }),
    [
      purchaseInvoices,
      salesInvoices,
      expenseReceipts,
      financeStaff,
      monthlySalary,
      currency,
    ]
  )

  const result = useMemo(() => calculateROI(input), [input])

  // Generate shareable link
  const generateShareLink = useCallback(() => {
    const params = new URLSearchParams()
    if (purchaseInvoices) params.set('pi', purchaseInvoices)
    if (salesInvoices) params.set('si', salesInvoices)
    if (expenseReceipts) params.set('er', expenseReceipts)
    if (financeStaff) params.set('staff', financeStaff)
    if (monthlySalary) params.set('salary', monthlySalary)
    params.set('currency', currency)
    if (partnerCode) params.set('partner', partnerCode)
    // Preserve the access token so shared links pass the middleware gate
    const token = searchParams.get('t')
    if (token) params.set('t', token)

    const url = `${window.location.origin}/roi-calculator?${params.toString()}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [
    purchaseInvoices,
    salesInvoices,
    expenseReceipts,
    financeStaff,
    monthlySalary,
    currency,
    partnerCode,
    searchParams,
  ])

  // Reset copied state when inputs change
  useEffect(() => {
    setCopied(false)
  }, [
    purchaseInvoices,
    salesInvoices,
    expenseReceipts,
    financeStaff,
    monthlySalary,
    currency,
  ])

  const grootPrice = GROOT_MONTHLY_PRICE[currency] ?? GROOT_MONTHLY_PRICE.USD

  return (
    <div className="min-h-screen bg-background">
      {/* Scoped animations */}
      <style jsx global>{`
        @keyframes roi-fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes roi-scale-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes roi-count-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes roi-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .roi-fade-up { animation: roi-fade-up 0.5s ease-out both; }
        .roi-scale-in { animation: roi-scale-in 0.4s ease-out both; }
        .roi-count-up { animation: roi-count-up 0.35s ease-out both; }
        .roi-stagger-1 { animation-delay: 0.05s; }
        .roi-stagger-2 { animation-delay: 0.1s; }
        .roi-stagger-3 { animation-delay: 0.15s; }
        .roi-stagger-4 { animation-delay: 0.2s; }
      `}</style>

      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <Calculator className="h-[18px] w-[18px] text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-[1.2rem] font-semibold text-foreground leading-tight">
                Groot Finance
              </h1>
              <p className="text-[0.7rem] text-muted-foreground">ROI Calculator</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <HowItWorksDrawer />
          </div>
        </div>
      </header>

      {/* Partner banner */}
      {partner && (
        <div className="bg-primary/5 border-b border-primary/10">
          <div className="mx-auto max-w-6xl px-4 py-2.5 sm:px-6">
            <p className="text-[0.82rem] text-primary text-center">
              Provided by{' '}
              <span className="font-semibold">{partner.name}</span>
            </p>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        {/* Hero */}
        <div className="text-center mb-8 roi-fade-up">
          <h2 className="text-[1.7rem] sm:text-[2rem] font-bold text-foreground mb-2 tracking-tight">
            How much can your business save?
          </h2>
          <p className="text-[0.95rem] text-muted-foreground max-w-2xl mx-auto">
            Enter your current business metrics to see how much time and money
            you could save with AI-powered financial automation.
          </p>
        </div>

        {/* 40/60 split: inputs narrow, results prominent */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
          {/* Input Section — compact 2/5 width */}
          <Card className="lg:col-span-2 roi-fade-up roi-stagger-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-[1.05rem] flex items-center gap-2">
                <Users className="h-[18px] w-[18px] text-primary" />
                Your Business Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Currency selector */}
              <div className="space-y-1">
                <Label htmlFor="currency" className="text-[0.8rem]">Currency</Label>
                <Select
                  value={currency}
                  onValueChange={(v) => setCurrency(v as SupportedCurrency)}
                >
                  <SelectTrigger id="currency" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Document volumes */}
              <div className="space-y-1">
                <Label htmlFor="pi" className="text-[0.8rem] flex items-center gap-1.5">
                  <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
                  Purchase invoices / mo
                </Label>
                <Input
                  id="pi"
                  type="number"
                  min={INPUT_LIMITS.minDocuments}
                  max={INPUT_LIMITS.maxDocuments}
                  placeholder="e.g. 50"
                  className="h-9"
                  value={purchaseInvoices}
                  onChange={(e) => setPurchaseInvoices(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="si" className="text-[0.8rem] flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  Sales invoices / mo
                </Label>
                <Input
                  id="si"
                  type="number"
                  min={INPUT_LIMITS.minDocuments}
                  max={INPUT_LIMITS.maxDocuments}
                  placeholder="e.g. 30"
                  className="h-9"
                  value={salesInvoices}
                  onChange={(e) => setSalesInvoices(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="er" className="text-[0.8rem] flex items-center gap-1.5">
                  <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                  Expense receipts / mo
                </Label>
                <Input
                  id="er"
                  type="number"
                  min={INPUT_LIMITS.minDocuments}
                  max={INPUT_LIMITS.maxDocuments}
                  placeholder="e.g. 100"
                  className="h-9"
                  value={expenseReceipts}
                  onChange={(e) => setExpenseReceipts(e.target.value)}
                />
              </div>

              {/* Team info */}
              <div className="border-t border-border pt-3 space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="staff" className="text-[0.8rem] flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    Finance / admin staff
                  </Label>
                  <Input
                    id="staff"
                    type="number"
                    min={INPUT_LIMITS.minStaff}
                    max={INPUT_LIMITS.maxStaff}
                    placeholder="e.g. 3"
                    className="h-9"
                    value={financeStaff}
                    onChange={(e) => setFinanceStaff(e.target.value)}
                  />
                  <p className="text-[0.7rem] text-muted-foreground">
                    Total headcount handling finance tasks
                  </p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="salary" className="text-[0.8rem] flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                    Avg monthly salary ({currency})
                  </Label>
                  <Input
                    id="salary"
                    type="number"
                    min={INPUT_LIMITS.minSalary}
                    max={INPUT_LIMITS.maxSalary}
                    placeholder={currency === 'MYR' ? 'e.g. 4000' : 'e.g. 3000'}
                    className="h-9"
                    value={monthlySalary}
                    onChange={(e) => setMonthlySalary(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results Section — prominent 3/5 width */}
          <div className="lg:col-span-3 space-y-5">
            {result.hasResults ? (
              <>
                {/* Primary metrics — hero numbers */}
                <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.03] to-primary/[0.07] roi-scale-in">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[1.1rem] flex items-center gap-2">
                      <Sparkles className="h-[18px] w-[18px] text-primary" />
                      Your Estimated Savings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <MetricCard
                        icon={<Clock className="h-5 w-5" />}
                        label="Hours saved / month"
                        value={`${formatNumber(result.hoursSavedPerMonth, 1)} hrs`}
                        color="text-blue-600 dark:text-blue-400"
                        bgColor="bg-blue-50/80 dark:bg-blue-950/30"
                        className="roi-count-up roi-stagger-1"
                      />
                      <MetricCard
                        icon={<DollarSign className="h-5 w-5" />}
                        label="Annual cost savings"
                        value={formatCurrency(
                          result.annualCostSavings,
                          currency,
                          0
                        )}
                        color="text-green-600 dark:text-green-400"
                        bgColor="bg-green-50/80 dark:bg-green-950/30"
                        highlight
                        className="roi-count-up roi-stagger-2"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <MetricCard
                        icon={<TrendingUp className="h-5 w-5" />}
                        label="Payback period"
                        value={
                          result.paybackPeriodMonths < 1
                            ? '< 1 month'
                            : `${result.paybackPeriodMonths} months`
                        }
                        color="text-purple-600 dark:text-purple-400"
                        bgColor="bg-purple-50/80 dark:bg-purple-950/30"
                        className="roi-count-up roi-stagger-3"
                      />
                      <MetricCard
                        icon={<Users className="h-5 w-5" />}
                        label="Time on manual finance"
                        value={`${result.timeSpentPercent}%`}
                        subtitle="of your team's capacity"
                        color="text-orange-600 dark:text-orange-400"
                        bgColor="bg-orange-50/80 dark:bg-orange-950/30"
                        className="roi-count-up roi-stagger-4"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Before/After comparison */}
                <Card className="roi-fade-up roi-stagger-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[1.05rem]">
                      Before vs After Groot Finance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-3 rounded-lg bg-muted/40 p-4">
                        <p className="font-semibold text-muted-foreground text-[0.7rem] uppercase tracking-wider">
                          Before
                        </p>
                        <ComparisonRow
                          label="Monthly hours on finance"
                          value={`${formatNumber(result.hoursSavedPerMonth, 1)} hrs`}
                          variant="before"
                        />
                        <ComparisonRow
                          label="Monthly cost"
                          value={formatCurrency(
                            result.monthlyCostSavings,
                            currency,
                            0
                          )}
                          variant="before"
                        />
                        <ComparisonRow
                          label="Automation"
                          value="Manual"
                          variant="before"
                        />
                      </div>
                      <div className="space-y-3 rounded-lg bg-primary/[0.04] border border-primary/10 p-4">
                        <p className="font-semibold text-primary text-[0.7rem] uppercase tracking-wider">
                          After
                        </p>
                        <ComparisonRow
                          label="Monthly hours on finance"
                          value="Automated"
                          variant="after"
                        />
                        <ComparisonRow
                          label="Monthly cost"
                          value={formatCurrency(grootPrice, currency, 0)}
                          variant="after"
                        />
                        <ComparisonRow
                          label="Automation"
                          value="AI-powered"
                          variant="after"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* CTAs */}
                <div className="flex flex-col sm:flex-row gap-3 roi-fade-up roi-stagger-3">
                  <Button
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground h-11 text-[0.95rem]"
                    onClick={() =>
                      window.open('https://finance.hellogroot.com/sign-up', '_blank')
                    }
                  >
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>

                  {partner && (
                    <Button
                      className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground h-11 text-[0.95rem]"
                      onClick={() => window.open(partner.contactUrl, '_blank')}
                    >
                      Talk to {partner.name}
                    </Button>
                  )}

                  <Button
                    className="bg-secondary hover:bg-secondary/80 text-secondary-foreground h-11"
                    onClick={generateShareLink}
                  >
                    {copied ? (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Share2 className="mr-2 h-4 w-4" />
                        Share
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              /* Empty state */
              <Card className="border-dashed roi-fade-up roi-stagger-2">
                <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="h-16 w-16 rounded-2xl bg-primary/5 flex items-center justify-center mb-5">
                    <Calculator className="h-8 w-8 text-primary/30" />
                  </div>
                  <h3 className="text-[1.15rem] font-medium text-foreground mb-1">
                    Enter your business metrics
                  </h3>
                  <p className="text-[0.9rem] text-muted-foreground max-w-sm">
                    Fill in the form to see how much time and money
                    your business could save with Groot Finance.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-border text-center">
          <p className="text-[0.75rem] text-muted-foreground">
            Estimates based on average time savings from Groot Finance customers.
            Actual results may vary based on business complexity and volume.
          </p>
          <p className="text-[0.75rem] text-muted-foreground mt-1">
            Groot Finance subscription starts at{' '}
            {formatCurrency(grootPrice, currency, 0)}/month.
          </p>
        </footer>
      </main>
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  subtitle,
  color,
  bgColor,
  highlight,
  className = '',
}: {
  icon: React.ReactNode
  label: string
  value: string
  subtitle?: string
  color: string
  bgColor: string
  highlight?: boolean
  className?: string
}) {
  return (
    <div className={`rounded-xl p-4 ${bgColor} ${highlight ? 'ring-1 ring-green-200 dark:ring-green-800/40' : ''} ${className}`}>
      <div className={`${color} mb-2`}>{icon}</div>
      <p className="text-[0.75rem] text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-[1.4rem] font-bold tracking-tight ${color}`}>{value}</p>
      {subtitle && (
        <p className="text-[0.7rem] text-muted-foreground mt-0.5">{subtitle}</p>
      )}
    </div>
  )
}

function ComparisonRow({
  label,
  value,
  variant,
}: {
  label: string
  value: string
  variant: 'before' | 'after'
}) {
  return (
    <div>
      <p className="text-muted-foreground text-[0.72rem]">{label}</p>
      <p
        className={`font-semibold text-[0.95rem] ${variant === 'before' ? 'text-muted-foreground' : 'text-primary'}`}
      >
        {value}
      </p>
    </div>
  )
}

function HowItWorksDrawer() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Info className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>How the ROI Calculator Works</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-6 text-sm">
          <div>
            <h4 className="font-medium text-foreground mb-2">
              1. Enter your metrics
            </h4>
            <p className="text-muted-foreground">
              Tell us how many documents your team processes monthly and your
              team size. We use these to calculate the hours currently spent on
              manual finance tasks.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-foreground mb-2">
              2. See your savings
            </h4>
            <p className="text-muted-foreground">
              Based on average time savings from Groot Finance customers, we
              estimate how many hours and how much money you could save by
              automating invoice processing, expense claims, and reconciliation.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-foreground mb-2">
              3. Share with your team
            </h4>
            <p className="text-muted-foreground">
              Copy the shareable link to send your results to decision-makers.
              The link preserves all your inputs so they see the exact same
              calculation.
            </p>
          </div>
          <div className="border-t border-border pt-4">
            <h4 className="font-medium text-foreground mb-2">
              Time savings assumptions
            </h4>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Purchase invoice: ~8 min saved per invoice</li>
              <li>• Sales invoice: ~6 min saved per invoice</li>
              <li>• Expense receipt: ~4 min saved per receipt</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              These estimates are based on the average difference between manual
              processing and Groot Finance automation across our customer base.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
