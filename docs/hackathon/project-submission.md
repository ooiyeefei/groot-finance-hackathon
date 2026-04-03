# Finance Copilot

**Tagline:** Your AI CFO that learns, acts, and speaks.

## Description

Finance Copilot is an autonomous AI finance agent for SMEs that doesn't just show dashboards — it does your finance work. Speak to it, and it processes receipts, creates expenses, auto-approves via policy engine, triggers payments, and posts IFRS-compliant journal entries — all in under 30 seconds, zero manual steps.

Unlike traditional accounting software where users upload, click, wait, and follow up, Finance Copilot flips the model: the AI acts proactively, humans only intervene for edge cases. It gets smarter every week through a self-improving loop — user corrections train the model via DSPy, compounding accuracy over time.

### Key Features

- **Voice-first interface** — Ask your AI CFO anything hands-free via MiniMax TTS/STT
- **Zero-touch expense automation** — Receipt → extract → approve → pay → journal entry, fully autonomous
- **Self-improving AI** — DSPy flywheel: corrections → weekly retraining → smarter model → fewer corrections
- **Persistent memory** — Remembers vendor preferences, team structure, and business context across sessions
- **n8n workflow orchestration** — Policy-based auto-approval, payment triggers, and notifications
- **42 AI tools** — From cash flow forecasting to anomaly detection to regulatory compliance search
- **IFRS-compliant accounting** — Double-entry bookkeeping, multi-currency, Southeast Asian tax compliance

### Built With

- **n8n** — Workflow automation for expense approval policies and payment orchestration
- **MiniMax** — Voice synthesis (Text-to-Speech) for hands-free AI CFO experience
- **Next.js + Convex** — Real-time full-stack application
- **LangGraph + Gemini** — Agentic AI orchestration with 42 MCP tools
- **DSPy** — Self-improving prompt optimization (weekly retraining pipeline)
- **AWS Lambda** — MCP tool server, document processing, browser automation

### Category

Advisory, Wealth & Client Experience + Compliance, Reporting & Back Office

---

## X (Twitter) Post

> Just built Finance Copilot at the @HanwhaAICenter HACathon — an AI CFO that learns, acts, and speaks.
>
> Voice in an expense → AI extracts, auto-approves, posts journal entries. Zero clicks. Gets smarter every week.
>
> Self-improving AI + @MiniMaxAI voice + @naborhi workflow automation = autonomous finance.
>
> Built with @aaborhi @MiniMaxAI @HanwhaAICenter
>
> #HACathon #AIFinance #VibeCode

## LinkedIn Post

> Excited to share what we built at the Hanwha AI Center HACathon — Finance Copilot: an AI CFO that doesn't just show dashboards, it does your finance work.
>
> Speak to it. It processes receipts, creates expenses, auto-approves via policy engine, triggers payments, and posts IFRS-compliant journal entries — all in under 30 seconds.
>
> The secret sauce: a self-improving AI loop. User corrections train the model weekly via DSPy. The more you use it, the smarter it gets.
>
> Built with MiniMax (voice), n8n (workflow automation), LangGraph + Gemini (AI agent), and 42 MCP tools.
>
> Thanks to AI Valley, MiniMax, and Hanwha AI Center for hosting!
>
> #AIFinance #Fintech #HACathon #AI #AutonomousFinance

---

## 3-Minute Demo Script

### Setup (before demo)
- Open the hackathon app in browser, logged in as admin
- Have chat widget open
- Enable auto-speak toggle (speaker icon in chat header)
- Have n8n workflow tab open in background (to show visually if asked)

### 0:00–0:30 — Hook & Problem

**Say:** "Every SME spends 15+ hours a week on financial admin. Upload receipts. Create expenses. Chase approvals. Enter journal entries. What if your AI did all of that — autonomously?"

**Show:** Dashboard briefly — clean, focused on cash flow + expenses.

### 0:30–1:15 — Live Demo: Voice → Autonomous Expense

**Say:** "Let me show you. I'll just talk to my AI CFO."

1. **Click voice input mic** → Speak: *"I had a forty-five dollar lunch at Sushi Zen for a client meeting"*
2. **Watch the agent respond** — it creates the expense claim, shows the receipt card with extracted data (vendor, amount, category)
3. **Click confirm** on the receipt card
4. **Say:** "That's it. The expense is submitted. Now watch what happens."

**Narrate while it happens:**
- "n8n receives the webhook... checks our policy — $45 is under the $100 auto-approve threshold..."
- "Auto-approved. Journal entry created. IFRS double-entry — debit expenses, credit accounts payable."
- "And now the AI speaks back the confirmation."

5. **Agent speaks via MiniMax:** *"Done! Your $45 expense at Sushi Zen has been approved and queued for reimbursement."*

**Say:** "Voice to payment. 30 seconds. Zero manual steps."

### 1:15–1:45 — Self-Improving AI (The Moat)

**Say:** "But here's what makes this different from every other finance tool."

**Show:** Correction feedback on a message (thumbs down → correct the response)

**Say:** "When the AI makes a mistake — wrong category, wrong amount — users correct it. Those corrections feed into our DSPy training pipeline. Every week, the model retrains and gets smarter. This is compounding intelligence. The more you use Finance Copilot, the less you need to correct it."

### 1:45–2:15 — AI CFO Capabilities

**Say:** "This isn't just expense processing. It's a full AI CFO with 42 tools."

**Quick demo (pick 1-2):**
- Type: *"Analyze my cash flow runway"* → shows forecast chart
- Type: *"Find unusual spending patterns"* → anomaly detection
- Type: *"GST requirements for Singapore"* → RAG-powered regulatory answer with citations

**Say:** "Cash flow forecasting. Anomaly detection. Regulatory compliance. Bank reconciliation. All through conversation."

### 2:15–2:45 — Architecture & Tech Stack

**Say:** "Under the hood:"
- "LangGraph agent with Gemini, 42 MCP tools on AWS Lambda"
- "n8n orchestrates approval workflows — policy checks, payment triggers"
- "MiniMax powers the voice — hands-free finance for busy founders"
- "DSPy retrains weekly with quality gates — only better models get promoted"
- "Mem0 gives the AI persistent memory — it remembers your vendors, preferences, team structure"

### 2:45–3:00 — Close

**Say:** "We're not building another accounting app. We're building the AI that replaces the need for one."

**Say:** "Finance Copilot — the AI CFO that gets smarter every week."

**Pause. Smile.**

"Happy to demo any feature live."
