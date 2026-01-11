# Agentic Processing Roadmap - Gap Analysis

**Analysis Date:** 2026-01-10
**Analyst:** Claude Code (AWS Solutions Architect + Tech Lead perspective)
**Reference:** Deep codebase analysis of document processing architecture
**Focus:** Expense Claims & Invoice post-processing automation

---

## Executive Summary

Based on comprehensive analysis of the Lambda document processor (`handler.py`), Convex system functions, and domain-specific workflows, this roadmap outlines a phased approach to building **agentic processing capabilities** for FinanSEAL.

### Current Architecture (Validated)

```
Phase 1 (Lambda):  OCR Extraction → Store in source tables
Phase 2 (Convex):  Business workflows (approval, accounting entries)

Gap: No automated analysis/flagging between Phase 1 and Phase 2
```

### Target Architecture

```
Phase 1 (Lambda):     OCR Extraction → Store in source tables
                              ↓
Phase 1.5 (Agentic): EventBridge → Analysis Lambdas → Flags/Alerts
                              ↓
Phase 2 (Convex):    Business workflows with AI-assisted decisions
```

---

## Phase 1: Foundation Infrastructure

### Issue A1: EventBridge Integration for Document Events
**Priority:** P1 - Foundation
**WINNING Score:** 48/60
**Estimated Effort:** 3-5 days
**Depends On:** None

**Description:**
Create EventBridge event bus to emit events when documents reach key states, enabling decoupled agentic processing.

**Scope:**
- [ ] Create EventBridge event bus `finanseal-document-events`
- [ ] Emit event when `expense_claims.status = 'draft'` (extraction complete)
- [ ] Emit event when `expense_claims.status = 'submitted'` (pending approval)
- [ ] Emit event when `invoices.status = 'pending'` (extraction complete)
- [ ] CDK stack updates in `infra/`
- [ ] Event schema definitions

**Events to Emit:**
```typescript
{
  source: "finanseal.documents",
  detailType: "ExpenseClaimExtracted" | "ExpenseClaimSubmitted" | "InvoiceExtracted",
  detail: {
    documentId: string,
    businessId: string,
    userId: string,
    totalAmount: number,
    currency: string,
    vendorName: string,
    category: string,
    transactionDate: string
  }
}
```

**Why Now:**
- Foundation for ALL agentic features
- Decouples analysis from extraction (single responsibility)
- Enables parallel feature development

---

### Issue A2: Agentic Lambda Skeleton + Shared Rule Engine
**Priority:** P1 - Foundation
**WINNING Score:** 45/60
**Estimated Effort:** 2-3 days
**Depends On:** A1

**Description:**
Create shared infrastructure for agentic Lambdas with common patterns for rule evaluation, result storage, and manager notifications.

**Scope:**
- [ ] Create `src/lambda/expense-analyzer/` skeleton
- [ ] Shared rule engine interface (`RuleEvaluator`, `RuleResult`)
- [ ] Convex mutations for storing analysis results (`expense_claim_flags` table)
- [ ] Notification dispatcher (in-app + email)
- [ ] CDK stack for agentic Lambda

**Schema:**
```sql
CREATE TABLE expense_claim_flags (
  id UUID PRIMARY KEY,
  expense_claim_id UUID REFERENCES expense_claims(id),
  flag_type VARCHAR(50),  -- 'duplicate', 'policy_violation', 'limit_exceeded', 'anomaly'
  severity VARCHAR(20),   -- 'info', 'warning', 'critical'
  rule_id VARCHAR(100),
  message TEXT,
  details JSONB,
  auto_resolved BOOLEAN DEFAULT FALSE,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Phase 2: Expense Claims Agentic Features

### Issue A3: Duplicate Receipt Detection (Enhances #77)
**Priority:** P2 - AI Differentiation
**WINNING Score:** 52/60 (upgraded from #77's 42)
**Estimated Effort:** 5-7 days
**Depends On:** A1, A2

**Description:**
Real-time duplicate detection triggered when expense claim is submitted. Extends existing issue #77 with proper Lambda architecture.

**Scope:**
- [ ] Lambda: `expense-duplicate-detector`
- [ ] EventBridge rule: Trigger on `ExpenseClaimSubmitted`
- [ ] Detection logic:
  - Same vendor + amount (within 5%) + date (within 3 days)
  - Vendor name fuzzy matching (Levenshtein distance < 3)
  - Image hash comparison (perceptual hash)
- [ ] Flag creation with `flag_type = 'duplicate'`
- [ ] Manager approval UI shows duplicate warning
- [ ] "Dismiss as not duplicate" action for managers

**Detection Algorithm:**
```python
def is_potential_duplicate(new_claim, existing_claims):
    for existing in existing_claims:
        if (
            fuzzy_match(new_claim.vendor, existing.vendor) > 0.8 and
            abs(new_claim.amount - existing.amount) / existing.amount < 0.05 and
            abs(new_claim.date - existing.date).days <= 3
        ):
            return True, existing.id
    return False, None
