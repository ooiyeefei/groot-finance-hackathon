'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Gift } from 'lucide-react'

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
    description: 'Get your unique referral link and share it with business owners in your network.',
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
  'Simple referral link tracking — no sales skills needed',
  'No technical knowledge required',
  'Ideal for influencers, accountants, and busy firms',
  'Monthly payout cycle',
]

const programRules = [
  'New logo deals only; 90-day attribution window',
  'First-touch attribution logic applies',
  'Referrer payouts released after 30 days of active billing',
  'Clawback if customer churns/refunds within 90 days',
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

export default function ReferralProgramPage() {
  const currentYear = new Date().getFullYear()

  return (
    <main className="min-h-screen bg-[#F8F9FB] text-[#111111]">
      <style>{`
        @media print {
          header, .no-print { display: none !important; }
          main { background: white !important; }
          .print-wrap { max-width: 980px !important; margin: 0 auto !important; padding: 0 !important; }
          .print-card { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      {/* Header */}
      <header className="border-b border-[#E5E7EB] bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image src="/groot-wordmark.png" alt="Groot Finance" width={118} height={30} className="h-7 w-auto" />
          </Link>
          <div className="flex items-center gap-3 no-print">
            <Link
              href="/reseller-program"
              className="rounded-lg border border-[#E5E7EB] px-4 py-2 text-sm font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6]"
            >
              Reseller Program
            </Link>
            <a
              href="mailto:partners@hellogroot.com?subject=Groot%20Referral%20Program%20Application"
              className="rounded-lg bg-[#111827] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1F2937]"
            >
              Join Referral
            </a>
          </div>
        </div>
      </header>

      <div className="print-wrap mx-auto w-full max-w-6xl px-6">

        {/* Hero Section - Dark gradient */}
        <section className="print-card mt-8 overflow-hidden rounded-2xl bg-gradient-to-br from-[#111827] via-[#1E293B] to-[#0F172A] p-10 md:p-14">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-[#93C5FD] backdrop-blur">
            <Gift className="h-4 w-4" />
            Referral Program
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl">
            Refer businesses. We close. You earn.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#94A3B8]">
            A simple referral model for existing customers and partners who want zero sales overhead. Share your link, we handle the rest.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 no-print">
            <a
              href="mailto:partners@hellogroot.com?subject=Apply%20-%20Groot%20Referral%20Program"
              className="inline-flex items-center gap-2 rounded-lg bg-[#4285F4] px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-[#3367D6]"
            >
              Join Referral Program
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>

        {/* How It Works */}
        <section className="mt-10 print-card">
          <h2 className="mb-6 text-sm font-semibold uppercase tracking-wider text-[#6B7280]">How It Works</h2>
          <div className="grid gap-5 md:grid-cols-3">
            {howItWorks.map((item) => (
              <article key={item.step} className="rounded-xl border border-[#E5E7EB] bg-white p-6">
                <span className="text-3xl font-bold text-[#4285F4]">{item.step}</span>
                <h3 className="mt-3 text-xl font-semibold text-[#111827]">{item.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-[#6B7280]">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Earnings Table */}
        <section className="mt-10 print-card">
          <h2 className="mb-6 text-sm font-semibold uppercase tracking-wider text-[#6B7280]">Referrer Rewards (Annual Deals)</h2>
          <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
            <div className="grid grid-cols-2 border-b border-[#E5E7EB] bg-[#F9FAFB] px-6 py-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#9CA3AF]">Plan</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#9CA3AF]">One-time Payout</span>
            </div>
            {earningsData.map((item, i) => (
              <div key={item.plan} className={`grid grid-cols-2 items-center px-6 py-5 ${i < earningsData.length - 1 ? 'border-b border-[#F3F4F6]' : ''}`}>
                <span className="text-base font-semibold text-[#111827]">{item.plan}</span>
                <span className="text-2xl font-bold text-[#111827]">{item.payout}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-[#9CA3AF]">
            Bonus: +RM 120 for Starter &rarr; Pro upgrades within 12 months.
          </p>
        </section>

        {/* Why Refer - highlight card */}
        <section className="mt-10 print-card overflow-hidden rounded-2xl bg-gradient-to-br from-[#1E293B] to-[#111827] p-8 md:p-10">
          <h2 className="mb-6 text-2xl font-bold text-white">Why refer with Groot?</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {whyRefer.map((item) => (
              <div key={item} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-[#34D399]" />
                <span className="text-base text-[#E2E8F0]">{item}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Existing Customers callout */}
        <section className="mt-6 print-card rounded-xl border border-[#E2E8F0] bg-gradient-to-r from-[#F0F9FF] to-[#EFF6FF] p-6">
          <div className="flex items-start gap-4">
            <Gift className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#4285F4]" />
            <div>
              <h3 className="text-base font-semibold text-[#111827]">Existing Groot customers</h3>
              <p className="mt-1 text-base text-[#6B7280]">
                Referral access will be available from your dashboard Settings. Share your link and start earning — no application required.
              </p>
            </div>
          </div>
        </section>

        {/* Program Rules */}
        <section className="mt-10 print-card">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-[#6B7280]">Program Rules</h2>
          <div className="grid gap-x-10 gap-y-3 md:grid-cols-2">
            {programRules.map((rule) => (
              <p key={rule} className="flex items-start gap-2 text-base text-[#4B5563]">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#9CA3AF]" />
                {rule}
              </p>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-10 print-card">
          <h2 className="mb-5 text-2xl font-bold text-[#111827]">FAQ</h2>
          <div className="space-y-3">
            {faqItems.map((item) => (
              <details key={item.q} className="group rounded-xl border border-[#E5E7EB] bg-white transition-all hover:border-[#D1D5DB]">
                <summary className="cursor-pointer list-none px-6 py-5 text-base font-semibold text-[#111827]">
                  {item.q}
                </summary>
                <p className="px-6 pb-5 text-base leading-relaxed text-[#6B7280]">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mt-10 mb-10 print-card rounded-2xl border border-[#D7E7FF] bg-gradient-to-br from-[#EFF6FF] to-[#F0F9FF] p-8 md:p-10">
          <h2 className="text-3xl font-bold text-[#111827]">Start Referring Today</h2>
          <p className="mt-3 text-lg text-[#4B5563]">
            For existing users, referral access will be available from your dashboard settings. External partners, apply below.
          </p>
          <a
            href="mailto:partners@hellogroot.com"
            className="mt-2 inline-block text-lg font-semibold text-[#4285F4] hover:underline"
          >
            partners@hellogroot.com
          </a>
          <div className="mt-6 flex flex-wrap gap-3 no-print">
            <a
              href="mailto:partners@hellogroot.com?subject=Apply%20-%20Groot%20Referral%20Program"
              className="inline-flex items-center gap-2 rounded-lg bg-[#111827] px-6 py-3 text-base font-semibold text-white hover:bg-[#1F2937]"
            >
              Join Referral Program
              <ArrowRight className="h-4 w-4" />
            </a>
            <button
              onClick={() => window.print()}
              className="rounded-lg border border-[#D1D5DB] bg-white px-6 py-3 text-base font-medium text-[#374151] hover:bg-[#F3F4F6]"
            >
              Export as PDF
            </button>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#E5E7EB] bg-white px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <p className="text-sm text-[#9CA3AF]">
            &copy; {currentYear} Groot Finance
          </p>
          <p className="text-xs text-[#9CA3AF]">
            Referral details subject to final signed terms.
          </p>
        </div>
      </footer>
    </main>
  )
}
