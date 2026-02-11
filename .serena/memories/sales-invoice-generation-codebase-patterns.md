# Sales-Invoice-Generation Codebase Exploration Report

Complete reference guide for existing patterns, conventions, and structures across the FinanSEAL codebase.

---

## 1. CONVEX SCHEMA STRUCTURE

**Location**: `/convex/schema.ts`

### Key Tables Referenced
- **businesses**: v.id("businesses") - Business profiles with multi-currency support
- **users**: v.id("users") - Users with clerkUserId as primary identity
- **business_memberships**: v.id("businesses"), v.id("users"), role (membershipRoleValidator)
- **invoices**: File storage path, processing status, extracted data in JSONB
- **accounting_entries**: Core transaction records with lineItems embedded array
- **expense_claims**: Expense submission workflow, processing metadata
- **vendors**: Vendor records per business
- **conversations**, **messages**: Chat domain

### Validators Used (convex/lib/validators.ts)
```typescript
// Creates union validators from status constants
literalUnion(STATUS_VALUES) → v.union(v.literal(...), ...)

Import from src/lib/constants/statuses.ts:
- expenseClaimStatusValidator
- invoiceStatusValidator
- accountingEntryStatusValidator
- transactionTypeValidator
- membershipRoleValidator
- vendorStatusValidator
- And 6+ others
```

### Index Patterns
```typescript
.index("by_businessId", ["businessId"])           // Multi-tenant isolation
.index("by_userId", ["userId"])                   // User-scoped queries
.index("by_status", ["status"])                   // Status filtering
.index("by_userId_businessId", ["userId", "businessId"]) // Compound queries
```

### Optional Fields Pattern
- `v.optional(v.string())`
- `v.optional(v.number())`
- `v.optional(v.any())` for JSONB fields
- Timestamps: `v.optional(v.number())` for Unix timestamps

### Embedded Objects Pattern
```typescript
lineItems: v.optional(v.array(v.object({
  itemDescription: v.string(),
  quantity: v.number(),
  unitPrice: v.number(),
  totalAmount: v.number(),
  currency: v.string(),
  taxAmount: v.optional(v.number()),
  taxRate: v.optional(v.number()),
  lineOrder: v.number(),
})))

// Similar pattern for processing_metadata, documentMetadata, etc.
```

---

## 2. DOMAIN FOLDER STRUCTURE

**Location**: `src/domains/`

### Existing Domains (18 total)
- account-management
- accounting-entries
- analytics
- api-keys
- audit
- billing
- chat
- expense-claims ⭐
- exports
- feedback
- invoices ⭐
- leave-management
- onboarding
- security
- system
- tasks
- users
- utilities

### Domain Pattern (expense-claims as reference)
```
src/domains/expense-claims/
├── types/
│   ├── index.ts                    # Main domain types
│   ├── expense-claims.ts           # Specific to domain
│   ├── duplicate-detection.ts
│   └── expense-extraction.ts
├── components/
│   ├── personal-expense-dashboard.tsx
│   ├── expense-approval-dashboard.tsx
│   ├── create-expense-page-new.tsx
│   ├── expense-submission-flow.tsx
│   ├── edit-expense-modal-new.tsx
│   └── ... (30+ components)
├── hooks/
│   ├── use-expense-claims.tsx      # Main data fetching hook
│   ├── use-expense-claim-processing.tsx
│   ├── use-duplicate-detection.ts
│   ├── use-expense-categories.ts
│   ├── use-expense-form.ts
│   └── use-expense-claims-realtime.tsx
├── lib/
│   ├── data-access.ts             # API layer abstraction
│   ├── duplicate-detection.ts
│   ├── expense-categorizer.ts
│   ├── enhanced-workflow-engine.ts
│   └── ... (8+ utilities)
└── CLAUDE.md                       # Domain-specific documentation
```

### Invoices Domain (similar structure)
```
src/domains/invoices/
├── types/
│   ├── enhanced-document-types.ts
│   └── gemini-ocr.ts
├── components/
│   ├── documents-container.tsx
│   ├── documents-list.tsx
│   ├── line-items-table.tsx
│   └── ... (20+ components)
├── hooks/
│   ├── use-documents.tsx           # Query documents
│   ├── use-invoices-realtime.ts
│   └── useDocumentSchema.ts
├── lib/
│   ├── data-access.ts             # API fetching
│   ├── document-to-accounting-entry-mapper.ts
│   └── default-cogs-categories.ts
└── CLAUDE.md
```

