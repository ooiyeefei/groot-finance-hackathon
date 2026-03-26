'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import Image from 'next/image'
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
  type CalculationResult,
} from '@/lib/roi-calculator/calculation'
import {
  SUPPORTED_CURRENCIES,
  INPUT_LIMITS,
  type SupportedCurrency,
  type ROIPlanMap,
} from '@/lib/roi-calculator/constants'

// Finance icon SVG (same as landing page)
const FINANCE_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDQ4IDQ4Ij48ZyBmaWxsPSJub25lIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjQiPjxwYXRoIGZpbGw9IiMyZjg4ZmYiIHN0cm9rZT0ibm9uZSIgZD0iTTI0IDQ0QzM1LjA0NTcgNDQgNDQgMzUuMDQ1NyA0NCAyNEM0NCAxMi45NTQzIDM1LjA0NTcgNCAyNCA0QzEyLjk1NDMgNCA0IDEyLjk1NDMgNCAyNEM0IDM1LjA0NTcgMTIuOTU0MyA0NCAyNCA0NFoiLz48cGF0aCBzdHJva2U9IiNmZmYiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgZD0iTTE4IDIySDMwIi8+PHBhdGggc3Ryb2tlPSIjZmZmIiBzdHJva2UtbGluZWNhcD0icm91bmQiIGQ9Ik0xOCAyOEgzMCIvPjxwYXRoIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBkPSJNMjQuMDA4MyAyMlYzNCIvPjxwYXRoIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBkPSJNMzAgMTVMMjQgMjFMMTggMTUiLz48L2c+PC9zdmc+'

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

