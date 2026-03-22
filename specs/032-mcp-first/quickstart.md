# Quickstart: Adding MCP-First Tools

**Date**: 2026-03-22 | **Branch**: `032-mcp-first`

## Adding a New Tool (MCP-First)

### Step 1: Define the Contract

In `src/lambda/mcp-server/contracts/mcp-tools.ts`:

```typescript
// Input schema (Zod)
export const MyNewToolInputSchema = z.object({
  business_id: z.string().optional().describe('Business ID (optional with API key)'),
  // ... tool-specific params
});
export type MyNewToolInput = z.infer<typeof MyNewToolInputSchema>;

// Output interface
export interface MyNewToolOutput {
  // ... structured result
}

// Register in MCP_TOOLS
export const MCP_TOOLS = {
  // ... existing tools
  my_new_tool: {
    name: 'my_new_tool',
    description: 'What this tool does (for LLM selection)',
    inputSchema: MyNewToolInputSchema,
  },
} as const;
```

### Step 2: Implement the Tool

Create `src/lambda/mcp-server/tools/my-new-tool.ts`:

```typescript
import { AuthContext, MCPErrorResponse } from '../contracts/mcp-tools.js';
import { getConvexClient } from '../lib/convex-client.js';
import { logger } from '../lib/logger.js';

export async function myNewTool(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<MyNewToolOutput | MCPErrorResponse> {
  const input = args as MyNewToolInput;
  const businessId = authContext?.businessId || input.business_id;

  if (!businessId) {
    return { error: true, code: 'INVALID_INPUT', message: 'business_id required' };
  }

  try {
    const convex = getConvexClient();
    const data = await convex.query('functions/myModule:myQuery', { businessId });

    logger.toolExecution('my_new_tool', Date.now() - start, 'success', { businessId });
    return { /* structured result */ };
  } catch (error) {
    logger.error('my_new_tool_error', { error: error.message, businessId });
    return { error: true, code: 'INTERNAL_ERROR', message: 'Failed to execute tool' };
  }
}
```

### Step 3: Register in Handler

In `src/lambda/mcp-server/handler.ts`:

```typescript
import { myNewTool } from './tools/my-new-tool.js';

const TOOL_IMPLEMENTATIONS = {
  // ... existing
  my_new_tool: myNewTool,
};
```

### Step 4: Add Tool-Factory Wrapper (for chat agent)

In `src/lib/ai/tools/my-new-tool-tool.ts`:

```typescript
export class MyNewToolTool extends BaseTool {
  getToolName() { return 'my_new_tool'; }

  protected async executeInternal(params, userContext) {
    return mcpToolWrapper.call('my_new_tool', params, userContext);
  }
}
```

### Step 5: Deploy

```bash
cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2
```

### Step 6: Verify

Test via chat: ask the agent a question that should trigger the new tool. Verify in CloudWatch logs that the MCP tool was called with correct parameters.

## DO NOT

- Add business logic to `tool-factory.ts` — all logic goes in MCP server
- Create a tool in tool-factory without an MCP endpoint
- Skip structured logging in the tool implementation
- Use `this.convex.query()` in tool-factory — delegate to MCP instead