---

## 3. TYPES AND CONSTANTS

**Location**: `src/lib/constants/statuses.ts`

### Status Constants Pattern
```typescript
export const EXPENSE_CLAIM_STATUSES = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
  REIMBURSED: "reimbursed",
  // ... etc
} as const;

export type ExpenseClaimStatus = typeof EXPENSE_CLAIM_STATUSES[keyof typeof EXPENSE_CLAIM_STATUSES];
export const EXPENSE_CLAIM_STATUS_VALUES = Object.values(EXPENSE_CLAIM_STATUSES);
```

### Import in Convex
```typescript
// convex/lib/validators.ts imports from src/ (not cyclical - no Convex deps in src/)
import { EXPENSE_CLAIM_STATUS_VALUES } from "../../src/lib/constants/statuses"
export const expenseClaimStatusValidator = literalUnion(EXPENSE_CLAIM_STATUS_VALUES)
```

### Key Status Sets
- `EXPENSE_CLAIM_STATUSES` (14 values: draft, uploading, classifying, analyzing, submitted, approved, rejected, reimbursed, processing, completed, failed, classification_failed, cancelled, pending)
- `INVOICE_STATUSES` (12 values)
- `ACCOUNTING_ENTRY_STATUSES` (5 values)
- `MEMBERSHIP_ROLE_VALUES` ("owner", "manager", "employee")
- `TRANSACTION_TYPE_VALUES` ("Income", "Cost of Goods Sold", "Expense")

---

## 4. EMAIL SERVICE

**Location**: `src/lib/services/email-service.ts`

### Service Pattern
```typescript
class EmailService {
  private ses?: SESClient
  private resend?: Resend
  private config?: EmailServiceConfig

  private initialize() { /* Lazy initialization */ }
  
  async sendInvitation(data: InvitationEmailData) { /* Try SES → fallback Resend */ }
  async sendFeedbackNotification(data: FeedbackNotificationData) { }
  async sendLeaveNotification(data: LeaveNotificationData) { }
}

export const emailService = new EmailService()
export default EmailService
```

### Authentication
- **Production**: Vercel OIDC token → AWS IAM role assumption (fromWebToken)
- **Local Dev**: AWS env vars or ~/.aws/credentials
- **Config**: AWS_REGION, AWS_ROLE_ARN, RESEND_API_KEY

### Email Build Pattern
```typescript
// Raw MIME email construction
private buildRawEmail(params: {
  from: string
  to: string
  subject: string
  htmlBody: string
  textBody: string
}): string {
  // Builds multipart/alternative MIME message
  // Subject encoded in base64 for UTF-8 support
}

// HTML generation
private generateInvitationHTML(data): string { /* Template */ }
private generateInvitationText(data): string { /* Plain text */ }
```

### Fallback Strategy
1. Try SES first
2. If sandbox error (unverified recipient), fallback to Resend
3. Log attempts with timestamps

### Used For
- Business invitations
- Feedback notifications
- Leave request notifications

---

## 5. SIDEBAR/NAVIGATION PATTERN

**Location**: `src/components/ui/sidebar.tsx`

### Navigation Component Pattern
```typescript
// Uses pathnames + locale context
const pathname = usePathname()
const locale = useLocale()
const localizedHref = (path: string) => `/${locale}${path}`

// Role-based rendering
const isEmployeeOnly = userRole.employee && !userRole.manager && !userRole.finance_admin
const isAdmin = userRole.finance_admin

const coreNavigationPart1 = [
  ...(isAdmin ? [{ name: t('dashboard'), href: localizedHref('/'), icon: Home }] : []),
  { name: t('expenseClaims'), href: localizedHref('/expense-claims'), icon: Receipt },
]
```

### Navigation Items
- Dashboard (admin only)
- Invoices (admin only)
- Transactions (admin only)
- Expense Claims (all)
- Leave (all)
- Team Calendar (all)
- Manager Approvals (manager/admin)
- Reporting & Exports (all)
- AI Assistant (all)
- Settings (manager/admin)

### Cache Management
```typescript
const { isLoaded: isAuthLoaded, isSignedIn } = useAuth()
const [userRole, setUserRole] = useState<UserRole>(() => {
  // Restore from localStorage cache to prevent nav expansion on load
  try {
    const cached = localStorage.getItem('sidebar-user-role')
    if (cached) return JSON.parse(cached)
  } catch { }
  return { employee: true, manager: false, finance_admin: false }
})
```

