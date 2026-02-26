# Convex Function Contracts: Master Accounting Export

## Code Mappings CRUD

### getCodeMappings (query)

Fetches all code mappings for a business and target system.

```typescript
// Args
{
  businessId: Id<"businesses">;
  targetSystem: string; // "master-accounting"
  mappingType?: string; // optional filter: "account_code" | "creditor_code" | "debtor_code" | "bank_code"
}

// Returns
Array<{
  _id: Id<"export_code_mappings">;
  mappingType: string;
  sourceValue: string;
  targetCode: string;
  isDefault?: boolean;
}>
```

**Auth**: Requires authenticated user with finance_admin or owner role for the business.

### upsertCodeMapping (mutation)

Creates or updates a single code mapping. If a mapping already exists for the same `businessId + targetSystem + mappingType + sourceValue`, it updates the `targetCode`.

```typescript
// Args
{
  businessId: Id<"businesses">;
  targetSystem: string;
  mappingType: string;
  sourceValue: string;
  targetCode: string;
  isDefault?: boolean;
}

// Returns
{ _id: Id<"export_code_mappings"> }
```

**Auth**: Requires authenticated user with finance_admin or owner role.
**Validation**: `targetCode` max 20 chars. If `isDefault: true`, unset any existing default for same `businessId + targetSystem + mappingType`.

### upsertCodeMappingsBatch (mutation)

Batch upsert for the inline mapping screen (saves all mappings at once).

```typescript
// Args
{
  businessId: Id<"businesses">;
  targetSystem: string;
  mappings: Array<{
    mappingType: string;
    sourceValue: string;
    targetCode: string;
  }>;
  defaults?: Array<{
    mappingType: string;
    targetCode: string;
  }>;
}

// Returns
{ upserted: number; defaultsSet: number }
```

**Auth**: Requires authenticated user with finance_admin or owner role.

### deleteCodeMapping (mutation)

Deletes a specific code mapping.

```typescript
// Args
{ mappingId: Id<"export_code_mappings"> }

// Returns
{ success: boolean }
```

## Export Execution (extends existing)

### getDistinctMappableValues (query)

Fetches distinct categories/vendors/customers from the records that will be exported, to populate the mapping screen.

```typescript
// Args
{
  businessId: Id<"businesses">;
  module: "expense" | "invoice" | "accounting";
  filters: ExportFilters;
  mappingTypes: string[]; // e.g., ["account_code", "creditor_code"]
}

// Returns
{
  account_code?: string[];   // distinct expense categories or account codes
  creditor_code?: string[];  // distinct vendor names
  debtor_code?: string[];    // distinct customer names
  bank_code?: string[];      // distinct bank account identifiers
}
```

**Auth**: Requires authenticated user with appropriate role for the module.
