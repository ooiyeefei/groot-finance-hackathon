# Research: Batch Payment Processing

## R1: Manager Approvals Page Structure

**Decision**: Add "Payment Processing" as a new tab after the existing Approval tab
**Rationale**: Per clarification, Expense Claims page is strictly for individual users. Manager Approvals follows the approve > pay workflow.
**Alternatives considered**: Accounting page (rejected — too far from approval context), Expense Claims page (rejected — that's for individual user submissions)

## R2: Expense Claim to Accounting Entry Link

**Decision**: Use existing `expense_claims` schema which tracks status transitions. Claims with status "approved" are candidates for payment processing. The `paidAt` field already exists in the schema.
**Rationale**: Schema already supports the `reimbursed` status and `paidAt` timestamp. No schema changes needed for core functionality.
**Alternatives considered**: Creating a separate payment_batches table (rejected — over-engineering for MVP; shared timestamp + admin identity on claims is sufficient)

## R3: Multi-Currency Handling

**Decision**: Show separate running totals per currency. Mixed-currency batches are allowed.
**Rationale**: Per clarification, totals must never be combined across currencies. Finance admins process reimbursements in the original currency.
**Alternatives considered**: Block mixed-currency selection (rejected — too restrictive), combine with conversion (rejected — accounting accuracy concern)

## R4: Batch Processing Atomicity

**Decision**: Use a single Convex mutation that iterates over all selected claim IDs, updating each claim and its linked accounting entry within the same transaction.
**Rationale**: Convex mutations are transactional by default. A single mutation call ensures all-or-nothing processing.
**Alternatives considered**: Individual mutations per claim (rejected — no atomicity, partial failure risk)

## R5: Payment Details Storage

**Decision**: Add optional fields to expense_claims: `paymentMethod`, `paymentReference`, `paidBy` (user ID of the processing admin). Reuse existing `paidAt`.
**Rationale**: Minimal schema additions. The `paidAt` field already exists. Adding method, reference, and admin identity completes the audit trail.
**Alternatives considered**: Separate payment_records table (rejected — unnecessary indirection for expense claim reimbursements)
