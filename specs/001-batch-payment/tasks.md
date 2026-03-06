# Tasks: Batch Payment Processing

## Task 1: Convex Schema Updates (P1)
- Add `paymentMethod`, `paymentReference`, `paidBy` fields to expense_claims table
- Add `sentBackBy`, `sentBackReason`, `sentBackAt` fields for send-back flow
- Deploy schema changes

## Task 2: Convex Mutations (P1)
- Create `batchMarkAsPaid` mutation in expenseClaims.ts
- Create `sendBackClaim` mutation in expenseClaims.ts
- Create `getPendingPaymentClaims` query grouped by submission

## Task 3: Rewrite ReimbursementQueueContent (P1)
- Replace existing basic component with submission-grouped view
- Expandable submissions with individual claims
- Checkbox at submission level + individual claim level
- Running totals per currency
- "Mark as Paid" + "Send Back" actions

## Task 4: Build & Deploy (P1)
- Run npm run build
- Run npx convex deploy --yes
- Commit and push
