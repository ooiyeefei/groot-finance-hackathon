# Quickstart: AR/AP Two-Level Tab Restructure

**Date**: 2026-02-15
**Feature**: 015-ar-ap-tab-restructure

## Prerequisites

- Node.js 20.x
- `npm install` (all dependencies already present — no new packages)
- Convex dev server: `npx convex dev`
- Next.js dev server: `npm run dev`

## No Backend Changes

This feature is **purely frontend**. No new Convex tables, queries, mutations, or indexes. All data sources already exist:

| Data | Convex Query | Already Used By |
|------|-------------|-----------------|
| AR Aging | `payments.getAgingReport` | `aging-report.tsx` |
| Debtor List | `payments.getDebtorList` | `debtor-list.tsx` |
| Vendor Items | `vendorPriceHistory.getVendorItems` | (backend only) |
| Price Changes | `vendorPriceHistory.detectPriceChanges` | (backend only) |
| Cross-Vendor | `vendorPriceHistory.getCrossVendorComparison` | (backend only) |
| Price History | `vendorPriceHistory.getVendorPriceHistory` | (backend only) |
| Item History | `vendorPriceHistory.getItemPriceHistory` | (backend only) |

## Key Files to Modify/Create

### Replace (1 file)
- `src/domains/invoices/components/invoices-tab-container.tsx` — rewrite as two-level AR/AP container

### Create (2 files)
- `src/domains/sales-invoices/components/ar-dashboard.tsx` — AR analytics dashboard
- `src/domains/payables/components/price-intelligence.tsx` — price history/alerts/comparison UI

### Modify (2 files)
- `src/app/[locale]/payables/page.tsx` — redirect to `/invoices#ap-dashboard`
- `src/components/ui/sidebar.tsx` — remove Payables link

### Delete (1 file)
- `src/domains/payables/components/payables-tab-container.tsx` — replaced by unified container

### Existing components (move under new tabs, no code changes)
- `documents-container.tsx` → AP > Incoming Invoices
- `sales-invoice-list.tsx` → AR > Sales Invoices
- `debtor-list.tsx` → AR > Debtors
- `catalog-item-manager.tsx` → AR > Product Catalog
- `ap-dashboard.tsx` → AP > Dashboard
- `vendor-manager.tsx` → AP > Vendors

## Architecture Pattern

### Two-Level Tabs (Radix UI nesting)

```tsx
<Tabs value={topLevel} onValueChange={setTopLevel}>        {/* Level 1: AR | AP */}
  <TabsList>
    <TabsTrigger value="ar">Account Receivables</TabsTrigger>
    <TabsTrigger value="ap">Account Payables</TabsTrigger>
  </TabsList>
  <TabsContent value="ar">
    <Tabs value={arSubTab} onValueChange={setArSubTab}>    {/* Level 2: AR sub-tabs */}
      <TabsList>...</TabsList>
      <TabsContent value="dashboard"><ARDashboard /></TabsContent>
      <TabsContent value="sales"><SalesInvoiceList /></TabsContent>
      ...
    </Tabs>
  </TabsContent>
  <TabsContent value="ap">
    <Tabs value={apSubTab} onValueChange={setApSubTab}>    {/* Level 2: AP sub-tabs */}
      ...
    </Tabs>
  </TabsContent>
</Tabs>
```

### URL Hash Encoding

Format: `#{topLevel}-{subTab}` — e.g., `#ar-dashboard`, `#ap-vendors`

```typescript
function parseHash(hash: string): { topLevel: 'ar' | 'ap'; subTab: string } {
  const cleaned = hash.replace('#', '')
  const [topLevel, subTab] = cleaned.split('-', 2)
  // Validate and return with defaults
}
```

### Lazy Loading

```tsx
const ARDashboard = lazy(() => import('@/domains/sales-invoices/components/ar-dashboard'))
const PriceIntelligence = lazy(() => import('@/domains/payables/components/price-intelligence'))
// Existing components also lazy-loaded
```

## Validation

```bash
npm run build    # Must pass
```

No Convex deployment needed (no backend changes).
