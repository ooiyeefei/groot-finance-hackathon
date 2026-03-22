/**
 * memory_search MCP Tool Implementation
 *
 * Performs semantic search over stored memories to find relevant context.
 * Delegates to Convex functions/memoryTools:searchMemories query.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  MemorySearchInput,
  MemorySearchOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

interface MemorySearchResult {
  id: string;
  content: string;
  score: number;
  createdAt: number;
}

export async function memorySearch(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<MemorySearchOutput | MCPErrorResponse> {
  const input = args as MemorySearchInput;

  const businessId = authContext?.businessId || (input.business_id as string);
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  const userId = authContext?.userId;
  if (!userId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'User ID is required for memory operations' };
  }

  const query = (input.query || '').trim();
  if (!query) {
    return { error: true, code: 'INVALID_INPUT', message: 'Search query is required' };
  }

  if (query.length > 500) {
    return { error: true, code: 'INVALID_INPUT', message: 'Query too long (max 500 characters)' };
  }

  const limit = input.limit || 5;

  try {
    const convex = getConvexClient();

    const results = await convex.query<MemorySearchResult[]>(
      'functions/memoryTools:searchMemories',
      {
        query,
        businessId,
        userId,
        limit,
      }
    );

    if (!results || results.length === 0) {
      return {
        memories: [],
        total_count: 0,
        query,
      };
    }

    logger.info('memory_search_success', {
      businessId,
      tool: 'memory_search',
    });

    return {
      memories: results.map(m => ({
        id: m.id,
        content: m.content,
        relevance_score: m.score,
        created_at: new Date(m.createdAt).toISOString(),
      })),
      total_count: results.length,
      query,
    };
  } catch (error) {
    logger.error('memory_search_error', {
      businessId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }
    return { error: true, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
