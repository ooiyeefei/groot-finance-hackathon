# Convex Function Contracts: Inventory Management

## Location Management (`convex/functions/inventoryLocations.ts`)

### Queries

#### `list` (public query)
```
Args: { businessId: Id<"businesses"> }
Returns: inventory_locations[] (active only, sorted by name)
Auth: finance_admin
```

#### `getDefault` (public query)
```
Args: { businessId: Id<"businesses"> }
Returns: inventory_locations | null
Auth: finance_admin
```

### Mutations

#### `create` (public mutation)
```
Args: {
  businessId: Id<"businesses">,
  name: string,
  address?: string,
  type: "warehouse" | "office" | "retail" | "other",
  isDefault: boolean,
}
Returns: Id<"inventory_locations">
Auth: finance_admin
Side effects:
  - If isDefault=true, unset previous default
  - If first location, auto-set isDefault=true
```

#### `update` (public mutation)
```
Args: {
  id: Id<"inventory_locations">,
  businessId: Id<"businesses">,
  name?: string,
  address?: string,
  type?: "warehouse" | "office" | "retail" | "other",
  isDefault?: boolean,
}
Returns: void
Auth: finance_admin
Side effects:
  - If setting isDefault=true, unset previous default
```

#### `deactivate` (public mutation)
```
Args: {
  id: Id<"inventory_locations">,
  businessId: Id<"businesses">,
  confirmWithStock?: boolean,
}
Returns: { success: boolean, error?: string }
Auth: finance_admin
Validation:
  - Cannot deactivate last active location
  - If stock exists and confirmWithStock !== true, return error with stock count
```

#### `reactivate` (public mutation)
```
Args: {
  id: Id<"inventory_locations">,
  businessId: Id<"businesses">,
}
Returns: void
Auth: finance_admin
```

---

## Inventory Stock (`convex/functions/inventoryStock.ts`)

### Queries

#### `getByProduct` (public query)
```
Args: { businessId: Id<"businesses">, catalogItemId: Id<"catalog_items"> }
Returns: Array<{ location: inventory_locations, stock: inventory_stock }>
Auth: finance_admin
```

#### `getByLocation` (public query)
```
Args: { businessId: Id<"businesses">, locationId: Id<"inventory_locations"> }
Returns: Array<{ catalogItem: catalog_items, stock: inventory_stock }>
Auth: finance_admin
```

#### `getDashboardSummary` (public action — NOT query, to avoid reactive bandwidth)
```
Args: { businessId: Id<"businesses"> }
Returns: {
  totalItems: number,
  totalLocations: number,
  lowStockCount: number,
  lowStockItems: Array<{ item, stock, location }>,
  recentMovements: inventory_movements[] (last 20),
}
Auth: finance_admin
```

#### `getAvailableStock` (public query)
```
Args: { businessId: Id<"businesses">, catalogItemId: Id<"catalog_items"> }
Returns: Array<{ locationId, locationName, quantityOnHand }>
Auth: finance_admin
Purpose: Used in sales invoice form to show available stock per location
```

---

## Inventory Movements (`convex/functions/inventoryMovements.ts`)

### Queries

#### `listByProduct` (public query)
```
Args: {
  businessId: Id<"businesses">,
  catalogItemId: Id<"catalog_items">,
  limit?: number,
}
Returns: inventory_movements[] (sorted by date desc)
Auth: finance_admin
```

#### `listFiltered` (public action — NOT query, for dashboard filtering)
```
Args: {
  businessId: Id<"businesses">,
  dateFrom?: string,
  dateTo?: string,
  locationId?: Id<"inventory_locations">,
  catalogItemId?: Id<"catalog_items">,
  movementType?: string,
  limit?: number,
}
Returns: inventory_movements[] with joined item/location names
Auth: finance_admin
```

### Mutations

#### `stockIn` (internal mutation)
```
Args: {
  businessId: Id<"businesses">,
  items: Array<{
    catalogItemId: Id<"catalog_items">,
    locationId: Id<"inventory_locations">,
    quantity: number,
    unitCostOriginal: number,
    unitCostOriginalCurrency: string,
    unitCostHome: number,
  }>,
  sourceType: "ap_invoice",
  sourceId: string,
  date: string,
  createdBy: string,
}
Returns: Id<"inventory_movements">[]
Side effects:
  - Create movement records
  - Upsert inventory_stock (increment quantityOnHand)
  - Recalculate weightedAvgCostHome
```

#### `stockOut` (internal mutation)
```
Args: {
  businessId: Id<"businesses">,
  items: Array<{
    catalogItemId: Id<"catalog_items">,
    locationId: Id<"inventory_locations">,
    quantity: number,
  }>,
  sourceType: "sales_invoice" | "void_reversal",
  sourceId: string,
  date: string,
  createdBy: string,
}
Returns: Id<"inventory_movements">[]
Side effects:
  - Create movement records (negative quantity)
  - Update inventory_stock (decrement quantityOnHand)
```

#### `adjust` (public mutation)
```
Args: {
  businessId: Id<"businesses">,
  catalogItemId: Id<"catalog_items">,
  locationId: Id<"inventory_locations">,
  quantity: number (positive or negative),
  notes: string (required),
}
Returns: Id<"inventory_movements">
Auth: finance_admin
Side effects:
  - Create adjustment movement
  - Update inventory_stock
  - Create adjustment journal entry (Dr/Cr 1500 vs 6500)
```

---

## Stock-In Action (`convex/functions/inventoryActions.ts`)

### `receiveFromInvoice` (public action)
```
Args: {
  businessId: Id<"businesses">,
  invoiceId: Id<"invoices">,
  items: Array<{
    catalogItemId: Id<"catalog_items">,
    locationId: Id<"inventory_locations">,
    quantity: number,
    unitCostOriginal: number,
    unitCostOriginalCurrency: string,
    unitCostHome: number,
    description: string,
  }>,
}
Returns: { movementIds: Id<"inventory_movements">[], journalEntryId: Id<"journal_entries"> }
Auth: finance_admin
Side effects:
  - Call internal stockIn mutation
  - Create reclassification JE: Dr. 1500 Inventory / Cr. 5200 Expenses
  - Mark invoice as inventory-received (patch invoice with inventoryReceivedAt)
```

### `reverseStockOut` (internal action)
```
Args: {
  businessId: Id<"businesses">,
  salesInvoiceId: Id<"sales_invoices">,
}
Returns: void
Side effects:
  - Find all stock_out movements for this invoice
  - Create reversal stock_in movements
  - Update inventory_stock levels
  - Create reversal JE: Dr. 1500 / Cr. 5100
```
