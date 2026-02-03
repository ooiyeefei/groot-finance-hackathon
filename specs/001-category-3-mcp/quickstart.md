# Quickstart: Category 3 MCP Server

**Phase**: Implementation Complete
**Date**: 2026-01-29

## Prerequisites

- Node.js 20.x
- AWS CLI configured with `groot-finanseal` profile
- Convex CLI (`npx convex`)
- Access to FinanSEAL Convex deployment

## Development Setup

### 1. Install Dependencies

```bash
cd src/lambda/mcp-server
npm install
```

### 2. Build TypeScript

```bash
npm run build
# or watch mode:
npm run watch
```

### 3. Local Testing

The MCP server runs as a Lambda function. For local testing:

```bash
# Option A: Use SAM CLI
cd infra
sam local invoke MCPServerFunction -e test-events/detect-anomalies.json

# Option B: Direct HTTP testing with curl
curl -X POST http://localhost:3000/api/v1/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fsk_test_key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

## Key Commands

### Deploy to AWS

```bash
cd infra
npx cdk deploy FinansealMCPServer \
  --app "npx ts-node --prefer-ts-exts bin/mcp-server.ts" \
  --profile groot-finanseal --require-approval never
```

### Deploy Convex Schema

```bash
npx convex deploy --yes
```

### Run Tests

```bash
npm run test:run
```

## File Locations

| Component | Location |
|-----------|----------|
| Lambda handler | `src/lambda/mcp-server/handler.ts` |
| MCP protocol types | `src/lambda/mcp-server/contracts/mcp-protocol.ts` |
| Tool schemas | `src/lambda/mcp-server/contracts/mcp-tools.ts` |
| Tool implementations | `src/lambda/mcp-server/tools/` |
| Convex intelligence | `convex/functions/financialIntelligence.ts` |
| CDK infrastructure | `infra/lib/mcp-server-stack.ts` |
| API key functions | `convex/functions/mcpApiKeys.ts` |
| Proposal functions | `convex/functions/mcpProposals.ts` |

## Testing the MCP Server

### 1. Initialize Connection

```bash
curl -X POST https://kuy2a5zca8.execute-api.us-west-2.amazonaws.com/v1/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": { "name": "test", "version": "1.0" }
    }
  }'
```

### 2. List Available Tools

```bash
curl -X POST https://kuy2a5zca8.execute-api.us-west-2.amazonaws.com/v1/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fsk_YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }'
```

### 3. Call a Tool (Business ID from API Key)

```bash
curl -X POST https://kuy2a5zca8.execute-api.us-west-2.amazonaws.com/v1/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fsk_YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "detect_anomalies",
      "arguments": {
        "sensitivity": "medium"
      }
    }
  }'
```

Note: `business_id` is automatically derived from the API key, so you don't need to provide it in the request.

### 4. Create and Confirm a Proposal (Human Approval Flow)

```bash
# Step 1: Create a proposal
curl -X POST https://kuy2a5zca8.execute-api.us-west-2.amazonaws.com/v1/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fsk_YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "create_proposal",
      "arguments": {
        "action_type": "approve_expense",
        "target_id": "EXPENSE_CLAIM_ID",
        "summary": "Approve travel expense for client meeting"
      }
    }
  }'

# Step 2: Confirm the proposal (after human approval)
curl -X POST https://kuy2a5zca8.execute-api.us-west-2.amazonaws.com/v1/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fsk_YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "confirm_proposal",
      "arguments": {
        "proposal_id": "PROPOSAL_ID_FROM_STEP_1"
      }
    }
  }'
```

## Webhook Integration (Zapier/n8n)

### Overview

The MCP Server exposes a stateless HTTP API that works perfectly with webhook-based automation platforms. Each request is independent and authenticated via API key.

### Configuration Pattern

1. **Create API Key**: Generate an API key in FinanSEAL with appropriate permissions
2. **Configure Webhook**: Point to `https://kuy2a5zca8.execute-api.us-west-2.amazonaws.com/v1/mcp`
3. **Set Headers**: Add `Authorization: Bearer fsk_YOUR_API_KEY` and `Content-Type: application/json`
4. **Format Payload**: Use JSON-RPC 2.0 format (see examples below)

### Zapier Configuration

**Step 1: Create a Zap with Webhooks by Zapier (Custom Request)**

```
URL: https://kuy2a5zca8.execute-api.us-west-2.amazonaws.com/v1/mcp
Method: POST
Headers:
  - Authorization: Bearer fsk_YOUR_API_KEY
  - Content-Type: application/json
Payload Type: JSON
Data:
{
  "jsonrpc": "2.0",
  "id": "{{zap_id}}",
  "method": "tools/call",
  "params": {
    "name": "detect_anomalies",
    "arguments": {
      "sensitivity": "high"
    }
  }
}
```

