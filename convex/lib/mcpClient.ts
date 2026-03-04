/**
 * MCP Client — Reusable helper for calling MCP tools from Convex internalActions.
 *
 * Uses the internal service key (MCP_INTERNAL_SERVICE_KEY) for auth,
 * bypassing per-business API keys. Passes businessId in the request body.
 *
 * This ensures MCP is the SINGLE intelligence engine — Layer 2 (enrichment/discovery)
 * consumes the same structured Category 3 analysis as the chat "Ask AI" feature.
 */

interface MCPToolCallOptions {
  /** MCP tool name (e.g., "detect_anomalies", "forecast_cash_flow") */
  toolName: string;
  /** Tool arguments (merged with _businessId for internal auth) */
  args: Record<string, unknown>;
  /** Business ID to scope the analysis */
  businessId: string;
}

interface MCPJsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: {
    content?: Array<{ type: string; text: string }>;
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Call an MCP tool and return the parsed result.
 * Returns null on any failure (network, auth, tool error).
 */
export async function callMCPTool<T = unknown>(options: MCPToolCallOptions): Promise<T | null> {
  const endpointUrl = process.env.MCP_ENDPOINT_URL;
  const serviceKey = process.env.MCP_INTERNAL_SERVICE_KEY;

  if (!endpointUrl || !serviceKey) {
    console.warn("[MCP Client] Missing MCP_ENDPOINT_URL or MCP_INTERNAL_SERVICE_KEY env vars");
    return null;
  }

  try {
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": serviceKey,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: options.toolName,
          arguments: options.args,
          _businessId: options.businessId,
        },
      }),
    });

    if (!response.ok) {
      console.error(`[MCP Client] HTTP ${response.status}: ${await response.text()}`);
      return null;
    }

    const data = (await response.json()) as MCPJsonRpcResponse;

    if (data.error) {
      console.error(`[MCP Client] Tool error: ${data.error.message}`);
      return null;
    }

    // MCP tools return results in content[0].text as JSON string
    const textContent = data.result?.content?.find((c) => c.type === "text");
    if (!textContent?.text) {
      console.warn(`[MCP Client] No text content in response for ${options.toolName}`);
      return null;
    }

    return JSON.parse(textContent.text) as T;
  } catch (error) {
    console.error(`[MCP Client] Call to ${options.toolName} failed:`, error);
    return null;
  }
}

/**
 * Call multiple MCP tools in parallel for a single business.
 * Returns results keyed by tool name. Failed tools return null.
 */
export async function callMCPToolsBatch(
  businessId: string,
  calls: Array<{ toolName: string; args: Record<string, unknown> }>
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};

  // Run all calls in parallel
  const promises = calls.map(async (call) => {
    const result = await callMCPTool({
      toolName: call.toolName,
      args: call.args,
      businessId,
    });
    return { toolName: call.toolName, result };
  });

  const settled = await Promise.all(promises);
  for (const { toolName, result } of settled) {
    results[toolName] = result;
  }

  return results;
}
