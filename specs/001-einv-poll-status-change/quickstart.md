# Quickstart: E-Invoice Status Polling

## Prerequisites
- Node.js 20.x
- AWS credentials configured (for Lambda deployment)
- Convex CLI (`npx convex`)

## Development
```bash
# Start Convex dev server
npx convex dev

# Start Next.js dev server
npm run dev

# Build check (mandatory before completion)
npm run build
```

## Key Files
| File | Purpose |
|------|---------|
| `src/lambda/lhdn-polling/handler.ts` | Lambda polling handler — add email notifications |
| `src/domains/sales-invoices/components/lhdn-detail-section.tsx` | LHDN detail UI — implement stub |
| `src/lib/services/buyer-notification-service.ts` | Email notification service (existing) |
| `convex/functions/salesInvoices.ts` | Convex mutations (no changes needed) |

## Testing
1. Build passes: `npm run build`
2. Manual: Create a sales invoice with LHDN status "valid", verify detail section renders correctly
3. Manual: Verify "Review Required" badge appears in list when `lhdnReviewRequired` is true
