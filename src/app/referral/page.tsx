'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Gift, Link2, Users } from 'lucide-react'

// Metadata is exported from layout.tsx (client components cannot export metadata)

const payoutCards = [
  { label: 'Starter (Annual)', value: 'RM 80' },
  { label: 'Pro (Annual)', value: 'RM 200' },
  { label: 'Enterprise', value: 'RM 500' },
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
    <main className="min-h-screen bg-[#FAFAFA] text-[#111111]">
      <style>{`
        @media print {
          header, .no-print { display: none !important; }
          main { background: white !important; }
          .print-wrap { max-width: 980px !important; margin: 0 auto !important; padding: 0 !important; }
          .print-card { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <header className="border-b border-[#E5E7EB] bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image src="/groot-wordmark.png" alt="Groot Finance" width={118} height={30} className="h-7 w-auto" />
          </Link>
          <div className="flex items-center gap-3 no-print">
            <Link
              href="/reseller-program"
              className="rounded-md border border-[#E5E7EB] px-3 py-2 text-sm text-[#374151] transition-colors hover:bg-[#F3F4F6]"
            >
              Reseller Program
            </Link>
            <a
              href="mailto:partners@hellogroot.com?subject=Groot%20Referral%20Program%20Application"
              className="rounded-md bg-[#4285F4] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3367D6]"
            >
              Join Referral
            </a>
          </div>
        </div>
      </header>

      <div className="print-wrap mx-auto w-full max-w-6xl px-6 py-10 md:py-14">
        <section className="print-card rounded-2xl border border-[#E5E7EB] bg-white p-7 md:p-10">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#EEF4FF] px-3 py-1 text-xs font-medium text-[#3367D6]">
            <Gift className="h-3.5 w-3.5" />
            Referral Program
          </p>
          <h1 className="max-w-3xl text-3xl font-semibold leading-tight md:text-4xl">
            Refer businesses. We close. You earn.
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] text-[#6B7280]">
            A simple referral model for existing customers and partners who want zero sales overhead.
          </p>
        </section>

        <section className="mt-7 grid gap-4 md:grid-cols-3">
          {payoutCards.map((item) => (
            <article key={item.label} className="print-card rounded-xl border border-[#E5E7EB] bg-white p-5">
              <p className="text-xs uppercase tracking-wide text-[#6B7280]">{item.label}</p>
              <p className="mt-1 text-2xl font-semibold">{item.value}</p>
              <p className="mt-1 text-sm text-[#6B7280]">One-time referral payout</p>
            </article>
          ))}
        </section>

        <section className="mt-7 grid gap-4 md:grid-cols-3">
          <article className="print-card rounded-xl border border-[#E5E7EB] bg-white p-5">
            <Link2 className="h-5 w-5 text-[#4285F4]" />
            <h2 className="mt-3 text-sm font-semibold">Share</h2>
            <p className="mt-2 text-sm text-[#6B7280]">Get your referral link and share it with business owners in your network.</p>
          </article>
          <article className="print-card rounded-xl border border-[#E5E7EB] bg-white p-5">
            <Users className="h-5 w-5 text-[#4285F4]" />
            <h2 className="mt-3 text-sm font-semibold">We Close</h2>
            <p className="mt-2 text-sm text-[#6B7280]">Groot handles qualification, demo, proposal, and onboarding.</p>
          </article>
          <article className="print-card rounded-xl border border-[#E5E7EB] bg-white p-5">
            <CheckCircle2 className="h-5 w-5 text-[#16A34A]" />
            <h2 className="mt-3 text-sm font-semibold">Get Paid</h2>
            <p className="mt-2 text-sm text-[#6B7280]">Receive payout once account qualifies as paid under referral policy.</p>
          </article>
        </section>

        <section className="mt-7 print-card rounded-xl border border-[#E5E7EB] bg-white p-5 md:p-6">
          <h2 className="text-lg font-semibold">FAQ</h2>
          <div className="mt-4 space-y-3">
            {faqItems.map((item) => (
              <details key={item.q} className="rounded-lg border border-[#E5E7EB] bg-[#FCFCFD] p-4">
                <summary className="cursor-pointer list-none pr-6 text-sm font-medium text-[#111111]">{item.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-7 print-card rounded-xl border border-[#D7E7FF] bg-[#F8FBFF] p-6">
          <h2 className="text-xl font-semibold">Start Referring</h2>
          <p className="mt-2 text-sm text-[#4B5563]">
            For existing users, referral access will be available from your dashboard settings.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 no-print">
            <a
              href="mailto:partners@hellogroot.com?subject=Apply%20-%20Groot%20Referral%20Program"
              className="inline-flex items-center gap-2 rounded-md bg-[#4285F4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3367D6]"
            >
              Join Referral Program
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
          &copy; {currentYear} Groot Finance. Referral details are subject to final signed terms.
        </p>
      </footer>
    </main>
  )
}
