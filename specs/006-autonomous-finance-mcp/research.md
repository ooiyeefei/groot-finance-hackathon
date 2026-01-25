# Phase 0 Research: Autonomous Finance MCP Server

**Branch**: `006-autonomous-finance-mcp` | **Date**: 2026-01-15
**Status**: Complete

## R1: MCP SDK HTTP Transport for Lambda

### Question
How to configure `@modelcontextprotocol/sdk` for HTTP transport (not stdio) in AWS Lambda?

### Findings

The MCP TypeScript SDK provides `StreamableHTTPServerTransport` for HTTP-based deployments. This is ideal for serverless environments like AWS Lambda.

**Key Pattern - Stateless HTTP Handler:**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// Create server instance (can be reused across requests)
const server = new McpServer({
  name: 'finanseal-mcp-server',
  version: '1.0.0'
});

// Lambda handler pattern
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode - no session management
    enableJsonResponse: true       // Return JSON directly (not SSE)
  });

  await server.connect(transport);

  // Parse JSON-RPC request from body
  const request = JSON.parse(event.body || '{}');

  // Process through transport
  const response = await transport.handleRequest(request);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(response)
  };
}
```

**Session Management Options:**

| Mode | `sessionIdGenerator` | Use Case |
|------|---------------------|----------|
| Stateless | `undefined` | Lambda (no session persistence) |
| Session-based | `() => randomUUID()` | Long-running servers with state |

**Recommendation**: Use stateless mode for Lambda. Each request is independent, which matches Lambda's execution model.

### References
- MCP SDK: `@modelcontextprotocol/sdk` v1.x
- Transport: `StreamableHTTPServerTransport` class

---

## R2: MCP Client Integration Pattern

### Question
How to create MCP client in LangGraph context and convert MCP tool responses to LangGraph tool results?

### Findings

**MCP Client Setup:**

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

class MCPClientAdapter {
  private client: Client;
  private transport: StreamableHTTPClientTransport;

  async connect(serverUrl: string): Promise<void> {
    this.transport = new StreamableHTTPClientTransport(new URL(serverUrl));
    this.client = new Client({ name: 'finanseal-agent', version: '1.0.0' });
    await this.client.connect(this.transport);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = await this.client.callTool({ name, arguments: args });

    // MCP returns { content: [{ type: 'text', text: '...' }] }
    // Convert to plain object for LangGraph
    if (result.content?.[0]?.type === 'text') {
      return JSON.parse(result.content[0].text);
    }
    return result;
  }
}
```

**LangGraph Tool Adapter Pattern:**

To integrate with existing `ToolFactory`, create wrapper tools that call MCP:

```typescript
// src/lib/ai/tools/mcp/mcp-tool-adapter.ts
import { ToolFactory } from '../tool-factory';
import { MCPClientAdapter } from './mcp-client';

export function registerMCPTools(factory: ToolFactory, mcpClient: MCPClientAdapter): void {
  // Wrap MCP tool as LangGraph tool
  factory.registerTool({
    name: 'mcp_detect_anomalies',
    description: 'Detect unusual financial transactions using statistical analysis',
    schema: z.object({
      dateRange: z.object({
        start: z.string(),
        end: z.string()
      }).optional(),
      categoryFilter: z.array(z.string()).optional(),
      sensitivityThreshold: z.number().min(1).max(5).default(2)
    }),
    execute: async (args, context) => {
      // Call MCP server
      const result = await mcpClient.callTool('detect_anomalies', {
        business_id: context.businessId,
        ...args
      });
      return result;
    }
  });
}
```

**Integration with Existing Agent:**

The existing `langgraph-agent.ts` uses `ToolFactory.getToolSchemas()` to build OpenAI-compatible function definitions. MCP tools registered through the adapter will automatically appear in the agent's tool list.

### Key Insight

MCP tools return `{ content: [{ type: 'text', text: JSON.stringify(data) }] }` format. The adapter must:
1. Parse the text content as JSON
2. Return the parsed object to LangGraph
3. Handle errors by returning structured error objects

---

## R3: Convex HTTP API from Lambda

### Question
How to call Convex queries from Lambda (not in Next.js context)?

### Findings

Convex provides an HTTP API for external access. The existing document processor Lambda already uses this pattern.

**Pattern from `convex_client.py`:**

```python
# Python pattern (existing)
def update_document(doc_id: str, data: dict):
    response = requests.post(
        f"{CONVEX_URL}/api/mutation",
        json={
            "path": "documents:update",
            "args": {"id": doc_id, "data": data}
        },
        headers={"Authorization": f"Bearer {CONVEX_DEPLOY_KEY}"}
    )
```

**TypeScript Equivalent for MCP Server:**

