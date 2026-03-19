# Groot Finance — Product Vision & Positioning

> This document is the single source of truth for Groot Finance's vision, positioning, and messaging.
> Referenced from CLAUDE.md. Used for pitch decks, investor materials, accelerator applications, and marketing copy.
> Last updated: 2026-03-19

---

## The Problem (150 words)

Southeast Asian SMEs drown in financial busywork. A typical business owner spends 15+ hours per week on tasks that require zero strategic thinking: manually matching bank transactions to invoices, filling e-invoice forms on merchant portals one by one, chasing employees for expense receipts, and reconciling numbers across disconnected spreadsheets. The tools they use — traditional accounting software — were built for data entry, not intelligence. They store records but learn nothing. Every month starts from scratch. Meanwhile, the owner needs answers NOW: "Can we afford to hire next month?" "Which vendor is overcharging?" "Are we compliant with the new e-invoicing mandate?" Getting these answers requires exporting data, building spreadsheets, and hoping the numbers are right. The finance function is stuck in a loop of manual labor that scales linearly with business growth — more transactions means more grunt work, not more insight.

---

## The Solution (150 words)

Groot Finance replaces the traditional finance software stack with an AI agent that works, learns, and improves. Instead of navigating menus and filling forms, users talk to their finances in plain language — English, Malay, Thai, or Bahasa Indonesia — and the agent handles the rest: posting invoices, matching payments, detecting anomalies, and forecasting cash flow. What makes Groot fundamentally different is the self-improving engine underneath. Every time a user corrects a match, categorizes a transaction, or flags an error, that correction trains the AI to be smarter — not just for that user, but for their entire company. The AI gets measurably better every week through automated prompt optimization (weekly retraining cycles on accumulated corrections). This means the system handles the routine 80% autonomously and keeps expanding what "routine" means. The more you use it, the less you need to.

---

## Vision Statement

**Groot Finance is the AI finance team that every Southeast Asian business deserves — one that works 24/7, learns your business deeply, and gets smarter every single week.**

We are building the future where:
- **Every employee** has a personal financial assistant that handles expense claims, receipt scanning, and compliance with zero training
- **Every manager** has a right-arm that surfaces team spending anomalies, flags late approvals, and provides real-time budget visibility
- **Every business owner** has a CFO copilot that forecasts cash flow, prepares board reports, optimizes vendor costs, and proactively alerts on financial risks — all through a single conversation

---

## One-Liner (Pitch)

**"The AI finance team member that learns your business and gets smarter every week you use it."**

Alternative versions:
- Investor-focused: "Self-improving AI that replaces the finance back-office for Southeast Asian SMEs."
- Technical: "An agentic AI platform with DSPy-powered self-improvement that automates financial operations across invoicing, reconciliation, expenses, and compliance."
- Customer-focused: "Talk to your finances like you'd talk to a CFO. Ask anything. Get answers in seconds. Watch it learn."

---

## Unique Selling Proposition (USP)

### Primary USP: Self-Improving AI

**"The only finance platform where AI doesn't just automate — it learns from your corrections and gets measurably smarter every week."**

Every finance app in 2026 claims "AI-powered." Most just run static prompts against an LLM — same accuracy on day 1 and day 365. Groot is architecturally different:

1. **Correction flywheel**: Every user correction (re-categorizing a transaction, fixing a match, flagging an error) becomes a training example
2. **Weekly retraining**: Accumulated corrections feed into automated optimization cycles that improve prompts and few-shot examples
3. **Per-business learning**: The AI learns YOUR vendor names, YOUR transaction patterns, YOUR categorization preferences — not generic patterns
4. **Compounding returns**: The more your team uses Groot, the fewer corrections needed, the more the AI handles autonomously

### Secondary USP: Agentic Automation

**"AI that doesn't just show you data — it takes action."**

Traditional software shows dashboards. Groot's agent DOES things:
- Posts invoices to accounting directly from chat
- Approves expense claims with one click
- Processes reimbursement payments with payment method selection
- Opens merchant e-invoice portals, fills forms, and retrieves e-invoices automatically (CUA — Computer Use Agent)
- Proactively alerts on cash flow risks before they become problems

### Tertiary USP: Southeast Asian Context

**"Built for the complexity of Southeast Asian finance — multi-currency, multi-language, multi-regulatory."**

- Supports English, Malay, Thai, Indonesian, Chinese
- Malaysian LHDN e-invoicing (MyInvois) integration with agent-based form filling
- Singapore GST compliance knowledge base
- Multi-currency with home currency conversion (IFRS 21)
- Designed for the SME reality: small teams, multiple roles per person, limited finance expertise

---

## Three Personas

### 1. Personal Assistant (Employee)
**"Snap a receipt. Done."**