```

**Why Higher Score Than #77:**
- Now has proper architectural foundation
- Event-driven (non-blocking)
- Manager workflow integration

---

### Issue A4: Expense Policy Rule Engine
**Priority:** P2 - Compliance
**WINNING Score:** 50/60
**Estimated Effort:** 7-10 days
**Depends On:** A2

**Description:**
Configurable business policy rules that automatically flag violations when expenses are submitted.

**Scope:**
- [ ] Lambda: `expense-policy-checker`
- [ ] EventBridge rule: Trigger on `ExpenseClaimSubmitted`
- [ ] Convex table: `expense_policies` (business-configurable)
- [ ] Policy types:
  - Amount limits by category
  - Required receipt threshold
  - Weekend/holiday submissions
  - Vendor blacklist
  - Category restrictions by role
- [ ] Policy configuration UI in Settings
- [ ] Flag creation with `flag_type = 'policy_violation'`
- [ ] Override workflow for managers with justification

**Policy Schema:**
```typescript
interface ExpensePolicy {
  id: string;
  businessId: string;
  name: string;
  ruleType: 'amount_limit' | 'category_restriction' | 'vendor_blacklist' | 'time_restriction';
  conditions: {
    category?: string;
    maxAmount?: number;
    minAmount?: number;
    roles?: string[];
    vendors?: string[];
    daysOfWeek?: number[];
  };
  severity: 'info' | 'warning' | 'block';
  isActive: boolean;
}
```

**Example Policies:**
- "Meals over $100 require manager pre-approval"
- "Entertainment expenses not allowed for Employee role"
- "Vendor 'ABC Casino' is blacklisted"

---

### Issue A5: Monthly/Category Spend Limits & Quotas
**Priority:** P2 - Budget Control
**WINNING Score:** 48/60
**Estimated Effort:** 5-7 days
**Depends On:** A2

**Description:**
Track and enforce spending limits per employee, per category, or per team on monthly/quarterly basis.

**Scope:**
- [ ] Lambda: `expense-limit-checker`
- [ ] EventBridge rule: Trigger on `ExpenseClaimSubmitted`
- [ ] Convex tables:
  - `spend_limits` (configurations)
  - `spend_tracking` (current usage)
- [ ] Limit types:
  - Per-employee monthly total
  - Per-employee per-category monthly
  - Per-team monthly total
  - Per-team per-category monthly
- [ ] Flag creation with `flag_type = 'limit_exceeded'`
- [ ] "Approaching limit" warnings (80%, 90%)
- [ ] Budget dashboard widget

**UI/UX:**
- Employee sees remaining budget before submitting
- Manager sees team budget utilization
- Automatic escalation when limit exceeded

---

### Issue A6: Anomaly Detection for Expense Patterns
**Priority:** P3 - Intelligence
**WINNING Score:** 42/60
**Estimated Effort:** 7-10 days
**Depends On:** A3, A4, A5 (needs baseline data)

**Description:**
ML-based anomaly detection for unusual expense patterns beyond simple rules.

**Scope:**
- [ ] Lambda: `expense-anomaly-detector`
- [ ] Historical pattern analysis:
  - Employee's typical spending patterns
  - Category averages across business
  - Vendor frequency analysis
- [ ] Anomaly types:
  - Amount outlier (3+ std deviations)
  - Unusual vendor for employee
  - Unusual category for employee
  - Frequency spike (many claims in short period)
  - Round number patterns
- [ ] Flag creation with `flag_type = 'anomaly'`
- [ ] Confidence score for each anomaly

**Technical Approach:**
- Start with statistical methods (z-score, IQR)
- Graduate to ML models as data grows
- Use Gemini for natural language explanation of anomalies

---

## Phase 3: Invoice Agentic Features

### Issue A7: Vendor Price Intelligence
**Priority:** P3 - Procurement
**WINNING Score:** 40/60
**Estimated Effort:** 5-7 days
**Depends On:** A1

**Description:**
Analyze price history from `vendor_price_history` table to detect price changes and provide procurement intelligence.

**Scope:**
- [ ] Lambda: `vendor-price-analyzer`
- [ ] EventBridge rule: Trigger on `InvoiceExtracted`
- [ ] Analysis types:
  - Price increase detection (vs last 3 invoices)
  - Price decrease opportunities
  - Volume discount suggestions
  - Alternative vendor suggestions
- [ ] Store insights in `vendor_insights` table
- [ ] Dashboard widget for price trends

**Value Proposition:**
- "Vendor ABC increased Item X price by 15% vs last order"
- "You could save $X by ordering Y units instead of Z"

---

### Issue A8: Invoice Payment Prediction
**Priority:** P3 - Cash Flow
**WINNING Score:** 38/60
**Estimated Effort:** 5-7 days
**Depends On:** A1

**Description:**
Predict optimal payment timing based on payment terms, cash flow, and vendor relationships.

**Scope:**
- [ ] Lambda: `payment-optimizer`
- [ ] Analysis factors:
  - Payment terms (Net 30, etc.)
  - Early payment discounts
  - Cash flow projection
  - Vendor priority score
- [ ] Recommendations:
  - Pay now (capture discount)
  - Pay on due date
  - Request extension
- [ ] Calendar view of upcoming payments

---

## Phase 4: Cross-Domain Intelligence

### Issue A9: Unified Anomaly Dashboard
**Priority:** P3 - Operations
**WINNING Score:** 35/60
**Estimated Effort:** 3-5 days
**Depends On:** A3, A4, A5, A6

**Description:**
Centralized dashboard for managers/admins to review all AI-generated flags and anomalies.

**Scope:**
- [ ] `/dashboard/anomalies` page
- [ ] Filter by: flag type, severity, date range, status
- [ ] Batch actions: dismiss, escalate, investigate
- [ ] Weekly digest email for unreviewed flags
- [ ] Metrics: flag rate, resolution time, override rate

---

### Issue A10: AI Category Improvement Loop
**Priority:** P4 - AI Quality
**WINNING Score:** 32/60
**Estimated Effort:** 5-7 days
**Depends On:** A9

**Description:**
Learn from manual category corrections to improve AI categorization accuracy.

**Scope:**
- [ ] Track when users change AI-suggested categories
- [ ] Aggregate correction patterns per business
- [ ] Fine-tune category keywords based on corrections
- [ ] Monthly accuracy report
- [ ] Option to retrain business-specific model

---

## Implementation Priority Matrix

| Phase | Issues | Total Effort | Dependencies |
|-------|--------|--------------|--------------|
| **Phase 1** | A1, A2 | 5-8 days | None |
| **Phase 2** | A3, A4, A5 | 17-24 days | Phase 1 |
| **Phase 2b** | A6 | 7-10 days | Phase 2 + data |
| **Phase 3** | A7, A8 | 10-14 days | Phase 1 |
| **Phase 4** | A9, A10 | 8-12 days | Phase 2 |

---

## Recommended Execution Order

```
Sprint 1 (Week 1-2):
├── A1: EventBridge Integration [FOUNDATION]
└── A2: Agentic Lambda Skeleton [FOUNDATION]