```typescript
// src/lambda/mcp-server/lib/convex-client.ts
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;

export async function queryConvex<T>(
  functionPath: string,
  args: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // No auth needed for public queries
    },
    body: JSON.stringify({
      path: functionPath,
      args
    })
  });

  if (!response.ok) {
    throw new Error(`Convex query failed: ${response.statusText}`);
  }

  const result = await response.json();
  return result.value as T;
}

export async function mutateConvex<T>(
  functionPath: string,
  args: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CONVEX_DEPLOY_KEY}`
    },
    body: JSON.stringify({
      path: functionPath,
      args
    })
  });

  if (!response.ok) {
    throw new Error(`Convex mutation failed: ${response.statusText}`);
  }

  const result = await response.json();
  return result.value as T;
}
```

**Authentication:**

| Operation | Auth Required | Header |
|-----------|---------------|--------|
| Query (public) | No | None |
| Query (internal) | Yes | `Authorization: Bearer {CONVEX_DEPLOY_KEY}` |
| Mutation | Yes | `Authorization: Bearer {CONVEX_DEPLOY_KEY}` |

**Existing Convex Functions to Call:**

- `insights:detectAnomalies` - Run anomaly detection
- `insights:forecastCashFlow` - Generate cash flow forecast
- `insights:vendorIntelligence` - Analyze vendor risks
- `actionCenterInsights:getForBusiness` - Retrieve cached insights

### Key Insight

The detection algorithms already exist as Convex actions. The MCP server doesn't need to re-implement them - it just needs to:
1. Call the existing Convex functions
2. Transform results into MCP response format

---

## R4: MCP Tool Schema Design

### Question
Best practices for MCP tool input/output schemas with complex return types?

### Findings

**Tool Registration with Zod:**

```typescript
import { z } from 'zod';

// Input schema with validation
const detectAnomaliesInput = z.object({
  business_id: z.string().describe('Business ID for authorization'),
  date_range: z.object({
    start: z.string().datetime().describe('Start date ISO 8601'),
    end: z.string().datetime().describe('End date ISO 8601')
  }).optional().describe('Date range to analyze (defaults to last 30 days)'),
  category_filter: z.array(z.string()).optional()
    .describe('Filter to specific expense categories'),
  sensitivity: z.enum(['low', 'medium', 'high']).default('medium')
    .describe('Detection sensitivity (low=3σ, medium=2σ, high=1.5σ)')
});

// Output structure (for documentation, not runtime validation)
interface AnomalyResult {
  anomalies: Array<{
    transaction_id: string;
    amount: number;
    category: string;
    z_score: number;
    severity: 'medium' | 'high' | 'critical';
    description: string;
  }>;
  summary: {
    total_analyzed: number;
    anomalies_found: number;
    date_range: { start: string; end: string };
  };
}
```

**MCP Tool Registration:**

```typescript
server.registerTool('detect_anomalies', {
  description: 'Detect unusual financial transactions using statistical outlier analysis. Returns transactions with spending patterns significantly different from historical norms.',
  inputSchema: detectAnomaliesInput,
}, async (args) => {
  // Validate business_id authorization
  await validateBusinessAccess(args.business_id);

  // Call Convex detection algorithm
  const result = await queryConvex<AnomalyResult>(
    'insights:detectAnomalies',
    args
  );

  // Return in MCP format
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(result)
    }]
  };
});
```

**Best Practices:**

1. **Use Zod `.describe()`** - Adds descriptions that appear in tool documentation
2. **Default values** - Use `.default()` for optional parameters
3. **Enums over booleans** - `sensitivity: enum` is clearer than `highSensitivity: boolean`
4. **Structured responses** - Always include a `summary` object for quick parsing
5. **Error responses** - Return structured errors, not thrown exceptions:

```typescript
// Error response pattern
return {
  content: [{
    type: 'text',
    text: JSON.stringify({
      error: true,
      code: 'UNAUTHORIZED',
      message: 'Business ID not found or access denied'
    })
  }],
  isError: true
};
```

---

## Summary: Key Decisions for Implementation

| Area | Decision | Rationale |
|------|----------|-----------|
| Transport | `StreamableHTTPServerTransport` stateless | Matches Lambda execution model |
| Session | None (stateless) | Each request independent |
| Auth | Business ID in request + IAM for Lambda invoke | Two-layer security |
| Convex | HTTP API calls | Existing pattern from doc processor |
| Tools | Zod schemas with `.describe()` | Self-documenting, validates input |
| Errors | Structured JSON in `content` | Consistent parsing by client |

## Next Steps

With research complete, proceed to Phase 1:
1. **data-model.md** - Define MCP tool schemas
2. **contracts/** - Create Zod schemas and TypeScript interfaces
3. **quickstart.md** - MVP implementation guide (detect_anomalies only)
