# Two Separate E-Invoice Flows (CRITICAL DISTINCTION)

**Date**: 2026-03-16
**Status**: ✅ Bug Fixed — Polling logic corrected

---

## 🚨 CRITICAL: These Are TWO COMPLETELY DIFFERENT Flows

### Flow A: OUTGOING E-Invoice Requests (Groot → Merchants)
**Purpose**: Request e-invoices FROM small merchants who don't have automated systems

```
┌─────────────────────────────────────────────────────────────────┐
│ Employee creates expense claim in Groot                          │
│ - Receipt from FamilyMart, 7-Eleven, Mr. D.I.Y., etc.          │
│ - Employee wants to attach official e-invoice                   │
└─────────────────┬───────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ Groot initiates e-invoice REQUEST to merchant                   │
│ - Triggers CUA (Computer Use Agent) / Playwright automation     │
│ - Opens merchant's e-invoice web form                           │
│ - Fills form with business details                              │
│ - Submits request                                               │
└─────────────────┬───────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ Merchant emails e-invoice back                                   │
│ - Sent to business email OR Groot system email                  │
│ - SES receives email → Lambda processes → attaches to claim     │
└─────────────────────────────────────────────────────────────────┘
```

**Tech Stack**:
- **Trigger**: User clicks "Request E-Invoice" in Groot UI
- **Method**: Browser automation (Playwright + CUA)
- **Status field**: `expense_claims.einvoiceRequestStatus: "requesting" | "requested" | "received"`
- **NOT related to LHDN polling**

**Use Case**: Small merchant receipts (restaurants, retail stores, petrol stations)

---

### Flow B: INCOMING Supplier E-Invoices (Supplier → LHDN → Groot)
**Purpose**: Receive e-invoices FROM suppliers who submit to LHDN

```
┌─────────────────────────────────────────────────────────────────┐
│ Supplier issues e-invoice (via their own system)                │
│ - Office supplies vendor, IT services, consultants, etc.        │
│ - Supplier has proper e-invoicing system integrated with LHDN   │
└─────────────────┬───────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ Supplier submits e-invoice to LHDN MyInvois portal             │
│ - LHDN validates the e-invoice                                  │
│ - LHDN stores it in their system                                │
│ - Invoice marked as "Valid" in LHDN                             │
└─────────────────┬───────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ Groot polls LHDN API every 5 minutes (Lambda)                  │
│ - Calls: GET /api/v1.0/documents/recent?InvoiceDirection=Received│
│ - Uses business LHDN credentials (Client ID + Secret)          │
│ - Retrieves all e-invoices issued TO this business             │
└─────────────────┬───────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│ Groot stores in einvoice_received_documents table              │
│ - Auto-matches to expense claims (4-tier matching)              │
│ - Shows in Groot UI with "Valid" status                         │
│ - User can reject within 72 hours (buyer rejection flow)        │
└─────────────────────────────────────────────────────────────────┘
```

**Tech Stack**:
- **Trigger**: Lambda cron (EventBridge every 5 min)
- **Method**: LHDN API polling (`GET /documents/recent`)
- **Status field**: `einvoice_received_documents.status: "valid" | "cancelled" | "rejected"`
- **THIS is what LHDN polling does**

**Use Case**: All supplier e-invoices (independent of expense claims)

---

## 🐛 The Bug (Fixed 2026-03-16)

### Before Fix (WRONG)

**Code** (`convex/functions/system.ts`):
```typescript
// BUG: Only polled businesses with expense claims in "requesting" status
const hasPending = pendingClaims.some(
  (claim) => claim.einvoiceRequestStatus === "requesting"
);

if (hasPending) {
  // Only poll this business
  result.push({ businessId, businessTin, lhdnClientId });
}
```

**Problem**:
- ❌ Only polled businesses with OUTGOING requests (Flow A)
- ❌ Missed supplier e-invoices from Flow B
- ❌ Supplier can submit e-invoice to LHDN at ANY time
- ❌ Business won't receive supplier e-invoices unless they have expense claims requesting merchant e-invoices
- ❌ Completely broke the buyer rejection flow (no incoming e-invoices received!)

**Example failure scenario**:
```
Supplier issues e-invoice to Business A
  ↓
Submits to LHDN (Business A is the buyer)
  ↓
LHDN validates and stores
  ↓
Groot polling Lambda runs
  ↓
Checks: "Does Business A have expense claims with einvoiceRequestStatus = requesting?"
  ↓
NO → Business A NOT polled
  ↓
❌ Supplier e-invoice NEVER received by Groot
❌ Business never sees it in their dashboard
❌ Buyer rejection flow doesn't work
```

---

### After Fix (CORRECT) ✅

**Code** (`convex/functions/system.ts`):
```typescript
// FIXED: Poll ALL businesses with LHDN credentials
return businesses
  .filter((b) =>
    b.lhdnTin &&
    b.lhdnClientId &&
    !b.deletedAt
  )
  .map((biz) => ({
    businessId: biz._id,
    businessTin: biz.lhdnTin,
    lhdnClientId: biz.lhdnClientId,
  }));
```

