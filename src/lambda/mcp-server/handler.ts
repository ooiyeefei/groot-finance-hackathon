/**
 * MCP Server Lambda Handler
 *
 * Entry point for the FinanSEAL MCP Server running on AWS Lambda.
 * Implements JSON-RPC 2.0 over HTTP (stateless mode) using MCP SDK.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  JSON_RPC_ERROR_CODES,
  SERVER_INFO,
  SERVER_CAPABILITIES,
  PROTOCOL_VERSION,
  createErrorResponse,
  createSuccessResponse,
  createToolResult,
} from './contracts/mcp-protocol.js';
import { MCP_TOOLS } from './contracts/mcp-tools.js';
import { detectAnomalies } from './tools/detect-anomalies.js';
import { forecastCashFlow } from './tools/forecast-cash-flow.js';
import { analyzeVendorRisk } from './tools/analyze-vendor-risk.js';

// Tool implementations registry
const TOOL_IMPLEMENTATIONS: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  detect_anomalies: detectAnomalies,
  forecast_cash_flow: forecastCashFlow,
  analyze_vendor_risk: analyzeVendorRisk,
};

/**
 * Lambda handler for MCP server
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const startTime = Date.now();

  // CORS headers for all responses
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify(createErrorResponse(
        null,
        JSON_RPC_ERROR_CODES.INVALID_REQUEST,
        'Method not allowed'
      )),
    };
  }

  try {
    // Parse JSON-RPC request
    const body = event.body;
    if (!body) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify(createErrorResponse(
          null,
          JSON_RPC_ERROR_CODES.PARSE_ERROR,
          'Empty request body'
        )),
      };
    }

    let request: {
      jsonrpc: string;
      id: string | number;
      method: string;
      params?: Record<string, unknown>;
    };

    try {
      request = JSON.parse(body);
    } catch {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify(createErrorResponse(
          null,
          JSON_RPC_ERROR_CODES.PARSE_ERROR,
          'Invalid JSON'
        )),
      };
    }

    // Validate JSON-RPC version
    if (request.jsonrpc !== '2.0') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify(createErrorResponse(
          request.id,
          JSON_RPC_ERROR_CODES.INVALID_REQUEST,
          'Invalid JSON-RPC version'
        )),
      };
    }

    // Route by method
    let result: unknown;

    switch (request.method) {
      case 'initialize':
        result = {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: SERVER_CAPABILITIES,
          serverInfo: SERVER_INFO,
        };
        break;

      case 'notifications/initialized':
        // Notification - no response needed
        return {
          statusCode: 204,
          headers: corsHeaders,
          body: '',
        };

      case 'tools/list':
        result = {
          tools: Object.values(MCP_TOOLS).map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: {
              type: 'object',
              properties: Object.fromEntries(
                Object.entries(tool.inputSchema.shape || {}).map(([key, schema]) => {
                  const zodSchema = schema as { description?: string; _def?: { typeName?: string } };
                  return [key, {
                    type: zodSchema._def?.typeName === 'ZodNumber' ? 'number' :
                          zodSchema._def?.typeName === 'ZodBoolean' ? 'boolean' :
                          zodSchema._def?.typeName === 'ZodArray' ? 'array' : 'string',
                    description: zodSchema.description || '',
                  }];
                })
              ),
            },
          })),
        };
        break;

      case 'tools/call': {
        const params = request.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};

        if (!toolName) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify(createErrorResponse(
              request.id,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Tool name is required'
            )),
          };
        }

        const toolImpl = TOOL_IMPLEMENTATIONS[toolName];
        if (!toolImpl) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify(createErrorResponse(
              request.id,
              JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
              `Tool not found: ${toolName}`
            )),
          };
        }

        console.log(`[MCP Server] Executing tool: ${toolName}`, { args: toolArgs });

        try {
          const toolResult = await toolImpl(toolArgs);
          result = createToolResult(toolResult);
        } catch (error) {
          console.error(`[MCP Server] Tool error: ${toolName}`, error);

          // Check if it's a structured error from our tools
          const errorObj = error as { error?: boolean; code?: string; message?: string };
          if (errorObj.error && errorObj.code) {
            result = createToolResult(errorObj, true);
          } else {
            result = createToolResult({
              error: true,
              code: 'INTERNAL_ERROR',
              message: error instanceof Error ? error.message : 'Unknown error',
            }, true);
          }
        }
        break;
      }

      default:
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify(createErrorResponse(
            request.id,
            JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
            `Unknown method: ${request.method}`
          )),
        };
    }

    const duration = Date.now() - startTime;
    console.log(`[MCP Server] Request completed`, {
      method: request.method,
      duration: `${duration}ms`,
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(createSuccessResponse(request.id, result as never)),
    };
  } catch (error) {
    console.error('[MCP Server] Unexpected error:', error);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify(createErrorResponse(
        null,
        JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        error instanceof Error ? error.message : 'Internal error'
      )),
    };
  }
}
