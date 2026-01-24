# Quickstart: Autonomous Finance MCP Server MVP

**Branch**: `006-autonomous-finance-mcp` | **Date**: 2026-01-15
**Goal**: Implement `detect_anomalies` tool end-to-end as proof of concept

## Overview

This guide walks through implementing a minimal viable MCP server with one tool (`detect_anomalies`) to validate the architecture before building the full feature set.

## Prerequisites

- AWS CDK CLI installed (`npm install -g aws-cdk`)
- AWS credentials configured (profile: `groot-finanseal`)
- Convex dev environment running (`npx convex dev`)

## Step-by-Step Implementation

### Step 1: Create MCP Server Lambda Structure

```bash
# Create directory structure
mkdir -p src/lambda/mcp-server/{tools,lib}

# Create package.json for Lambda
cat > src/lambda/mcp-server/package.json << 'EOF'
{
  "name": "finanseal-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "main": "handler.js",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.22.0"
  }
}
EOF
```

### Step 2: Implement Lambda Handler

Create `src/lambda/mcp-server/handler.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { detectAnomalies } from './tools/detect-anomalies.js';
import { DetectAnomaliesInputSchema } from './contracts/mcp-tools.js';

// Initialize MCP server (reused across invocations)
const server = new McpServer({
  name: 'finanseal-mcp-server',
  version: '1.0.0'
});

// Register tools
server.tool(
  'detect_anomalies',
  'Detect unusual financial transactions using statistical outlier analysis',
  DetectAnomaliesInputSchema,
  detectAnomalies
);

// Lambda handler
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Parse JSON-RPC request
    const request = JSON.parse(event.body || '{}');

    // Create stateless transport
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
      enableJsonResponse: true
    });

    // Connect server to transport
    await server.connect(transport);

    // Process request
    const response = await transport.handleRequest(request);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error('[MCP Server] Error:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error'
        }
      })
    };
  }
}
```

### Step 3: Implement Anomaly Detection Tool

Create `src/lambda/mcp-server/tools/detect-anomalies.ts`:

```typescript
import { queryConvex } from '../lib/convex-client.js';
import type { DetectAnomaliesInput, DetectAnomaliesOutput } from '../contracts/mcp-tools.js';

export async function detectAnomalies(
  args: DetectAnomaliesInput
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    // Validate business access (simplified for MVP)
    if (!args.business_id) {
      return createErrorResponse('INVALID_INPUT', 'business_id is required');
    }

    // Call existing Convex detection algorithm
    const result = await queryConvex<DetectAnomaliesOutput>(
      'insights:detectAnomalies',
      {
        businessId: args.business_id,
        dateRange: args.date_range,
        categoryFilter: args.category_filter,
        sensitivity: args.sensitivity || 'medium'
      }
    );

    // Return MCP-formatted response
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result)
      }]
    };
  } catch (error) {
    console.error('[detect_anomalies] Error:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

function createErrorResponse(code: string, message: string) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        error: true,
        code,
        message
      })
    }],
    isError: true
  };
}
```

### Step 4: Implement Convex HTTP Client

Create `src/lambda/mcp-server/lib/convex-client.ts`:

```typescript
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;

export async function queryConvex<T>(
  functionPath: string,
  args: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      path: functionPath,
      args
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Convex query failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return result.value as T;
}
```

### Step 5: Create CDK Stack

