# FinanSEAL Features Landing Page Specification

## Overview

This specification defines the design and content for a features-focused sub-landing page meant to pitch FinanSEAL to Southeast Asian SMEs. The page should communicate the platform's AI-powered financial co-pilot capabilities in a compelling, modern way.

**Target Audience**: SME business owners, finance managers, and accountants in Southeast Asia (Malaysia, Thailand, Indonesia, Singapore, Vietnam, Philippines)

**Primary Goal**: Convince visitors that FinanSEAL is the intelligent, automated solution for their financial management needs.

---

## Page Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                         HERO SECTION                             │
│   "The AI-Powered Financial Co-Pilot for Southeast Asian SMEs"  │
│                      [CTA: Start Free Trial]                     │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                      KEY FEATURES (6 cards)                      │
│   AI Document Processing | Multi-Currency | Action Center        │
│   Expense Workflows | AI Assistant | Real-Time Analytics         │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                   FEATURE DEEP-DIVES (3 sections)               │
│   Document Intelligence | Team Collaboration | Analytics         │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                      TRUST INDICATORS                            │
│   Security badges | Compliance logos | Stats                     │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                      CTA SECTION                                 │
│   "Ready to transform your finances?" [Start Free Trial]        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Section 1: Hero Section

### Content

**Headline**: "The AI-Powered Financial Co-Pilot for Southeast Asian SMEs"

**Subheadline**: "Automate document processing, gain proactive insights, and manage multi-currency operations with intelligent AI assistance."

**Primary CTA**: "Start Your 14-Day Free Trial" → `/sign-up`

**Secondary CTA**: "Watch Demo" (optional, can link to video or demo page)

### Design Notes
- Full-width hero with gradient background (use brand colors)
- Optional: animated illustration or subtle motion graphics
- Mobile-responsive: stack headline and CTA vertically

---

## Section 2: Key Features Grid (6 cards)

Display 6 primary feature cards in a 3×2 grid (responsive: 2×3 on tablet, 1×6 on mobile).

### Feature 1: AI Document Processing
- **Icon**: FileText or Scan icon
- **Title**: "AI Document Processing"
- **Description**: "Upload invoices and receipts in any format. Our AI automatically classifies, extracts data, and visualizes results with interactive bounding boxes—in under 5 seconds."
- **Key benefit**: 90% reduction in manual data entry

### Feature 2: Multi-Currency Operations
- **Icon**: Globe or Currency icon
- **Title**: "Multi-Currency Operations"
- **Description**: "Track transactions across 9 Southeast Asian currencies with real-time exchange rates. Automatic home currency conversion for unified reporting."
- **Supported**: THB, MYR, IDR, SGD, VND, PHP, USD, EUR, CNY

### Feature 3: Action Center Intelligence
- **Icon**: Lightbulb or Brain icon
- **Title**: "Proactive AI Insights"
- **Description**: "Receive AI-generated alerts on anomalies, compliance risks, cash flow concerns, and optimization opportunities—before problems become costly."
- **Categories**: Anomaly, Compliance, Deadline, Cash Flow, Optimization

### Feature 4: Expense Claim Workflows
- **Icon**: Receipt or Workflow icon
- **Title**: "Smart Expense Management"
- **Description**: "Employees submit receipts via mobile. AI extracts details, routes to managers, and automatically creates accounting entries upon approval."
- **Workflow**: Submit → Route → Approve → Reimburse

### Feature 5: AI Chat Assistant
- **Icon**: MessageSquare or Bot icon
- **Title**: "Conversational Finance AI"
- **Description**: "Ask questions in natural language—English, Thai, or Indonesian. Get instant answers about transactions, vendors, compliance, and forecasts."
- **Powered by**: LangGraph agent with tool calling

### Feature 6: Real-Time Analytics
- **Icon**: BarChart or TrendingUp icon
- **Title**: "Live Financial Dashboards"
- **Description**: "Monitor income, expenses, profit margins, aged receivables, and payables in real-time. Period comparisons show trends at a glance."
- **Metrics**: Income, Expenses, Net Profit, Aged A/R, Aged A/P

### Design Notes
- Each card: White background, subtle shadow, rounded corners
- Icon in colored circle (brand primary color)
- Hover effect: slight elevation/shadow increase
- Equal card heights using CSS grid

---

## Section 3: Feature Deep-Dives (3 alternating sections)

### Deep-Dive 1: Document Intelligence

**Layout**: Image left, content right (alternates on next section)

**Section Title**: "From Paper to Insights in Seconds"

**Headline**: "AI-Powered Document Processing"

**Body Content**:
> Transform any invoice or receipt into structured financial data instantly. Our two-phase extraction delivers results in 3-4 seconds, with line items loading progressively so you never wait.
>
> **What makes it intelligent:**
> - **Smart Classification**: Automatically detects document type and routes to the right processing pipeline
> - **Visual Verification**: Interactive bounding boxes show exactly what data was extracted and where
> - **Confidence Scoring**: Know which fields need review with per-field accuracy indicators
> - **Line Item Extraction**: Captures quantities, unit prices, taxes, and totals automatically

**Supporting Image/Illustration**:
- Mock-up of document viewer with bounding box annotations
- Or: animated GIF showing upload → processing → results flow

**Stats to highlight**:
- "< 5 seconds average processing time"
- "95%+ extraction accuracy on standard invoices"
- "Support for PDF, JPEG, PNG, WebP formats"

---

### Deep-Dive 2: Team Collaboration & Workflows

**Layout**: Content left, image right

**Section Title**: "Built for Teams, Designed for Control"

**Headline**: "Streamlined Approval Workflows"