**Correct behavior**:
- ✅ Polls ALL businesses with LHDN credentials configured
- ✅ Receives supplier e-invoices regardless of expense claim status
- ✅ Supplier e-invoices appear in Groot automatically
- ✅ Buyer rejection flow works correctly
- ✅ Flow A (outgoing requests) and Flow B (incoming e-invoices) are independent

**Example success scenario**:
```
Supplier issues e-invoice to Business A
  ↓
Submits to LHDN (Business A is the buyer)
  ↓
LHDN validates and stores
  ↓
Groot polling Lambda runs
  ↓
Checks: "Does Business A have LHDN credentials?"
  ↓
YES → Poll Business A
  ↓
LHDN API returns supplier e-invoice
  ↓
✅ Groot stores in einvoice_received_documents
✅ Shows in dashboard with countdown timer
✅ Buyer can reject within 72 hours
```

---

## 💰 Cost Impact of Fix

### Before Fix (Conditional Polling)
```
Only polled: 10 businesses (with pending outgoing requests)
API calls: 2,880/day
```

### After Fix (Poll All Configured Businesses)
```
Polls: ALL 50 businesses with LHDN credentials
API calls: 14,400/day

Increase: 5x more API calls
```

**Why this is acceptable:**
1. ✅ **Essential for core functionality** — without this, buyer rejection flow doesn't work
2. ✅ **Still within rate limits** — 14,400/day vs 17,280/day limit (83% usage)
3. ✅ **Lambda cost still FREE** — well within AWS free tier
4. ✅ **Tiered polling already reduces Pass 2 by 60%**

**At scale (100 businesses):**
```
Pass 1 (Receive): 100 businesses × 288 invocations/day = 28,800 API calls/day
Pass 2 (Status):  20 businesses × 115 invocations/day = 2,300 API calls/day (tiered)
Total: 31,100 API calls/day

Monthly: 933,000 calls/month
Rate limit: 518,400 calls/month
Usage: 180% ⚠️ Would need batching
```

**Solution at 100+ businesses:**
- Implement batching (split businesses across multiple Lambda invocations)
- Add business-level toggle to opt-out of polling (rare)

---

## 🎯 When to Use Each Flow

### Use Flow A (OUTGOING Requests) When:
- ✅ Small merchant with NO e-invoicing system (FamilyMart, 7-Eleven)
- ✅ Merchant has web form for e-invoice requests
- ✅ Business wants to request e-invoice retroactively
- ✅ Expense claim exists but no e-invoice received yet

**Trigger**: User clicks "Request E-Invoice" button in expense claim

---

### Use Flow B (INCOMING via LHDN) When:
- ✅ Supplier has proper e-invoicing system
- ✅ Supplier submits e-invoices to LHDN directly
- ✅ Automatic receipt of supplier e-invoices
- ✅ No manual action needed from buyer

**Trigger**: Automatic (Lambda cron every 5 min)

---

## 📊 Comparison Table

| Aspect | Flow A (OUTGOING) | Flow B (INCOMING) |
|--------|-------------------|-------------------|
| **Direction** | Groot → Merchant | Supplier → LHDN → Groot |
| **Trigger** | User button click | Automatic (cron) |
| **Method** | Browser automation | LHDN API polling |
| **Status field** | `einvoiceRequestStatus` | `einvoice_received_documents.status` |
| **Use case** | Small merchants | Proper suppliers |
| **Can reject?** | ❌ NO (not from LHDN) | ✅ YES (72h window) |
| **Polling needed?** | ❌ NO | ✅ YES (this is the bug fix) |

---

## 🔧 Implementation Files

### Flow A (OUTGOING)
- **Trigger**: `src/domains/expense-claims/components/einvoice-section.tsx`
- **Automation**: `src/trigger/einvoice-form-fill.ts` (CUA/Playwright)
- **Email receipt**: `src/lambda/einvoice-email-processor/handler.ts`
- **Status**: `expense_claims.einvoiceRequestStatus`

### Flow B (INCOMING)
- **Polling**: `src/lambda/lhdn-polling/handler.ts` ✅ **Fixed**
- **Discovery**: `convex/functions/system.ts:getBusinessesForLhdnPolling` ✅ **Fixed**
- **Storage**: `convex/functions/system.ts:processLhdnReceivedDocuments`
- **Rejection**: `convex/functions/einvoiceReceivedDocuments.ts:rejectReceivedDocument`
- **Status**: `einvoice_received_documents.status`

---

## ✅ Final Status

| Component | Before | After | Status |
|-----------|--------|-------|--------|
| **Flow A (OUTGOING)** | ✅ Working | ✅ Working | Unchanged |
| **Flow B (INCOMING)** | ❌ BROKEN | ✅ FIXED | Deployed |
| **Polling logic** | Conditional (wrong) | All businesses (correct) | ✅ Fixed |
| **Cost impact** | Lower but broken | Higher but correct | Acceptable |
| **Buyer rejection** | ❌ Not working | ✅ Working | ✅ Fixed |

---

**Bug discovered**: 2026-03-16 (by user catching my explanation error)
**Bug fixed**: 2026-03-16
**Deployed**: ✅ Production

**Lesson**: Always distinguish between OUTGOING requests and INCOMING e-invoices!
