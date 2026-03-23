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
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Calculator className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Groot Finance
              </h1>
              <p className="text-xs text-muted-foreground">ROI Calculator</p>
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
          <div className="mx-auto max-w-5xl px-4 py-2 sm:px-6">
            <p className="text-sm text-primary text-center">
              Provided by{' '}
              <span className="font-medium">{partner.name}</span>
            </p>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        {/* Hero */}
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            How much can your business save?
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Enter your current business metrics to see how much time and money
            you could save with AI-powered financial automation.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Your Business Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Currency selector */}
              <div className="space-y-1.5">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={currency}
                  onValueChange={(v) => setCurrency(v as SupportedCurrency)}
                >
                  <SelectTrigger id="currency">
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
              <div className="space-y-1.5">
                <Label htmlFor="pi" className="flex items-center gap-1.5">
                  <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
                  Purchase invoices per month
                </Label>
                <Input
                  id="pi"
                  type="number"
                  min={INPUT_LIMITS.minDocuments}
                  max={INPUT_LIMITS.maxDocuments}
                  placeholder="e.g. 50"
                  value={purchaseInvoices}
                  onChange={(e) => setPurchaseInvoices(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="si" className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  Sales invoices per month
                </Label>
                <Input
                  id="si"
                  type="number"
                  min={INPUT_LIMITS.minDocuments}
                  max={INPUT_LIMITS.maxDocuments}
                  placeholder="e.g. 30"
                  value={salesInvoices}
                  onChange={(e) => setSalesInvoices(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="er" className="flex items-center gap-1.5">
                  <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                  Expense receipts per month
                </Label>
                <Input
                  id="er"
                  type="number"
                  min={INPUT_LIMITS.minDocuments}
                  max={INPUT_LIMITS.maxDocuments}
                  placeholder="e.g. 100"
                  value={expenseReceipts}
                  onChange={(e) => setExpenseReceipts(e.target.value)}
                />
              </div>

              {/* Team info */}
              <div className="border-t border-border pt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="staff" className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    Finance / admin staff
                  </Label>
                  <Input
                    id="staff"
                    type="number"
                    min={INPUT_LIMITS.minStaff}
                    max={INPUT_LIMITS.maxStaff}
                    placeholder="e.g. 3"
                    value={financeStaff}
                    onChange={(e) => setFinanceStaff(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Total headcount handling finance tasks
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="salary" className="flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                    Average monthly salary ({currency})
                  </Label>
                  <Input
                    id="salary"
                    type="number"
                    min={INPUT_LIMITS.minSalary}
                    max={INPUT_LIMITS.maxSalary}
                    placeholder={currency === 'MYR' ? 'e.g. 4000' : 'e.g. 3000'}
                    value={monthlySalary}
                    onChange={(e) => setMonthlySalary(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results Section */}
          <div className="space-y-4">
            {result.hasResults ? (
              <>
                {/* Primary metrics */}
                <Card className="border-primary/20 bg-primary/[0.02]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      Your Estimated Savings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <MetricCard
                        icon={<Clock className="h-5 w-5" />}
                        label="Hours saved / month"
                        value={`${formatNumber(result.hoursSavedPerMonth, 1)} hrs`}
                        color="text-blue-600 dark:text-blue-400"
                        bgColor="bg-blue-50 dark:bg-blue-950/30"
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
                        bgColor="bg-green-50 dark:bg-green-950/30"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <MetricCard
                        icon={<TrendingUp className="h-5 w-5" />}
                        label="Payback period"
                        value={
                          result.paybackPeriodMonths < 1
                            ? '< 1 month'
                            : `${result.paybackPeriodMonths} months`
                        }
                        color="text-purple-600 dark:text-purple-400"
                        bgColor="bg-purple-50 dark:bg-purple-950/30"
                      />
                      <MetricCard
                        icon={<Users className="h-5 w-5" />}
                        label="Time on manual finance"
                        value={`${result.timeSpentPercent}%`}
                        subtitle="of your team's capacity"
                        color="text-orange-600 dark:text-orange-400"
                        bgColor="bg-orange-50 dark:bg-orange-950/30"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Before/After comparison */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Before vs After Groot Finance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="space-y-3">
                        <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
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
                      <div className="space-y-3">
                        <p className="font-medium text-primary text-xs uppercase tracking-wider">
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
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={() =>
                      window.open('https://finance.hellogroot.com/sign-up', '_blank')
                    }
                  >
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>

                  {partner && (
                    <Button
                      className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                      onClick={() => window.open(partner.contactUrl, '_blank')}
                    >
                      Talk to {partner.name}
                    </Button>
                  )}

                  <Button
                    className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
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
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <Calculator className="h-12 w-12 text-muted-foreground/40 mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-1">
                    Enter your business metrics
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Fill in the form on the left to see how much time and money
                    your business could save with Groot Finance.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            Estimates based on average time savings from Groot Finance customers.
            Actual results may vary based on business complexity and volume.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
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
}: {
  icon: React.ReactNode
  label: string
  value: string
  subtitle?: string
  color: string
  bgColor: string
}) {
  return (
    <div className={`rounded-lg p-4 ${bgColor}`}>
      <div className={`${color} mb-2`}>{icon}</div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
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
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={`font-medium ${variant === 'before' ? 'text-muted-foreground' : 'text-primary'}`}
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
