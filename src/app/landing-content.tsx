'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { Bot, Radar, FileText, ScanLine, Printer, Building2, Sparkles, Check } from 'lucide-react';
import { localizeEInvoiceLabel } from '@/lib/utils/e-invoice-label';
import { isNativePlatform } from '@/lib/capacitor/platform';

// Finance icon SVG as base64 (provided)
const FINANCE_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDQ4IDQ4Ij48ZyBmaWxsPSJub25lIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjQiPjxwYXRoIGZpbGw9IiMyZjg4ZmYiIHN0cm9rZT0ibm9uZSIgZD0iTTI0IDQ0QzM1LjA0NTcgNDQgNDQgMzUuMDQ1NyA0NCAyNEM0NCAxMi45NTQzIDM1LjA0NTcgNCAyNCA0QzEyLjk1NDMgNCA0IDEyLjk1NDMgNCAyNEM0IDM1LjA0NTcgMTIuOTU0MyA0NCAyNCA0NFoiLz48cGF0aCBzdHJva2U9IiNmZmYiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgZD0iTTE4IDIySDMwIi8+PHBhdGggc3Ryb2tlPSIjZmZmIiBzdHJva2UtbGluZWNhcD0icm91bmQiIGQ9Ik0xOCAyOEgzMCIvPjxwYXRoIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBkPSJNMjQuMDA4MyAyMlYzNCIvPjxwYXRoIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBkPSJNMzAgMTVMMjQgMjFMMTggMTUiLz48L2c+PC9zdmc+';

/** Map country code to currency symbol */
function getCurrencyInfo(country: string): { symbol: string; code: string } {
  switch (country) {
    case 'MY': return { symbol: 'RM', code: 'MYR' };
    case 'SG': return { symbol: 'S$', code: 'SGD' };
    case 'TH': return { symbol: '฿', code: 'THB' };
    case 'ID': return { symbol: 'Rp', code: 'IDR' };
    default: return { symbol: '$', code: 'USD' };
  }
}

const FEATURES = [
  {
    icon: Bot,
    title: 'AI Financial Co-Pilot',
    description: 'Ask anything in plain English, Thai, or Bahasa. Your AI consultant draws live dashboards, posts invoices, flags compliance risks, and forecasts cash flow — all from a single conversation.',
  },
  {
    icon: Radar,
    title: 'Proactive Insights Engine',
    description: 'Our intelligence engine runs behind the scenes — detecting spend anomalies, tracking vendor price surges, and surfacing cash flow risks as actionable alerts before they become problems.',
  },
  {
    icon: FileText,
    title: 'Smart Invoicing & Payments',
    description: 'Create, send, and track sales invoices with PDF generation. Manage vendor bills, debtor statements, and aging reports. Sync your Stripe product catalog or add custom items — one hub for all commercial documents.',
  },
  {
    icon: ScanLine,
    title: 'AI Expense Intelligence',
    description: 'Snap receipts and let AI extract every field, auto-categorize by vendor, and flag duplicates with statistical matching. Multi-level approval workflows route claims to the right manager automatically.',
  },
  {
    icon: Printer,
    title: 'Reports & Integration Hub',
    description: 'Generate print-ready PDF financial reports and build custom CSV export templates mapped to any third-party accounting system. Schedule recurring exports or push to Google Sheets.',
  },
  {
    icon: Building2,
    title: 'Enterprise Command Center',
    description: 'Multi-tenancy, role-based access, team management with leave tracking and shared calendar, and configurable approval workflows. Full audit trails and data isolation across every business unit.',
  },
];

/** Launch prices per currency. Stripe charges the `price`; `listPrice` is marketing decoration. */
const PRICING_DATA: Record<string, { price: number; listPrice: number }[]> = {
  MYR: [{ price: 249, listPrice: 299 }, { price: 599, listPrice: 699 }],
  SGD: [{ price: 149, listPrice: 179 }, { price: 349, listPrice: 399 }],
  THB: [{ price: 249, listPrice: 299 }, { price: 599, listPrice: 699 }],
  IDR: [{ price: 249, listPrice: 299 }, { price: 599, listPrice: 699 }],
  USD: [{ price: 249, listPrice: 299 }, { price: 599, listPrice: 699 }],
}

