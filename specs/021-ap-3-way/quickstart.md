# Quickstart: AP 3-Way Matching

**Branch**: `021-ap-3-way` | **Date**: 2026-03-11

## Build Order

### Phase 1: Schema & Foundation
1. Add `purchase_orders`, `goods_received_notes`, `po_matches`, `matching_settings` tables to `convex/schema.ts`
2. Add `purchaseOrderId` and `matchId` fields to `accounting_entries`
3. Deploy schema: `npx convex deploy --yes`
4. Create `convex/functions/purchaseOrders.ts` — CRUD + number generation
5. Create `convex/functions/goodsReceivedNotes.ts` — CRUD + PO status update
6. Create `convex/functions/poMatches.ts` — matching engine + variance detection
7. Create `convex/functions/matchingSettings.ts` — settings CRUD

### Phase 2: CSV Parser Extension
8. Add `PURCHASE_ORDER_FIELDS` and `GRN_FIELDS` to `src/lib/csv-parser/lib/schema-definitions.ts`
9. Extend `SchemaType` in `src/lib/csv-parser/types/index.ts` to include `"purchase_order" | "goods_received_note"`
10. Update `getSchemaFields()` to return new field definitions

### Phase 3: UI — Purchase Orders
11. Create `src/domains/payables/components/po-list.tsx` — PO list with filters
12. Create `src/domains/payables/components/po-form.tsx` — Create/edit PO form
13. Create `src/domains/payables/components/po-detail.tsx` — PO detail view
14. Create `src/domains/payables/hooks/use-purchase-orders.ts` — Convex query hooks
15. Add "Purchase Orders" tab to AP page

### Phase 4: UI — Goods Received Notes
16. Create `src/domains/payables/components/grn-list.tsx` — GRN list
17. Create `src/domains/payables/components/grn-form.tsx` — GRN form (pre-populated from PO)
18. Create `src/domains/payables/hooks/use-grns.ts` — Convex query hooks
19. Add "Goods Received" tab to AP page

### Phase 5: Matching Engine & UI
20. Create `src/domains/payables/components/match-review.tsx` — Side-by-side comparison
21. Create `src/domains/payables/components/match-list.tsx` — Match list with filters
22. Create `src/domains/payables/components/unmatched-report.tsx` — Unmatched documents tabs
23. Create `src/domains/payables/hooks/use-matches.ts` — Convex query hooks
24. Add "Matching" tab to AP page
25. Integrate auto-match trigger in invoice processing flow

### Phase 6: Dashboard & Settings
26. Create `src/domains/payables/components/matching-summary.tsx` — Dashboard cards
27. Create `src/domains/payables/components/matching-settings.tsx` — Tolerance config
28. Integrate matching summary into existing AP dashboard

## Key Files

| Purpose | File |
|---------|------|
| Schema | `convex/schema.ts` |
| PO functions | `convex/functions/purchaseOrders.ts` |
| GRN functions | `convex/functions/goodsReceivedNotes.ts` |
| Match functions | `convex/functions/poMatches.ts` |
| Settings functions | `convex/functions/matchingSettings.ts` |
| CSV schemas | `src/lib/csv-parser/lib/schema-definitions.ts` |
| CSV types | `src/lib/csv-parser/types/index.ts` |
| PO components | `src/domains/payables/components/po-*.tsx` |
| GRN components | `src/domains/payables/components/grn-*.tsx` |
| Match components | `src/domains/payables/components/match-*.tsx` |
| Hooks | `src/domains/payables/hooks/use-purchase-orders.ts`, `use-grns.ts`, `use-matches.ts` |

## Dependencies

- Convex schema deployed before any function development
- PO CRUD before GRN (GRN references POs)
- PO + GRN CRUD before matching engine
- Matching engine before review UI
- All CRUD before dashboard integration

## Testing

```bash
npm run build          # Must pass
npx convex deploy --yes  # Deploy schema + functions to prod
```