Sprint 2 (Week 3-4):
├── A3: Duplicate Detection [HIGH VALUE]
└── A5: Spend Limits [HIGH VALUE]

Sprint 3 (Week 5-6):
├── A4: Policy Rule Engine [COMPLIANCE]
└── A9: Anomaly Dashboard [OPERATIONS]

Sprint 4 (Week 7-8):
├── A6: Anomaly Detection [INTELLIGENCE]
└── A7: Vendor Price Intelligence [PROCUREMENT]

Future:
├── A8: Payment Prediction
└── A10: AI Category Improvement
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Document Upload                                  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   Phase 1: Document Processor Lambda                     │
│                   (OCR Extraction - EXISTING)                            │
│                                                                          │
│   Upload → Validate → Convert → Extract → Store in Convex               │
│                                    │                                     │
│                    expense_claims (status: draft)                        │
│                    invoices (status: pending)                            │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      EventBridge (NEW - A1)                              │
│                                                                          │
│   Events: ExpenseClaimExtracted, ExpenseClaimSubmitted, InvoiceExtracted│
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
┌─────────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Duplicate Detector  │ │ Policy Checker  │ │ Limit Checker   │
│ Lambda (A3)         │ │ Lambda (A4)     │ │ Lambda (A5)     │
│                     │ │                 │ │                 │
│ - Fuzzy matching    │ │ - Rule engine   │ │ - Budget track  │
│ - Image hash        │ │ - Policy config │ │ - Quota alerts  │
└──────────┬──────────┘ └────────┬────────┘ └────────┬────────┘
           │                     │                   │
           └─────────────────────┼───────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Convex: expense_claim_flags                         │
