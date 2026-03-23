'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
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

  const partnerCode = searchParams.get('partner')
  const partner = useMemo(() => getPartner(partnerCode), [partnerCode])

  const input: CalculationInput = useMemo(
    () => ({
      purchaseInvoices: clampInt(purchaseInvoices, INPUT_LIMITS.minDocuments, INPUT_LIMITS.maxDocuments),
      salesInvoices: clampInt(salesInvoices, INPUT_LIMITS.minDocuments, INPUT_LIMITS.maxDocuments),
      expenseReceipts: clampInt(expenseReceipts, INPUT_LIMITS.minDocuments, INPUT_LIMITS.maxDocuments),
      financeStaff: clampInt(financeStaff, INPUT_LIMITS.minStaff, INPUT_LIMITS.maxStaff),
      monthlySalary: clampFloat(monthlySalary, INPUT_LIMITS.minSalary, INPUT_LIMITS.maxSalary),
      currency,
    }),
    [purchaseInvoices, salesInvoices, expenseReceipts, financeStaff, monthlySalary, currency]
  )

  const result = useMemo(() => calculateROI(input), [input])

  const generateShareLink = useCallback(() => {
    const params = new URLSearchParams()
    if (purchaseInvoices) params.set('pi', purchaseInvoices)
    if (salesInvoices) params.set('si', salesInvoices)
    if (expenseReceipts) params.set('er', expenseReceipts)
    if (financeStaff) params.set('staff', financeStaff)
    if (monthlySalary) params.set('salary', monthlySalary)
    params.set('currency', currency)
    if (partnerCode) params.set('partner', partnerCode)
    const token = searchParams.get('t')
    if (token) params.set('t', token)

    const url = `${window.location.origin}/roi-calculator?${params.toString()}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [purchaseInvoices, salesInvoices, expenseReceipts, financeStaff, monthlySalary, currency, partnerCode, searchParams])

  useEffect(() => {
    setCopied(false)
  }, [purchaseInvoices, salesInvoices, expenseReceipts, financeStaff, monthlySalary, currency])

  const grootPrice = GROOT_MONTHLY_PRICE[currency] ?? GROOT_MONTHLY_PRICE.USD

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <style jsx global>{`
        @keyframes roi-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes roi-scale-in {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes roi-count-up {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .roi-fade-up { animation: roi-fade-up 0.4s ease-out both; }
        .roi-scale-in { animation: roi-scale-in 0.35s ease-out both; }
        .roi-count-up { animation: roi-count-up 0.3s ease-out both; }
        .roi-stagger-1 { animation-delay: 0.04s; }
        .roi-stagger-2 { animation-delay: 0.08s; }
        .roi-stagger-3 { animation-delay: 0.12s; }
        .roi-stagger-4 { animation-delay: 0.16s; }
      `}</style>

      {/* Header — compact */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-2 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Calculator className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-[1.05rem] font-semibold text-foreground leading-tight">
                Groot Finance
              </h1>
              <p className="text-[0.65rem] text-muted-foreground leading-tight">ROI Calculator</p>
            </div>
          </div>
          <HowItWorksDrawer />
        </div>
      </header>

      {/* Partner banner — slim */}
      {partner && (
        <div className="bg-primary/5 border-b border-primary/10">
          <div className="mx-auto max-w-6xl px-4 py-1.5 sm:px-6">
            <p className="text-[0.78rem] text-primary text-center">
              Provided by <span className="font-semibold">{partner.name}</span>
            </p>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-4 sm:px-6 flex-1">
        {/* Hero — tight */}
        <div className="text-center mb-4 roi-fade-up">
          <h2 className="text-[1.5rem] sm:text-[1.75rem] font-bold text-foreground tracking-tight">
            How much can your business save?
          </h2>
          <p className="text-[0.85rem] text-muted-foreground">
            Enter your metrics to see estimated savings with AI-powered financial automation.
          </p>
        </div>

        {/* 40/60 split */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6">
          {/* Inputs — compact */}
          <Card className="lg:col-span-2 roi-fade-up roi-stagger-1">
            <CardContent className="pt-4 pb-4 space-y-2.5">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-[0.95rem] font-semibold text-foreground">Your Business Metrics</span>
              </div>

              {/* Currency — inline with first field */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="space-y-0.5">
                  <Label htmlFor="currency" className="text-[0.72rem]">Currency</Label>
                  <Select value={currency} onValueChange={(v) => setCurrency(v as SupportedCurrency)}>
                    <SelectTrigger id="currency" className="h-8 text-[0.82rem]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-0.5">
                  <Label htmlFor="salary" className="text-[0.72rem] flex items-center gap-1">
                    <DollarSign className="h-3 w-3 text-muted-foreground" />
                    Avg monthly salary ({currency})
                  </Label>
                  <Input id="salary" type="number" min={INPUT_LIMITS.minSalary} max={INPUT_LIMITS.maxSalary}
                    placeholder={currency === 'MYR' ? 'e.g. 4000' : 'e.g. 3000'} className="h-8 text-[0.82rem]"
                    value={monthlySalary} onChange={(e) => setMonthlySalary(e.target.value)} />
                </div>
              </div>

              {/* Document volumes */}
              <div className="space-y-0.5">
                <Label htmlFor="pi" className="text-[0.72rem] flex items-center gap-1">
                  <ShoppingCart className="h-3 w-3 text-muted-foreground" />
                  Purchase invoices / mo
                </Label>
                <Input id="pi" type="number" min={INPUT_LIMITS.minDocuments} max={INPUT_LIMITS.maxDocuments}
                  placeholder="e.g. 50" className="h-8 text-[0.82rem]"
                  value={purchaseInvoices} onChange={(e) => setPurchaseInvoices(e.target.value)} />
              </div>

              <div className="space-y-0.5">
                <Label htmlFor="si" className="text-[0.72rem] flex items-center gap-1">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  Sales invoices / mo
                </Label>
                <Input id="si" type="number" min={INPUT_LIMITS.minDocuments} max={INPUT_LIMITS.maxDocuments}
                  placeholder="e.g. 30" className="h-8 text-[0.82rem]"
                  value={salesInvoices} onChange={(e) => setSalesInvoices(e.target.value)} />
              </div>

              <div className="space-y-0.5">
                <Label htmlFor="er" className="text-[0.72rem] flex items-center gap-1">
                  <Receipt className="h-3 w-3 text-muted-foreground" />
                  Expense receipts / mo
                </Label>
                <Input id="er" type="number" min={INPUT_LIMITS.minDocuments} max={INPUT_LIMITS.maxDocuments}
                  placeholder="e.g. 100" className="h-8 text-[0.82rem]"
                  value={expenseReceipts} onChange={(e) => setExpenseReceipts(e.target.value)} />
              </div>

              {/* Team — inline row */}
              <div className="border-t border-border pt-2 space-y-0.5">
                <Label htmlFor="staff" className="text-[0.72rem] flex items-center gap-1">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  Finance / admin staff
                </Label>
                <Input id="staff" type="number" min={INPUT_LIMITS.minStaff} max={INPUT_LIMITS.maxStaff}
                  placeholder="e.g. 3" className="h-8 text-[0.82rem]"
                  value={financeStaff} onChange={(e) => setFinanceStaff(e.target.value)} />
                <p className="text-[0.65rem] text-muted-foreground">Total headcount handling finance tasks</p>
              </div>
            </CardContent>
          </Card>

          {/* Results — prominent */}
          <div className="lg:col-span-3 space-y-3">
            {result.hasResults ? (
              <>
                {/* Metric cards */}
                <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.03] to-primary/[0.07] roi-scale-in">
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-center gap-2 mb-2.5">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-[0.95rem] font-semibold text-foreground">Your Estimated Savings</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <MetricCard
                        icon={<Clock className="h-4 w-4" />}
                        label="Hours saved / month"
                        value={`${formatNumber(result.hoursSavedPerMonth, 1)} hrs`}
                        color="text-blue-600 dark:text-blue-400"
                        bgColor="bg-blue-50/80 dark:bg-blue-950/30"
                        className="roi-count-up roi-stagger-1"
                      />
                      <MetricCard
                        icon={<DollarSign className="h-4 w-4" />}
                        label="Annual cost savings"
                        value={formatCurrency(result.annualCostSavings, currency, 0)}
                        color="text-green-600 dark:text-green-400"
                        bgColor="bg-green-50/80 dark:bg-green-950/30"
                        highlight
                        className="roi-count-up roi-stagger-2"
                      />
                      <MetricCard
                        icon={<TrendingUp className="h-4 w-4" />}
                        label="Payback period"
                        value={result.paybackPeriodMonths < 1 ? '< 1 month' : `${result.paybackPeriodMonths} months`}
                        color="text-purple-600 dark:text-purple-400"
                        bgColor="bg-purple-50/80 dark:bg-purple-950/30"
                        className="roi-count-up roi-stagger-3"
                      />
                      <MetricCard
                        icon={<Users className="h-4 w-4" />}
                        label="Time on manual finance"
                        value={`${result.timeSpentPercent}%`}
                        subtitle="of team capacity"
                        color="text-orange-600 dark:text-orange-400"
                        bgColor="bg-orange-50/80 dark:bg-orange-950/30"
                        className="roi-count-up roi-stagger-4"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Before/After — horizontal compact strip */}
                <div className="grid grid-cols-2 gap-3 roi-fade-up roi-stagger-2">
                  <div className="rounded-lg bg-muted/40 px-4 py-3">
                    <p className="font-semibold text-muted-foreground text-[0.65rem] uppercase tracking-wider mb-2">Before</p>
                    <div className="grid grid-cols-3 gap-2">
                      <ComparisonRow label="Hours / mo" value={`${formatNumber(result.hoursSavedPerMonth, 1)} hrs`} variant="before" />
                      <ComparisonRow label="Monthly cost" value={formatCurrency(result.monthlyCostSavings, currency, 0)} variant="before" />
                      <ComparisonRow label="Process" value="Manual" variant="before" />
                    </div>
                  </div>
                  <div className="rounded-lg bg-primary/[0.04] border border-primary/10 px-4 py-3">
                    <p className="font-semibold text-primary text-[0.65rem] uppercase tracking-wider mb-2">After</p>
                    <div className="grid grid-cols-3 gap-2">
                      <ComparisonRow label="Hours / mo" value="Automated" variant="after" />
                      <ComparisonRow label="Monthly cost" value={formatCurrency(grootPrice, currency, 0)} variant="after" />
                      <ComparisonRow label="Process" value="AI-powered" variant="after" />
                    </div>
                  </div>
                </div>

                {/* CTAs — compact row */}
                <div className="flex gap-2.5 roi-fade-up roi-stagger-3">
                  <Button
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground h-10 text-[0.88rem]"
                    onClick={() => window.open('https://finance.hellogroot.com/sign-up', '_blank')}
                  >
                    Get Started <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                  {partner && (
                    <Button
                      className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground h-10 text-[0.88rem]"
                      onClick={() => window.open(partner.contactUrl, '_blank')}
                    >
                      Talk to {partner.name}
                    </Button>
                  )}
                  <Button
                    className="bg-secondary hover:bg-secondary/80 text-secondary-foreground h-10"
                    onClick={generateShareLink}
                  >
                    {copied ? <><Check className="mr-1.5 h-3.5 w-3.5" /> Copied!</> : <><Share2 className="mr-1.5 h-3.5 w-3.5" /> Share</>}
                  </Button>
                </div>
              </>
            ) : (
              <Card className="border-dashed roi-fade-up roi-stagger-2 h-full">
                <CardContent className="flex flex-col items-center justify-center h-full py-16 text-center">
                  <div className="h-14 w-14 rounded-2xl bg-primary/5 flex items-center justify-center mb-4">
                    <Calculator className="h-7 w-7 text-primary/30" />
                  </div>
                  <h3 className="text-[1.05rem] font-medium text-foreground mb-1">
                    Enter your business metrics
                  </h3>
                  <p className="text-[0.82rem] text-muted-foreground max-w-xs">
                    Fill in the form to see how much time and money your business could save.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Footer — minimal */}
        <footer className="mt-3 pt-3 border-t border-border text-center">
          <p className="text-[0.7rem] text-muted-foreground">
            Estimates based on average time savings. Actual results may vary. Groot Finance starts at {formatCurrency(grootPrice, currency, 0)}/month.
          </p>
        </footer>
      </main>
    </div>
  )
}

function MetricCard({
  icon, label, value, subtitle, color, bgColor, highlight, className = '',
}: {
  icon: React.ReactNode; label: string; value: string; subtitle?: string
  color: string; bgColor: string; highlight?: boolean; className?: string
}) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${bgColor} ${highlight ? 'ring-1 ring-green-200 dark:ring-green-800/40' : ''} ${className}`}>
      <div className={`${color} mb-1`}>{icon}</div>
      <p className="text-[0.68rem] text-muted-foreground leading-tight">{label}</p>
      <p className={`text-[1.25rem] font-bold tracking-tight leading-tight ${color}`}>{value}</p>
      {subtitle && <p className="text-[0.62rem] text-muted-foreground">{subtitle}</p>}
    </div>
  )
}

function ComparisonRow({ label, value, variant }: { label: string; value: string; variant: 'before' | 'after' }) {
  return (
    <div>
      <p className="text-muted-foreground text-[0.62rem] leading-tight">{label}</p>
      <p className={`font-semibold text-[0.82rem] leading-snug ${variant === 'before' ? 'text-muted-foreground' : 'text-primary'}`}>
        {value}
      </p>
    </div>
  )
}

function HowItWorksDrawer() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <Info className="h-3.5 w-3.5" />
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>How the ROI Calculator Works</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-6 text-sm">
          <div>
            <h4 className="font-medium text-foreground mb-2">1. Enter your metrics</h4>
            <p className="text-muted-foreground">
              Tell us how many documents your team processes monthly and your team size.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-foreground mb-2">2. See your savings</h4>
            <p className="text-muted-foreground">
              We estimate hours and cost savings from automating invoice processing, expense claims, and reconciliation.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-foreground mb-2">3. Share with your team</h4>
            <p className="text-muted-foreground">
              Copy the shareable link to send results to decision-makers.
            </p>
          </div>
          <div className="border-t border-border pt-4">
            <h4 className="font-medium text-foreground mb-2">Time savings assumptions</h4>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Purchase invoice: ~8 min saved</li>
              <li>• Sales invoice: ~6 min saved</li>
              <li>• Expense receipt: ~4 min saved</li>
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