**Step 2: Parse the Response**

The response is JSON with this structure:
```json
{
  "jsonrpc": "2.0",
  "id": "...",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"anomalies\": [...], \"summary\": {...}}"
      }
    ]
  }
}
```

Use Zapier's "Code by Zapier" or "Formatter" to extract `result.content[0].text` and parse the JSON.

### n8n Configuration

**HTTP Request Node Settings:**

```yaml
Method: POST
URL: https://kuy2a5zca8.execute-api.us-west-2.amazonaws.com/v1/mcp
Authentication: Header Auth
  - Name: Authorization
  - Value: Bearer fsk_YOUR_API_KEY
Headers:
  - Content-Type: application/json
Body Content Type: JSON
Body Parameters:
  jsonrpc: "2.0"
  id: "={{ $runIndex }}"
  method: "tools/call"
  params:
    name: "forecast_cash_flow"
    arguments:
      horizon_days: 30
      scenario: "moderate"
```

**Response Handling:**

Use a "Set" node to extract the tool result:
```javascript
const response = $input.first().json;
const toolResult = JSON.parse(response.result.content[0].text);
return { json: toolResult };
```

### Example: Weekly Anomaly Report Automation

**Zapier:**
1. Trigger: Schedule (Weekly)
2. Action: Webhooks by Zapier → Custom Request (call `detect_anomalies`)
3. Action: Code by Zapier → Parse response and format
4. Action: Gmail → Send email with anomaly summary

**n8n:**
1. Trigger: Cron (Weekly)
2. HTTP Request: Call `detect_anomalies`
3. Set: Parse response
4. IF: Check if anomalies found
5. Send Email: Send formatted report

### CORS Configuration

The MCP server allows all origins (`Access-Control-Allow-Origin: *`), so browser-based webhook testing tools like Webhook.site or RequestBin can be used for debugging.

### Rate Limiting

- Default: 60 requests per minute per API key
- Rate limit headers: `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`
- When rate limited, wait for `Retry-After` seconds before retrying

## Available Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `detect_anomalies` | Find unusual transactions | `sensitivity`, `date_range`, `category_filter` |
| `forecast_cash_flow` | Project future cash balance | `horizon_days`, `scenario`, `include_recurring` |
| `analyze_vendor_risk` | Vendor concentration analysis | `analysis_period_days`, `vendor_filter` |
| `create_proposal` | Create human-approval proposal | `action_type`, `target_id`, `summary` |
| `confirm_proposal` | Execute approved proposal | `proposal_id` |
| `cancel_proposal` | Cancel pending proposal | `proposal_id`, `reason` |

## Common Issues

### "UNAUTHORIZED" Error
- Check API key is valid and not revoked
- Ensure Authorization header uses Bearer format
- Verify API key has permission for the requested tool

### "INSUFFICIENT_DATA" Error
- Business needs at least 5 transactions for anomaly detection
- Try expanding the date range
- Check if business has any data at all

### "RATE_LIMITED" Error
- Wait for the `Retry-After` header value
- Consider spreading requests over time
- Contact admin to increase rate limit if needed

### "CONVEX_ERROR"
- Check Convex deployment status
- Verify NEXT_PUBLIC_CONVEX_URL environment variable
- Check CloudWatch logs for details

### "PROPOSAL_EXPIRED" Error
- Proposals expire after 15 minutes
- Create a new proposal and confirm it promptly
- Use `cancel_proposal` to explicitly cancel if no longer needed

## API Key Management

### Generating API Keys

API keys are generated through the admin interface or via Convex function:

```typescript
// Example: Generate API key via Convex
await convex.mutation(api.functions.mcpApiKeys.generateApiKey, {
  businessId: "your_business_id",
  name: "My Integration",
  permissions: ["detect_anomalies", "forecast_cash_flow"],
  rateLimitPerMinute: 60,
  createdBy: "your_user_id",
  keyHash: "hashed_key_value",
  keyPrefix: "fsk_abc1",
});
```

### Key Permissions

Keys can be scoped to specific tools:
- `detect_anomalies` - Read anomaly data
- `forecast_cash_flow` - Read cash flow projections
- `analyze_vendor_risk` - Read vendor analytics
- `create_proposal` - Create proposals
- `confirm_proposal` - Confirm and execute proposals
- `cancel_proposal` - Cancel proposals

### Revoking Keys

Keys can be revoked immediately:

```typescript
await convex.mutation(api.functions.mcpApiKeys.revokeApiKey, {
  apiKeyId: "key_to_revoke",
});
```

Revoked keys are rejected on the next request (per-request validation).
