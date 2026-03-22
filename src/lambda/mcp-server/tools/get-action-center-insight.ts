/**
 * get_action_center_insight MCP Tool Implementation
 *
 * Retrieves detailed information about a specific Action Center insight by ID.
 * Read-only query — no proposal pattern needed.
 *
 * Part of 032-mcp-first migration.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  GetActionCenterInsightInput,
  GetActionCenterInsightOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

interface InsightRecord {
  _id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  recommendedAction?: string;
  affectedEntities?: unknown[];
  detectedAt: number;
  metadata?: Record<string, unknown>;
  businessId: string;
}

/**
 * Execute get_action_center_insight tool
 */
export async function getActionCenterInsight(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<GetActionCenterInsightOutput | MCPErrorResponse> {
  const input = args as GetActionCenterInsightInput;

  const businessId = authContext?.businessId;
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  if (!input.insight_id || typeof input.insight_id !== 'string') {
    return { error: true, code: 'INVALID_INPUT', message: 'insight_id is required and must be a string' };
  }

  try {
    const convex = getConvexClient();

    logger.info('get_action_center_insight_start', {
      businessId,
      insightId: input.insight_id,
    });

    const insight = await convex.query<InsightRecord | null>(
      'functions/actionCenterInsights:getById',
      { insightId: input.insight_id }
    );

    if (!insight) {
      return {
        error: true,
        code: 'INSUFFICIENT_DATA',
        message: `Insight not found with ID: ${input.insight_id}`,
      };
    }

    // Verify the insight belongs to this business
    if (insight.businessId !== businessId) {
      return {
        error: true,
        code: 'UNAUTHORIZED',
        message: 'Insight does not belong to this business',
      };
    }

    logger.info('get_action_center_insight_found', {
      insightId: insight._id,
      category: insight.category,
      priority: insight.priority,
    });

    return {
      id: insight._id,
      title: insight.title,
      description: insight.description,
      category: insight.category,
      priority: insight.priority,
      status: insight.status,
      recommendedAction: insight.recommendedAction,
      affectedEntities: insight.affectedEntities,
      detectedAt: new Date(insight.detectedAt).toISOString(),
      metadata: insight.metadata,
    };
  } catch (error) {
    logger.info('get_action_center_insight_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }

    return {
      error: true,
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
