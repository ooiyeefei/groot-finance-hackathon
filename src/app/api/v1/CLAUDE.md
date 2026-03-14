# Groot Finance API v1 Documentation

Comprehensive REST API documentation for Groot Finance's backend services organized by domain.

**Base URL**: `/api/v1`
**Authentication**: Clerk-based session authentication
**Architecture**: Next.js 15 App Router with RESTful conventions

---

## Table of Contents

1. [Account Management APIs](#account-management-apis)
2. [Accounting Entries APIs](#accounting-entries-apis)
3. [Expense Claims APIs](#expense-claims-apis)
4. [Invoices & Documents APIs](#invoices--documents-apis)
5. [Applications APIs](#applications-apis)
6. [Chat & AI Assistant APIs](#chat--ai-assistant-apis)
7. [Analytics APIs](#analytics-apis)
8. [User Management APIs](#user-management-apis)
9. [System APIs](#system-apis)
10. [Utility APIs](#utility-apis)

---

## Authentication

All API endpoints require Clerk authentication unless explicitly stated otherwise.

```typescript
import { auth } from '@clerk/nextjs/server'

const { userId } = await auth()
if (!userId) {
  return NextResponse.json(
    { success: false, error: 'Unauthorized' },
    { status: 401 }
  )
}
```

### Standard Response Format

```typescript
// Success Response
{
  success: true,
  data: T,
  message?: string
}

// Error Response
{
  success: false,
  error: string,
  details?: any
}
```

---

## Account Management APIs

Multi-tenancy and business account management for team collaboration.

### Business Management

#### `GET /api/v1/account-management/businesses`
List all businesses user belongs to (as member or owner).

**Response:**
```typescript
{
  success: true,
  data: {
    businesses: Business[]
  }
}
```

#### `POST /api/v1/account-management/businesses`
Create new business account.

**Request:**
```typescript
{
  name: string;
  tax_id?: string;
  address?: string;
  contact_email?: string;
  home_currency: string;
}
```

#### `GET /api/v1/account-management/businesses/context`
Get current business context for authenticated user.

**Response:**
```typescript
{
  success: true,
  data: {
    business_id: string;
    business_name: string;
    role: 'owner' | 'admin' | 'manager' | 'employee';
  }
}
```

#### `POST /api/v1/account-management/businesses/switch`
Switch user's active business context.

**Request:**
```typescript
{
  business_id: string;
}
```

#### `GET /api/v1/account-management/businesses/profile`
Get detailed business profile and settings.

#### `PATCH /api/v1/account-management/businesses/profile`
Update business profile information.

---

### Team Invitations

#### `GET /api/v1/account-management/invitations`
List pending invitations (sent or received).

**Query Params:**
- `type: 'sent' | 'received'` - Filter by invitation type

**Response:**
```typescript
{
  success: true,
  data: {
    invitations: TeamInvitation[]
  }
}
```

#### `POST /api/v1/account-management/invitations`
Send team invitation to new member.

**Request:**
```typescript
{
  email: string;
  role: 'admin' | 'manager' | 'employee';
  business_id: string;
  message?: string;
}
```

#### `POST /api/v1/account-management/invitations/accept`
Accept team invitation.

**Request:**
```typescript
{
  invitation_id: string;
  token: string;
}
```

#### `DELETE /api/v1/account-management/invitations/[invitationId]`
Revoke or decline invitation.

#### `POST /api/v1/account-management/invitations/[invitationId]/resend`
Resend invitation email.

---

### Team Memberships

#### `GET /api/v1/account-management/memberships`
List all team members in current business.

**Response:**
```typescript
{
  success: true,
  data: {
    memberships: TeamMembership[]
  }
}
```

#### `PATCH /api/v1/account-management/memberships/[membershipId]`
Update team member role or status.

**Request:**
```typescript
{
  role?: 'admin' | 'manager' | 'employee';
  status?: 'active' | 'suspended';
}
```

#### `DELETE /api/v1/account-management/memberships/[membershipId]`
Remove team member from business.

---

### COGS Categories Management

#### `GET /api/v1/account-management/cogs-categories`
List all COGS categories (enabled and disabled).

**Response:**
```typescript
{
  success: true,
  data: {
    categories: COGSCategory[]
  }
}
```

#### `GET /api/v1/account-management/cogs-categories/enabled`
List only enabled COGS categories for dropdowns.

**Response:**
```typescript
{
  success: true,
  data: COGSCategory[]
}
```

#### `POST /api/v1/account-management/cogs-categories`
Create custom COGS category.

**Request:**
```typescript
{
  category_name: string;
  category_code: string;
  description?: string;
  cost_type: 'direct' | 'indirect';
  vendor_patterns?: string[];
  ai_keywords?: string[];
}
```

#### `PATCH /api/v1/account-management/cogs-categories/[categoryId]`
Update COGS category configuration.

#### `DELETE /api/v1/account-management/cogs-categories/[categoryId]`
Disable COGS category (soft delete).

---

## Accounting Entries APIs

> **DEPRECATED (2026-03-14):** All `/api/v1/accounting-entries` REST routes have been deleted.
> Financial transactions now use the double-entry `journal_entries` system via Convex mutations.
> AP payment recording uses `invoices.recordPayment` (Convex mutation, not REST).
> Historical data is still readable via Convex queries (`accountingEntries.list`, `accountingEntries.getById`).

---

## Expense Claims APIs

Employee expense submission and manager approval workflows.

### Expense Claim Management

#### `GET /api/v1/expense-claims`
List expense claims with role-based access control.

**Query Params:**
- `status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'reimbursed'`
- `approver: 'me'` - Show claims pending current user's approval
- `employee_id: string` - Filter by employee (manager/admin only)
- `date_from: string` - Submission date range
- `date_to: string`

**Response:**
```typescript
{
  success: true,
  data: {
    claims: ExpenseClaim[];
    role: UserRole;
    summary?: {
      total_claims: number;
      pending_approval: number;
      approved_amount: number;
      rejected_count: number;
    }
  }
}
```

#### `POST /api/v1/expense-claims`
Create new expense claim.

**Request:**
```typescript
{
  description: string;
  vendor_name: string;
  total_amount: number;
  currency: string;
  transaction_date: string;
  expense_category_id: string;
  business_purpose: string;
  receipt_url?: string;
  processing_metadata?: {
    extraction_method: 'dspy' | 'manual';
    financial_data: ExtractedData;
    line_items?: ExtractedLineItem[];
  }
}
```

#### `GET /api/v1/expense-claims/[id]`
Get expense claim details.

**Response:**
```typescript
{
  success: true,
  data: {
    claim: ExpenseClaim;
    employee: UserProfile;
    approver?: UserProfile;
    accounting_entry?: AccountingEntry;
  }
}
```

#### `PUT /api/v1/expense-claims/[id]`
Update expense claim status (employee edit or manager approval).

**Request:**
```typescript
{
  status: 'submitted' | 'approved' | 'rejected' | 'reimbursed';
  comment?: string;
  approval_notes?: string;
}
```

**Business Logic:**
- `approved` status triggers RPC: `create_accounting_entry_from_approved_claim()`
- `reimbursed` status updates accounting_entries.status to 'paid'

#### `DELETE /api/v1/expense-claims/[id]`
Delete expense claim (draft only).

---

### Expense Categories

#### `GET /api/v1/expense-claims/categories`
List all expense categories.

**Response:**
```typescript
{
  success: true,
  data: {
    categories: ExpenseCategory[]
  }
}
```

#### `GET /api/v1/expense-claims/categories/enabled`
List enabled expense categories for dropdowns.

**Response:**
```typescript
{
  success: true,
  data: ExpenseCategory[]
}
```

#### `POST /api/v1/expense-claims/categories`
Create custom expense category.

**Request:**
```typescript
{
  category_name: string;
  category_code: string;
  description?: string;
  is_reimbursable: boolean;
  requires_receipt: boolean;
  approval_required: boolean;
}
```

#### `PATCH /api/v1/expense-claims/categories/[categoryId]`
Update expense category.

#### `DELETE /api/v1/expense-claims/categories/[categoryId]`
Disable expense category (soft delete).

---

## Invoices & Documents APIs

Multi-modal document processing with OCR and AI extraction.

### Document Management

#### `GET /api/v1/invoices`
List uploaded documents/invoices.

**Query Params:**
- `status: 'pending' | 'processing' | 'completed' | 'failed'`
- `document_type: 'invoice' | 'receipt' | 'contract'`
- `page: number`
- `limit: number`

**Response:**
```typescript
{
  success: true,
  data: {
    documents: Document[];
    pagination: PaginationMeta;
  }
}
```

#### `POST /api/v1/invoices`
Upload new document for processing.

**Request:** `multipart/form-data`
```typescript
{
  file: File; // PDF or image
  document_type: 'invoice' | 'receipt' | 'contract';
  description?: string;
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    document_id: string;
    storage_url: string;
    status: 'pending';
  }
}
```

#### `GET /api/v1/invoices/[invoiceId]`
Get document details and extraction results.

**Response:**
```typescript
{
  success: true,
  data: {
    document: Document;
    extracted_data: ExtractedFinancialData;
    bounding_boxes: BoundingBox[];
    processing_status: ProcessingStatus;
  }
}
```

#### `DELETE /api/v1/invoices/[invoiceId]`
Delete document and associated data.

---

### Document Processing

#### `POST /api/v1/invoices/[invoiceId]/process`
Trigger OCR and AI extraction (Trigger.dev background job).

**Response:**
```typescript
{
  success: true,
  data: {
    task_id: string;
    status: 'queued';
    message: 'Document processing initiated';
  }
}
```

**Background Workflow:**
1. PDF → Image conversion (hybrid architecture)
2. ColNomic Embed Multimodal 3B OCR extraction
3. Python + OpenCV annotation (if bounding boxes exist)
4. Store annotated images to Supabase Storage

#### `GET /api/v1/invoices/[invoiceId]/image-url`
Get annotated document image URL for preview.

**Response:**
```typescript
{
  success: true,
  data: {
    annotated_url: string;
    original_url: string;
    has_annotations: boolean;
  }
}
```

---

## Applications APIs

Business application management for operational workflows.

#### `GET /api/v1/applications`
List all applications user has access to.

**Response:**
```typescript
{
  success: true,
  data: {
    applications: Application[]
  }
}
```

#### `GET /api/v1/applications/[id]`
Get application details.

#### `GET /api/v1/applications/[id]/summary`
Get application summary metrics and status.

---

### Application Documents

#### `GET /api/v1/applications/[id]/documents`
List documents attached to application.

#### `POST /api/v1/applications/[id]/documents`
Upload document to application.

#### `GET /api/v1/applications/[id]/documents/[documentId]`
Get application document details.

#### `POST /api/v1/applications/[id]/documents/[documentId]/process`
Process application document.

#### `DELETE /api/v1/applications/[id]/documents/[documentId]`
Remove document from application.

---

## Chat & AI Assistant APIs

LangGraph-based conversational AI with RAG and tool integration.

### Chat Sessions

#### `POST /api/v1/chat`
Send message to AI assistant (streaming SSE response).

**Request:**
```typescript
{
  message: string;
  conversation_id?: string; // Resume existing conversation
  context?: {
    document_id?: string;
    transaction_id?: string;
  };
}
```

**Response:** Server-Sent Events (SSE)
```typescript
// Stream of events:
{ type: 'thinking', content: 'Analyzing your request...' }
{ type: 'tool_call', tool: 'document-search', args: {...} }
{ type: 'content', content: 'Based on your invoice...' }
{ type: 'citation', source: {...} }
{ type: 'done', conversation_id: 'uuid' }
```

**Agent Capabilities:**
- Document search (Qdrant vector search)
- Transaction lookup (Supabase queries)
- Cross-border tax compliance (regulatory knowledge base)
- Multi-language support (English, Thai, Indonesian)

---

### Conversations

#### `GET /api/v1/chat/conversations`
List user's chat history.

**Query Params:**
- `limit: number` (default: 20)
- `offset: number`

**Response:**
```typescript
{
  success: true,
  data: {
    conversations: Conversation[];
    total: number;
  }
}
```

#### `GET /api/v1/chat/conversations/[conversationId]`
Get conversation details and message history.

**Response:**
```typescript
{
  success: true,
  data: {
    conversation: Conversation;
    messages: Message[];
  }
}
```

#### `DELETE /api/v1/chat/conversations/[conversationId]`
Delete conversation history.

---

### Citations & Messages

#### `POST /api/v1/chat/citation-preview`
Get preview of cited document/source.

**Request:**
```typescript
{
  source_id: string;
  source_type: 'document' | 'transaction' | 'regulatory';
}
```

#### `GET /api/v1/chat/messages/[messageId]`
Get specific message details.

#### `PATCH /api/v1/chat/messages/[messageId]`
Edit user message and regenerate response.

---

## Analytics APIs

Real-time financial analytics and monitoring.

### Dashboards

#### `GET /api/v1/analytics/dashboards`
Get comprehensive dashboard data.

**Query Params:**
- `scope: 'personal' | 'team' | 'company'`
- `date_from: string`
- `date_to: string`

**Response:**
```typescript
{
  success: true,
  data: {
    revenue: {
      total: number;
      change_percent: number;
      trend: 'up' | 'down' | 'stable';
    };
    expenses: ExpenseSummary;
    cash_flow: CashFlowData;
    top_categories: CategoryBreakdown[];
  }
}
```

---

### Real-time Analytics

#### `GET /api/v1/analytics/realtime`
Get real-time financial metrics.

**Response:**
```typescript
{
  success: true,
  data: {
    total_amount: number;
    total_claims: number;
    avg_claim_amount: number;
    monthly_change: number;
    category_breakdown: CategoryStats[];
  }
}
```

---

### Cash Flow Monitoring

#### `GET /api/v1/analytics/monitoring/cash-flow`
Get cash flow analysis and forecasting.

**Query Params:**
- `period: 'daily' | 'weekly' | 'monthly'`
- `forecast: boolean` - Include AI forecast

**Response:**
```typescript
{
  success: true,
  data: {
    current_balance: number;
    incoming: number;
    outgoing: number;
    net_flow: number;
    forecast?: ForecastData[];
  }
}
```

---

## User Management APIs

User profiles, roles, and team management.

### User Profile

#### `GET /api/v1/users/profile`
Get current user profile.

**Response:**
```typescript
{
  success: true,
  data: {
    user_id: string;
    email: string;
    full_name: string;
    department?: string;
    home_currency: string;
    preferences: UserPreferences;
  }
}
```

#### `PATCH /api/v1/users/profile`
Update user profile.

**Request:**
```typescript
{
  full_name?: string;
  department?: string;
  home_currency?: string;
  preferences?: Partial<UserPreferences>;
}
```

---

### Role Management

#### `GET /api/v1/users/role`
Get current user's role in active business.

**Response:**
```typescript
{
  success: true,
  data: {
    role: 'owner' | 'admin' | 'manager' | 'employee';
    permissions: Permission[];
  }
}
```

#### `GET /api/v1/users/[id]/roles`
Get user's roles across all businesses (admin only).

#### `PATCH /api/v1/users/[id]/roles`
Update user role (admin only).

**Request:**
```typescript
{
  business_id: string;
  role: 'admin' | 'manager' | 'employee';
}
```

---

### Team Management

#### `GET /api/v1/users/team`
List all team members in current business.

**Response:**
```typescript
{
  success: true,
  data: {
    team_members: TeamMember[];
    total: number;
  }
}
```

---

## System APIs

Infrastructure, webhooks, and knowledge base management.

### Knowledge Base

#### `GET /api/v1/system/knowledge-base/regulatory-documents`
List regulatory knowledge base documents.

**Response:**
```typescript
{
  success: true,
  data: {
    documents: RegulatoryDocument[];
    total: number;
  }
}
```

#### `POST /api/v1/system/knowledge-base/search`
Vector search in regulatory knowledge base.

**Request:**
```typescript
{
  query: string;
  country?: string;
  tax_type?: string;
  limit?: number;
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    results: SearchResult[];
    relevance_scores: number[];
  }
}
```

#### `GET /api/v1/system/knowledge-base/chunks`
List knowledge base chunks for debugging.

---

### Webhooks

#### `POST /api/v1/system/webhooks/clerk`
Clerk webhook handler for user sync.

**Events:**
- `user.created` - Sync new user to Supabase
- `user.updated` - Update user profile
- `user.deleted` - Soft delete user

**Security:** Svix signature verification

---

### Audit Events

#### `GET /api/v1/system/audit-events`
List audit log events.

**Query Params:**
- `action: string` - Filter by action type
- `user_id: string` - Filter by user
- `date_from: string`
- `date_to: string`

**Response:**
```typescript
{
  success: true,
  data: {
    events: AuditEvent[];
    pagination: PaginationMeta;
  }
}
```

---

## Utility APIs

Cross-cutting utilities for currency, translation, and security.

### Currency Conversion

#### `GET /api/v1/utils/currency/list`
List supported currencies.

**Response:**
```typescript
{
  success: true,
  data: {
    currencies: Currency[];
    supported: ['THB', 'IDR', 'MYR', 'SGD', 'USD', 'EUR', 'CNY', 'VND', 'PHP', 'INR']
  }
}
```

#### `POST /api/v1/utils/currency/convert`
Convert amount between currencies.

**Request:**
```typescript
{
  amount: number;
  from_currency: string;
  to_currency: string;
  date?: string; // Historical rate
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    conversion: {
      original_amount: number;
      original_currency: string;
      converted_amount: number;
      converted_currency: string;
      exchange_rate: number;
      rate_date: string;
    }
  }
}
```

---

### Translation

#### `POST /api/v1/utils/translate`
Translate text using SEALION AI.

**Request:**
```typescript
{
  text: string;
  source_language: 'en' | 'th' | 'id' | 'zh';
  target_language: 'en' | 'th' | 'id' | 'zh';
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    translated_text: string;
    confidence: number;
  }
}
```

---

### Security

#### `GET /api/v1/utils/security/csrf-token`
Get CSRF token for forms.

**Response:**
```typescript
{
  success: true,
  data: {
    token: string;
    expires_at: string;
  }
}
```

---

## Shared Schemas

#### `GET /api/v1/shared/schemas/[documentType]`
Get Zod schema for document type validation.

**Path Params:**
- `documentType: 'invoice' | 'receipt' | 'contract'`

**Response:**
```typescript
{
  success: true,
  data: {
    schema: ZodSchema;
    fields: FieldDefinition[];
  }
}
```

---

## Task Management

#### `GET /api/v1/tasks/[id]/status`
Get background task status (Trigger.dev).

**Response:**
```typescript
{
  success: true,
  data: {
    task_id: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    progress?: number;
    result?: any;
    error?: string;
  }
}
```

---

## API Design Patterns

### Security

1. **Clerk Authentication**: All endpoints use `auth()` from `@clerk/nextjs/server`
2. **Row Level Security (RLS)**: Database queries filtered by `user_id` and `business_id`
3. **RBAC Authorization**: `requirePermission()` helper for role-based access
4. **CSRF Protection**: Required for state-changing operations
5. **Input Validation**: Zod schemas for request validation

### Error Handling

```typescript
// Standard Error Response
{
  success: false,
  error: string,
  details?: {
    field: string;
    message: string;
  }[]
}
```

**HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

### Pagination

```typescript
// List Response Format
{
  success: true,
  data: {
    items: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      total_pages: number;
    }
  }
}
```

### Background Jobs

Long-running operations use Trigger.dev v3:
- OCR document processing
- DSPy receipt extraction
- Image annotation with Python + OpenCV
- Bulk data exports

**Pattern:**
```typescript
// 1. Trigger background job
const { id: taskId } = await tasks.trigger<typeof processDocumentOCR>(
  "process-document-ocr",
  { documentId }
)

// 2. Return immediate response
return NextResponse.json({
  success: true,
  data: { task_id: taskId, status: 'queued' }
}, { status: 202 })

// 3. Client polls GET /api/v1/tasks/[id]/status
```

### Multi-Tenancy

All data scoped by `business_id`:
```typescript
const { data, error } = await supabase
  .from('accounting_entries')
  .select('*')
  .eq('business_id', currentBusinessId)
  .eq('user_id', userId)
```

**Business Context:**
- Stored in Clerk user metadata
- Retrieved via `GET /api/v1/account-management/businesses/context`
- Switchable via `POST /api/v1/account-management/businesses/switch`

---

## Rate Limiting

**Current Implementation:**
- No explicit rate limiting (relies on Vercel edge function limits)
- Recommended: Implement Redis-based rate limiting for production

**Suggested Limits:**
- Anonymous: 10 req/min
- Authenticated: 100 req/min
- Document upload: 10 uploads/hour
- AI chat: 30 messages/hour

---

## Versioning

**Current Version:** v1
**Breaking Changes:** Will introduce v2 with backward compatibility period

**Version Header:**
```
API-Version: v1
```

---

## Monitoring & Observability

**Logging:**
- Console.log with structured tags: `[Domain API v1]`
- Error details logged with stack traces

**Recommended:**
- Sentry for error tracking
- Datadog/New Relic for APM
- Custom metrics for business KPIs

---

## Testing

**Endpoint Testing:**
```typescript
// Accounting entries endpoints removed (2026-03-14).
// Use Convex mutations directly for financial transactions.
```

---

## Migration Notes

### From Legacy API (if applicable)

**Deprecated Endpoints:**
- `/api/transactions` → REMOVED (use Convex journal_entries)
- `/api/v1/accounting-entries` → REMOVED (use Convex journal_entries)
- `/api/documents/process` → `/api/v1/invoices/[id]/process`

**Breaking Changes:**
- Response format now uses `{ success, data, error }` wrapper
- Pagination params changed to `page` and `limit`
- Authentication moved to Clerk from custom JWT

---

## Support & Contact

**Documentation Issues:** Check main `CLAUDE.md` for architecture context
**API Questions:** Contact development team
**Bug Reports:** Submit via GitHub issues

---

**Last Updated:** 2025-01-13
**API Version:** v1.0.0
**Maintained By:** Groot Finance Development Team
