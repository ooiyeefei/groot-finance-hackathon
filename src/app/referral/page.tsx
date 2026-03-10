'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight, CheckCircle2, Gift, Send, Loader2, TrendingUp, Sparkles } from 'lucide-react'

// Metadata is exported from layout.tsx (client components cannot export metadata)

const earningsData = [
  { plan: 'Starter (Annual)', payout: 'RM 80' },
  { plan: 'Pro (Annual)', payout: 'RM 200' },
  { plan: 'Enterprise', payout: 'RM 500' },
]

const howItWorks = [
  {
    step: '01',
    title: 'Share',
    description: 'Get your unique referral code and share it with business owners in your network.',
  },
  {
    step: '02',
    title: 'We Close',
    description: 'Groot handles qualification, demo, proposal, and onboarding. You do zero sales work.',
  },
  {
    step: '03',
    title: 'Get Paid',
    description: 'Receive your payout once the referred customer completes 30 days as a paying subscriber.',
  },
]

const whyRefer = [
  'Simple referral code tracking — no sales skills needed',
  'No technical knowledge required',
  'Ideal for influencers, accountants, and busy firms',
  'Monthly payout cycle',
]

const programRules = [
  'New paying subscriptions; 90-day attribution window',
  'First-touch attribution logic applies',
  'Referrer payouts released after 30 days of active billing',
  'Clawback if customer churns/refunds within 90 days',
  'Downgrade within 90 days: payout adjusted to lower plan level',
]