---

## 6. PAGE STRUCTURE & AUTH GATES

**Location**: `src/app/[locale]/invoices/page.tsx` (reference)

### Page Pattern
```typescript
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getUserRole } from '@/domains/users/lib/user.service'

export default async function DocumentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const { userId } = await auth()
  
  if (!userId) {
    redirect('/sign-in')
  }
  
  // Role check - finance admins only
  const roleData = await getUserRole()
  const isAdmin = roleData?.permissions?.finance_admin
  
  if (!isAdmin) {
    redirect(`/${locale}/expense-claims`)
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <HeaderWithUser title="Invoices" subtitle="" />
          <main className="flex-1 overflow-auto p-card-padding pb-24 sm:pb-4">
            <DocumentsContainer />
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}
```

### Auth Flow
1. Server-side `auth()` from Clerk
2. Role check via `getUserRole()`
3. Redirect if unauthorized
4. Wrap content in `<ClientProviders>` for client-side hooks
5. Layout: Sidebar + Header + Main Content

### CSS Class Patterns
- `bg-background` - Page background (semantic token)
- `text-foreground` - Primary text
- `p-card-padding` - Standard padding
- `pb-24 sm:pb-4` - Responsive bottom padding

---

## 7. CONFIRMATION DIALOG & UI COMPONENTS

**Location**: `src/components/ui/confirmation-dialog.tsx`

### Dialog Pattern
```typescript
export default function ConfirmationDialog({
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string = 'Confirm'
  cancelText?: string = 'Cancel'
  confirmVariant?: 'danger' | 'primary' = 'primary'
  isLoading?: boolean = false
}: ConfirmationDialogProps)
```

### Rendering Pattern
```typescript
if (!isOpen) return null

return (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    {/* Backdrop */}
    <div
      className="fixed inset-0 transition-opacity"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)'
      }}
      onClick={onClose}
    />

    {/* Modal content */}
    <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">
      {/* Header, Message, Actions */}
    </div>
  </div>
)
```

### Key UI Components
- Button component: `src/components/ui/button.tsx` (variants: default, secondary, destructive, ghost)
- Badge component: `src/components/ui/badge.tsx` (status colors)
- Card component: `src/components/ui/card.tsx` (CardHeader, CardContent, CardTitle)
- Input/Select/Textarea
- Loader2 icon from lucide-react for loading states

---

## 8. CONVEX QUERY PATTERNS

**Location**: `convex/functions/expenseClaims.ts` (reference)

### Query Pattern
```typescript
export const list = query({
  args: {
    businessId: v.string(),
    status: v.optional(v.string()),
    userId: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    personalOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return { claims: [], nextCursor: null }
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject)
    if (!user) {
      return { claims: [], nextCursor: null }
    }

    // Resolve IDs (supports both Convex and legacy UUID)
    const business = await resolveById(ctx.db, "businesses", args.businessId)

    // Get user membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first()

    // Role-based filtering
    if (args.personalOnly || role === "employee") {
      claims = claims.filter((c) => c.userId === user._id)
    }

    return { claims, nextCursor: null }
  }
})
```

### Mutation Pattern
```typescript
export const create = mutation({
  args: {
    businessId: v.string(),
    data: v.object({ /* ... */ }),
  },
  handler: async (ctx, args) => {
    // Auth check
    const identity = await ctx.auth.getUserIdentity()
    
    // Resolve IDs
    // Validate permissions
    // Create record with ctx.db.insert()
    // Return { success: true, data: /* ... */ }
  }
})
```

### Resolver Helpers
```typescript
// Resolve Clerk ID → Convex User ID
const user = await resolveUserByClerkId(ctx.db, clerkId)

// Resolve either Convex ID or legacy UUID
const business = await resolveById(ctx.db, "businesses", idOrUuid)
```

---

## 9. HOOKS PATTERN

**Location**: `src/domains/expense-claims/hooks/use-expense-claims.tsx`

