'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Award, Briefcase, CheckCircle2, Handshake, Layers3, Sparkles } from 'lucide-react'

// Metadata is exported from layout.tsx (client components cannot export metadata)

const highlights = [
  {
    icon: Handshake,
    label: 'Starter Payout',
    value: 'RM 300',
    note: 'One-time close payout (annual)',
  },
  {
    icon: Briefcase,
    label: 'Pro Payout',
    value: 'RM 800',
    note: 'One-time close payout (annual)',
  },
  {
    icon: Award,
    label: 'Enterprise',
    value: '10-15%',
    note: 'Year 1 contract value',
  },
  {
    icon: Layers3,
    label: 'Renewal Share',
    value: '5%',
    note: 'From Year 2 onward',
  },
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
    q: 'Can resellers charge setup fees?',
    a: 'Yes. Resellers may charge customers directly for setup, migration, and training services (suggested RM 300-800 for setup assistance).',
  },
  {
    q: 'What are the founding partner benefits?',
    a: 'Founding partners can receive free Pro for their own firm, a directory badge, priority roadmap input, and milestone incentives.',
  },
  {
    q: 'How are payouts and renewals handled?',
    a: 'Close payouts are released after the customer completes 60 days as a paying subscriber. Renewal share (5%) is settled quarterly in arrears.',
  },
  {
    q: 'Where are full terms and legal rules?',
    a: 'Full program rules and T&Cs are published separately in official partner terms.',
  },
]

export default function ResellerProgramPage() {
  const currentYear = new Date().getFullYear()

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-[#111111]">
      <style>{`
        @media print {
          header, .no-print { display: none !important; }
          main { background: white !important; }
          .print-wrap { max-width: 980px !important; margin: 0 auto !important; padding: 0 !important; }
          .print-card { break-inside: avoid; page-break-inside: avoid; }
          details { border-color: #d1d5db !important; }
        }
      `}</style>

      <header className="border-b border-[#E5E7EB] bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image src="/groot-wordmark.png" alt="Groot Finance" width={118} height={30} className="h-7 w-auto" />
          </Link>
          <div className="flex items-center gap-3 no-print">
            <Link
              href="/referral"
              className="rounded-md border border-[#E5E7EB] px-3 py-2 text-sm text-[#374151] transition-colors hover:bg-[#F3F4F6]"
            >
              Referral
            </Link>
            <a
              href="mailto:partners@hellogroot.com?subject=Groot%20Reseller%20Program%20Application"
              className="rounded-md bg-[#4285F4] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3367D6]"
            >
              Become a Partner
            </a>
          </div>
        </div>
      </header>

      <div className="print-wrap mx-auto w-full max-w-6xl px-6 py-10 md:py-14">
        <section className="print-card relative overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white p-7 md:p-10">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#4285F4]/10" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-[#4285F4]/5" />

          <div className="relative">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#EEF4FF] px-3 py-1 text-xs font-medium text-[#3367D6]">
              <Sparkles className="h-3.5 w-3.5" />
              Reseller Program
            </p>
            <h1 className="max-w-3xl text-3xl font-semibold leading-tight md:text-4xl">
              Sell Groot Finance and earn meaningful recurring partner revenue.
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] text-[#6B7280]">
              Purpose-built for accounting firms, consultants, and IT advisors supporting SMEs in Malaysia.
            </p>
          </div>
        </section>

        <section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {highlights.map((item) => (
            <article key={item.label} className="print-card rounded-xl border border-[#E5E7EB] bg-white p-5">
              <item.icon className="h-5 w-5 text-[#4285F4]" />
              <p className="mt-3 text-xs uppercase tracking-wide text-[#6B7280]">{item.label}</p>
              <p className="mt-1 text-2xl font-semibold text-[#111111]">{item.value}</p>
              <p className="mt-1 text-sm text-[#6B7280]">{item.note}</p>
            </article>
          ))}
        </section>

        <section className="mt-7 grid gap-4 md:grid-cols-3">
          <article className="print-card rounded-xl border border-[#E5E7EB] bg-white p-5">
            <h2 className="text-sm font-semibold text-[#111111]">How It Works</h2>
            <ul className="mt-3 space-y-2 text-sm text-[#4B5563]">
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-[#16A34A]" />Register partner profile</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-[#16A34A]" />Source, demo, and close annual deals</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-[#16A34A]" />Receive payout + renewal share</li>
            </ul>
          </article>

          <article className="print-card rounded-xl border border-[#E5E7EB] bg-white p-5 md:col-span-2">
            <h2 className="text-sm font-semibold text-[#111111]">At A Glance</h2>
            <p className="mt-3 text-sm text-[#4B5563]">
              Earn close payouts on annual deals, plus 5% recurring renewal share from Year 2. Charge your own setup fees (RM 300–800) on top — 100% yours to keep.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#EEF4FF] px-3 py-1 text-xs font-medium text-[#3367D6]">Annual Deals</span>
              <span className="rounded-full bg-[#F3F4F6] px-3 py-1 text-xs font-medium text-[#374151]">MYR Pricing</span>
              <span className="rounded-full bg-[#F0FDF4] px-3 py-1 text-xs font-medium text-[#166534]">Founding Partner Benefits</span>
            </div>
          </article>
        </section>

        <section className="mt-7 print-card rounded-xl border border-[#E5E7EB] bg-white p-5 md:p-6">
          <h2 className="text-lg font-semibold">FAQ</h2>
          <div className="mt-4 space-y-3">
            {faqItems.map((item) => (
              <details key={item.q} className="rounded-lg border border-[#E5E7EB] bg-[#FCFCFD] p-4">
                <summary className="cursor-pointer list-none pr-6 text-sm font-medium text-[#111111]">
                  {item.q}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-7 print-card rounded-xl border border-[#D7E7FF] bg-[#F8FBFF] p-6">
          <h2 className="text-xl font-semibold">Join The Founding Partner Cohort</h2>
          <p className="mt-2 text-sm text-[#4B5563]">
            Start with a simple, high-clarity payout model and grow with us as the program evolves.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 no-print">
            <a
              href="mailto:partners@hellogroot.com?subject=Apply%20-%20Groot%20Reseller%20Program"
              className="inline-flex items-center gap-2 rounded-md bg-[#4285F4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3367D6]"
            >
              Apply as Reseller
              <ArrowRight className="h-4 w-4" />
            </a>
            <button
              onClick={() => window.print()}
              className="rounded-md border border-[#D1D5DB] bg-white px-4 py-2.5 text-sm font-medium text-[#374151] hover:bg-[#F3F4F6]"
            >
              Export as PDF
            </button>
          </div>
        </section>
      </div>

      <footer className="border-t border-[#E5E7EB] bg-white px-6 py-4">
        <p className="text-center text-xs text-[#6B7280]">
          &copy; {currentYear} Groot Finance. Partner program details are subject to final signed terms.
        </p>
      </footer>
    </main>
  )
}
