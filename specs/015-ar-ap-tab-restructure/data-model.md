# Data Model: AR/AP Two-Level Tab Restructure

**Date**: 2026-02-15
**Feature**: 015-ar-ap-tab-restructure

## Overview

This feature introduces **no new database tables or schema changes**. All data sources already exist in Convex. The restructure is purely a UI reorganization that consumes existing queries in new component arrangements.

## Existing Entities (consumed, not modified)

### AR Domain

| Entity | Convex Table | Key Queries | Used By |
|--------|-------------|-------------|---------|
| Sales Invoice | `sales_invoices` | `salesInvoices.list`, `salesInvoices.getById` | AR > Sales Invoices |
| Customer/Debtor | `customers` | `payments.getDebtorList`, `payments.getDebtorDetail` | AR > Debtors, AR > Dashboard |
| AR Aging | (computed) | `payments.getAgingReport` | AR > Dashboard |
| Catalog Item | `catalog_items` | `catalogItems.list`, `catalogItems.getById` | AR > Product Catalog |
| Payment | `payments` | `payments.listByInvoice` | AR > Debtors (detail) |

### AP Domain

| Entity | Convex Table | Key Queries | Used By |
|--------|-------------|-------------|---------|
| Incoming Invoice | `invoices` | (document processing queries) | AP > Incoming Invoices |
| Vendor | `vendors` | `vendors.list`, `vendors.getById`, `vendors.searchByName` | AP > Vendors |
| Accounting Entry | `accounting_entries` | `accountingEntries.list` | AP > Dashboard (aging, spend) |
| Vendor Price History | `vendor_price_history` | `vendorPriceHistory.getVendorItems`, `.detectPriceChanges`, `.getCrossVendorComparison`, `.getVendorPriceHistory`, `.getItemPriceHistory` | AP > Price Intelligence |

## Client-Side State Model

### Tab State

```
TopLevelTab: "ar" | "ap"
ARSubTab: "dashboard" | "sales" | "debtors" | "catalog"
APSubTab: "dashboard" | "incoming" | "vendors" | "prices"
```

**State persistence**: URL hash (`window.location.hash`)
**State derivation**: Hash string → parsed into `{ topLevel, subTab }` tuple

### Hash ↔ State Mapping

| Hash String | TopLevelTab | SubTab |
|-------------|-------------|--------|
| `ar-dashboard` | ar | dashboard |
| `ar-sales` | ar | sales |
| `ar-debtors` | ar | debtors |
| `ar-catalog` | ar | catalog |
| `ap-dashboard` | ap | dashboard |
| `ap-incoming` | ap | incoming |
| `ap-vendors` | ap | vendors |
| `ap-prices` | ap | prices |
| (empty/invalid) | ar | dashboard |

## Data Flow Diagram

```
┌─────────────────────────────────────────────────┐
│                 Invoices Page                     │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ Account       │  │ Account      │  ← Top-level│
│  │ Receivables   │  │ Payables     │    tabs     │
│  └──────┬───────┘  └──────┬───────┘             │
│         │                  │                      │
│    AR selected        AP selected                 │
│    ┌────┴────┐       ┌────┴────┐                 │
│    │Sub-tabs │       │Sub-tabs │  ← Sub-tabs     │
│    └────┬────┘       └────┬────┘                 │
│         │                  │                      │
│  ┌──────┴──────┐   ┌──────┴──────┐              │
│  │ Dashboard   │   │ Dashboard   │               │
│  │ ─useAging   │   │ ─useVendor  │               │
│  │  Report()   │   │  Aging()    │               │
│  │ ─useDebtor  │   │ ─useUpcoming│               │
│  │  List()     │   │  Payments() │               │
│  ├─────────────┤   │ ─useSpend   │               │
│  │ Sales Inv.  │   │  Analytics()│               │
│  │ ─SalesInv   │   ├────────────┤               │
│  │  List       │   │ Incoming   │               │
│  ├─────────────┤   │ ─Documents │               │
│  │ Debtors     │   │  Container │               │
│  │ ─DebtorList │   ├────────────┤               │
│  ├─────────────┤   │ Vendors    │               │
│  │ Catalog     │   │ ─Vendor    │               │
│  │ ─CatalogItem│   │  Manager   │               │
│  │  Manager    │   ├────────────┤               │
│  └─────────────┘   │ Price Intel│               │
│                     │ ─getVendor │               │
│                     │  Items()   │               │
│                     │ ─detectPrice│              │
│                     │  Changes() │               │
│                     │ ─getCross  │               │
│                     │  VendorComp│               │
│                     └────────────┘               │
└─────────────────────────────────────────────────┘
```
