# Component Interface Contracts

**Branch**: `012-stripe-invoice-ux` | **Date**: 2026-02-13

Since this feature is a frontend UX redesign using Convex (not REST APIs), the "contracts" are component interfaces — the props and data shapes that define boundaries between components.

## New Components

### 1. InvoiceEditorLayout

The top-level split-panel layout component used by both create and edit pages.

```typescript
interface InvoiceEditorLayoutProps {
  mode: 'create' | 'edit'
  invoiceId?: string              // Required when mode === 'edit'
  initialData?: SalesInvoiceFormInput  // Pre-populated data for edit mode
}
```

**Renders**: Header bar + left form panel + right preview panel

### 2. InvoiceEditorHeader

Persistent top header bar with actions.

```typescript
interface InvoiceEditorHeaderProps {
  mode: 'create' | 'edit'
  lastSavedAt?: Date              // Timestamp of last auto-save
  isSaving: boolean               // Shows saving indicator
  isPreviewVisible: boolean       // Current preview panel state
  onTogglePreview: () => void     // Toggle preview visibility
  onReviewInvoice: () => void     // Open review/finalization view
  onClose: () => void             // Close editor (with unsaved changes check)
}
```

### 3. InvoiceFormPanel

Scrollable left panel containing all form sections.

```typescript
interface InvoiceFormPanelProps {
  form: UseSalesInvoiceFormReturn  // All form state and methods from the hook
  businessSettings: InvoiceSettings
  onDraftCreated: (invoiceId: string) => void  // Callback when draft first saved
}
```

**Sections rendered (in order)**:
1. CustomerSection
2. CurrencySection
3. ItemsSection
4. PaymentCollectionSection
5. AdditionalOptionsSection

### 4. InvoicePreviewPanel

Sticky right panel with tabbed previews.

```typescript
interface InvoicePreviewPanelProps {
  invoiceData: {
    invoice: InvoicePreviewData
    businessInfo: BusinessInfo
    templateId: string
  }
  activeTab: 'pdf' | 'email'
  onTabChange: (tab: 'pdf' | 'email') => void
}
```

### 5. EmailPreview

New component — visual mockup of the invoice email.

```typescript
interface EmailPreviewProps {
  recipientEmail: string
  companyName: string
  companyLogo?: string
  invoiceNumber: string
  totalAmount: number
  currency: string
  dueDate: string
  fromName: string
  toName: string
  lineItems: Array<{
    description: string
    quantity: number
    unitPrice: number
    totalAmount: number
    supplyDateStart?: string
    supplyDateEnd?: string
  }>
  totalDue: number
  amountPaid: number
  amountRemaining: number
}
```

### 6. ItemDetailForm

Expanded line item editor with advanced options (replaces inline table editing).

```typescript
interface ItemDetailFormProps {
  item: LineItem
  onSave: (item: LineItem) => void
  onSaveAndAddAnother: (item: LineItem) => void
  onCancel: () => void
  currency: string
  taxMode: TaxMode
}
```

**Advanced "Item options" section** (collapsible):
- Item taxes dropdown
- Item discount (percentage/fixed)
- Supply date range picker
- Discountable toggle

### 7. AdditionalOptionsSection

Toggle-able customization fields.

```typescript
interface AdditionalOptionsSectionProps {
  // Template
  templateId: string
  onTemplateChange: (id: string) => void
  // Memo (maps to existing "notes" field)
  memo: string
  onMemoChange: (text: string) => void
  showMemo: boolean
  onToggleMemo: (show: boolean) => void
  // Footer
  footer: string
  onFooterChange: (text: string) => void
  showFooter: boolean
  onToggleFooter: (show: boolean) => void
  // Custom fields
  customFields: Array<{ key: string; value: string }>
  onCustomFieldsChange: (fields: Array<{ key: string; value: string }>) => void
  showCustomFields: boolean
  onToggleCustomFields: (show: boolean) => void
  // Tax ID
  showTaxId: boolean
  onToggleTaxId: (show: boolean) => void
}
```

### 8. ReviewInvoiceView

Summary/finalization view before sending.

```typescript
interface ReviewInvoiceViewProps {
  invoiceData: SalesInvoice
  businessInfo: BusinessInfo
  onSendInvoice: () => Promise<void>
  onBackToEdit: () => void
  isSending: boolean
}
```

## Extended Existing Interfaces

### useSalesInvoiceForm (Hook Extension)

New options and return values added to the existing hook:

```typescript
// New options
interface UseInvoiceFormOptions {
  // ... existing options
  initialData?: SalesInvoiceFormInput  // For edit mode pre-population
  invoiceId?: string                    // Existing invoice ID for updates
}

// New return values (added to existing return type)
{
  // ... existing return values

  // New fields
  footer: string
  setFooter: (text: string) => void
  customFields: Array<{ key: string; value: string }>
  setCustomFields: (fields: Array<{ key: string; value: string }>) => void
  showTaxId: boolean
  setShowTaxId: (show: boolean) => void

  // Auto-save
  isDraftCreated: boolean
  lastSavedAt: Date | null
  isSaving: boolean
}
```

### LineItem (Type Extension)

```typescript
interface LineItem {
  // ... existing fields
  supplyDateStart?: string   // NEW: ISO date
  supplyDateEnd?: string     // NEW: ISO date
  isDiscountable?: boolean   // NEW: defaults to true
}
```

## Convex Mutation Extensions

### salesInvoices.create — New optional fields

```typescript
{
  // ... existing fields
  footer: v.optional(v.string()),
  customFields: v.optional(v.array(v.object({
    key: v.string(),
    value: v.string(),
  }))),
  showTaxId: v.optional(v.boolean()),
}
```

### salesInvoices.update — Same new optional fields

Mirrors create, all fields optional for partial updates.

### Line item validator extension

```typescript
{
  // ... existing line item fields
  supplyDateStart: v.optional(v.string()),
  supplyDateEnd: v.optional(v.string()),
  isDiscountable: v.optional(v.boolean()),
}
```
