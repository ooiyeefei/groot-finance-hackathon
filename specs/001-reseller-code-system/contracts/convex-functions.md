# API Contracts: Convex Functions Changes

## Modified: updateReferralStatus (mutation)

**Current**: Hardcoded `earning = planName === "pro" ? 200 : 80`

**Change**: Look up referral code's `type` field, branch commission:

```
Input: { referralId, newStatus, planName?, isAnnual? }

Logic (on first "paid"):
  1. Get referral → get referralCodeId → get referral_code.type
  2. If type === "partner_reseller":
       earning = planName === "pro" ? 800 : 300
     Else:
       earning = planName === "pro" ? 200 : 80
  3. Set estimatedEarning = earning
  4. Update referral_code aggregate: totalEarnings += earning
```

## Modified: getMyCode (query)

**Current**: Returns code object (already includes `type` field)

**Change**: None — `type` is already in the return value. Frontend just needs to read it.

## Unchanged

- `getMyReferrals` — no changes needed
- `getStats` — sums `estimatedEarning` from referrals table (already correct, amounts will differ by code type)
- `captureReferral` — first-touch attribution works regardless of code type
- `optIn` — only used for customer codes (auto-generate flow)
