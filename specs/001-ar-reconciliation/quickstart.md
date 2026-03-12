# Quickstart: AR Reconciliation

## Prerequisites
- Convex dev server running (`npx convex dev`)
- Next.js dev server running (`npm run dev`)
- At least one sales invoice in the system to match against

## Development Setup

1. **Deploy schema changes:**
   ```bash
   npx convex deploy --yes
   ```

2. **Start dev:**
   ```bash
   npm run dev
   ```

3. **Navigate to AR Reconciliation:**
   - Go to `/invoices`
   - Click the "AR" tab
   - Click the "Reconciliation" sub-tab

## Testing the Import Flow

1. Click "Import Sales Statement"
2. Upload a CSV with columns like: Order ID, Date, Product, Qty, Amount, Fee, Net
3. Map columns (auto-detection should handle most cases)
4. Confirm import → orders appear in reconciliation table
5. Matching runs automatically → check matched/unmatched/variance counts

## Sample CSV Format

```csv
Order ID,Order Date,Product Name,Qty,Unit Price,Total Amount,Commission,Net Payout,Currency
ORD-001,2026-03-01,Widget A,2,50.00,100.00,5.00,95.00,MYR
ORD-002,2026-03-02,Widget B,1,200.00,200.00,10.00,190.00,MYR
```