| What they do today | What Groot does |
|---|---|
| Save receipt, open expense app, manually enter details, attach photo, submit, wait for approval, chase manager | Snap photo in chat → AI reads receipt → creates claim → auto-routes to manager → tracks status → notifies when reimbursed |
| Search Google for "is this tax deductible in Malaysia?" | Ask Groot: "Is this lunch deductible?" → instant answer from regulatory KB |
| Fill e-invoice forms on merchant portals one by one | One click → agent fills all forms automatically |

### 2. Manager's Right-Arm (Manager)
**"Your team's finances, watched 24/7."**

| What they do today | What Groot does |
|---|---|
| Check expense approval queue manually every few days | Proactive alert: "3 expense claims waiting for your approval (2 days overdue)" |
| Build spreadsheet to compare team spending by category | Ask Groot: "Compare team spending this month vs last month" → instant comparison card |
| Manually review each claim for duplicates and policy violations | AI flags duplicates, over-budget categories, and unusual patterns automatically |

### 3. CFO Copilot (Owner / Finance Admin)
**"Your AI finance team member."**

| What they do today | What Groot does |
|---|---|
| Export data to Excel, build charts, prepare board report | Ask Groot: "Prepare Q1 financial summary for the board" → comprehensive report with cash flow dashboard |
| Log into multiple portals to check AR/AP status | Ask Groot: "Who hasn't paid us?" → instant overdue list with follow-up actions |
| Hire a bookkeeper to do monthly reconciliation | AI matches bank transactions to invoices automatically, gets smarter each month |
| Worry about cash flow at 2 AM | Groot alerts proactively: "Cash runway dropped to 45 days. Here's why and what to do." |

---

## Competitive Positioning

### What we are NOT
- ❌ Not another Xero/QuickBooks with an AI chatbot bolted on
- ❌ Not a static accounting app that happens to have OCR
- ❌ Not a dashboard tool that shows data but can't act on it
- ❌ Not a one-trick AI that does the same thing forever

### What we ARE
- ✅ An AI agent that IS the product (accounting features serve the agent)
- ✅ A self-improving system that gets better with every user interaction
- ✅ An agentic platform that takes action, not just shows data
- ✅ A finance team in a box — assistant, manager tool, and CFO copilot in one

### The Moat
```
Traditional SaaS:     Build feature → Ship → Maintain → Build next feature
                      (Linear effort, linear value)

Groot:                Build AI → Users correct AI → AI learns → AI handles more
                      → Users correct less → AI handles even more → ...
                      (Linear effort, COMPOUNDING value)
```

Every customer that uses Groot makes Groot better. Every correction is training data. Every week the AI handles more, humans handle less. This flywheel is extremely hard to replicate because it requires:
1. The DSPy optimization infrastructure (not just LLM prompts)
2. Correction collection at every touchpoint (not just a feedback button)
3. Domain-specific training (SE Asian banking formats, vendor names, regulatory rules)
4. IFRS-compliant double-entry accounting as the data foundation

---

## Market Context

**Target market**: SMEs in Southeast Asia (Malaysia, Singapore, Thailand, Indonesia, Philippines, Vietnam)
- 71M+ SMEs across ASEAN
- <5% use modern cloud accounting software
- Rapidly growing e-invoicing mandates (Malaysia 2024-2025, others following)
- Multi-currency, multi-language complexity that global tools handle poorly

**Go-to-market**:
- Malaysia first (home market, e-invoicing mandate driving urgency)
- Singapore second (English-speaking, regulatory-forward)
- Thailand/Indonesia third (large markets, growing fintech adoption)

**Business model**: SaaS subscription
- Starter: ~$150/mo (AI copilot + basic features)
- Pro: ~$350/mo (proactive insights, reconciliation, advanced AI)
- Enterprise: Custom (multi-entity, API access, dedicated support)

---

## Technical Foundation (for technical audiences only)

| Layer | Technology | Purpose |
|---|---|---|
| AI Agent | LangGraph + Gemini 3.1 Flash-Lite | Multi-tool financial agent with RBAC |
| Self-Improvement | DSPy (BootstrapFewShot, MIPROv2) | Weekly prompt optimization from corrections |
| Memory | Mem0 + Qdrant | Per-user persistent memory across sessions |
| Knowledge | Qdrant RAG (regulatory_kb) | Tax/compliance knowledge for MY, SG, TH, ID |
| Accounting | Convex (journal_entries + lines) | IFRS double-entry bookkeeping |
| Browser Agent | Gemini CUA (Computer Use Agent) | E-invoice portal automation |
| Infrastructure | AWS Lambda + CDK + EventBridge | Serverless, cost-optimized |
| Frontend | Next.js 15 + Convex | Real-time, SEA-optimized |

---

*This document should be updated whenever the product vision evolves. All marketing copy, pitch decks, and investor materials should reference this as the source of truth.*
