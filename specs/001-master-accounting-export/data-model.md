# Data Model: Master Accounting Export Integration

**Branch**: `001-master-accounting-export` | **Date**: 2026-02-26

## New Entities

### export_code_mappings (Convex table)

Stores user-configured mappings between Groot Finance values and Master Accounting codes. Scoped per business and target system.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | Id\<"businesses"\> | Yes | Multi-tenant scope |
| targetSystem | string | Yes | Always `"master-accounting"` for this feature |
| mappingType | string | Yes | `"account_code"` \| `"creditor_code"` \| `"debtor_code"` \| `"bank_code"` |
| sourceValue | string | Yes | Groot Finance value (e.g., category name "Transport", vendor name "ABC Sdn Bhd") |
| targetCode | string | Yes | Master Accounting code (e.g., "6001", "4000-A0001") |
| isDefault | boolean | No | `true` if this is the fallback default for this mappingType |
| createdBy | Id\<"users"\> | Yes | Who created the mapping |
| updatedBy | Id\<"users"\> | No | Who last updated |
| updatedAt | number | No | Last update timestamp |

**Indexes**:
- `by_business_system`: `[businessId, targetSystem]` — fetch all mappings for a business
- `by_business_type`: `[businessId, targetSystem, mappingType]` — fetch mappings by type (e.g., all account code mappings)
- `by_business_source`: `[businessId, targetSystem, mappingType, sourceValue]` — lookup specific mapping

**Uniqueness**: `businessId + targetSystem + mappingType + sourceValue` must be unique (enforce in mutation). One `isDefault: true` per `businessId + targetSystem + mappingType`.

**Validation rules**:
- `targetCode` must be non-empty string, max 20 characters (Master Accounting Varchar(20) for codes)
- `sourceValue` must be non-empty string
- `mappingType` must be one of the allowed enum values

**State transitions**: None — mappings are created/updated/deleted, no lifecycle states.

## Modified Entities

### PrebuiltTemplate (TypeScript interface — in-memory, not persisted)

Add optional fields to support Master Accounting's section header and column header control:

| New Field | Type | Description |
|-----------|------|-------------|
| sectionHeader | string \| undefined | First line of output file (e.g., `"Purchases Book-Bill"`) |
| includeColumnHeaders | boolean \| undefined | Whether to include column header row. Default `true` for flat, `false` for hierarchical. Master data exports set to `false`. |
| requiresCodeMapping | boolean \| undefined | `true` if this template needs the inline mapping screen before export |
| codeMappingTypes | string[] \| undefined | Which mapping types are needed (e.g., `["account_code", "creditor_code"]`) |

### ExportFormatType (TypeScript union)

No change needed. Master Accounting transaction files use `"hierarchical"`, master data files use `"flat"`.

## Entity Relationships

```
businesses (1) ──── (N) export_code_mappings
                           │
                           │ mappingType = "account_code" | "creditor_code" | "debtor_code" | "bank_code"
                           │
PrebuiltTemplate ──── references mappingTypes → used to query export_code_mappings at export time
```

## Data Volume Estimates

- **export_code_mappings**: ~20-100 rows per business (typical SME has 10-30 expense categories, 10-50 vendors, 5-20 customers). Low volume, no performance concerns.
- **Export file size**: Up to 1,000 records × ~500 bytes/row = ~500KB per export file. Well within Convex File Storage limits.