Create `infra/lib/mcp-server-stack.ts`:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class MCPServerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // MCP Server Lambda
    const mcpServerLambda = new lambda.Function(this, 'MCPServerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('src/lambda/mcp-server', {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash', '-c',
            'npm install && npm run build && cp -r dist/* /asset-output/'
          ]
        }
      }),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL || '',
        NODE_OPTIONS: '--enable-source-maps'
      },
      tracing: lambda.Tracing.ACTIVE
    });

    // API Gateway
    const api = new apigateway.RestApi(this, 'MCPServerAPI', {
      restApiName: 'FinanSEAL MCP Server',
      description: 'MCP Server for financial intelligence tools',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['POST', 'OPTIONS']
      }
    });

    // POST /mcp endpoint
    const mcpResource = api.root.addResource('mcp');
    mcpResource.addMethod('POST', new apigateway.LambdaIntegration(mcpServerLambda));

    // Vercel OIDC permission (same pattern as doc processor)
    const vercelOidcRoleArn = 'arn:aws:iam::837224017779:role/FinanSEAL-Vercel-S3-Role';
    mcpServerLambda.addPermission('VercelOidcInvoke', {
      principal: new iam.ArnPrincipal(vercelOidcRoleArn),
      action: 'lambda:InvokeFunction'
    });

    // Outputs
    new cdk.CfnOutput(this, 'MCPServerEndpoint', {
      value: api.url + 'mcp',
      description: 'MCP Server API endpoint'
    });
  }
}
```

### Step 6: Create MCP Client Adapter for LangGraph

Create `src/lib/ai/tools/mcp/mcp-client.ts`:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export class MCPClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  async connect(): Promise<void> {
    if (this.client) return; // Already connected

    this.transport = new StreamableHTTPClientTransport(new URL(this.serverUrl));
    this.client = new Client({
      name: 'finanseal-langgraph-agent',
      version: '1.0.0'
    });

    await this.client.connect(this.transport);
  }

  async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    if (!this.client) {
      await this.connect();
    }

    const result = await this.client!.callTool({ name, arguments: args });

    // Parse MCP response
    const textContent = result.content?.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('Invalid MCP response: no text content');
    }

    const parsed = JSON.parse(textContent.text);

    // Check for MCP error
    if (parsed.error) {
      throw new Error(`MCP Error [${parsed.code}]: ${parsed.message}`);
    }

    return parsed as T;
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
      this.client = null;
    }
  }
}

// Singleton instance
let mcpClient: MCPClient | null = null;

export function getMCPClient(): MCPClient {
  if (!mcpClient) {
    const serverUrl = process.env.MCP_SERVER_URL || 'https://api.finanseal.com/mcp';
    mcpClient = new MCPClient(serverUrl);
  }
  return mcpClient;
}
```

### Step 7: Register MCP Tool in ToolFactory

Add to `src/lib/ai/tools/tool-factory.ts`:

```typescript
import { getMCPClient } from './mcp/mcp-client';
import type { DetectAnomaliesOutput } from '@/specs/006-autonomous-finance-mcp/contracts/mcp-tools';

// Add this tool registration in ToolFactory constructor or init method
this.registerTool({
  name: 'mcp_detect_anomalies',
  description: 'Detect unusual financial transactions using statistical outlier analysis. Use this when users ask about anomalies, unusual expenses, or spending outliers.',
  schema: z.object({
    date_range: z.object({
      start: z.string().describe('Start date YYYY-MM-DD'),
      end: z.string().describe('End date YYYY-MM-DD')
    }).optional(),
    category_filter: z.array(z.string()).optional(),
    sensitivity: z.enum(['low', 'medium', 'high']).default('medium')
  }),
  execute: async (args, context) => {
    const client = getMCPClient();
    const result = await client.callTool<DetectAnomaliesOutput>('detect_anomalies', {
      business_id: context.businessId,
      ...args
    });
    return result;
  }
});
```

## Testing

### Local Testing

```bash
# 1. Build the Lambda
cd src/lambda/mcp-server
npm install
npm run build

# 2. Test with curl (mock JSON-RPC request)
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "detect_anomalies",
      "arguments": {
        "business_id": "test-business-id",
        "sensitivity": "medium"
      }
    }
  }'
```

### Integration Testing

```bash
# Test via chat interface
# Ask: "Are there any unusual expenses this month?"
# Expected: Agent calls mcp_detect_anomalies tool and returns results
```

## Deployment Checklist

- [ ] Build Lambda package: `cd src/lambda/mcp-server && npm run build`
- [ ] Set environment variables in CDK stack
- [ ] Deploy CDK: `cd infra && npx cdk deploy MCPServerStack --profile groot-finanseal`
- [ ] Update Vercel env: `MCP_SERVER_URL=<api-gateway-url>/mcp`
- [ ] Test end-to-end via chat interface
- [ ] Monitor CloudWatch for errors

## Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_CONVEX_URL` | Lambda | Convex deployment URL |
| `MCP_SERVER_URL` | Vercel | API Gateway endpoint |
| `SENTRY_DSN` | Lambda | Error tracking (optional) |

## Success Criteria

MVP is complete when:
1. Lambda deploys successfully
2. API Gateway returns 200 for tools/list
3. detect_anomalies tool returns valid results
4. Chat interface can trigger MCP tool via natural language
5. Results appear in chat response with proper formatting

## Next Steps After MVP

1. Add `forecast_cash_flow` tool
2. Add `analyze_vendor_risk` tool
3. Implement rate limiting
4. Add Sentry error tracking
5. Create comprehensive tests
