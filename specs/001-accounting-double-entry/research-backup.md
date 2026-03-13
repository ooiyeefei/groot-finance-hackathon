# Research: Double-Entry Accounting System Implementation

## 5. Currency Rate Priority

### Requirements Summary

From spec clarification (Session 2026-03-12):
- **Hybrid approach**: API default + Finance Admin manual override
- System uses existing `CurrencyService` (ExchangeRate-API.com free tier) for automated daily rates
- Finance Admin can optionally enter manual rates for specific currency pairs (effective date) which take precedence over API rates
- Provides compliance flexibility for businesses requiring official bank rates or government-mandated rates (e.g., Bank Negara Malaysia rates) while maintaining automation for most transactions

### Current Implementation Analysis

**File**: `/home/fei/fei/code/groot-finance/ar-recon/src/lib/services/currency-service.ts`

**Current Rate Resolution Flow**:
1. Check cache (5-minute TTL)
2. Try API providers in order (Fixer → ExchangeRate-API)
3. Fall back to static `FALLBACK_RATES`

**Key Methods**:
- `getCurrentRate(from, to)` - Returns current exchange rate
- `getHistoricalRate(from, to, date)` - Returns historical rate (only Fixer supports this)
- `convertAmount(amount, from, to)` - Full conversion with metadata

**Cache Structure**:
```typescript
interface CachedRate {
  rate: number
  timestamp: number
  date: string
}
// Cache key: `${from}_${to}_${date || 'current'}`
```

### Design: Manual Rate Override System

#### 1. Database Schema

**New Convex Table**: `manual_exchange_rates`

```typescript
manual_exchange_rates: defineTable({
  // Multi-tenant scope
  businessId: v.id("businesses"),

  // Currency pair
  fromCurrency: v.string(),     // e.g., "USD"
  toCurrency: v.string(),       // e.g., "MYR"

  // Rate details
  rate: v.number(),             // Exchange rate value
  effectiveDate: v.string(),    // ISO date YYYY-MM-DD

  // Audit trail
  enteredBy: v.id("users"),     // Finance Admin who entered the rate
  reason: v.optional(v.string()), // Optional note (e.g., "Bank Negara official rate")

  // System fields
  createdAt: v.number(),        // Unix timestamp
  updatedAt: v.optional(v.number()), // For PATCH operations
})
.index("by_business_pair_date", ["businessId", "fromCurrency", "toCurrency", "effectiveDate"])
.index("by_business", ["businessId"])
```

**Index Rationale**:
- `by_business_pair_date`: Primary lookup for finding manual rate for specific currency pair on/before transaction date
- `by_business`: List all manual rates for a business (admin UI)

#### 2. Query Pattern

**Find Manual Rate for Transaction Date**:
```typescript
// Find the most recent manual rate effective on or before the transaction date
// WHERE businessId = X
//   AND fromCurrency = "USD"
//   AND toCurrency = "MYR"
//   AND effectiveDate <= "2026-03-15"
// ORDER BY effectiveDate DESC
// LIMIT 1

const manualRate = await ctx.db
  .query("manual_exchange_rates")
  .withIndex("by_business_pair_date", (q) =>
    q
      .eq("businessId", businessId)
      .eq("fromCurrency", from)
      .eq("toCurrency", to)
  )
  .filter((q) => q.lte(q.field("effectiveDate"), transactionDate))
  .order("desc")
  .first();
```

**Forward Date Logic**:
- If transaction date is `2026-03-15` and manual rates exist for `2026-03-01` (rate: 4.65) and `2026-03-10` (rate: 4.70), use the `2026-03-10` rate
- Manual rates are effective from their `effectiveDate` forward until a newer manual rate is entered
- This matches standard accounting practice for exchange rate changes

#### 3. Code Modification

**Modified `CurrencyService.getCurrentRate()` Flow**:

```typescript
async getCurrentRate(
  from: SupportedCurrency,
  to: SupportedCurrency,
  businessId?: string,
  transactionDate?: string // ISO date, defaults to today
): Promise<number> {
  if (from === to) return 1

  const effectiveDate = transactionDate || new Date().toISOString().split('T')[0]

  // 1. Check manual rates first (if businessId provided)
  if (businessId) {
    const manualRate = await this.getManualRate(businessId, from, to, effectiveDate)
    if (manualRate !== null) {
      console.log(`[CurrencyService] Using manual rate ${from}→${to}: ${manualRate} (effective ${effectiveDate})`)
      return manualRate
    }
  }

  // 2. Check cache
  const cachedRate = this.cache.get(from, to, effectiveDate)
  if (cachedRate !== null) {
    console.log(`[CurrencyService] Using cached rate ${from}→${to}: ${cachedRate}`)
    return cachedRate
  }

  // 3. Try API providers
  for (const provider of this.providers) {
    try {
      console.log(`[CurrencyService] Fetching ${from}→${to} from ${provider.name}`)
      const rate = await provider.getCurrentRate(from, to)

      // Cache the successful result
      this.cache.set(from, to, rate, effectiveDate)
      console.log(`[CurrencyService] Got rate ${from}→${to}: ${rate} from ${provider.name}`)
      return rate
    } catch (error) {
      console.warn(`[CurrencyService] Provider ${provider.name} failed:`, error)
      continue
    }
  }

  // 4. Fall back to static rates
  console.warn(`[CurrencyService] All providers failed, using fallback rate for ${from}→${to}`)
  const fallbackRate = getFallbackRate(from, to)
  this.cache.set(from, to, fallbackRate, effectiveDate)
  return fallbackRate
}

private async getManualRate(
  businessId: string,
  from: SupportedCurrency,
  to: SupportedCurrency,
  effectiveDate: string
): Promise<number | null> {
  // This would be implemented using Convex query in a Next.js API route context
  // For now, return null - actual implementation will use Convex client
  // See API route implementation below
  return null
}
```

**Note**: `CurrencyService` is a pure TypeScript class that runs in browser/API context. It cannot directly query Convex. The manual rate lookup must be done in API routes before calling `CurrencyService`.

#### 4. API Route Implementation

**New Routes**: `/api/v1/accounting/currency-rates`

```typescript
// POST /api/v1/accounting/currency-rates
// Create new manual exchange rate
export async function POST(request: NextRequest) {
  const { auth } = getClerkAuth(request)
  const { userId } = auth()

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check Finance Admin role
  const userRole = await getUserRole(userId)
  if (userRole !== 'owner' && userRole !== 'finance_admin') {
    return NextResponse.json({ error: 'Forbidden - Finance Admin only' }, { status: 403 })
  }

  const body = await request.json()
  const { fromCurrency, toCurrency, rate, effectiveDate, reason } = body

  // Validation
  if (!fromCurrency || !toCurrency || !rate || !effectiveDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Check if rate already exists for this date
  const existingRate = await ctx.db
    .query("manual_exchange_rates")
    .withIndex("by_business_pair_date", (q) =>
      q
        .eq("businessId", businessId)
        .eq("fromCurrency", fromCurrency)
        .eq("toCurrency", toCurrency)
        .eq("effectiveDate", effectiveDate)
    )
    .first()

  if (existingRate) {
    return NextResponse.json(
      { error: 'Manual rate already exists for this date. Use PATCH to update.' },
      { status: 409 }
    )
  }

  // Insert new manual rate
  const manualRateId = await ctx.db.insert("manual_exchange_rates", {
    businessId,
    fromCurrency,
    toCurrency,
    rate,
    effectiveDate,
    enteredBy: userId,
    reason: reason || undefined,
    createdAt: Date.now(),
  })

  return NextResponse.json({ id: manualRateId }, { status: 201 })
}

// PATCH /api/v1/accounting/currency-rates/[rateId]
// Update existing manual rate
export async function PATCH(request: NextRequest, { params }: { params: { rateId: string } }) {
  // Similar auth checks as POST

  const { rate, reason } = await request.json()

  await ctx.db.patch(params.rateId, {
    rate,
    reason,
    updatedAt: Date.now(),
  })

  return NextResponse.json({ success: true })
}

// DELETE /api/v1/accounting/currency-rates/[rateId]
// Delete manual rate
export async function DELETE(request: NextRequest, { params }: { params: { rateId: string } }) {
  // Similar auth checks as POST

  await ctx.db.delete(params.rateId)

  return NextResponse.json({ success: true })
}

// GET /api/v1/accounting/currency-rates
// List all manual rates for business
export async function GET(request: NextRequest) {
  const { auth } = getClerkAuth(request)
  const { userId } = auth()

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const businessId = await getBusinessId(userId)

  const manualRates = await ctx.db
    .query("manual_exchange_rates")
    .withIndex("by_business", (q) => q.eq("businessId", businessId))
    .order("desc")
    .collect()

  return NextResponse.json({ rates: manualRates })
}
```