export function ROICalculatorClient({ planData }: { planData: ROIPlanMap }) {
  const searchParams = useSearchParams()

  const [purchaseInvoices, setPurchaseInvoices] = useState(searchParams.get('pi') || '')
  const [salesInvoices, setSalesInvoices] = useState(searchParams.get('si') || '')
  const [expenseReceipts, setExpenseReceipts] = useState(searchParams.get('er') || '')
  const [financeStaff, setFinanceStaff] = useState(searchParams.get('staff') || '')
  const [monthlySalary, setMonthlySalary] = useState(searchParams.get('salary') || '')
  const [currency, setCurrency] = useState<SupportedCurrency>(
    (searchParams.get('currency') as SupportedCurrency) || 'MYR'
  )
  const [copied, setCopied] = useState(false)

  const partnerCode = searchParams.get('partner')
  const partnerData = useQuery(
    api.functions.referral.getPartnerBySlug,
    partnerCode ? { slug: partnerCode } : 'skip'
  )

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

  const result = useMemo(() => calculateROI(input, planData), [input, planData])

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

  useEffect(() => { setCopied(false) }, [purchaseInvoices, salesInvoices, expenseReceipts, financeStaff, monthlySalary, currency])

  const grootPrice = result.grootPrice
  const startsAtPrice = planData.starter.currencyOptions[currency.toLowerCase()] ?? planData.starter.price

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <style jsx global>{`
        @keyframes roi-fade-up {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes roi-scale-in {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes roi-count-up {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .roi-fade-up { animation: roi-fade-up 0.45s ease-out both; }
        .roi-scale-in { animation: roi-scale-in 0.4s ease-out both; }
        .roi-count-up { animation: roi-count-up 0.3s ease-out both; }
        .roi-stagger-1 { animation-delay: 0.05s; }
        .roi-stagger-2 { animation-delay: 0.1s; }
        .roi-stagger-3 { animation-delay: 0.15s; }
        .roi-stagger-4 { animation-delay: 0.2s; }
      `}</style>

      {/* Header — matches landing page nav */}
      <nav className="border-b border-[#E5E7EB] bg-white/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Image src="/groot-wordmark.png" alt="groot" width={72} height={22} className="h-5 w-auto invert" />
            <span className="text-[#4285F4] text-xl font-semibold">.</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={FINANCE_ICON} alt="" width={20} height={20} className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-3">
            <HowItWorksDrawer />
            <a
              href="https://finance.hellogroot.com/en/sign-in"
              className="text-sm px-4 py-1.5 rounded-lg border border-[#E5E7EB] text-[#111] hover:bg-[#F9FAFB] transition-colors"
            >
              Sign in
            </a>
          </div>
        </div>
      </nav>

      {/* Partner banner */}
      {partnerData && (
        <div className="bg-[#4285F4]/5 border-b border-[#4285F4]/10">
          <div className="max-w-6xl mx-auto px-6 py-2">
            <p className="text-[0.95rem] text-[#4285F4] text-center font-medium">
              Provided by <span className="font-bold">{partnerData.name}</span>
            </p>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-5 flex-1">
        {/* Hero — brand pitch */}
        <div className="text-center mb-5 roi-fade-up">
          <h2 className="text-[1.65rem] sm:text-[1.9rem] font-semibold text-[#111] tracking-tight mb-1">
            How much can your business <span className="text-[#4285F4]">save</span>?
          </h2>
          <p className="text-[0.9rem] text-[#6B7280]">
            The only finance platform with AI that gets smarter every week — see your estimated ROI below.
          </p>
        </div>

        {/* 1:2:1 layout (inputs | savings | plan) */}
        <div className="grid grid-cols-1 lg:grid-cols-8 gap-5 lg:gap-5">
          {/* Inputs — col 1 */}
          <Card className="lg:col-span-2 roi-fade-up roi-stagger-1 border-[#E5E7EB]">
            <CardContent className="pt-5 pb-5 space-y-3">
              <div className="flex items-center gap-2 mb-0.5">
                <Users className="h-[18px] w-[18px] text-[#4285F4]" />
                <span className="text-[0.95rem] font-semibold text-[#111]">Your Business Metrics</span>
              </div>

              {/* Currency + Salary row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="currency" className="text-[0.75rem] text-[#6B7280]">Currency</Label>
                  <Select value={currency} onValueChange={(v) => setCurrency(v as SupportedCurrency)}>
                    <SelectTrigger id="currency" className="h-9 text-[0.85rem]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="salary" className="text-[0.75rem] text-[#6B7280] flex items-center gap-1">
                    <DollarSign className="h-3 w-3" /> Avg monthly salary ({currency})
                  </Label>
                  <Input id="salary" type="number" min={INPUT_LIMITS.minSalary} max={INPUT_LIMITS.maxSalary}
                    placeholder={currency === 'MYR' ? 'e.g. 4000' : 'e.g. 3000'} className="h-9 text-[0.85rem]"
                    value={monthlySalary} onChange={(e) => setMonthlySalary(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="pi" className="text-[0.75rem] text-[#6B7280] flex items-center gap-1">
                  <ShoppingCart className="h-3 w-3" /> Purchase invoices / mo
                </Label>
                <Input id="pi" type="number" min={INPUT_LIMITS.minDocuments} max={INPUT_LIMITS.maxDocuments}
                  placeholder="e.g. 50" className="h-9 text-[0.85rem]"
                  value={purchaseInvoices} onChange={(e) => setPurchaseInvoices(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="si" className="text-[0.75rem] text-[#6B7280] flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Sales invoices / mo
                </Label>
                <Input id="si" type="number" min={INPUT_LIMITS.minDocuments} max={INPUT_LIMITS.maxDocuments}
                  placeholder="e.g. 30" className="h-9 text-[0.85rem]"
                  value={salesInvoices} onChange={(e) => setSalesInvoices(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="er" className="text-[0.75rem] text-[#6B7280] flex items-center gap-1">
                  <Receipt className="h-3 w-3" /> Expense receipts / mo
                </Label>
                <Input id="er" type="number" min={INPUT_LIMITS.minDocuments} max={INPUT_LIMITS.maxDocuments}
                  placeholder="e.g. 100" className="h-9 text-[0.85rem]"
                  value={expenseReceipts} onChange={(e) => setExpenseReceipts(e.target.value)} />
              </div>

              <div className="border-t border-[#E5E7EB] pt-3 space-y-1">
                <Label htmlFor="staff" className="text-[0.75rem] text-[#6B7280] flex items-center gap-1">
                  <Users className="h-3 w-3" /> Finance / admin staff
                </Label>
                <Input id="staff" type="number" min={INPUT_LIMITS.minStaff} max={INPUT_LIMITS.maxStaff}
                  placeholder="e.g. 3" className="h-9 text-[0.85rem]"
                  value={financeStaff} onChange={(e) => setFinanceStaff(e.target.value)} />
                <p className="text-[0.68rem] text-[#9CA3AF]">Total headcount handling finance tasks</p>
              </div>
            </CardContent>
          </Card>

          {/* Results — col 2 (wider) */}
          <div className="lg:col-span-4 space-y-4">
            {result.hasResults ? (
              <>
                {/* Metric cards */}
                <Card className="border-[#4285F4]/20 bg-gradient-to-br from-[#4285F4]/[0.02] to-[#4285F4]/[0.06] roi-scale-in">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="h-[18px] w-[18px] text-[#4285F4]" />
                      <span className="text-[0.95rem] font-semibold text-[#111]">Your Estimated Savings</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <MetricCard icon={<Clock className="h-[18px] w-[18px]" />}
                        label="Hours saved / month"
                        value={`${formatNumber(result.hoursSavedPerMonth, 1)} hrs`}
                        color="text-blue-600" bgColor="bg-blue-50/80"
                        className="roi-count-up roi-stagger-1" />
                      <MetricCard icon={<DollarSign className="h-[18px] w-[18px]" />}
                        label="Annual cost savings"
                        value={formatCurrency(result.annualCostSavings, currency, 0)}
                        color="text-green-600" bgColor="bg-green-50/80" highlight
                        className="roi-count-up roi-stagger-2" />
                      <MetricCard icon={<TrendingUp className="h-[18px] w-[18px]" />}
                        label="Payback period"
                        value={result.paybackPeriodMonths < 1 ? '< 1 month' : `${result.paybackPeriodMonths} months`}
                        color="text-purple-600" bgColor="bg-purple-50/80"
                        className="roi-count-up roi-stagger-3" />
                      <MetricCard icon={<Users className="h-[18px] w-[18px]" />}
                        label="Time on manual finance"
                        value={`${result.timeSpentPercent}%`} subtitle="of team capacity"
                        color="text-orange-600" bgColor="bg-orange-50/80"
                        className="roi-count-up roi-stagger-4" />
                    </div>
                  </CardContent>
                </Card>

                {/* Before/After strip */}
                <div className="grid grid-cols-2 gap-3 roi-fade-up roi-stagger-2">
                  <div className="rounded-lg bg-[#F3F4F6] px-4 py-3">
                    <p className="font-semibold text-[#9CA3AF] text-[0.68rem] uppercase tracking-wider mb-2">Before</p>
                    <div className="grid grid-cols-3 gap-2">
                      <ComparisonRow label="Hours / mo" value={`${formatNumber(result.hoursSavedPerMonth, 1)} hrs`} variant="before" />
                      <ComparisonRow label="Monthly cost" value={formatCurrency(result.monthlyCostSavings, currency, 0)} variant="before" />
                      <ComparisonRow label="Process" value="Manual" variant="before" />
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#4285F4]/[0.04] border border-[#4285F4]/10 px-4 py-3">
                    <p className="font-semibold text-[#4285F4] text-[0.68rem] uppercase tracking-wider mb-2">
                      After <span className="normal-case font-normal text-[#9CA3AF]">({result.planName} plan)</span>
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <ComparisonRow label="Hours / mo" value="Automated" variant="after" />
                      <ComparisonRow label="Monthly cost" value={formatCurrency(grootPrice, currency, 0)} variant="after" />
                      <ComparisonRow label="Process" value="AI-powered" variant="after" />
                    </div>
                  </div>
                </div>

                {/* CTAs */}
                <div className="flex gap-3 roi-fade-up roi-stagger-3">
                  <Button
                    className="flex-1 bg-[#4285F4] hover:bg-[#3B78E7] text-white h-10 text-[0.9rem] rounded-lg"
                    onClick={() => window.open('https://finance.hellogroot.com/sign-up', '_blank')}
                  >
                    Get Started <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                  {partnerData && (
                    <Button
                      className="flex-1 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#111] h-10 text-[0.9rem] rounded-lg"
                      onClick={() => window.open(`mailto:hello@hellogroot.com?subject=ROI Calculator inquiry via ${partnerData.name}`, '_blank')}
                    >
                      Talk to {partnerData.name}
                    </Button>
                  )}
                  <Button
                    className="bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#111] h-10 rounded-lg"
                    onClick={generateShareLink}
                  >
                    {copied ? <><Check className="mr-1.5 h-4 w-4" /> Copied!</> : <><Share2 className="mr-1.5 h-4 w-4" /> Share</>}
                  </Button>
                </div>
              </>
            ) : (
              <Card className="border-dashed border-[#E5E7EB] roi-fade-up roi-stagger-2 h-full">
                <CardContent className="flex flex-col items-center justify-center h-full py-16 text-center">
                  <div className="h-14 w-14 rounded-2xl bg-[#4285F4]/5 flex items-center justify-center mb-4">
                    <Calculator className="h-7 w-7 text-[#4285F4]/30" />
                  </div>
                  <h3 className="text-[1.1rem] font-medium text-[#111] mb-1">Enter your business metrics</h3>
                  <p className="text-[0.85rem] text-[#6B7280] max-w-xs">
                    Fill in the form to see how much time and money your business could save with Groot Finance.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Recommended Plan — col 3 */}
          <div className="lg:col-span-2 roi-fade-up roi-stagger-3">
            <RecommendedPlanCard
              result={result}
              currency={currency}
              grootPrice={grootPrice}
            />
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-4 pt-3 border-t border-[#E5E7EB] text-center">
          <p className="text-[0.72rem] text-[#9CA3AF]">
            Estimates based on average time savings from Groot Finance customers. Actual results may vary. Subscription starts at {formatCurrency(startsAtPrice, currency, 0)}/month.
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
    <div className={`rounded-xl px-3.5 py-3 ${bgColor} ${highlight ? 'ring-1 ring-green-200' : ''} ${className}`}>
      <div className={`${color} mb-1`}>{icon}</div>
      <p className="text-[0.7rem] text-[#6B7280] leading-tight">{label}</p>
      <p className={`text-[1.35rem] font-bold tracking-tight leading-tight ${color}`}>{value}</p>
      {subtitle && <p className="text-[0.65rem] text-[#9CA3AF]">{subtitle}</p>}
    </div>
  )
}

function ComparisonRow({ label, value, variant }: { label: string; value: string; variant: 'before' | 'after' }) {
  return (
    <div>
      <p className="text-[#9CA3AF] text-[0.65rem] leading-tight">{label}</p>
      <p className={`font-semibold text-[0.85rem] leading-snug ${variant === 'before' ? 'text-[#6B7280]' : 'text-[#4285F4]'}`}>
        {value}
      </p>
    </div>
  )
}

function formatLimit(limit: number): string {
  if (limit === -1) return 'Unlimited'
  return `${limit}`
}

function RecommendedPlanCard({
  result,
  currency,
  grootPrice,
}: {
  result: CalculationResult
  currency: SupportedCurrency
  grootPrice: number
}) {
  if (!result.hasResults) {
    return (
      <Card className="border-dashed border-[#E5E7EB] h-full">
        <CardContent className="flex flex-col items-center justify-center h-full py-16 text-center">
          <div className="h-12 w-12 rounded-2xl bg-[#4285F4]/5 flex items-center justify-center mb-3">
            <Sparkles className="h-6 w-6 text-[#4285F4]/30" />
          </div>
          <h3 className="text-[0.95rem] font-medium text-[#111] mb-1">Your recommended plan</h3>
          <p className="text-[0.8rem] text-[#6B7280]">
            Fill in your metrics to see which plan fits best.
          </p>
        </CardContent>
      </Card>
    )
  }

  const q = result.planQuotas
  const isEnterprise = result.planName === 'Enterprise'

  return (
    <Card className="border-[#4285F4]/30 bg-gradient-to-b from-[#4285F4]/[0.03] to-white roi-scale-in h-full flex flex-col">
      <CardContent className="pt-4 pb-4 flex flex-col flex-1">
        {/* Plan header */}
        <div className="text-center mb-3">
          <span className="inline-block text-[0.6rem] font-semibold uppercase tracking-widest text-[#4285F4] bg-[#4285F4]/10 px-2.5 py-0.5 rounded-full mb-2">
            Recommended
          </span>
          <h3 className="text-[1.1rem] font-bold text-[#111]">
            {result.planName}
          </h3>
          {isEnterprise ? (
            <p className="text-[0.85rem] text-[#6B7280] mt-0.5">Custom pricing</p>
          ) : (
            <div className="mt-1">
              <span className="text-[1.5rem] font-bold text-[#111]">
                {formatCurrency(grootPrice, currency, 0)}
              </span>
              <span className="text-[0.8rem] text-[#6B7280]">/mo</span>
            </div>
          )}
        </div>

        {/* Quotas */}
        <div className="space-y-1.5 mb-3">
          <p className="text-[0.68rem] font-semibold text-[#9CA3AF] uppercase tracking-wider">Plan quotas</p>
          <QuotaRow label="Team members" value={formatLimit(q.teamLimit)} />
          <QuotaRow label="OCR scans/mo" value={formatLimit(q.ocrLimit)} />
          <QuotaRow label="AI messages/mo" value={formatLimit(q.aiMessageLimit)} />
          <QuotaRow label="Sales invoices/mo" value={formatLimit(q.invoiceLimit)} />
          <QuotaRow label="e-Invoices/mo" value={formatLimit(q.einvoiceLimit)} />
        </div>

        {/* Features */}
        <div className="border-t border-[#E5E7EB] pt-3 flex-1">
          <p className="text-[0.68rem] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1.5">Includes</p>
          <ul className="space-y-1">
            {result.planHighlightFeatures.map((feature, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[0.75rem] text-[#374151]">
                <Check className="h-3.5 w-3.5 text-[#4285F4] shrink-0 mt-0.5" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <Button
          className="w-full mt-3 bg-[#4285F4] hover:bg-[#3B78E7] text-white h-9 text-[0.8rem] rounded-lg"
          onClick={() => window.open('https://finance.hellogroot.com/sign-up', '_blank')}
        >
          {isEnterprise ? 'Contact Us' : 'Start Free Trial'}
        </Button>
      </CardContent>
    </Card>
  )
}

function QuotaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[0.78rem]">
      <span className="text-[#6B7280]">{label}</span>
      <span className="font-semibold text-[#111]">{value}</span>
    </div>
  )
}

function HowItWorksDrawer() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[#F3F4F6] transition-colors">
          <Info className="h-4 w-4 text-[#6B7280]" />
        </button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>How the ROI Calculator Works</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-6 text-sm">
          <div>
            <h4 className="font-medium text-[#111] mb-2">1. Enter your metrics</h4>
            <p className="text-[#6B7280]">Tell us how many documents your team processes monthly and your team size.</p>
          </div>
          <div>
            <h4 className="font-medium text-[#111] mb-2">2. See your savings</h4>
            <p className="text-[#6B7280]">We estimate hours and cost savings from automating invoice processing, expense claims, and reconciliation.</p>
          </div>
          <div>
            <h4 className="font-medium text-[#111] mb-2">3. Share with your team</h4>
            <p className="text-[#6B7280]">Copy the shareable link to send results to decision-makers.</p>
          </div>
          <div className="border-t border-[#E5E7EB] pt-4">
            <h4 className="font-medium text-[#111] mb-2">Time savings assumptions</h4>
            <ul className="space-y-1 text-[#6B7280]">
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