### Hook Pattern
```typescript
export interface UseExpenseClaimsReturn {
  dashboardData: PersonalDashboardData | null
  categories: any[] | null
  loading: boolean
  categoriesLoading: boolean
  error: string | null
  refreshDashboard: () => Promise<void>
  deleteClaim: (claimId: string) => Promise<boolean>
  submitClaim: (claimId: string) => Promise<boolean>
  reprocessClaim: (claimId: string) => Promise<boolean>
  deleting: Set<string>
  submitting: Set<string>
  reprocessing: Set<string>
}

export function useExpenseClaims(): UseExpenseClaimsReturn {
  // TanStack Query setup
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['expense-claims-dashboard'],
    queryFn: fetchDashboardData,
    staleTime: 1 * 60 * 1000, // 1 minute for dashboard
  })

  const categoryQuery = useQuery({
    queryKey: ['expense-categories'],
    queryFn: fetchCategories,
    staleTime: 30 * 60 * 1000, // 30 minutes (rarely changes)
  })

  // Mutations for deleteClaim, submitClaim, etc.
  const deleteMutation = useMutation({
    mutationFn: async (claimId) => {
      const response = await fetch(`/api/v1/expense-claims/${claimId}`, {
        method: 'DELETE',
      })
      // ...
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expense-claims-dashboard'] })
  })

  return {
    dashboardData: data?.data || null,
    categories: categoryQuery.data?.data || null,
    loading: isLoading,
    categoriesLoading: categoryQuery.isLoading,
    error: error?.message || null,
    refreshDashboard: () => refetch(),
    deleteClaim: (claimId) => deleteMutation.mutateAsync(claimId),
    deleting: new Set(/* ... */),
    // ...
  }
}
```

### Query Client Patterns
- **Caching**: `staleTime` (1 min for frequent, 30 min for static)
- **Invalidation**: `queryClient.invalidateQueries({ queryKey: [...] })`
- **Mutations**: `useMutation` with `onSuccess` callbacks
- **Multiple queries**: `useQueries` for parallel fetching

---

## 10. CONVEX FUNCTIONS FILE PATTERNS

**Location**: `convex/functions/`

### File Structure
```
convex/functions/
├── admin.ts              # Admin operations
├── invoices.ts          # Invoice CRUD + queries
├── expenseClaims.ts     # Expense claim operations
├── accountingEntries.ts # Accounting entries
├── businesses.ts        # Business management
├── users.ts             # User operations
├── vendors.ts           # Vendor management
├── emails.ts            # Email sending
├── leaveRequests.ts     # Leave management
├── exportTemplates.ts   # Export configuration
├── exportHistory.ts     # Export records
├── exportSchedules.ts   # Scheduled exports
├── exportJobs.ts        # Export job handling
├── memberships.ts       # Business memberships
├── audit.ts             # Audit logging
├── feedback.ts          # Feedback management
├── messages.ts          # Chat messages
├── conversations.ts     # Chat conversations
├── leaveBalances.ts     # Leave balance tracking
├── leaveTypes.ts        # Leave type config
├── publicHolidays.ts    # Holiday definitions
├── mcpApiKeys.ts        # MCP API keys
├── mcpProposals.ts      # MCP proposals
├── ocrUsage.ts          # OCR usage tracking
├── stripeEvents.ts      # Stripe webhooks
├── vendorPriceHistory.ts # Price tracking
├── systemMonitoring.ts  # System health
├── system.ts            # System utilities
└── admin/ (subdirectory)
```

### Each file typically contains:
- `query()` exports for data retrieval
- `mutation()` exports for modifications
- Helper functions
- Type definitions
- Index constants

---

## 11. FORMAT-NUMBER UTILITY

**Location**: `src/lib/utils/format-number.ts`

### Usage Pattern
```typescript
export function formatNumber(value: number | string | null | undefined, decimals?: number): string {
  if (value === null || value === undefined || value === '') {
    return '0'
  }

  const num = typeof value === 'string' ? parseFloat(value) : value

  if (isNaN(num)) {
    return '0'
  }

  if (decimals !== undefined) {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
  }

  return num.toLocaleString('en-US')
}

export function formatCurrency(
  value: number | string | null | undefined,
  currency: string = 'SGD',
  decimals: number = 2
): string {
  const formattedNumber = formatNumber(value, decimals)
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] || currency + ' '
  return `${symbol}${formattedNumber}`
}

export function formatCompactNumber(value: number | string | null | undefined): string {
  // Returns format like "1.5M", "2.3K"
  return num.toLocaleString('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  })
}
```

### Supported Currencies
- USD, EUR, GBP (Western)
- THB, SGD, MYR, IDR, VND, PHP (Southeast Asia)
- CNY, JPY (East Asia)

---

## 12. BUSINESS CONTEXT PATTERN

**Location**: `src/contexts/business-context.tsx`