#### 5. Integration with Accounting Entries

**When Creating/Updating Accounting Entry**:

```typescript
// In POST /api/v1/accounting-entries route
const { original_currency, home_currency, transaction_date, original_amount } = body

// Query manual rate BEFORE calling CurrencyService
const manualRate = await ctx.db
  .query("manual_exchange_rates")
  .withIndex("by_business_pair_date", (q) =>
    q
      .eq("businessId", businessId)
      .eq("fromCurrency", original_currency)
      .eq("toCurrency", home_currency)
  )
  .filter((q) => q.lte(q.field("effectiveDate"), transaction_date))
  .order("desc")
  .first()

let exchangeRate: number
let rateSource: string

if (manualRate) {
  exchangeRate = manualRate.rate
  rateSource = `manual_${manualRate.effectiveDate}`
} else {
  // Fall back to API/cache/fallback
  const conversion = await currencyService.convertAmount(
    original_amount,
    original_currency,
    home_currency
  )
  exchangeRate = conversion.exchange_rate
  rateSource = conversion.rate_source
}

const homeCurrencyAmount = Number((original_amount * exchangeRate).toFixed(2))

// Save accounting entry with exchange_rate and rate_source
await ctx.db.insert("accounting_entries", {
  ...otherFields,
  original_currency,
  original_amount,
  home_currency,
  home_currency_amount: homeCurrencyAmount,
  exchange_rate: exchangeRate,
  exchange_rate_date: transaction_date,
  // Add rate_source field to schema
  rate_source: rateSource,
})
```

#### 6. UI Components

**Finance Admin - Manual Rates Management Page**:

Location: `/app/[locale]/(authenticated)/accounting/currency-rates/page.tsx`

Features:
1. **List View**: Table showing all manual rates (currency pair, rate, effective date, entered by, reason)
2. **Add Rate Button**: Opens modal/form to enter new manual rate
3. **Edit Rate**: Inline editing or modal for updating rate value
4. **Delete Rate**: Confirmation dialog before deletion
5. **Filter/Search**: Filter by currency pair or date range

**Form Fields**:
- From Currency (dropdown)
- To Currency (dropdown)
- Rate (number input, 6 decimal places)
- Effective Date (date picker)
- Reason (textarea, optional)

**Validation**:
- Rate must be positive number
- Effective date cannot be in future (prevents accidental forward rates)
- Currency pair must be valid (from ≠ to)

#### 7. Rate Source Tracking

**Add `rate_source` field to Convex schema**:

```typescript
// In convex/schema.ts - accounting_entries table
exchange_rate: v.number(),
exchange_rate_date: v.string(), // ISO date
rate_source: v.optional(v.string()), // "manual_2026-03-01" | "Fixer" | "ExchangeRate-API" | "fallback"
```

**Benefits**:
- Audit trail showing which rates were manual vs API
- Compliance reporting (show which transactions used official bank rates)
- Debugging (identify if wrong rate source was used)

#### 8. Migration Considerations

**Backwards Compatibility**:
- `businessId` and `transactionDate` parameters are **optional** in `getCurrentRate()`
- If not provided, system behaves exactly as before (cache → API → fallback)
- Only new accounting entry creation flow passes these parameters

**Existing Accounting Entries**:
- Old entries without `rate_source` field are fine (field is optional)
- Can backfill `rate_source` if needed: check exchange_rate value against API/manual rates to infer source

#### 9. Security Considerations

**Role-Based Access Control**:
- Only Finance Admin can create/edit/delete manual rates
- Owner can view manual rates (read-only)
- Manager/Employee have no access to currency rate management

**Data Integrity**:
- Manual rates are immutable once referenced by accounting entries (soft delete or versioning)
- Consider adding `isActive: v.boolean()` field to allow deactivation instead of deletion

**Audit Trail**:
- Every manual rate stores `enteredBy` (who created it)
- Consider adding audit_events entry for create/update/delete of manual rates

#### 10. Example TypeScript Implementation

**New Convex Query**: `convex/functions/manualExchangeRates.ts`

