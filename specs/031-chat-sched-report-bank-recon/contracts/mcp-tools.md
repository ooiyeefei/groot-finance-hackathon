# MCP Tool Contracts

All tools are MCP server endpoints on `finanseal-mcp-server`. Called via `callMCPTool()` from Convex.

## schedule_report

Create/modify a recurring report schedule.

**Input**:
```json
{
  "action": "create" | "modify" | "cancel" | "list",
  "scheduleId": "string (required for modify/cancel)",
  "reportType": "pnl" | "cash_flow" | "ar_aging" | "ap_aging" | "expense_summary",
  "frequency": "daily" | "weekly" | "monthly",
  "dayOfWeek": 0-6,
  "dayOfMonth": 1-28,
  "recipients": ["email@example.com"],
  "_businessId": "string",
  "_userId": "string"
}
```

**Output (create)**:
```json
{
  "success": true,
  "scheduleId": "...",
  "reportType": "pnl",
  "frequency": "weekly",
  "dayOfWeek": 1,
  "nextRunDate": "2026-03-24T04:00:00Z",
  "recipients": ["user@example.com"],
  "message": "Weekly P&L scheduled for every Monday. Next report: Mar 24, 2026."
}
```

**Output (list)**:
```json
{
  "schedules": [
    {
      "scheduleId": "...",
      "reportType": "pnl",
      "frequency": "weekly",
      "dayOfWeek": 1,
      "nextRunDate": "2026-03-24T04:00:00Z",
      "recipients": ["user@example.com"],
      "lastRunStatus": "success",
      "isActive": true
    }
  ],
  "count": 1
}
```

## run_bank_reconciliation

Trigger bank reconciliation for a specific bank account.

**Input**:
```json
{
  "bankAccountId": "string",
  "_businessId": "string",
  "_userId": "string"
}
```

**Output**:
```json
{
  "runId": "...",
  "bankAccountName": "Maybank Current Account",
  "status": "complete",
  "summary": {
    "totalProcessed": 45,
    "matched": 30,
    "pendingReview": 10,
    "unmatched": 5
  },
  "pendingMatches": [
    {
      "matchId": "...",
      "bankTransaction": {
        "id": "...",
        "date": "2026-03-15",
        "amount": -1500.00,
        "description": "TRF TO ACME SDN BHD"
      },
      "matchedItems": [
        {
          "type": "invoice",
          "id": "...",
          "reference": "INV-2026-0042",
          "amount": 1500.00,
          "vendor": "Acme Sdn Bhd"
        }
      ],
      "confidence": 0.87,
      "matchType": "fuzzy"
    }
  ],
  "message": "Reconciled 45 transactions: 30 matched, 10 need review, 5 unmatched."
}
```

## accept_recon_match

Accept or reject a reconciliation match.

**Input**:
```json
{
  "action": "accept" | "reject" | "bulk_accept",
  "matchId": "string (for individual)",
  "runId": "string (for bulk)",
  "minConfidence": 0.9,
  "_businessId": "string",
  "_userId": "string"
}
```

**Output (individual)**:
```json
{
  "success": true,
  "matchId": "...",
  "journalEntryId": "...",
  "message": "Match accepted. Journal entry created: Dr. Bank Charges 6200, Cr. Cash 1000 — MYR 1,500.00"
}
```

**Output (bulk)**:
```json
{
  "success": true,
  "acceptedCount": 8,
  "journalEntriesCreated": 8,
  "message": "8 matches above 90% confidence accepted. 8 journal entries created."
}
```

## show_recon_status

Query current reconciliation status.

**Input**:
```json
{
  "bankAccountId": "string (optional — all accounts if omitted)",
  "query": "string (optional — natural language query about specific transaction)",
  "_businessId": "string"
}
```

**Output**:
```json
{
  "accounts": [
    {
      "bankAccountId": "...",
      "bankAccountName": "Maybank Current Account",
      "totalTransactions": 150,
      "matched": 120,
      "pendingReview": 15,
      "unmatched": 15,
      "dateRange": { "from": "2026-01-01", "to": "2026-03-21" },
      "lastReconDate": "2026-03-20T04:00:00Z"
    }
  ],
  "unmatchedTransactions": [
    {
      "id": "...",
      "date": "2026-03-18",
      "amount": -500.00,
      "description": "TRF TO UNKNOWN PARTY",
      "status": "unmatched"
    }
  ],
  "message": "Maybank: 150 transactions — 120 matched, 15 pending review, 15 unmatched."
}
```