│                                                                          │
│   { flag_type, severity, message, details, reviewed_by }                │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   Phase 2: Business Workflows (EXISTING)                 │
│                                                                          │
│   Manager Approval UI shows:                                             │
│   - Expense claim details                                                │
│   - AI-generated flags/warnings  ← NEW                                   │
│   - Override with justification  ← NEW                                   │
│                                                                          │
│   On Approve → Create accounting_entries + line_items                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## WINNING Scores Summary

| Issue | W | I | N | N | I | N | Total | Recommendation |
|-------|---|---|---|---|---|---|-------|----------------|
| A1: EventBridge | 8 | 8 | 9 | 7 | 8 | 8 | **48** | FILE |
| A2: Rule Engine | 7 | 7 | 8 | 7 | 8 | 8 | **45** | FILE |
| A3: Duplicates | 8 | 9 | 9 | 8 | 9 | 9 | **52** | FILE |
| A4: Policies | 8 | 8 | 8 | 9 | 8 | 9 | **50** | FILE |
| A5: Limits | 8 | 8 | 8 | 8 | 8 | 8 | **48** | FILE |
| A6: Anomalies | 7 | 7 | 7 | 7 | 7 | 7 | **42** | FILE |
| A7: Price Intel | 6 | 7 | 7 | 6 | 7 | 7 | **40** | FILE |
| A8: Payment | 6 | 6 | 7 | 6 | 6 | 7 | **38** | WAIT |
| A9: Dashboard | 6 | 6 | 6 | 5 | 6 | 6 | **35** | WAIT |
| A10: AI Loop | 5 | 6 | 5 | 5 | 5 | 6 | **32** | WAIT |

**Legend:** W=Worth, I=Impact, N=Now, N=Necessary, I=Implementable, N=Notable

---

## Cost Analysis

**Lambda Costs (Event-Driven):**
- EventBridge: $1/million events (~free for SME volume)
- Lambda invocations: $0.20/million requests
- Lambda duration: Minimal (analysis is fast)

**Estimated Monthly Cost:** < $5 for typical SME usage

**Why Event-Driven is Cost-Effective:**
- Only runs when needed (not polling)
- Sub-second execution for rule checks
- Shared container warmup with document processor
- No Step Functions pricing overhead

---

## Next Steps

1. **Create GitHub Issues** for Phase 1 (A1, A2) - Foundation
2. **Update Issue #77** to reference A3 architecture
3. **Add to Sprint Planning** - Phase 1 in next sprint
4. **Create CDK module** for agentic Lambda infrastructure
