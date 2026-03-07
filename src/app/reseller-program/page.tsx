'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react'

// Metadata is exported from layout.tsx (client components cannot export metadata)

const earningsData = [
  { plan: 'Starter', payout: 'RM 300', renewal: '+ 5% Renewal' },
  { plan: 'Pro', payout: 'RM 800', renewal: '+ 5% Renewal' },
  { plan: 'Enterprise', value: '10-15% Y1', renewal: '+ 5% Renewal' },
]

const howItWorks = [
  {
    step: '01',
    title: 'Register',
    description: 'Complete your partner profile and get approved. Access partner resources and your unique tracking link.',
  },
  {
    step: '02',
    title: 'Sell & Close',
    description: 'Source prospects, run demos, and close annual deals. You manage the full sales cycle with our support.',
  },
  {
    step: '03',
    title: 'Get Paid',
    description: 'Receive close payout after 30 days of active billing. Earn 5% renewal share from Year 2 onward.',
  },
]

const foundingBenefits = [
  'Free Groot Pro for your own firm*',
  'Founding Badge in Partner Directory',
  'Priority roadmap input',
  'RM 1,000 Milestone Bonus**',
  'Partner-exclusive Launch Promo extension (+2 months)',
]

const programRules = [
  'New paying subscriptions; 90-day attribution window',
  'Reseller deal registration required prior to sale',
  'Payouts released after 30 days of active billing',
  'Commission on net collected subscription revenue',
  'First-touch attribution logic applies',
  'Clawback if customer churns/refunds within 90 days',
  'Downgrade within 90 days: payout adjusted to lower plan level',
]

const faqItems = [
  {
    q: 'Who should join as a reseller?',
    a: 'Accounting firms, bookkeepers, IT advisors, and consultants who can source, demo, and close SME clients.',
  },
  {
    q: 'Are reseller payouts annual-only?',
    a: 'Yes. Launch v1 reseller payouts apply to annual closed-won deals.',
  },
{
    q: 'How are payouts and renewals handled?',
    a: 'Close payouts are released after the customer completes 30 days as a paying subscriber. Renewal share (5%) is settled quarterly in arrears.',
  },
  {
    q: 'Where are full terms and legal rules?',
    a: 'Full program rules and T&Cs are published separately in official partner terms.',
  },
]

