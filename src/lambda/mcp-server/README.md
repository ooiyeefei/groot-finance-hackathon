# Groot Finance MCP Server

Financial intelligence tools for AI assistants via the Model Context Protocol (MCP).

> Connect Claude Desktop, Cursor, or any MCP-compatible client to your Groot Finance business data.

## Quick Start

### 1. Get Your API Key

1. Go to **Settings > API Keys** in your Groot Finance dashboard
2. Click **Create API Key**
3. Select permissions for the tools you want to use
4. Copy and save your key (shown only once)

### 2. Configure Your MCP Client

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "finanseal": {
      "url": "https://kuy2a5zca8.execute-api.us-west-2.amazonaws.com/v1/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

#### Cursor

Add to your Cursor MCP settings:

```json
{
  "mcp": {
    "servers": {
      "finanseal": {
        "type": "http",
        "url": "https://kuy2a5zca8.execute-api.us-west-2.amazonaws.com/v1/mcp",
        "headers": {
          "Authorization": "Bearer YOUR_API_KEY"
        }
      }
    }
  }
}
```

### 3. Test Connection

```bash
curl -X POST https://kuy2a5zca8.execute-api.us-west-2.amazonaws.com/v1/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":"1"}'
```

---

## Available Tools

### Read-Only Intelligence Tools

These tools analyze your financial data without making changes.

#### `detect_anomalies`

Detect unusual financial transactions using statistical outlier analysis.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `date_range` | object | No | `{start: "YYYY-MM-DD", end: "YYYY-MM-DD"}`. Defaults to last 30 days |
| `category_filter` | string[] | No | Filter to specific categories, e.g., `["OFFICE_SUPPLIES", "TRAVEL"]` |
| `sensitivity` | string | No | Detection threshold: `low` (3σ), `medium` (2σ, default), `high` (1.5σ) |

**Example:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "detect_anomalies",
    "arguments": {
      "sensitivity": "high",
      "category_filter": ["TRAVEL", "MEALS"]
    }
  },
  "id": "1"
}
```

**Response:**
```json
{
  "anomalies": [
    {
      "transaction_id": "abc123",
      "description": "Flight to Singapore",
      "amount": 2500,
      "currency": "SGD",
      "category": "TRAVEL",
      "z_score": 2.8,
      "severity": "high",
      "explanation": "Amount is 2.8 standard deviations above category average"
    }
  ],
  "summary": {
    "total_transactions_analyzed": 150,
    "anomalies_found": 3,
    "sensitivity_used": "high"
  }
}
```

---

#### `forecast_cash_flow`

Project future cash balance based on historical income/expense patterns.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `horizon_days` | number | No | Forecast period: 7-90 days (default: 30) |
| `scenario` | string | No | `conservative`, `moderate` (default), or `optimistic` |
| `include_recurring` | boolean | No | Factor in recurring transactions (default: true) |

**Example:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "forecast_cash_flow",
    "arguments": {
      "horizon_days": 14,
      "scenario": "conservative"
    }
  },
  "id": "2"
}
```

**Response:**
```json
{
  "forecast": [
    {
      "date": "2026-02-04",
      "projected_balance": 45000,
      "projected_income": 0,
      "projected_expenses": 500,
      "confidence": "high"
    }
  ],
  "alerts": [
    {
      "type": "low_runway",
      "severity": "warning",
      "message": "Cash runway is 45 days at current burn rate",
      "recommendation": "Consider reducing discretionary spending"
    }
  ],
  "summary": {
    "current_balance": 50000,
    "projected_end_balance": 43000,
    "burn_rate_daily": 500,
    "scenario_used": "conservative"
  }
}
```

---

#### `analyze_vendor_risk`

Analyze vendor concentration, spending changes, and risk factors.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `vendor_filter` | string[] | No | Filter to specific vendor names |
| `analysis_period_days` | number | No | Lookback period: 7-365 days (default: 90) |
| `include_concentration` | boolean | No | Include concentration risk analysis (default: true) |
| `include_spending_changes` | boolean | No | Compare to previous period (default: true) |

