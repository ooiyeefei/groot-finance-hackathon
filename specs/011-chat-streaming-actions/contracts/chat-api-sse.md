# API Contract: Chat SSE Streaming Endpoint

**Endpoint**: `POST /api/copilotkit`
**Content-Type (request)**: `application/json`
**Content-Type (response)**: `text/event-stream`

---

## Request

```json
{
  "message": "Are there any suspicious transactions this month?",
  "conversationId": "conv_abc123",
  "conversationHistory": [
    { "role": "user", "content": "previous message" },
    { "role": "assistant", "content": "previous response" }
  ],
  "language": "en"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| message | string | Yes | User's message text |
| conversationId | string | No | Convex conversation ID (auto-created if absent) |
| conversationHistory | array | No | Previous messages for context |
| language | string | No | Language code (default: "en") |

**Authentication**: Clerk session cookie (same as current)
**Rate Limit**: 30 messages/hour/user (same as current)

---

## Response (SSE Stream)

Each event follows the SSE format: `event: <type>\ndata: <json>\n\n`

### Event Types

#### `status`
Emitted when the agent enters a processing phase.

```
event: status
data: {"phase": "Searching documents..."}

event: status
data: {"phase": "Analyzing transactions..."}
```

#### `text`
Emitted per token as the LLM generates text.

```
event: text
data: {"token": "I found "}

event: text
data: {"token": "3 suspicious "}

event: text
data: {"token": "transactions."}
```

#### `action`
Emitted when the agent produces structured action card data.

```
event: action
data: {
  "type": "anomaly_card",
  "id": "action_001",
  "data": {
    "anomalies": [
      {
        "id": "anom_1",
        "severity": "high",
        "title": "Duplicate Payment",
        "description": "Vendor ABC charged $2,400 on both Jan 5 and Jan 6",
        "amount": 2400,
        "currency": "SGD",
        "resourceId": "sub_xyz",
        "resourceType": "expense_claim",
        "actions": [
          { "label": "View Transaction", "action": "navigate", "url": "/en/expense-claims/submissions/sub_xyz" }
        ]
      }
    ]
  }
}
```

#### `citation`
Emitted when citation metadata is available.

```
event: citation
data: {"citations": [{"sourceType": "document", "sourceId": "doc_123", "content": "..."}]}
```

#### `done`
Emitted exactly once when the stream completes successfully.

```
event: done
data: {"totalTokens": 245}
```

#### `error`
Emitted when an error occurs during processing. Terminates the stream.

```
event: error
data: {"message": "Failed to process message", "code": "AGENT_ERROR"}
```

---

## Error Responses (Non-Streaming)

These are returned as standard JSON (not SSE) before the stream begins:

| Status | Body | Condition |
|--------|------|-----------|
| 401 | `{"error": "Unauthorized"}` | No Clerk session |
| 400 | `{"error": "No business context found"}` | User has no business |
| 400 | `{"error": "Message is required"}` | Empty message |
| 429 | `{"error": "Rate limit exceeded"}` | >30 messages/hour |

---

## Client Consumption Pattern

```
const response = await fetch('/api/copilotkit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message, conversationId, conversationHistory, language }),
  signal: abortController.signal  // for Stop button
})

const reader = response.body.getReader()
const decoder = new TextDecoder()

// Read SSE chunks, parse event type + data, update UI progressively
```

---

## Backward Compatibility

The endpoint path remains `/api/copilotkit` (same as current). The request body schema is unchanged. The only change is the response format: from `application/json` to `text/event-stream`. The client (useCopilotBridge hook) must be updated to consume the stream instead of calling `.json()`.
