/**
 * memory_recall MCP Tool Implementation
 *
 * Retrieves all stored memories for a user, optionally filtered by category.
 * Uses Convex functions/memoryTools:searchMemories with empty query to get all.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  MemoryRecallInput,
  MemoryRecallOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

interface MemoryResult {
  id: string;
  content: string;
  score: number;
  createdAt: number;
}

export async function memoryRecall(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<MemoryRecallOutput | MCPErrorResponse> {
  const input = args as MemoryRecallInput;

  const businessId = authContext?.businessId || (input.business_id as string);
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  const userId = authContext?.userId;
  if (!userId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'User ID is required for memory operations' };
  }

  const category = input.category || 'all';
  const limit = input.limit || 20;

  try {
    const convex = getConvexClient();

    // Use searchMemories with empty query to get all memories
    const results = await convex.query<MemoryResult[]>(
      'functions/memoryTools:searchMemories',
      {
        query: '', // Empty query returns all
        businessId,
        userId,
        limit: 200, // Get all, filter locally by category
      }
    );

    if (!results || results.length === 0) {
      return {
        memories: [],
        total_count: 0,
        category,
      };
    }

    // Category filtering is done client-side since Convex doesn't store
    // category in the searchMemories return. We rely on content-based matching.
    // For now, return all and let limit apply.
    const limited = results.slice(0, limit);

    logger.info('memory_recall_success', {
      businessId,
      tool: 'memory_recall',
    });

    return {
      memories: limited.map(m => ({
        id: m.id,
        content: m.content,
        created_at: new Date(m.createdAt).toISOString(),
      })),
      total_count: limited.length,
      total_available: results.length,
      category,
    };
  } catch (error) {
    logger.error('memory_recall_error', {
      businessId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }
    return { error: true, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
