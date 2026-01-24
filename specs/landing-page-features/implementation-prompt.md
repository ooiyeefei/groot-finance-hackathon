# LLM Implementation Prompt: FinanSEAL Features Landing Page

## Context

You are building a features landing page for **FinanSEAL**, an AI-powered financial co-pilot platform designed for Southeast Asian SMEs. This is a Next.js 15 application using App Router, TypeScript, Tailwind CSS, and follows a semantic design system.

---

## Your Task

Create a beautiful, responsive features landing page at `/[locale]/features` that showcases the platform's capabilities to potential customers. The page should be marketing-focused, conversion-optimized, and follow the existing design system.

---

## Technical Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS with semantic tokens (do NOT use hardcoded colors like `bg-gray-700`)
- **Icons**: Lucide React (`lucide-react`)
- **Components**: Import from `@/components/ui` (Button, Card, Badge, etc.)
- **Internationalization**: Path-based i18n with `[locale]` dynamic segment

---

## Design System Rules (CRITICAL)

**NEVER use hardcoded colors.** Always use semantic tokens:

```tsx
// ❌ WRONG - Never do this
<div className="bg-gray-100 text-gray-900">
<div className="bg-blue-500 text-white">

// ✅ CORRECT - Always use semantic tokens
<div className="bg-background text-foreground">
<div className="bg-primary text-primary-foreground">
<div className="bg-card border-border">
<div className="bg-muted text-muted-foreground">
```

**Layer hierarchy**: `bg-background` → `bg-surface` → `bg-card` → `bg-muted`

**Success states**: Use `bg-success text-success-foreground` for positive elements

---

## Page Structure to Implement

### 1. Hero Section

```tsx
// Location: Top of page, full-width
// Height: 100vh or min-h-[600px]

<section className="relative min-h-[600px] flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-success/5">
  <div className="container max-w-6xl mx-auto px-4 text-center">
    {/* Badge */}
    <Badge className="mb-4">AI-Powered Finance Platform</Badge>

    {/* Headline */}
    <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6">
      The AI-Powered Financial Co-Pilot<br />
      <span className="text-primary">for Southeast Asian SMEs</span>
    </h1>

    {/* Subheadline */}
    <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
      Automate document processing, gain proactive insights, and manage multi-currency
      operations with intelligent AI assistance.
    </p>

    {/* CTAs */}
    <div className="flex flex-col sm:flex-row gap-4 justify-center">
      <Button size="lg" asChild>
        <Link href="/sign-up">Start Your 14-Day Free Trial</Link>
      </Button>
      <Button size="lg" variant="outline">
        Watch Demo
      </Button>
    </div>

    {/* Reassurance */}
    <p className="mt-4 text-sm text-muted-foreground">
      No credit card required · Full access during trial
    </p>
  </div>
</section>
```

---

### 2. Key Features Grid (6 cards)

```tsx
// Section title centered above grid
// 3×2 grid on desktop, 2×3 on tablet, 1-column on mobile

const features = [
  {
    icon: FileText, // from lucide-react
    title: "AI Document Processing",
    description: "Upload invoices and receipts in any format. Our AI automatically classifies, extracts data, and visualizes results with interactive bounding boxes—in under 5 seconds."
  },
  {
    icon: Globe,
    title: "Multi-Currency Operations",
    description: "Track transactions across 9 Southeast Asian currencies with real-time exchange rates. Automatic home currency conversion for unified reporting."
  },
  {
    icon: Lightbulb,
    title: "Proactive AI Insights",
    description: "Receive AI-generated alerts on anomalies, compliance risks, cash flow concerns, and optimization opportunities—before problems become costly."
  },
  {
    icon: Receipt,
    title: "Smart Expense Management",
    description: "Employees submit receipts via mobile. AI extracts details, routes to managers, and automatically creates accounting entries upon approval."
  },
  {
    icon: MessageSquare,
    title: "Conversational Finance AI",
    description: "Ask questions in natural language—English, Thai, or Indonesian. Get instant answers about transactions, vendors, compliance, and forecasts."
  },
  {
    icon: BarChart3,
    title: "Real-Time Analytics",
    description: "Monitor income, expenses, profit margins, aged receivables, and payables in real-time. Period comparisons show trends at a glance."
  }
]

// Card design:
<Card className="bg-card border-border p-6 hover:shadow-lg transition-shadow">
  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
    <Icon className="w-6 h-6 text-primary" />
  </div>
  <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
  <p className="text-muted-foreground">{description}</p>
</Card>
```

---

### 3. Feature Deep-Dives (3 alternating sections)

Create 3 sections with alternating image/content layouts:

#### Section A: Document Intelligence
- **Layout**: Image LEFT, Content RIGHT
- **Title**: "From Paper to Insights in Seconds"
- **Headline**: "AI-Powered Document Processing"
- **Bullet points**:
  - Smart Classification: Automatically detects document type and routes to the right processing pipeline
  - Visual Verification: Interactive bounding boxes show exactly what data was extracted and where
  - Confidence Scoring: Know which fields need review with per-field accuracy indicators
  - Line Item Extraction: Captures quantities, unit prices, taxes, and totals automatically
- **Stats**: "< 5 seconds processing" | "95%+ accuracy" | "PDF, JPEG, PNG, WebP"
- **Image placeholder**: Use a div with `bg-muted rounded-xl aspect-video` or actual screenshot

#### Section B: Team Collaboration
- **Layout**: Content LEFT, Image RIGHT (alternate)
- **Title**: "Built for Teams, Designed for Control"
- **Headline**: "Streamlined Approval Workflows"
- **Bullet points**:
  - Manager Hierarchy Routing: Claims automatically route to assigned managers
  - Mobile-First Approvals: Managers can approve or reject from any device
  - IFRS-Compliant Records: Approved expenses automatically generate accounting entries
  - Role-Based Access: Employees, Managers, and Admins see only what they need
- **Stats**: "3-step workflow" | "Auto accounting entries" | "Multi-tenant support"

#### Section C: Analytics & Insights
- **Layout**: Image LEFT, Content RIGHT
- **Title**: "Know Your Numbers in Real-Time"
- **Headline**: "Dashboard Intelligence"
- **Bullet points**:
  - 5 Key Metrics: Total Income, Total Expenses, Net Profit, Transaction Count, Profit Margin
  - Aged Analysis: Receivables and payables by 30/60/90+ day buckets
  - Currency Breakdown: See exposure across all your operating currencies
  - Trend Indicators: Instant visual cues for improving or declining metrics
- **Stats**: "Real-time sync" | "9 currencies" | "Period comparison"

```tsx
// Deep-dive section component pattern:
<section className={cn("py-16 md:py-24", index % 2 === 1 && "bg-muted/30")}>
  <div className="container max-w-6xl mx-auto px-4">
    <div className={cn(
      "grid md:grid-cols-2 gap-12 items-center",
      reverse && "md:[&>*:first-child]:order-2" // Alternating layout
    )}>
      {/* Image side */}
      <div className="relative aspect-video rounded-xl overflow-hidden bg-muted border border-border">
        {/* Placeholder or actual image */}
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          [Feature Screenshot]
        </div>
      </div>

      {/* Content side */}
      <div>
        <Badge variant="secondary" className="mb-4">{sectionTitle}</Badge>
        <h2 className="text-3xl font-bold text-foreground mb-4">{headline}</h2>
        <p className="text-muted-foreground mb-6">{description}</p>

        {/* Bullet points */}
        <ul className="space-y-4 mb-8">
          {bullets.map((bullet, i) => (
            <li key={i} className="flex gap-3">
              <CheckCircle className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-foreground">{bullet.title}:</span>{' '}
                <span className="text-muted-foreground">{bullet.description}</span>
              </div>
            </li>
          ))}
        </ul>

        {/* Stats row */}
        <div className="flex flex-wrap gap-6">
          {stats.map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-2xl font-bold text-primary">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
</section>
```

---

### 4. Trust Indicators Section

```tsx
<section className="py-16 bg-muted/30">
  <div className="container max-w-6xl mx-auto px-4">
    <h2 className="text-2xl font-bold text-center text-foreground mb-12">
      Built for Security & Compliance
    </h2>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
      {[
        { icon: Shield, title: "Secure Auth", desc: "Clerk-powered SSO & MFA" },
        { icon: Lock, title: "Data Isolation", desc: "Multi-tenant row-level security" },
        { icon: FileCheck, title: "Audit Trail", desc: "Complete compliance logging" },
        { icon: Building, title: "IFRS Aligned", desc: "Accounting standards compliant" }
      ].map((item, i) => (
        <div key={i} className="text-center">
          <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3">
            <item.icon className="w-6 h-6 text-success" />
          </div>
          <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
          <p className="text-sm text-muted-foreground">{item.desc}</p>
        </div>
      ))}
    </div>

    {/* Additional stats */}
    <div className="mt-12 flex flex-wrap justify-center gap-8 text-center">
      <div>
        <div className="text-3xl font-bold text-foreground">9</div>
        <div className="text-sm text-muted-foreground">Currencies Supported</div>
      </div>
      <div>
        <div className="text-3xl font-bold text-foreground">3</div>
        <div className="text-sm text-muted-foreground">Languages (EN, TH, ID)</div>
      </div>
      <div>
        <div className="text-3xl font-bold text-foreground">AWS</div>
        <div className="text-sm text-muted-foreground">Powered Infrastructure</div>
      </div>
    </div>
  </div>
</section>
```

---

### 5. Final CTA Section