export default function ResellerProgramPage() {
  const currentYear = new Date().getFullYear()

  return (
    <div className="min-h-screen bg-[#F0F2F5]">
      <style>{`
        @media print {
          header, .no-print { display: none !important; }
          .page-shell { background: white !important; padding: 0 !important; }
          .brochure { box-shadow: none !important; max-width: 980px !important; margin: 0 auto !important; }
          .print-card { break-inside: avoid; page-break-inside: avoid; }
          details { border-color: #d1d5db !important; }
        }
      `}</style>

      {/* Header - outside the brochure */}
      <header className="border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image src="/groot-wordmark.png" alt="Groot Finance" width={118} height={30} className="h-7 w-auto" />
          </Link>
          <div className="flex items-center gap-3 no-print">
            <Link
              href="/referral"
              className="rounded-lg border border-[#E5E7EB] px-4 py-2 text-sm font-medium text-[#374151] transition-colors hover:bg-[#F3F4F6]"
            >
              Referral Program
            </Link>
            <a
              href="mailto:partners@hellogroot.com?subject=Groot%20Reseller%20Program%20Application"
              className="rounded-lg bg-[#4285F4] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3367D6]"
            >
              Become a Partner
            </a>
          </div>
        </div>
      </header>

      {/* Brochure shell - floating card effect */}
      <div className="page-shell mx-[5%] py-10 md:mx-[15%] md:py-14">
        <main className="brochure overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-lg shadow-black/5">

          {/* Hero - clean white with blue accents */}
          <section className="print-card border-b border-[#E5E7EB] px-8 pb-10 pt-10 md:px-12 md:pt-14 md:pb-12">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-[#111827] md:text-3xl">Groot Reseller Program</h2>
                <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-[#4285F4]">Version 1.0 (Launch)</p>
              </div>
              <div className="hidden text-right md:block">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#9CA3AF]">Effective Date</p>
                <p className="text-base font-semibold text-[#111827]">March 7, 2026</p>
              </div>
            </div>

            <div className="h-px bg-[#E5E7EB]" />

            <div className="mt-8">
              <h1 className="max-w-2xl text-3xl font-bold leading-snug text-[#111827] md:text-[2.5rem] md:leading-snug">
                Sell Groot Finance. Earn meaningful{' '}
                <span className="text-[#4285F4]">recurring revenue</span>.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#6B7280]">
                Purpose-built for accounting firms, consultants, and IT advisors supporting SMEs in Malaysia. Source, demo, close — and get paid.
              </p>
            </div>
          </section>

          {/* How It Works */}
          <section className="print-card border-b border-[#E5E7EB] px-8 py-10 md:px-12">
            <h2 className="mb-6 text-sm font-semibold uppercase tracking-wider text-[#4285F4]">How It Works</h2>
            <div className="grid gap-6 md:grid-cols-3">
              {howItWorks.map((item) => (
                <div key={item.step}>
                  <span className="text-3xl font-bold text-[#4285F4]/20">{item.step}</span>
                  <h3 className="mt-2 text-lg font-semibold text-[#111827]">{item.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#6B7280]">{item.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Earnings Table */}
          <section className="print-card border-b border-[#E5E7EB] px-8 py-10 md:px-12">
            <h2 className="mb-6 text-sm font-semibold uppercase tracking-wider text-[#4285F4]">Reseller Earnings (Annual Deals)</h2>
            <div className="overflow-hidden rounded-xl border border-[#E5E7EB]">
              <div className="grid grid-cols-3 border-b border-[#E5E7EB] bg-[#F9FAFB] px-6 py-3.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#9CA3AF]">Plan</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#9CA3AF]">Close Payout</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#9CA3AF]">Renewal</span>
              </div>
              {earningsData.map((item, i) => (
                <div key={item.plan} className={`grid grid-cols-3 items-center px-6 py-5 ${i < earningsData.length - 1 ? 'border-b border-[#F3F4F6]' : ''}`}>
                  <span className="text-base font-semibold text-[#111827]">{item.plan}</span>
                  <span className="text-2xl font-bold text-[#111827]">{item.payout || item.value}</span>
                  <span className="text-sm font-medium text-[#4285F4]">{item.renewal}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-[#9CA3AF]">
              Bonus: +RM 500 for Starter &rarr; Pro upgrades within 12 months.
            </p>
          </section>

          {/* Founding Partner Benefits - Dark card */}
          <section className="print-card border-b border-[#E5E7EB] px-8 py-10 md:px-12">
            <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#1E293B] to-[#111827] p-8 md:p-10">
              <div className="mb-6 flex items-center gap-3">
                <span className="rounded-md bg-[#4285F4] px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">Exclusive</span>
                <h2 className="text-xl font-bold text-white md:text-2xl">Founding Partner Benefits</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {foundingBenefits.map((benefit) => (
                  <div key={benefit} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-[#34D399]" />
                    <span className="text-[15px] text-[#E2E8F0]">{benefit}</span>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-sm text-[#64748B]">
                *Requires 3+ active customers. **Paid at 10th active customer.
              </p>
            </div>
          </section>

          {/* Program Rules */}
          <section className="print-card border-b border-[#E5E7EB] px-8 py-10 md:px-12">
            <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-[#4285F4]">Program Rules</h2>
            <div className="grid gap-x-10 gap-y-3 md:grid-cols-2">
              {programRules.map((rule) => (
                <p key={rule} className="flex items-start gap-2.5 text-[15px] text-[#4B5563]">
                  <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#CBD5E1]" />
                  {rule}
                </p>
              ))}
            </div>
          </section>

          {/* FAQ */}
          <section className="print-card border-b border-[#E5E7EB] px-8 py-10 md:px-12">
            <h2 className="mb-5 text-xl font-bold text-[#111827]">FAQ</h2>
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

          {/* CTA */}
          <section className="print-card px-8 py-10 md:px-12">
            <h2 className="text-2xl font-bold text-[#111827] md:text-3xl">
              Join Groot Founding Partner Cohort {currentYear}
            </h2>
            <p className="mt-3 text-lg text-[#6B7280]">
              Start with a simple, high-clarity payout model and grow with us as the program evolves.
            </p>
            <a
              href="mailto:partners@hellogroot.com"
              className="mt-2 inline-block text-lg font-semibold text-[#4285F4] hover:underline"
            >
              partners@hellogroot.com
            </a>
            <div className="mt-6 flex flex-wrap gap-3 no-print">
              <a
                href="mailto:partners@hellogroot.com?subject=Apply%20-%20Groot%20Reseller%20Program"
                className="inline-flex items-center gap-2 rounded-lg bg-[#4285F4] px-6 py-3 text-base font-semibold text-white hover:bg-[#3367D6]"
              >
                Apply as Reseller
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
        </main>

        {/* Footer - outside brochure card */}
        <footer className="mt-6 flex items-center justify-between px-2">
          <p className="text-sm text-[#9CA3AF]">
            &copy; {currentYear} Groot Finance
          </p>
          <p className="text-xs text-[#9CA3AF]">
            Commercial guidance only. Final terms in partner agreement.
          </p>
        </footer>
      </div>
    </div>
  )
}