```typescript
import { v } from "convex/values"
import { query, mutation } from "../_generated/server"

// Query manual rate for specific currency pair and date
export const getManualRate = query({
  args: {
    businessId: v.id("businesses"),
    fromCurrency: v.string(),
    toCurrency: v.string(),
    effectiveDate: v.string(), // ISO date YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    const manualRate = await ctx.db
      .query("manual_exchange_rates")
      .withIndex("by_business_pair_date", (q) =>
        q
          .eq("businessId", args.businessId)
          .eq("fromCurrency", args.fromCurrency)
          .eq("toCurrency", args.toCurrency)
      )
      .filter((q) => q.lte(q.field("effectiveDate"), args.effectiveDate))
      .order("desc")
      .first()

    return manualRate
  },
})

// List all manual rates for business
export const listManualRates = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const rates = await ctx.db
      .query("manual_exchange_rates")
      .withIndex("by_business", (q) => q.eq("businessId", args.businessId))
      .order("desc")
      .collect()

    return rates
  },
})

// Create manual rate (Finance Admin only)
export const createManualRate = mutation({
  args: {
    businessId: v.id("businesses"),
    fromCurrency: v.string(),
    toCurrency: v.string(),
    rate: v.number(),
    effectiveDate: v.string(),
    enteredBy: v.id("users"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if rate already exists for this date
    const existing = await ctx.db
      .query("manual_exchange_rates")
      .withIndex("by_business_pair_date", (q) =>
        q
          .eq("businessId", args.businessId)
          .eq("fromCurrency", args.fromCurrency)
          .eq("toCurrency", args.toCurrency)
          .eq("effectiveDate", args.effectiveDate)
      )
      .first()

    if (existing) {
      throw new Error("Manual rate already exists for this date")
    }

    const rateId = await ctx.db.insert("manual_exchange_rates", {
      ...args,
      createdAt: Date.now(),
    })

    return rateId
  },
})

// Update manual rate
export const updateManualRate = mutation({
  args: {
    rateId: v.id("manual_exchange_rates"),
    rate: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.rateId, {
      rate: args.rate,
      reason: args.reason,
      updatedAt: Date.now(),
    })

    return { success: true }
  },
})

// Delete manual rate
export const deleteManualRate = mutation({
  args: {
    rateId: v.id("manual_exchange_rates"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.rateId)
    return { success: true }
  },
})
```

#### 11. Testing Strategy

**Unit Tests**:
1. Manual rate query returns correct rate for given date
2. Manual rate query returns null when no rate found
3. Rate priority: manual > cache > API > fallback
4. Cache invalidation when manual rate is added/updated/deleted

**Integration Tests**:
1. Create accounting entry with manual rate
2. Create accounting entry without manual rate (falls back to API)
3. Update manual rate and verify new transactions use new rate
4. Delete manual rate and verify transactions fall back to API

**UAT Scenarios**:
1. Finance Admin enters Bank Negara Malaysia rate for USD→MYR effective 2026-03-01
2. Create expense claim dated 2026-03-05 with USD invoice
3. Verify accounting entry uses manual rate (not API rate)
4. Generate P&L report showing USD expenses converted at manual rate
5. Export accounting data showing `rate_source: "manual_2026-03-01"`

### Summary

**Priority Order**:
1. **Manual rates** (business-specific, Finance Admin entered) → highest priority
2. **API rates** (ExchangeRate-API/Fixer) → default automation
3. **Fallback rates** (static constants) → last resort

**Key Benefits**:
- ✅ Compliance flexibility (official bank rates, government mandates)
- ✅ Audit trail (rate source tracking)
- ✅ Backwards compatible (optional parameters)
- ✅ Finance Admin control (manual override when needed)
- ✅ Automation by default (most transactions use API)

**Implementation Checklist**:
- [ ] Add `manual_exchange_rates` table to Convex schema
- [ ] Create Convex queries/mutations for manual rate CRUD
- [ ] Add API routes under `/api/v1/accounting/currency-rates`
- [ ] Modify accounting entry creation to check manual rates first
- [ ] Add `rate_source` field to `accounting_entries` schema
- [ ] Build Finance Admin UI for manual rate management
- [ ] Add role-based access control (Finance Admin only)
- [ ] Write unit tests for rate priority logic
- [ ] Add UAT test cases for manual rate scenarios
- [ ] Deploy Convex schema changes to production