### Context Provider Pattern
```typescript
interface BusinessContextState {
  // Data
  memberships: TBusinessWithMembership[]
  activeContext: TBusinessContext | null
  profile: BusinessProfile | null
  
  // Loading states
  isLoadingMemberships: boolean
  isLoadingContext: boolean
  isSwitching: boolean
  
  // Error states
  membershipsError: string | null
  contextError: string | null
  switchError: string | null
  
  // Actions
  refreshMemberships: () => Promise<void>
  refreshContext: () => Promise<void>
  switchActiveBusiness: (businessId: string) => Promise<boolean>
  clearErrors: () => void
}

const BusinessContext = createContext<BusinessContextState | null>(null)

export function useActiveBusiness() {
  const context = useContext(BusinessContext)
  if (!context) {
    throw new Error('useActiveBusiness must be used within BusinessContextProvider')
  }
  return context
}
```

### Usage in Components
```typescript
const { business, businessId, switchActiveBusiness } = useActiveBusiness()
```

---

## 13. SEMANTIC DESIGN SYSTEM

**Location**: `src/components/ui/CLAUDE.md`, `src/app/globals.css`

### Design Tokens (3-Layer System)
```typescript
// Layer 1: Core Semantic Tokens
--background: 0 0% 98%;          // App background
--surface: 0 0% 100%;            // Elevated surfaces
--card: 0 0% 100%;               // Card backgrounds
--muted: 220 14% 96%;            // Muted/disabled
--input: 220 13% 91%;            // Form inputs
--foreground: 222 47% 11%;       // Primary text
--muted-foreground: 220 9% 46%;  // Secondary text
--border: 220 13% 91%;           // Borders
--primary: 221 83% 53%;          // Primary color (blue)
--destructive: 0 84% 60%;        // Destructive (red)

// Layer 2: Component Classes
.bg-card          // Semantic background
.text-foreground  // Semantic text
.border-border    // Semantic border

// Layer 3: Context-Specific
// Domain components apply Layer 1-2 consistently
```

### Color Patterns
```typescript
// Status badges (light/dark mode safe)
bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30

// Approved: Green
// Rejected: Red
// Pending: Amber/Yellow
// Draft: Blue
```

### Component Variants
- Button: `default`, `secondary`, `destructive`, `ghost`
- Badge: semantic status colors
- Card: `bg-card` with `border-border`

---

## 14. PACKAGE.JSON DEPENDENCIES

**Key Libraries**:
- `html2pdf.js` (v0.12.1) - PDF generation (already in dependencies!)
- `convex` (v1.31.3) - Real-time database
- `next` (15.5.7) - Framework
- `react` (19.1.2), `react-dom` (19.1.2)
- `@clerk/nextjs` (6.30.0) - Authentication
- `@tanstack/react-query` (5.90.7) - Data fetching
- `@langchain/langgraph` (0.4.5), `langchain` (0.3.30) - AI/LLM
- `@google/genai` (1.19.0) - Gemini API
- `sharp` (0.34.3) - Image processing
- `date-fns` (4.1.0) - Date utilities
- `zod` (3.23.8) - Schema validation
- `lucide-react` (0.539.0) - Icons
- `tailwindcss` (3.4.17) - Styling
- `recharts` (3.1.2) - Charts
- `stripe` (20.1.0) - Payments
- `@aws-sdk` packages - AWS services (S3, SES, Lambda, SSM)
- `dotenv` (17.2.1) - Environment variables
- `sonner` (2.0.7) - Toast notifications

---

## 15. EXPENSE CLAIMS DOMAIN SPECIFIC

### Processing Pipeline
```
Upload → classify-document (Gemini) → extract-receipt-data (DSPy) → draft status
```

### Statuses (14 values)
- Workflow: draft → submitted → approved → reimbursed
- Processing: uploading, classifying, analyzing, extracting, processing, completed
- Errors: failed, classification_failed, cancelled

### Approval Routing
```
Employee submits → Manager assigned? → Route to manager
                ↓ No manager
                Manager/Admin role? → Route to self
                ↓ No
                Fallback to admin → Fallback to manager
```

### Key Database Fields
- `processing_metadata` (JSONB) - Extracted data, confidence scores, category mapping
- `lineItems` - Embedded array of line items
- `accountingEntryId` - Link to accounting entry (NULL until approved)
- `processingStartedAt`, `processedAt`, `failedAt`
- `designatedApproverId`, `routingHistory` - Approval workflow tracking

---