```tsx
<section className="py-20 bg-primary text-primary-foreground">
  <div className="container max-w-4xl mx-auto px-4 text-center">
    <h2 className="text-3xl md:text-4xl font-bold mb-4">
      Ready to Transform Your Financial Operations?
    </h2>
    <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto">
      Join SMEs across Southeast Asia who've automated their finance workflows with FinanSEAL.
    </p>

    <div className="flex flex-col sm:flex-row gap-4 justify-center">
      <Button size="lg" variant="secondary" asChild>
        <Link href="/sign-up">Start Your 14-Day Free Trial</Link>
      </Button>
      <Button size="lg" variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10">
        Schedule a Demo
      </Button>
    </div>

    <p className="mt-4 text-sm opacity-75">
      No credit card required · Full access during trial
    </p>
  </div>
</section>
```

---

## File Structure

Create these files:

```
src/app/[locale]/features/
├── page.tsx              # Main page component (can be single file or use components)

# Optional: If you want to split into components
src/domains/marketing/components/
├── features-hero.tsx
├── features-grid.tsx
├── feature-deep-dive.tsx
├── trust-indicators.tsx
└── features-cta.tsx
```

---

## Main Page Implementation

```tsx
// src/app/[locale]/features/page.tsx

import { Metadata } from 'next'
import Link from 'next/link'
import {
  FileText, Globe, Lightbulb, Receipt, MessageSquare, BarChart3,
  CheckCircle, Shield, Lock, FileCheck, Building
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'AI-Powered Finance Platform Features | FinanSEAL',
  description: 'Discover how FinanSEAL\'s AI document processing, multi-currency support, and proactive insights help Southeast Asian SMEs automate financial operations.',
}

export default function FeaturesPage() {
  return (
    <main className="bg-background">
      {/* Hero Section */}
      <HeroSection />

      {/* Key Features Grid */}
      <KeyFeaturesSection />

      {/* Feature Deep-Dives */}
      <DocumentIntelligenceSection />
      <TeamCollaborationSection />
      <AnalyticsSection />

      {/* Trust Indicators */}
      <TrustSection />

      {/* Final CTA */}
      <CTASection />
    </main>
  )
}

// Implement each section component below...
```

---

## Icons to Use (from lucide-react)

```tsx
import {
  FileText,        // Document processing
  Globe,           // Multi-currency
  Lightbulb,       // Insights
  Receipt,         // Expense management
  MessageSquare,   // AI chat
  BarChart3,       // Analytics
  CheckCircle,     // Bullet checkmarks
  Shield,          // Security
  Lock,            // Data protection
  FileCheck,       // Audit
  Building,        // Compliance
  ArrowRight,      // CTA arrows
  Zap,             // Speed/performance
  Users,           // Team features
  TrendingUp,      // Trends
} from 'lucide-react'
```

---

## Responsive Breakpoints

- **Mobile (default)**: Single column, stacked layout
- **md (768px)**: 2-column grids, side-by-side layouts
- **lg (1024px)**: 3-column grids, full layouts

---

## Animation Suggestions (Optional)

If you want to add subtle animations:

```tsx
// Fade in on scroll (using Tailwind + Intersection Observer)
// Or use framer-motion if available

// Simple CSS transitions:
className="transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
```

---

## What NOT to Include

1. **No Voice-Activated Management** - We don't have this feature
2. **No Fraud Detection** - Not implemented yet
3. **No made-up features** - Only use features confirmed in the spec
4. **No hardcoded colors** - Always semantic tokens
5. **No external image URLs** - Use placeholders or local assets

---

## Testing Checklist

After implementation, verify:

- [ ] Page renders at `/en/features`, `/th/features`, `/id/features`
- [ ] All CTAs link to `/sign-up`
- [ ] Responsive on mobile, tablet, desktop
- [ ] No hardcoded colors (search for `bg-gray`, `text-white`, etc.)
- [ ] Build passes: `npm run build`
- [ ] Semantic tokens work in both light and dark mode

---

## Example Complete Section

Here's a complete example of one feature card:

```tsx
<Card className="bg-card border-border p-6 hover:shadow-lg transition-shadow">
  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
    <FileText className="w-6 h-6 text-primary" />
  </div>
  <h3 className="text-lg font-semibold text-foreground mb-2">
    AI Document Processing
  </h3>
  <p className="text-muted-foreground text-sm">
    Upload invoices and receipts in any format. Our AI automatically classifies,
    extracts data, and visualizes results with interactive bounding boxes—in under 5 seconds.
  </p>
</Card>
```

---

## Final Notes

1. **Keep it simple** - This is a marketing page, not a complex app
2. **Focus on conversion** - CTAs should be prominent and compelling
3. **Mobile-first** - Many SME owners browse on mobile
4. **Performance** - Keep the page lightweight, lazy load images
5. **SEO** - Use semantic HTML (h1, h2, etc.) and proper meta tags

Good luck! Create a beautiful page that sells FinanSEAL's value proposition clearly.