const faqItems = [
  {
    q: 'Who can join?',
    a: 'Existing Groot customers and approved external partners can join the referral program.',
  },
  {
    q: 'Do I need to do demos or sales calls?',
    a: 'No. Referral is lead-only. Groot handles demo, closing, and onboarding.',
  },
  {
    q: 'When do payouts happen?',
    a: 'Payouts are released after the referred customer completes 30 days as a paying subscriber (past trial). Monthly payout cycle.',
  },
  {
    q: 'Where are full referral rules?',
    a: 'Full referral policy and T&Cs are published separately on the referral terms page.',
  },
]

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-[#D1D5DB] bg-[#F9FAFB] text-[#111827] text-sm placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#4285F4] focus:border-transparent'
const labelClass = 'block text-sm font-medium text-[#111827] mb-1.5'

export default function ReferralProgramPage() {
  const currentYear = new Date().getFullYear()
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', companyName: '', companyWebsite: '', smeClients: '', currentServices: '', heardFrom: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/v1/partner-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, partnerType: 'referrer' }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to submit')
      }
      setIsSubmitted(true)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }
  const updateForm = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))

  return (
    <div className="min-h-screen bg-[#F0F2F5] print:bg-white">
      <style>{`
        @page {
          size: A4;
          margin: 10mm;
        }
        @media print {
          html, body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .no-print { display: none !important; }
          .page-shell {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
          }
          .brochure {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
          }
          .print-card { break-inside: avoid; page-break-inside: avoid; }
          details { border-color: #d1d5db !important; }
          details[open] summary ~ * { display: block !important; }
          .dark-card { background: linear-gradient(135deg, #1E293B, #111827) !important; -webkit-print-color-adjust: exact !important; }
          section {
            padding-left: 1.5rem !important;
            padding-right: 1.5rem !important;
            padding-top: 1rem !important;
            padding-bottom: 1rem !important;
          }
          h1 { font-size: 1.75rem !important; }
          h2 { font-size: 0.85rem !important; }
          .accent-bar { height: 4px !important; }
        }
      `}</style>

      {/* Top Promo Banner */}
      <div className="no-print sticky top-0 z-50 flex items-center justify-center gap-3 bg-gradient-to-r from-[#1E293B] to-[#111827] px-4 py-3 text-white">
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse" />
        <p className="text-[15px] font-medium">
          <span className="font-semibold text-amber-400">Launch Promo:</span>{' '}
          2x referral fee — RM 160 (Starter) to RM 400 (Pro) on first 50 annual deals{' '}
          <span className="mx-1.5">—</span>{' '}
          <span className="font-semibold text-amber-400">First come, first served</span>
        </p>
        <button
          onClick={() => document.getElementById('apply-form')?.scrollIntoView({ behavior: 'smooth' })}
          className="ml-2 rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-[#111827] transition-colors hover:bg-gray-100"
        >
          <Sparkles className="mr-1 inline h-3.5 w-3.5" /> Join Referral
        </button>
      </div>

      {/* Brochure shell */}
      <div className="page-shell mx-[5%] py-10 md:mx-[15%] md:py-14 print:mx-0 print:py-0">
        <main className="brochure overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-lg shadow-black/5 print:shadow-none print:border-0 print:rounded-none">

          {/* Hero */}
          <section className="print-card relative overflow-hidden">
            {/* Top accent bar */}
            <div className="accent-bar h-1.5 bg-gradient-to-r from-[#4285F4] via-[#5B9BFF] to-[#4285F4]" />

            <div className="px-5 pb-8 pt-5 sm:px-8 md:px-12 md:pb-12">
              {/* Nav buttons */}
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 no-print">
                <span className="rounded-full bg-[#4285F4]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#4285F4]">Referral Program</span>
                <div className="flex items-center gap-2">
                  <Link
                    href="/reseller-program?t=groot2026"
                    className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6] sm:px-4 sm:py-2 sm:text-sm"
                  >
                    Reseller Program
                  </Link>
                  <button
                    onClick={() => document.getElementById('apply-form')?.scrollIntoView({ behavior: 'smooth' })}
                    className="rounded-lg bg-[#4285F4] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#3367D6] sm:px-4 sm:py-2 sm:text-sm"
                  >
                    Join Referral
                  </button>
                </div>
              </div>

              <div className="flex items-start justify-between gap-8">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <h2 className="text-xl font-bold text-[#111827] sm:text-2xl md:text-3xl">Groot Referral Program</h2>
                  </div>

                  <h1 className="max-w-2xl text-2xl font-bold leading-snug text-[#111827] sm:text-3xl md:text-[2.5rem] md:leading-snug">
                    Refer businesses. We close.{' '}
                    <span className="text-[#4285F4]">You earn</span>.
                  </h1>
                  <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#6B7280]">
                    A simple referral model for existing customers and partners who want zero sales overhead. Share your code, we handle the rest.
                  </p>
                </div>

                {/* Date box */}
                <div className="hidden md:flex flex-col items-center rounded-xl border-2 border-[#4285F4]/20 bg-[#4285F4]/5 px-6 py-4 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#4285F4]">Effective</p>
                  <p className="text-2xl font-bold text-[#111827]">Mar 7</p>
                  <p className="text-sm font-semibold text-[#6B7280]">{currentYear}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Launch Promo Banner */}
          <section className="print-card border-t border-[#E5E7EB] px-5 py-8 sm:px-8 sm:py-10 md:px-12">
            <div className="rounded-xl border-2 border-[#4285F4]/30 bg-gradient-to-br from-[#4285F4]/5 to-[#4285F4]/10 p-6 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#4285F4]/15">
                <TrendingUp className="h-5 w-5 text-[#4285F4]" />
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#4285F4]">Founding Bonus</p>
              <p className="mt-2 text-3xl font-bold text-[#111827]">2x Commission</p>
              <p className="mt-2 text-base text-[#6B7280]">
                <strong>RM 160 (Starter Annual)</strong> to <strong>RM 400 (Pro Annual)</strong> per deal — limited to first 50 annual subscriptions across all referrers.
              </p>
              <p className="mt-2 text-sm font-bold uppercase tracking-wider text-amber-600">First come, first served — act fast</p>
            </div>
            <div className="mt-4 text-center">
              <Link href="/pricing" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4285F4] hover:underline">
                View full pricing details <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>

          {/* How It Works - numbered cards */}
          <section className="print-card border-t border-[#E5E7EB] bg-[#FAFBFC] px-5 py-8 sm:px-8 sm:py-10 md:px-12">
            <h2 className="mb-8 text-sm font-bold uppercase tracking-wider text-[#4285F4]">How It Works</h2>
            <div className="grid gap-5 md:grid-cols-3">
              {howItWorks.map((item) => (
                <div key={item.step} className="rounded-xl border border-[#E5E7EB] bg-white p-6 transition-shadow hover:shadow-md">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#4285F4] text-lg font-bold text-white">
                    {item.step}
                  </div>
                  <h3 className="text-lg font-bold text-[#111827]">{item.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#6B7280]">{item.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Earnings Table + Upgrade Bonus */}
          <section className="print-card border-t border-[#E5E7EB] px-5 py-8 sm:px-8 sm:py-10 md:px-12">
            <h2 className="mb-6 text-sm font-bold uppercase tracking-wider text-[#4285F4]">Referrer Rewards (Annual Deals Only)</h2>

            <div className="grid gap-6 md:grid-cols-[1fr,auto]">
              <div className="overflow-hidden rounded-xl border border-[#E5E7EB]">
                <div className="grid grid-cols-2 border-b border-[#E5E7EB] bg-[#F9FAFB] px-6 py-3.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#9CA3AF]">Plan</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#9CA3AF]">One-time Payout</span>
                </div>
                {earningsData.map((item, i) => (
                  <div key={item.plan} className={`grid grid-cols-2 items-center px-6 py-5 ${i < earningsData.length - 1 ? 'border-b border-[#F3F4F6]' : ''}`}>
                    <span className="text-base font-semibold text-[#111827]">{item.plan}</span>
                    <span className="text-2xl font-bold text-[#111827]">{item.payout}</span>
                  </div>
                ))}
              </div>

              {/* Upgrade Bonus callout */}
              <div className="md:w-52">
                <div className="rounded-xl border-2 border-[#4285F4]/30 bg-gradient-to-br from-[#4285F4]/5 to-[#4285F4]/10 p-5 text-center">
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#4285F4]/15">
                    <TrendingUp className="h-5 w-5 text-[#4285F4]" />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#4285F4]">Upgrade Bonus</p>
                  <p className="mt-2 text-2xl font-bold text-[#111827]">+RM 120</p>
                  <p className="mt-1 text-sm text-[#6B7280]">
                    Starter to Pro upgrade within 12 months
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Why Refer - Dark card */}
          <section className="print-card border-t border-[#E5E7EB] px-5 py-8 sm:px-8 sm:py-10 md:px-12">
            <div className="dark-card overflow-hidden rounded-2xl bg-gradient-to-br from-[#1E293B] to-[#111827] p-8 md:p-10">
              <h2 className="mb-6 text-xl font-bold text-white md:text-2xl">Why refer with Groot?</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {whyRefer.map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-[#34D399]" />
                    <span className="text-[15px] text-[#E2E8F0]">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Existing Customers callout */}
          <section className="print-card border-t border-[#E5E7EB] px-5 py-6 sm:px-8 md:px-12">
            <div className="flex items-start gap-4 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-5">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#4285F4]/10">
                <Gift className="h-4.5 w-4.5 text-[#4285F4]" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#111827]">Existing Groot customers</h3>
                <p className="mt-1 text-[15px] text-[#6B7280]">
                  Referral access will be available from your dashboard Settings. Share your code and start earning — no application required.
                </p>
              </div>
            </div>
          </section>

          {/* Program Rules */}
          <section className="print-card border-t border-[#E5E7EB] px-5 py-8 sm:px-8 sm:py-10 md:px-12">
            <h2 className="mb-5 text-sm font-bold uppercase tracking-wider text-[#4285F4]">Program Rules</h2>
            <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-6">
              <div className="grid gap-x-10 gap-y-3 md:grid-cols-2">
                {programRules.map((rule) => (
                  <p key={rule} className="flex items-start gap-2.5 text-[15px] text-[#4B5563]">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#4285F4]/40" />
                    {rule}
                  </p>
                ))}
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section className="print-card border-t border-[#E5E7EB] px-5 py-8 sm:px-8 sm:py-10 md:px-12">
            <h2 className="mb-5 text-lg font-bold text-[#111827]">Frequently Asked Questions</h2>
            <div className="space-y-3">
              {faqItems.map((item) => (
                <details key={item.q} className="group rounded-xl border border-[#E5E7EB] bg-[#FCFCFD] transition-all hover:border-[#D1D5DB]">
                  <summary className="cursor-pointer list-none px-5 py-4 text-[15px] font-semibold text-[#111827]">
                    {item.q}
                  </summary>
                  <p className="px-5 pb-4 text-[15px] leading-relaxed text-[#6B7280]">{item.a}</p>
                </details>
              ))}
            </div>
          </section>

          {/* Application Form */}
          <section id="apply-form" className="print-card border-t border-[#E5E7EB] px-5 py-8 sm:px-8 sm:py-10 md:px-12">
            <div className="flex items-start gap-4">
              <div className="hidden md:flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[#4285F4]">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[#111827] md:text-3xl">Start Referring Today</h2>
                <p className="mt-2 text-base text-[#6B7280]">
                  For existing users, referral access will be available from your dashboard settings. External partners, apply below.
                </p>
              </div>
            </div>

            {isSubmitted ? (
              <div className="mt-8 rounded-xl border border-green-200 bg-green-50 p-6 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
                <h3 className="mt-3 text-lg font-semibold text-[#111827]">Application Submitted</h3>
                <p className="mt-1 text-sm text-[#6B7280]">
                  Thank you! Our partnerships team will review your application and get back to you via email.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-8 space-y-5 no-print">
                <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white p-6">
                  {/* Row 1: Name & Email */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="fullName" className={labelClass}>Full Name *</label>
                      <input id="fullName" type="text" required value={form.fullName} onChange={e => updateForm('fullName', e.target.value)} placeholder="John Doe" className={inputClass} />
                    </div>
                    <div>
                      <label htmlFor="email" className={labelClass}>Work Email *</label>
                      <input id="email" type="email" required value={form.email} onChange={e => updateForm('email', e.target.value)} placeholder="john@company.com" className={inputClass} />
                    </div>
                  </div>

                  {/* Row 2: Phone & Company */}
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="phone" className={labelClass}>Phone / WhatsApp *</label>
                      <input id="phone" type="tel" required value={form.phone} onChange={e => updateForm('phone', e.target.value)} placeholder="+60 12-345 6789" className={inputClass} />
                    </div>
                    <div>
                      <label htmlFor="companyName" className={labelClass}>Company Name *</label>
                      <input id="companyName" type="text" required value={form.companyName} onChange={e => updateForm('companyName', e.target.value)} placeholder="Your Company Sdn Bhd" className={inputClass} />
                    </div>
                  </div>

                  {/* Row 3: Website */}
                  <div className="mt-4">
                    <label htmlFor="companyWebsite" className={labelClass}>Company Website / SSM Number</label>
                    <input id="companyWebsite" type="text" value={form.companyWebsite} onChange={e => updateForm('companyWebsite', e.target.value)} placeholder="www.company.com or SSM 202401012345" className={inputClass} />
                  </div>

                  {/* Optional section */}
                  <div className="mt-6 border-t border-[#F3F4F6] pt-5">
                    <p className="mb-4 text-xs font-bold uppercase tracking-wider text-[#9CA3AF]">Optional</p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="smeClients" className={labelClass}>How many SME clients do you serve?</label>
                        <input id="smeClients" type="text" value={form.smeClients} onChange={e => updateForm('smeClients', e.target.value)} placeholder="e.g. 20-50" className={inputClass} />
                      </div>
                      <div>
                        <label htmlFor="heardFrom" className={labelClass}>How did you hear about us?</label>
                        <input id="heardFrom" type="text" value={form.heardFrom} onChange={e => updateForm('heardFrom', e.target.value)} placeholder="e.g. LinkedIn, referral" className={inputClass} />
                      </div>
                    </div>
                    <div className="mt-4">
                      <label htmlFor="currentServices" className={labelClass}>Current services offered</label>
                      <input id="currentServices" type="text" value={form.currentServices} onChange={e => updateForm('currentServices', e.target.value)} placeholder="e.g. Bookkeeping, tax filing, IT consulting" className={inputClass} />
                    </div>
                  </div>
                </div>

                {formError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm text-red-600">{formError}</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#4285F4] px-6 py-3 text-base font-semibold text-white hover:bg-[#3367D6] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</>
                    ) : (
                      <><Send className="h-4 w-4" /> Join Referral Program</>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-lg border border-[#D1D5DB] bg-white px-6 py-3 text-base font-medium text-[#374151] hover:bg-[#F3F4F6]"
                  >
                    Export as PDF
                  </button>
                  <a href="mailto:partners@hellogroot.com" className="text-sm font-medium text-[#4285F4] hover:underline">
                    partners@hellogroot.com
                  </a>
                </div>
              </form>
            )}
          </section>
        </main>

        {/* Footer */}
        <footer className="mt-6 flex items-center justify-between px-2 print:mt-4 print:border-t print:border-[#E5E7EB] print:pt-3">
          <p className="text-sm text-[#9CA3AF]">
            &copy; {currentYear} Groot Finance
          </p>
          <p className="text-xs text-[#9CA3AF]">
            Referral details subject to final signed terms.
          </p>
        </footer>
      </div>
    </div>
  )
}