const PRICING_TIERS = [
  {
    name: 'Groot Finance Starter',
    subtitle: 'Perfect for small businesses',
    featured: false,
    cta: 'Start free trial',
    ctaStyle: 'beam' as const,
    features: [
      'AI receipt scanning',
      'AI auto categorization',
      'AI chat assistant',
      'LHDN e-Invoice',
      'RAG regulatory compliance',
    ],
  },
  {
    name: 'Groot Finance Pro',
    subtitle: 'Best for growing companies',
    featured: true,
    badge: 'Most Popular',
    cta: 'Start free trial',
    ctaStyle: 'primary' as const,
    features: [
      'Everything in Starter, plus:',
      'AI proactive insights',
      'Duplicate expense detection',
      'Full AR & AP management',
      'Advanced analytics',
      'Audit trail',
    ],
  },
  {
    name: 'Enterprise',
    subtitle: 'For large organizations',
    featured: false,
    cta: 'Contact Us',
    ctaStyle: 'beam' as const,
    features: [
      'Everything in Pro, plus:',
      'Unlimited everything',
      'Cash flow forecasting',
      'Financial intelligence',
      'MCP Server / API access',
      'Custom integrations',
      'Dedicated account manager',
      'SLA guarantee',
    ],
  },
];

export default function LandingContent({ country }: { country: string }) {
  const heroRef = useRef<HTMLDivElement>(null);
  const currency = getCurrencyInfo(country);

  useEffect(() => {
    const mainEl = document.querySelector('.snap-container');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.05, rootMargin: '100px', root: mainEl }
    );

    const cards = document.querySelectorAll('.fly-in');
    cards.forEach((card) => observer.observe(card));

    const timeout = setTimeout(() => {
      cards.forEach((card) => card.classList.add('visible'));
    }, 800);

    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, []);

  const currentYear = new Date().getFullYear();

  return (
    <main className="landing-page snap-container">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

        :root {
          --near-black: #111111;
          --off-white: #FAFAFA;
          --white: #FFFFFF;
          --mid-gray: #6B7280;
          --light-gray: #E5E7EB;
          --primary-blue: #4285F4;
          --primary-hover: #5A8DFA;
          --primary-active: #3367D6;
        }

        * {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .landing-page {
          background: var(--off-white);
          min-height: 100vh;
          overflow-x: hidden;
        }

        /* Hero fade in */
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .hero-fade { animation: fadeInUp 0.5s ease-out forwards; }
        .hero-fade-1 { animation-delay: 0.05s; opacity: 0; }
        .hero-fade-2 { animation-delay: 0.1s; opacity: 0; }
        .hero-fade-3 { animation-delay: 0.15s; opacity: 0; }
        .hero-fade-4 { animation-delay: 0.2s; opacity: 0; }

        /* Feature cards fly-in on scroll */
        .fly-in {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.4s ease, transform 0.4s ease;
        }
        .fly-in.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .fly-in:nth-child(1) { transition-delay: 0s; }
        .fly-in:nth-child(2) { transition-delay: 0.03s; }
        .fly-in:nth-child(3) { transition-delay: 0.06s; }
        .fly-in:nth-child(4) { transition-delay: 0.09s; }
        .fly-in:nth-child(5) { transition-delay: 0.12s; }
        .fly-in:nth-child(6) { transition-delay: 0.15s; }

        /* Scroll snap sections */
        .snap-container {
          scroll-snap-type: y mandatory;
          overflow-y: scroll;
          height: 100vh;
        }
        .snap-section {
          scroll-snap-align: start;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .snap-section-auto {
          scroll-snap-align: start;
          min-height: auto;
        }

        /* Primary button with subtle shine animation */
        .btn-primary {
          position: relative;
          background: var(--primary-blue);
          color: var(--white);
          font-weight: 500;
          overflow: hidden;
          transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
          border: none;
        }

        .btn-primary-text {
          position: relative;
          z-index: 2;
        }

        .btn-primary::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 60%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.3),
            transparent
          );
          transform: skewX(-20deg);
          transition: left 0s;
        }

        .btn-primary:hover {
          background: var(--primary-hover);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(66, 133, 244, 0.4);
        }

        .btn-primary:hover::before {
          left: 120%;
          transition: left 1.2s ease;
        }

        /* Secondary button with streak border animation */
        .btn-beam {
          position: relative;
          background: var(--white);
          color: var(--near-black);
          font-weight: 500;
          border: 1px solid #D1D5DB;
          overflow: hidden;
          transition: color 0.3s ease, border-color 0.3s ease;
          z-index: 1;
        }

        .btn-beam-text {
          position: relative;
          z-index: 2;
        }

        .btn-beam::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg,
            transparent 0%,
            transparent 25%,
            rgba(66, 133, 244, 0.6) 45%,
            var(--primary-blue) 50%,
            rgba(66, 133, 244, 0.6) 55%,
            transparent 75%,
            transparent 100%
          );
          background-size: 200% 100%;
          opacity: 0;
          transition: opacity 0.3s ease;
          z-index: 0;
        }

        .btn-beam::after {
          content: '';
          position: absolute;
          inset: 1px;
          background: var(--white);
          border-radius: 7px;
          z-index: 1;
        }

        .btn-beam:hover {
          border-color: rgba(66, 133, 244, 0.3);
          color: var(--primary-blue);
        }

        .btn-beam:hover::before {
          opacity: 1;
          animation: streak-flow 1.5s ease-in-out infinite;
        }

        @keyframes streak-flow {
          0% { background-position: 150% 0; }
          100% { background-position: -50% 0; }
        }

        /* Feature card with hover elevation */
        .feature-card {
          background: var(--white);
          border: 1px solid var(--light-gray);
          border-radius: 12px;
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }

        .feature-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 16px 32px -8px rgba(17, 17, 17, 0.1);
        }

        /* Section backgrounds */
        .section-white { background: var(--white); }
        .section-muted { background: var(--off-white); }

        /* Pricing featured */
        .pricing-featured { border: 2px solid var(--primary-blue); }

        /* Icon box */
        .icon-box {
          background: rgba(66, 133, 244, 0.08);
          border-radius: 10px;
          transition: background 0.3s ease;
        }
        .feature-card:hover .icon-box {
          background: rgba(66, 133, 244, 0.15);
        }

        /* Restore standard Tailwind values overridden by dashboard-specific globals.css */
        .landing-page {
          /* Typography - standard Tailwind sizes (globals.css reduces these by 13%) */
          --font-size-xs: 0.75rem;     /* 12px */
          --font-size-sm: 0.875rem;    /* 14px */
          --font-size-base: 1rem;      /* 16px */
          --font-size-lg: 1.125rem;    /* 18px */
          --font-size-xl: 1.25rem;     /* 20px */
          --font-size-2xl: 1.5rem;     /* 24px */
          --font-size-3xl: 1.875rem;   /* 30px */
          --font-size-4xl: 2.25rem;    /* 36px */
          /* Spacing - standard Tailwind sizes (globals.css reduces these by 10%) */
          --space-1: 0.25rem;          /* 4px */
          --space-2: 0.5rem;           /* 8px */
          --space-3: 0.75rem;          /* 12px */
          --space-4: 1rem;             /* 16px */
          --space-5: 1.25rem;          /* 20px */
          --space-6: 1.5rem;           /* 24px */
          --space-8: 2rem;             /* 32px */
          --space-10: 2.5rem;          /* 40px */
          --space-12: 3rem;            /* 48px */
          --space-16: 4rem;            /* 64px */
          --space-20: 5rem;            /* 80px */
          --space-24: 6rem;            /* 96px */
          /* Component sizes - standard values (globals.css reduces these by 10%) */
          --button-height-sm: 2rem;    /* 32px */
          --button-height-md: 2.5rem;  /* 40px */
          --button-height-lg: 3rem;    /* 48px */
          --input-height: 2.5rem;      /* 40px */
          --card-padding: 1.5rem;      /* 24px */
          --card-gap: 1.5rem;          /* 24px */
          --section-gap: 3rem;         /* 48px */
          font-size: 1rem;
        }
        /* Restore standard max-width values (dashboard globals.css overrides these) */
        .landing-page .max-w-7xl { max-width: 80rem !important; }
        .landing-page .max-w-6xl { max-width: 72rem !important; }
        .landing-page .max-w-5xl { max-width: 64rem !important; }
        .landing-page .max-w-4xl { max-width: 56rem !important; }
        .landing-page .max-w-3xl { max-width: 48rem !important; }
        .landing-page .max-w-2xl { max-width: 42rem !important; }
        .landing-page .max-w-xl { max-width: 36rem !important; }
        .landing-page .max-w-lg { max-width: 32rem !important; }
      `}</style>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#E5E7EB]" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Image src="/groot-wordmark.png" alt="groot" width={72} height={22} className="h-5 w-auto invert" />
            <span className="text-[#4285F4] text-xl font-semibold">.</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={FINANCE_ICON} alt="" width={20} height={20} className="w-5 h-5" />
          </div>
          <a href="/en/sign-in" className="btn-beam text-sm px-4 py-2 rounded-lg"><span className="btn-beam-text">Sign in</span></a>
        </div>
      </nav>

      {/* Hero */}
      <section className="section-white px-6 pt-28 pb-10 snap-section">
        <div className="max-w-4xl mx-auto text-center" ref={heroRef}>
          <div className="flex items-center justify-center gap-1 mb-10 hero-fade hero-fade-1">
            <Image src="/groot-wordmark.png" alt="groot" width={140} height={42} className="h-10 w-auto invert" />
            <span className="text-[#4285F4] text-4xl font-semibold">.</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={FINANCE_ICON} alt="" width={36} height={36} className="w-9 h-9" />
          </div>

          <h1 className="hero-fade hero-fade-2 text-4xl md:text-5xl font-semibold text-[#111111] mb-6 tracking-tight">
            Your AI-powered <span className="text-[#4285F4]">finance team</span>
          </h1>

          <p className="hero-fade hero-fade-3 text-lg md:text-xl text-[#6B7280] font-medium mb-10 max-w-2xl mx-auto">
            From invoicing and expense claims to proactive insights<br />
            and team management — AI automates your financial
            operations while you focus on growth.
          </p>

          <div className="hero-fade hero-fade-4 flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
            <a href="/en/sign-up" className="btn-primary px-6 py-3 rounded-lg text-base flex items-center gap-2">
              <span className="btn-primary-text flex items-center gap-2">Start free trial <Sparkles className="w-4 h-4" /></span>
            </a>
            <button
              onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
              className="btn-beam px-6 py-3 rounded-lg text-base"
            >
              <span className="btn-beam-text">View pricing</span>
            </button>
          </div>

          <p className="hero-fade hero-fade-4 text-sm text-[#6B7280] font-medium mb-10">14-day free trial &middot; No credit card required</p>

          <div className="hero-fade hero-fade-4 grid grid-cols-3 gap-8 max-w-lg mx-auto">
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-semibold text-[#111111]">3K+</div>
              <div className="text-sm text-[#6B7280] font-medium uppercase tracking-wide">Documents Processed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-semibold text-[#111111]">95%+</div>
              <div className="text-sm text-[#6B7280] font-medium uppercase tracking-wide">OCR Accuracy</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-semibold text-[#111111]">4</div>
              <div className="text-sm text-[#6B7280] font-medium uppercase tracking-wide">Languages</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section-muted px-6 lg:px-16 py-10 snap-section">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-semibold text-[#111111] mb-2 tracking-tight">
              One platform, every <span className="text-[#4285F4]">advantage</span>
            </h2>
            <p className="text-sm text-[#6B7280] font-medium">AI-powered tools that think, act, and scale with your business</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="fly-in feature-card p-5">
                <div className="icon-box inline-block p-2.5 mb-3">
                  <feature.icon className="w-5 h-5 text-[#4285F4]" />
                </div>
                <h3 className="text-base font-medium text-[#111111] mb-1.5">{feature.title}</h3>
                <p className="text-sm text-[#6B7280] leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing - hidden on native iOS per Apple IAP guidelines */}
      {!isNativePlatform() && (
      <section id="pricing" className="section-white px-6 pt-20 pb-6 snap-section flex flex-col">
        <div className="max-w-4xl mx-auto flex-1 flex flex-col justify-center">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-semibold text-[#111111] mb-2 tracking-tight">
              Simple, transparent <span className="text-[#4285F4]">pricing</span>
            </h2>
            <p className="text-sm text-[#6B7280] font-medium">Choose the plan that works for your business</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`feature-card py-7 px-6 flex flex-col relative ${tier.featured ? 'pricing-featured' : ''}`}
              >
                {tier.featured && tier.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-[#4285F4] text-white px-3 py-0.5 rounded-full text-xs font-medium">
                      {tier.badge}
                    </span>
                  </div>
                )}
                <h3 className="text-lg font-semibold text-[#111111] text-center">{tier.name}</h3>
                <p className="text-sm text-[#6B7280] font-medium text-center mb-4">{tier.subtitle}</p>

                {/* Price - geo-aware with launch pricing */}
                <div className="text-center mb-5">
                  {tier.name === 'Enterprise' ? (
                    <span className="text-2xl font-semibold text-[#111111]">Custom pricing</span>
                  ) : (() => {
                    const tierIndex = tier.name.includes('Starter') ? 0 : 1
                    const prices = PRICING_DATA[currency.code] || PRICING_DATA.MYR
                    const { price, listPrice } = prices[tierIndex]
                    const savings = listPrice - price
                    return (
                      <>
                        <p className="text-sm text-[#9CA3AF] line-through">{currency.symbol}{listPrice}/mo</p>
                        <div className="flex items-baseline gap-1 justify-center">
                          <span className="text-3xl font-semibold text-[#111111]">{currency.symbol}{price}</span>
                          <span className="text-sm text-[#6B7280]">/mo</span>
                        </div>
                        <p className="text-xs font-medium text-green-600 mt-1">
                          Save {currency.symbol}{savings} — Launch Special
                        </p>
                      </>
                    )
                  })()}
                </div>

                <ul className="space-y-2.5 mb-6 text-sm text-[#6B7280] font-medium flex-1">
                  {tier.features.map((feature) => {
                    const isEInvoice = /e-invoice|einvoice|lhdn|peppol/i.test(feature)
                    const displayLabel = isEInvoice
                      ? feature.replace(/LHDN e-Invoice|e-Invoice \(Peppol\)|e-Invoice/i, localizeEInvoiceLabel(currency.code))
                      : feature
                    return (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span>
                          {displayLabel}
                          {isEInvoice && (
                            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-500/15 text-violet-600 border border-violet-500/30">
                              Early Access
                            </span>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>

                {tier.name === 'Enterprise' ? (
                  <a
                    href="mailto:hello@hellogroot.com"
                    className={`btn-beam block w-full text-center px-4 py-2.5 rounded-lg text-sm mt-auto`}
                  >
                    <span className="btn-beam-text">{tier.cta}</span>
                  </a>
                ) : (
                  <a
                    href="/en/sign-up"
                    className={`${tier.ctaStyle === 'primary' ? 'btn-primary' : 'btn-beam'} block w-full text-center px-4 py-2.5 rounded-lg text-sm mt-auto`}
                  >
                    <span className={`${tier.ctaStyle === 'primary' ? 'btn-primary-text' : 'btn-beam-text'}`}>{tier.cta}</span>
                  </a>
                )}
              </div>
            ))}
          </div>

          <p className="text-center text-[#6B7280] text-sm font-medium mt-5">All plans include a 14-day free trial. Cancel anytime.</p>

          {/* CTA */}
          <div className="mt-8 pt-8 border-t border-[#E5E7EB] text-center">
            <h2 className="text-xl md:text-2xl font-semibold text-[#111111] mb-1 tracking-tight">
              Ready to <span className="text-[#4285F4]">transform</span> your finances?
            </h2>
            <p className="text-sm text-[#6B7280] font-medium mb-4">Join businesses automating their financial operations with confidence</p>
            <a href="/en/sign-up" className="btn-primary inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm">
              <span className="btn-primary-text flex items-center gap-2">Get started <Sparkles className="w-4 h-4" /></span>
            </a>
          </div>
        </div>

        <footer className="border-t border-[#E5E7EB] py-4 mt-8">
          <p className="text-xs text-[#6B7280] font-medium text-center">&copy; {currentYear} Groot. Simplifying financial management for businesses.</p>
        </footer>
      </section>
      )}
    </main>
  );
}
