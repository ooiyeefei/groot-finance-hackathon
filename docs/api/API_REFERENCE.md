# FinanSEAL API V1 Reference Guide

Quick reference for all V1 API endpoints.

---

## Authentication

All endpoints require Clerk authentication via `Authorization: Bearer <token>` header.

**Authentication Flow**:
```typescript
const { userId } = await auth() // Clerk Next.js
if (!userId) return 401 Unauthorized
```

---

## Response Format

**Success**:
```json
{
  "success": true,
  "data": { ... }
}
```

**Error**:
```json
{
  "success": false,
  "error": "Descriptive error message"
}
```

---

## Domain APIs

### Applications
```
GET    /api/v1/applications
POST   /api/v1/applications
GET    /api/v1/applications/[id]
PUT    /api/v1/applications/[id]
DELETE /api/v1/applications/[id]
GET    /api/v1/applications/[id]/summary
POST   /api/v1/applications/[id]/documents/[documentId]/process
```

### Accounting Entries
```
GET    /api/v1/accounting-entries
POST   /api/v1/accounting-entries
GET    /api/v1/accounting-entries/[entryId]
PUT    /api/v1/accounting-entries/[entryId]
DELETE /api/v1/accounting-entries/[entryId]
PATCH  /api/v1/accounting-entries/[entryId]/status
PATCH  /api/v1/accounting-entries/[entryId]/category
```

### Invoices
```
GET    /api/v1/invoices
POST   /api/v1/invoices
GET    /api/v1/invoices/[invoiceId]
PUT    /api/v1/invoices/[invoiceId]
DELETE /api/v1/invoices/[invoiceId]
POST   /api/v1/invoices/[invoiceId]/process
GET    /api/v1/invoices/[invoiceId]/image-url
```

### Expense Claims
```
GET    /api/v1/expense-claims
POST   /api/v1/expense-claims
GET    /api/v1/expense-claims/[id]
PUT    /api/v1/expense-claims/[id]
DELETE /api/v1/expense-claims/[id]
PATCH  /api/v1/expense-claims/[id]/status
GET    /api/v1/expense-claims/categories
POST   /api/v1/expense-claims/categories
GET    /api/v1/expense-claims/categories/enabled
```

### Account Management
```
GET    /api/v1/account-management/businesses/context
POST   /api/v1/account-management/businesses
POST   /api/v1/account-management/businesses/switch
GET    /api/v1/account-management/businesses/profile
PUT    /api/v1/account-management/businesses/profile
GET    /api/v1/account-management/invitations
POST   /api/v1/account-management/invitations
GET    /api/v1/account-management/invitations/[id]
DELETE /api/v1/account-management/invitations/[id]
POST   /api/v1/account-management/invitations/[id]/resend
POST   /api/v1/account-management/invitations/accept
GET    /api/v1/account-management/cogs-categories
POST   /api/v1/account-management/cogs-categories
GET    /api/v1/account-management/cogs-categories/enabled
```

### Chat
```
POST   /api/v1/chat
GET    /api/v1/chat/conversations
GET    /api/v1/chat/conversations/[id]
PUT    /api/v1/chat/conversations/[id]
DELETE /api/v1/chat/conversations/[id]
GET    /api/v1/chat/messages/[id]
PUT    /api/v1/chat/messages/[id]
DELETE /api/v1/chat/messages/[id]
```

### Users
```
GET    /api/v1/users/profile
PATCH  /api/v1/users/profile
GET    /api/v1/users/team
GET    /api/v1/users/role
POST   /api/v1/users/[id]/roles
```

### Analytics
```
GET    /api/v1/analytics/dashboards
GET    /api/v1/analytics/realtime
POST   /api/v1/analytics/monitoring/cash-flow
```

### Tasks
```
GET    /api/v1/tasks/[id]/status
```

---

## Utility APIs

### Currency
```
GET    /api/v1/utils/currency/list
POST   /api/v1/utils/currency/convert
```

**Supported Currencies**: THB, IDR, MYR, SGD, USD, EUR, CNY, VND, PHP

### Translation
```
POST   /api/v1/utils/translate
```

**Request**:
```json
{
  "text": "สวัสดีครับ",
  "sourceLanguage": "Thai",
  "targetLanguage": "English"
}
```

### Security
```
GET    /api/v1/utils/security/csrf-token
```

---

## System APIs

### Audit Events
```
GET    /api/v1/system/audit-events
POST   /api/v1/system/audit-events
```

**Purpose**: Compliance tracking (SOC2, GDPR), security auditing

### Webhooks
```
POST   /api/v1/system/webhooks/clerk
```

**Webhook Events**: `user.created`, `user.updated`, `user.deleted`

### Knowledge Base
```
GET    /api/v1/system/knowledge-base/regulatory-documents
GET    /api/v1/system/knowledge-base/chunks
POST   /api/v1/system/knowledge-base/search
```

**Authentication**: Requires `INTERNAL_SERVICE_KEY` header

---

## Root Level Exception

### Trigger.dev
```
GET    /api/trigger
POST   /api/trigger
```

⚠️ **IMPORTANT**: This endpoint MUST remain at root level (Trigger.dev framework requirement).

---

## Service Layers

All business logic is centralized in service layers:

```
src/domains/
├── account-management/lib/account-management.service.ts
├── analytics/lib/analytics.service.ts
├── audit/lib/audit.service.ts
├── chat/lib/chat.service.ts
├── expense-claims/lib/data-access.ts
├── system/lib/
│   ├── knowledge-base.service.ts
│   └── webhook.service.ts
├── tasks/lib/task.service.ts
├── users/lib/user.service.ts
└── utilities/lib/
    ├── translation.service.ts
    └── utilities.service.ts
```

---

## Multi-Tenant Isolation

All service functions enforce multi-tenant isolation:

```typescript
// ✅ CORRECT: Always filter by business_id
const { data } = await supabase
  .from('table')
  .select('*')
  .eq('business_id', userData.business_id) // Required

// ❌ WRONG: Missing business_id filter
const { data } = await supabase
  .from('table')
  .select('*')
  .eq('user_id', userId) // Not enough!
```

---

## Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Continue |
| 401 | Unauthorized | Check authentication |
| 403 | Forbidden | Check permissions |
| 404 | Not Found | Verify resource exists |
| 500 | Internal Server Error | Check logs |

---

## Rate Limiting

**Current**: No rate limiting (development)
**Recommended**: 100 requests/minute per user (production)

---

## Caching

| Service | TTL | Strategy |
|---------|-----|----------|
| Currency Exchange Rates | 1 hour | In-memory cache |
| Analytics Dashboard | 5 minutes | Redis cache (future) |

---

## Testing

### Postman Collection
Import from: `docs/api-migration/postman_collection.json` (to be created)

### cURL Examples

**Get User Profile**:
```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/v1/users/profile
```

**Create Expense Claim**:
```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 50.00, "currency": "SGD", "description": "Lunch"}' \
  https://your-domain.com/api/v1/expense-claims
```

---

## Deployment URLs

**Development**: `http://localhost:3000/api/v1/*`
**Staging**: `https://staging.finanseal.com/api/v1/*`
**Production**: `https://app.finanseal.com/api/v1/*`

---

## Support

For API support, contact:
- Technical Issues: Create issue in GitHub repo
- Architecture Questions: Review `V1_MIGRATION_COMPLETE.md`
- Service Layer Details: Check individual service files

---

**Last Updated**: October 13, 2025
**API Version**: V1 (Complete)
