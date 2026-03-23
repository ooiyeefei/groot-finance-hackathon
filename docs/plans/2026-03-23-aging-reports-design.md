# Aging Payable & Receivable Reports — Design

**Date:** 2026-03-23
**Issue:** #318
**Status:** Validated via brainstorming

## Summary

Polish and unify existing AP/AR aging report infrastructure into a production-ready feature with automated monthly generation, per-debtor/vendor individual statements, review-then-send workflow, and an optional AI insights layer.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | AP Aging + AR Aging only | Core deliverable; summaries and bank recon are separate features |
| AI label | Deterministic reports + optional AI insights | Aging math doesn't need AI. Insights (trends, recommendations) do. Honest labeling. |
| Trigger | Auto-generated monthly (1st) + on-demand | CFO Copilot persona expects proactive reports |
| Report types | Consolidated (owner) + per-debtor/vendor statements | Consolidated for decision-making, individual for collections |
| Send workflow | Review-then-send, opt-in auto-send per debtor | Balances automation with control; trust builds over time |
| Owner notification | Action Center + monthly email with summary | Email as fallback if notifications are off |
| Debtor email | Individual statement PDF + polite message | Automated collections workflow |
| Data accuracy | Pre-generation recon check + generate-with-warnings fallback | Flags unmatched bank transactions before sending inaccurate statements |
| AI insights | Trend summary + actionable recommendations | Genuinely useful AI, not marketing fluff |

## Design

### 1. Report Generation & Storage

**What gets generated:**
- **AP Aging Report** — from `invoices` table, grouped by vendor, aging buckets (Current, 1-30, 31-60, 61-90, 90+ days)
- **AR Aging Report** — from `sales_invoices` table, grouped by customer, same aging buckets

**How it's triggered:**
- **Auto-monthly**: EventBridge rule (1st of month) → Lambda → Convex to generate both reports → PDFs to S3 → notify owner
- **On-demand**: User clicks "Generate Report", picks "as of" date, gets instant PDF + on-screen view

**Storage:**
- PDFs in S3 (`finanseal-bucket`, prefix `reports/{businessId}/`)
- Metadata in Convex `generated_reports` table (type, asOfDate, s3Key, generatedAt, generatedBy)
- Historical reports browsable from Reports page

### 2. Individual Debtor/Vendor Statements

**Per-debtor PDF contains:**
- Company header, statement date
- List of outstanding invoices (number, date, amount, days overdue)
- Aging breakdown for that specific debtor
- Total owed

**Per-vendor PDF contains:**
- Same structure but for AP — what the business owes each vendor

### 3. Review-Then-Send Workflow

**Monthly cycle (1st of each month):**
1. EventBridge triggers generation of all reports + individual statements
2. Pre-generation reconciliation check runs (see Section 5)
3. PDFs stored, Action Center notification + email to owner
4. Owner opens Statements Review page — list of all debtor statements
5. Each row: debtor name, amount owed, # invoices, preview, send checkbox
6. "Send All" or selective send
7. System emails each debtor via SES

**Auto-send progression:**
- Month 1-2: Manual review (build trust)
- Review page shows banner: "Enable auto-send to skip manual review"
- Owner can toggle auto-send globally or per-debtor in Business Settings > Reports
- Auto-send debtors skip review queue; new debtors always require first review

### 4. Email Notifications

**Owner monthly email:**
- Subject: "Your [Month Year] Aging Report — N debtor statements ready for review"
- Inline summary: total AR outstanding, overdue amount/%, debtor count, worst aging
- Top 5 debtors table in email body
- CTA: "Review & Send Statements"
- Auto-send status line
- Attached: consolidated AR aging PDF

**Debtor statement email:**
- Subject: "Statement of Account — [Business Name] — [Month Year]"
- Brief polite body with total outstanding amount
- Attached: individual statement PDF
- Reply-to: business contact email
- Disclaimer if unreconciled transactions exist

### 5. Pre-Generation Reconciliation Check

**Problem:** If vendor/debtor paid via bank but payment wasn't recorded, aging report shows them as overdue incorrectly.

**Solution (two-layer):**
1. **Pre-check**: Before generating, scan unreconciled bank transactions against outstanding invoices using existing DSPy bank recon matching (Tier 1: amount+reference+date, Tier 2: fuzzy name matching)
2. **Reconciliation queue**: "3 bank transactions may match outstanding invoices. Review before generating."
3. **If owner skips**: Generate with warnings — report includes "Unreconciled bank transactions may affect accuracy" section. Debtor emails include disclaimer.

### 6. AI Insights Layer

**What it provides (top of consolidated report):**
- Trend analysis: "AR collection rate dropped from 85% to 71% vs last month"
- Concentration risk: "3 vendors account for 78% of overdue AP"
- Behavioral patterns: "Debtor XYZ consistently 15-20 days late for 3 months — consider adjusting credit terms"
- Actionable recommendations

**How it works:**
- Calls existing MCP tools (`analyze_trends`, `get_ap_aging`, `get_ar_summary`)
- Passes data to Gemini Flash-Lite for natural language summary
- Optional — if API fails, report generates without insights
- Appears in: consolidated PDF, owner email, Action Center card

### 7. Reports Page & Navigation

- New "Reports" sidebar entry
- Sections: Pending Review (top), Generate Report button, Generated Reports history
- Links to existing interactive aging pages (`/invoices/aging-report/`, new `/payables/aging-report/`)
- AP aging page created to mirror existing AR aging page

## What Already Exists

- AR aging page at `/invoices/aging-report/` with interactive view
- `getAPAging` and `getARSummary` Convex queries
- PDF templates for AP and AR aging (`ar-aging-template.tsx`, `ap-aging-template.tsx`)
- Aging calculation utilities
- MCP tools for both queries
- EventBridge + Lambda infrastructure (scheduled-intelligence-stack)
- SES email infrastructure
- S3 storage with CloudFront CDN

## Out of Scope

- Payable/Receivable summary reports (different aggregation, future feature)
- Bank reconciliation statement (separate data source)
- Payment links in debtor emails (future feature)
- Vendor statement send workflow (AP side — owner doesn't send statements to vendors)
