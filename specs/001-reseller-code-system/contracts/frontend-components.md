# API Contracts: Frontend Component Changes

## referral-utils.ts

### calculateEarning(planName, isAnnual, codeType?)

**Current**: `(planName: string, isAnnual?: boolean) => number`
**New**: `(planName: string, isAnnual?: boolean, codeType?: string) => number`

```
If !isAnnual → 0
If codeType === "partner_reseller":
  planName === "pro" → 800, else → 300
Else:
  planName === "pro" → 200, else → 80
```

### getShareMessage(code, codeType?)

**Current**: Hardcoded "RM 100 off"
**New**: codeType === "partner_reseller" → "RM 200 off", else → "RM 100 off"

### New: getCommissionRange(codeType?)

```
If codeType === "partner_reseller" → { min: 300, max: 800, discount: 200 }
Else → { min: 80, max: 200, discount: 100 }
```

## Component Props Changes

### ReferralCodeDisplay
**New prop**: `codeType: string`
**Change**: "RM 100 off" → dynamic based on codeType

### ReferralList
**Change**: Read codeType from parent/context, update empty state copy

### ReferralStatsCards
**Change**: No prop change needed — earnings already summed correctly from DB

### ReferralDashboard (parent)
**Change**: Pass `code.type` down to child components