**Body Content**:
> Expense claims flow automatically to the right approvers based on your organization structure. Managers approve on mobile, and accounting entries are created instantly—no manual re-entry required.
>
> **Workflow capabilities:**
> - **Manager Hierarchy Routing**: Claims automatically route to assigned managers
> - **Mobile-First Approvals**: Managers can approve or reject from any device
> - **IFRS-Compliant Records**: Approved expenses automatically generate accounting entries
> - **Role-Based Access**: Employees, Managers, and Admins see only what they need

**Supporting Image/Illustration**:
- Workflow diagram: Employee → Submit → Manager Approval → Accounting Entry
- Or: mobile approval screen mockup

**Stats to highlight**:
- "3-step approval workflow"
- "Automatic accounting entry creation"
- "Multi-tenant team management"

---

### Deep-Dive 3: Analytics & Insights

**Layout**: Image left, content right

**Section Title**: "Know Your Numbers in Real-Time"

**Headline**: "Dashboard Intelligence"

**Body Content**:
> Your financial health at a glance. Track income, expenses, and profit margins with period-over-period comparisons. Aged receivables and payables help you manage cash flow proactively.
>
> **Dashboard highlights:**
> - **5 Key Metrics**: Total Income, Total Expenses, Net Profit, Transaction Count, Profit Margin
> - **Aged Analysis**: Receivables and payables by 30/60/90+ day buckets
> - **Currency Breakdown**: See exposure across all your operating currencies
> - **Trend Indicators**: Instant visual cues for improving or declining metrics

**Supporting Image/Illustration**:
- Dashboard screenshot or mockup showing key metrics cards
- Or: chart visualization (currency breakdown, category analysis)

**Stats to highlight**:
- "Real-time data sync via Convex"
- "Multi-currency dashboard support"
- "Period comparison: 60 days, quarter, year"

---

## Section 4: Trust Indicators

### Content

**Section Title**: "Built for Security & Compliance"

**Trust badges/icons** (horizontal row):
1. **Secure Authentication** - "Clerk-powered SSO & MFA"
2. **Data Isolation** - "Multi-tenant row-level security"
3. **Audit Trail** - "Complete compliance logging"
4. **IFRS Aligned** - "Accounting standards compliant"

**Optional additional stats row**:
- "9 currencies supported"
- "3 languages (EN, TH, ID)"
- "AWS-powered infrastructure"

### Design Notes
- Muted background color (light gray or brand secondary)
- Icons in a horizontal row, evenly spaced
- Small, clean badges/icons

---

## Section 5: Final CTA Section

### Content

**Headline**: "Ready to Transform Your Financial Operations?"

**Subheadline**: "Join SMEs across Southeast Asia who've automated their finance workflows with FinanSEAL."

**Primary CTA**: "Start Your 14-Day Free Trial" → `/sign-up`

**Secondary CTA**: "Schedule a Demo" (optional, can link to Calendly or contact form)

**Reassurance text**: "No credit card required. Full access during trial."

### Design Notes
- Centered text, contrasting background (brand primary or gradient)
- Large, prominent CTA button
- Optional: small testimonial quote or logo parade of customer types

---

## Design System Guidelines

### Colors (use existing brand tokens)
- **Primary**: Use `bg-primary`, `text-primary-foreground`
- **Secondary**: Use `bg-secondary`, `text-secondary-foreground`
- **Accent/Success**: Use `bg-success` for positive highlights
- **Background layers**: `bg-background` → `bg-surface` → `bg-card`

### Typography
- **Headings**: Font-semibold to font-bold, appropriate scale
- **Body**: text-foreground for primary, text-muted-foreground for secondary
- **Card titles**: text-lg font-semibold

### Spacing
- Section padding: py-16 to py-24 (responsive)
- Card gap: gap-6 to gap-8
- Content max-width: max-w-7xl mx-auto

### Components to reuse
- Import from `@/components/ui`: Button, Card, Badge
- Use Lucide React icons consistently
- Follow existing Tailwind patterns from the codebase

---

## Responsive Behavior

| Breakpoint | Key Features Grid | Deep-Dive Layout |
|------------|-------------------|------------------|
| Desktop (lg+) | 3×2 grid | Image + Content side by side |
| Tablet (md) | 2×3 grid | Stack image above content |
| Mobile (sm) | 1×6 stack | Stack image above content |

---

## Technical Requirements

1. **Route**: `/[locale]/features` (supports i18n)
2. **Page type**: Static page, no authentication required
3. **Performance**:
   - Lazy load images
   - Use Next.js Image component with optimization
   - Keep above-the-fold content lightweight
4. **SEO**:
   - Meta title: "AI-Powered Finance Platform Features | FinanSEAL"
   - Meta description: "Discover how FinanSEAL's AI document processing, multi-currency support, and proactive insights help Southeast Asian SMEs automate financial operations."
5. **Analytics**: Track CTA clicks, section scroll depth

---

## Content Translations Required

The page should support:
- **English** (en) - Primary
- **Thai** (th)
- **Indonesian** (id)
- **Chinese** (zh)

Translation keys should be added to the locale JSON files.

---

## Files to Create

1. `src/app/[locale]/features/page.tsx` - Main page component
2. `src/domains/marketing/components/features-hero.tsx`
3. `src/domains/marketing/components/features-grid.tsx`
4. `src/domains/marketing/components/feature-deep-dive.tsx`
5. `src/domains/marketing/components/trust-indicators.tsx`
6. `src/domains/marketing/components/features-cta.tsx`

Or alternatively, a single-file page with inline sections if simpler.

---

## Success Metrics

- **Conversion**: Clicks on "Start Free Trial" CTA
- **Engagement**: Scroll depth past Key Features section (50%+)
- **Bounce rate**: Target < 60% for feature page visitors