**Example:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "analyze_vendor_risk",
    "arguments": {
      "analysis_period_days": 180
    }
  },
  "id": "3"
}
```

---

### Proposal Tools (Human-in-the-Loop)

These tools enable AI-assisted write operations with human approval. The two-step workflow ensures no changes happen without explicit confirmation.

> **Security Note:** Proposals expire after 15 minutes. This prevents stale approvals from executing unexpected changes.

#### `create_proposal`

Create a proposal for a write operation that requires human approval.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action_type` | string | Yes | `approve_expense`, `reject_expense`, `categorize_expense`, `update_vendor` |
| `target_id` | string | Yes | ID of the target entity (e.g., expense claim ID) |
| `parameters` | object | No | Action-specific parameters |
| `summary` | string | Yes | Human-readable summary (10-500 chars) |

**Example:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "create_proposal",
    "arguments": {
      "action_type": "reject_expense",
      "target_id": "exp_abc123",
      "parameters": {"reason": "Missing receipt"},
      "summary": "Reject expense claim for $150 lunch meeting - no receipt attached"
    }
  },
  "id": "4"
}
```

**Response:**
```json
{
  "proposal_id": "prop_xyz789",
  "expires_at": 1738600000000,
  "expires_in_seconds": 900,
  "confirmation_required": true,
  "message": "Proposal created. Call confirm_proposal to execute."
}
```

---

#### `confirm_proposal`

Confirm and execute a pending proposal (human approval step).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `proposal_id` | string | Yes | The proposal ID from `create_proposal` |

---

#### `cancel_proposal`

Cancel a pending proposal without executing it.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `proposal_id` | string | Yes | The proposal ID to cancel |
| `reason` | string | No | Optional cancellation reason |

---

## Error Handling

All errors follow a consistent format:

```json
{
  "error": true,
  "code": "ERROR_CODE",
  "message": "Human-readable description",
  "details": {}
}
```

### Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `UNAUTHORIZED` | Invalid or missing API key | Check your API key in Settings > API Keys |
| `INVALID_INPUT` | Request parameters failed validation | Check parameter types and required fields |
| `INSUFFICIENT_DATA` | Not enough data to complete analysis | Expand date range or wait for more transactions |
| `RATE_LIMITED` | Too many requests | Wait and retry. Default: 60 requests/minute |
| `CONVEX_ERROR` | Database operation failed | Retry or contact support |
| `INTERNAL_ERROR` | Unexpected server error | Retry or contact support |

### Example Error Response

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"error\":true,\"code\":\"INSUFFICIENT_DATA\",\"message\":\"Not enough transactions in the selected date range (minimum 5 required)\",\"details\":{\"transactionsFound\":1,\"minimumRequired\":5}}"
    }]
  }
}
```

---

## Rate Limiting

- Default: **60 requests per minute** per API key
- Configurable per key in Settings > API Keys
- Rate limit headers included in responses:
  - `X-RateLimit-Limit`: Maximum requests per window
  - `X-RateLimit-Remaining`: Requests remaining
  - `X-RateLimit-Reset`: Unix timestamp when limit resets

---

## Security

- **API keys are hashed** - only the prefix is stored, never the full key
- **Business isolation** - each key is scoped to one business
- **Permission-based access** - keys can be limited to specific tools
- **Expiration support** - set keys to auto-expire after 30, 90, or 365 days
- **Audit logging** - all tool calls are logged with timestamps

---

## Protocol Details

This server implements the [Model Context Protocol](https://modelcontextprotocol.io) over HTTP.

**Endpoint:** `https://kuy2a5zca8.execute-api.us-west-2.amazonaws.com/v1/mcp`

**Supported Methods:**
- `initialize` - Protocol handshake
- `tools/list` - List available tools
- `tools/call` - Execute a tool

**Content-Type:** `application/json`

**Authentication:** Bearer token in `Authorization` header

---

## Support

- **Documentation**: This README and inline tool descriptions
- **Issues**: Contact Groot Finance support
- **API Key Management**: Settings > API Keys in your dashboard
