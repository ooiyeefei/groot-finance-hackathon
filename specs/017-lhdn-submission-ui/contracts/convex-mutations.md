# Convex Mutation Contracts: LHDN Submission

## Mutation: `salesInvoices.submitToLhdn`

**Purpose**: Initiate LHDN submission for a sales invoice. Validates prerequisites, sets status to "pending", and records the submission timestamp.

### Input

```typescript
{
  invoiceId: Id<"sales_invoices">   // Required: invoice to submit
  businessId: Id<"businesses">       // Required: business context
  useGeneralTin?: boolean            // Optional: if true, skip buyer TIN warning
}
```

### Validation (server-side)

1. Authenticate user (Clerk identity)
2. Verify membership: user must have `owner` or `finance_admin` role for the business
3. Verify invoice exists and belongs to the business
4. Verify invoice status is "sent" (not draft, paid, void, etc.)
5. Verify `lhdnStatus` is undefined (not already submitted)
6. Verify business has `lhdnTin`, `businessRegistrationNumber`, and `msicCode` populated
7. If `useGeneralTin` is false/undefined, verify `customerSnapshot.tin` is populated (warn otherwise)

### Output

```typescript
{
  success: true
  invoiceId: Id<"sales_invoices">
  lhdnStatus: "pending"
}
```

### Side Effects

- Sets `lhdnStatus` to "pending"
- Sets `lhdnSubmittedAt` to `Date.now()`
- Sets `einvoiceType` to auto-determined value based on document type

### Errors

| Error | Condition |
|-------|-----------|
| "Not authenticated" | No Clerk identity |
| "Not authorized" | User role is not owner or finance_admin |
| "Invoice not found" | Invoice doesn't exist or wrong business |
| "Invoice must be sent before submitting to LHDN" | Invoice status is not "sent" |
| "Invoice already submitted to LHDN" | lhdnStatus is not undefined |
| "Business LHDN configuration incomplete" | Missing lhdnTin, BRN, or msicCode |

---

## Mutation: `salesInvoices.resubmitToLhdn`

**Purpose**: Resubmit an invalid invoice to LHDN after corrections.

### Input

```typescript
{
  invoiceId: Id<"sales_invoices">
  businessId: Id<"businesses">
}
```

### Validation

1. All validations from `submitToLhdn` EXCEPT:
   - Instead of checking `lhdnStatus` is undefined, check it is "invalid"

### Output

Same as `submitToLhdn`.

### Side Effects

- Sets `lhdnStatus` to "pending"
- Updates `lhdnSubmittedAt` to `Date.now()`
- Clears `lhdnValidationErrors` (replaced on next validation response)
- Clears `lhdnValidatedAt`
- Clears `lhdnDocumentUuid`, `lhdnLongId`, `lhdnDocumentHash` (new submission = new document)
