# Data Model: Action-Driven Rendering & SSE Streaming

**Branch**: `011-chat-streaming-actions` | **Date**: 2026-02-12

---

## Entities

### ChatAction

A structured data object returned by the AI agent alongside text content. Stored in Convex message metadata for historical rendering.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | string (enum) | Yes | Action card type identifier (e.g., "anomaly_card", "expense_approval", "vendor_comparison", "spending_chart") |
| data | object | Yes | Type-specific payload (see Card Data Schemas below) |
| id | string | No | Unique identifier for the action instance (for tracking button clicks, state changes) |

**Extensibility**: The `type` field maps to a component registry. New types can be added by:
1. Defining a new data schema
2. Registering a React component in the action registry
3. Unrecognized types fall back to text rendering

---

### StreamEvent

A unit of data sent from server to client during response generation via SSE.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| event | string (enum) | Yes | Event type: "status", "text", "action", "citation", "done", "error" |
| data | object | Yes | Event-specific payload |

**Event payloads**:

- `status`: `{ phase: string }` — e.g., "Searching documents...", "Analyzing transactions..."
- `text`: `{ token: string }` — incremental text token
- `action`: `ChatAction` — complete action card payload
- `citation`: `{ citations: CitationData[] }` — citation metadata
- `done`: `{ totalTokens?: number }` — stream completion signal
- `error`: `{ message: string, code?: string }` — error during processing

---

### Card Data Schemas

#### AnomalyCardData

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| anomalies | AnomalyItem[] | Yes | List of detected anomalies |
| summary | string | No | Overall summary text |

**AnomalyItem**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique anomaly identifier |
| severity | "high" \| "medium" \| "low" | Yes | Severity level for color coding |
| title | string | Yes | Short description (e.g., "Duplicate Payment") |
| description | string | Yes | Detailed explanation |
| amount | number | No | Amount involved |
| currency | string | No | Currency code (e.g., "SGD") |
| date | string | No | Date of the anomaly (ISO format) |
| resourceId | string | No | ID of the related record (expense claim, transaction) |
| resourceType | "expense_claim" \| "transaction" \| "vendor" | No | Type of the related record |
| actions | ActionButton[] | No | Available actions for this anomaly |

#### ExpenseApprovalCardData

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| submissionId | string | Yes | Convex submission document ID |
| submitterName | string | Yes | Name of the person who submitted |
| totalAmount | number | Yes | Total amount of the submission |
| currency | string | Yes | Currency code |
| claimCount | number | Yes | Number of claims in the submission |
| category | string | No | Primary expense category |
| submittedDate | string | Yes | When it was submitted (ISO format) |
| status | "pending" \| "approved" \| "rejected" | Yes | Current status (for historical rendering) |
| claims | ExpenseClaimSummary[] | No | Individual claim details |

**ExpenseClaimSummary**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Claim ID |
| description | string | Yes | Claim description |
| amount | number | Yes | Claim amount |
| category | string | No | Expense category |

#### VendorComparisonCardData

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| vendors | VendorMetrics[] | Yes | List of vendors to compare (2-5) |
| comparisonPeriod | string | No | Time period of comparison |

**VendorMetrics**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Vendor ID |
| name | string | Yes | Vendor name |
| averagePrice | number | No | Average transaction amount |
| currency | string | No | Currency code |
| onTimeRate | number | No | On-time delivery percentage (0-100) |
| rating | number | No | Rating (0-5) |
| transactionCount | number | No | Number of transactions in period |
| totalSpend | number | No | Total spend in period |

#### SpendingChartData

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| chartType | "bar" \| "horizontal_bar" \| "stacked_bar" | Yes | Chart visualization type |
| title | string | Yes | Chart title |
| period | string | No | Time period label |
| categories | ChartCategory[] | Yes | Data points for the chart |
| total | number | No | Grand total |
| currency | string | No | Currency code |

**ChartCategory**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| label | string | Yes | Category name |
| value | number | Yes | Amount |
| percentage | number | No | Percentage of total (0-100) |
| color | string | No | Semantic color token (e.g., "primary", "destructive") |

---

### ActionButton

Shared across card types for interactive buttons.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| label | string | Yes | Button text (e.g., "Approve", "View Transaction") |
| action | string | Yes | Action identifier (e.g., "approve", "reject", "navigate", "send_reminder") |
| resourceId | string | No | Target resource ID |
| url | string | No | Navigation URL (for "navigate" action) |
| variant | "primary" \| "destructive" \| "secondary" | No | Button styling variant |
| requiresConfirmation | boolean | No | Whether to show inline confirmation before executing (default: false) |

---

## State Transitions

### ExpenseApprovalCard State Machine

```
pending → [user clicks Approve] → confirming → [user confirms] → approved
pending → [user clicks Reject]  → confirming → [user confirms] → rejected
confirming → [user cancels] → pending
confirming → [backend error] → error → pending (retry available)
```

When loaded from history: card renders directly in `approved`, `rejected`, or `pending` state based on stored `status` field.

### StreamEvent Lifecycle

```
[user sends message]
  → status events (0-N, as agent processes through nodes)
  → text events (0-N, as LLM generates tokens)
  → action events (0-N, when structured data is ready)
  → citation events (0-1, when citations are available)
  → done event (exactly 1, signals completion)

OR at any point:
  → error event (exactly 1, signals failure)

OR at any point (user-initiated):
  → [abort signal] → stream ends, partial content preserved
```

---

## Storage

### Convex Message Metadata Extension

The existing `metadata` field on chat messages (currently stores `citations`) will be extended to also store action card data:

```
metadata: {
  citations?: CitationData[]      // existing
  actions?: ChatAction[]          // new — action cards for this message
  actionStates?: Record<string, string>  // new — tracks button click states (e.g., { "sub123": "approved" })
}
```

No Convex schema changes required — `metadata` is already a flexible object field.
