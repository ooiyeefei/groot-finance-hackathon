# MCP Contracts: Finance/AP/AR Batch

**Tools**: 9 tools migrating from tool-factory to MCP server

## get_invoices
- **Input**: `{ business_id?, status_filter?, vendor_filter?, date_range?, limit? }`
- **Output**: `{ invoices: Invoice[], total_count, filters_applied }`
- **RBAC**: finance_admin, owner

## get_sales_invoices
- **Input**: `{ business_id?, status_filter?, customer_filter?, date_range?, limit? }`
- **Output**: `{ sales_invoices: SalesInvoice[], total_count, filters_applied }`
- **RBAC**: finance_admin, owner

## get_transactions
- **Input**: `{ business_id?, account_code?, date_range?, type_filter?, limit? }`
- **Output**: `{ transactions: JournalEntryLine[], total_count, summary }`
- **RBAC**: finance_admin, owner

## get_vendors
- **Input**: `{ business_id?, search_query?, limit? }`
- **Output**: `{ vendors: Vendor[], total_count }`
- **RBAC**: finance_admin, owner

## search_documents
- **Input**: `{ business_id?, query, document_type?, date_range?, limit? }`
- **Output**: `{ documents: Document[], total_count, search_relevance }`
- **RBAC**: all roles

## searchRegulatoryKnowledgeBase
- **Input**: `{ query, jurisdiction?, topic_filter? }`
- **Output**: `{ results: KBEntry[], total_count, confidence_scores }`
- **RBAC**: all roles

## get_ar_summary
- **Input**: `{ business_id?, as_of_date?, aging_buckets? }`
- **Output**: `{ aging_summary: AgingBucket[], total_outstanding, overdue_amount }`
- **RBAC**: finance_admin, owner

## get_ap_aging
- **Input**: `{ business_id?, as_of_date?, vendor_filter? }`
- **Output**: `{ aging_summary: AgingBucket[], total_outstanding, overdue_amount }`
- **RBAC**: finance_admin, owner

## get_business_transactions
- **Input**: `{ business_id?, date_range?, category?, limit? }`
- **Output**: `{ transactions: Transaction[], total_count, summary }`
- **RBAC**: finance_admin, owner
