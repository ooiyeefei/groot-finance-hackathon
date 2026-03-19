# Data Model: AI Agent RBAC & Intelligence

## Entities

### UserContext (modified)

The authenticated user context flowing through the agent pipeline.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| userId | string | Yes | Clerk user ID |
| convexUserId | string | Yes | Convex database user ID |
| businessId | string | Yes | Business ID for tenant isolation |
| role | string | **Yes (NEW)** | Business membership role: employee, manager, finance_admin, owner |
| homeCurrency | string | No | Business/user home currency |
| conversationId | string | No | Chat conversation ID |

**Change**: `role` is now REQUIRED (was optional/undefined). Set by both API route and base-tool.ts profile enrichment.

### ToolAccessTier (new concept)

Classification of tools by minimum role required.

| Tier | Roles | Tools |
|------|-------|-------|
| personal | all | get_transactions, search_documents, get_vendors, searchRegulatoryKnowledgeBase |
| manager | manager, finance_admin, owner | get_employee_expenses, get_team_summary, get_action_center_insight |
| finance | finance_admin, owner | get_invoices, get_sales_invoices, search_invoices, get_ar_summary, get_ap_aging, get_business_transactions, analyze_cash_flow, detect_anomalies, analyze_vendor_risk |

### Action Center Insight Scope (modified)

| Role | duplicates | approvals_pending | overdue |
|------|-----------|-------------------|---------|
| manager | Direct reports' expenses only | Direct reports only | Direct reports only |
| finance_admin | Business-wide (all expenses + invoices) | Business-wide | Business-wide |
| owner | Business-wide (all expenses + invoices) | Business-wide | Business-wide |

## Existing Tables Referenced (no schema changes)

### invoices (AP)
Key fields for new queries: `businessId`, `vendorName`, `invoiceNumber`, `invoiceDate`, `amount`, `currency`, `paidAmount`, `paymentStatus`, `dueDate`, `isPosted`, `lineItems[]`, `extractedData`

### sales_invoices (AR)
Key fields for new queries: `businessId`, `clientName`, `invoiceNumber`, `invoiceDate`, `dueDate`, `total`, `currency`, `status`, `outstandingBalance`

### journal_entry_lines (business-wide transactions)
Key fields: `businessId`, `accountCode`, `debitAmount`, `creditAmount`, `transactionDate`, `description`, `vendorName`, `category`, `sourceDocumentType`

### business_memberships (role resolution)
Key fields: `userId`, `businessId`, `role`, `managerId`, `status`