## 16. INVOICES DOMAIN SPECIFIC

### Processing Pipeline
```
Upload PDF/Image → PDF conversion → Classification → Gemini OCR → Extraction → draft
```

### Classification
- ✅ Supported: Invoice, Receipt
- ❌ Not supported: ID Card, Payslip, Application Form, Contract

### Statuses (12 values)
- Processing: pending, uploading, analyzing, classifying, extracting, processing, completed
- Payment: paid, overdue, disputed
- Error: failed, classification_failed, cancelled

### Key Database Fields
- `convertedImagePath`, `convertedImageWidth`, `convertedImageHeight`
- `classificationMethod`, `classificationTaskId`, `extractionTaskId`
- `processingMetadata`, `documentMetadata`, `extractedData`
- `lineItemsStatus` - Phase 1 (core fields) vs Phase 2 (line items extraction)

---

## 17. API ENDPOINT PATTERNS

### Base Path
`/api/v1/`

### Existing Endpoints
- `GET /api/v1/expense-claims?limit=10&sort_order=desc`
- `GET /api/v1/expense-claims/{id}`
- `POST /api/v1/expense-claims` (multipart/form-data)
- `PUT /api/v1/expense-claims/{id}`
- `DELETE /api/v1/expense-claims/{id}`
- `GET /api/v1/invoices`
- `POST /api/v1/invoices`
- `GET /api/v1/accounting-entries`

### Response Pattern
```typescript
{
  success: boolean
  data?: T
  error?: string
  pagination?: { total, page, limit }
}
```

---

## 18. TRANSLITERATION & I18N

**Location**: `src/app/[locale]/` (Next.js i18n routing)

### Pattern
- Locale in URL: `/en/invoices`, `/th/invoices`, `/id/invoices`
- Sidebar uses `useLocale()` and `useTranslations()`
- Navigation items translated via i18n keys

---

## KEY FILES TO UNDERSTAND

### Essential Reference Files
1. `/convex/schema.ts` - All table definitions (1214 lines)
2. `/src/lib/constants/statuses.ts` - All status constants
3. `/src/components/ui/sidebar.tsx` - Navigation pattern
4. `/src/domains/expense-claims/hooks/use-expense-claims.tsx` - Hook pattern
5. `/convex/functions/expenseClaims.ts` - Convex query/mutation pattern
6. `/src/lib/services/email-service.ts` - Email service
7. `/src/app/[locale]/invoices/page.tsx` - Page auth gate pattern
8. `/src/contexts/business-context.tsx` - Multi-tenant context
9. `/src/lib/utils/format-number.ts` - Number formatting
10. `/src/components/ui/confirmation-dialog.tsx` - Dialog pattern

---

## CRITICAL CONVENTIONS TO FOLLOW

### File Naming
- React components: PascalCase with `.tsx`
- Utilities: camelCase with `.ts`
- Hooks: `use-*.ts` or `use-*.tsx`
- Types: `*-types.ts` or included in `types/index.ts`

### Import Organization
```typescript
// External imports first
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

// Absolute imports (from @/)
import { Button } from '@/components/ui/button'
import { useActiveBusiness } from '@/contexts/business-context'

// Relative imports last
import { formatCurrency } from '../lib/utils'
```

### Type Safety
- Use `v.union()` validators in Convex schema
- Import status types from `src/lib/constants/statuses.ts`
- Create validators with `literalUnion()` helper
- Use TypeScript `as const` for status objects

### Accessibility
- Semantic HTML: `<button>`, `<a>`, `<input>`
- WCAG AA contrast ratios maintained
- Focus states visible with `ring-ring` token

### Performance
- React Query caching: 1 min for dynamic, 30 min for static
- Dynamic imports for large libraries (html2pdf)
- Parallel queries with `useQueries`

---

## html2pdf.js INTEGRATION

**Status**: Already in package.json (v0.12.1)

### Usage Example (from codebase)
```typescript
// src/domains/expense-claims/components/formatted-expense-report.tsx
const html2pdf = (await import('html2pdf.js')).default

const options = {
  margin: 10,
  filename: 'report.pdf',
  image: { type: 'jpeg', quality: 0.98 },
  html2canvas: { scale: 2 },
  jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
}

const element = document.getElementById('report')
await html2pdf().set(options).from(element).save()
```

### Why Dynamic Import
- Avoids SSR issues (html2pdf uses browser APIs)
- Reduces bundle size (only loaded when needed)
- Prevents hydration mismatches

