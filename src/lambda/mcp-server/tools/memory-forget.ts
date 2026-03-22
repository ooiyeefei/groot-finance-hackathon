/**
 * memory_forget MCP Tool Implementation
 *
 * Soft-deletes memories by ID or search query.
 * Delegates to Convex functions/memoryTools:forgetMemory mutation
 * and functions/memoryTools:searchMemories query.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  MemoryForgetInput,
  MemoryForgetOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

interface MemorySearchResult {
  id: string;
  content: string;
  score: number;
  createdAt: number;
}

export async function memoryForget(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<MemoryForgetOutput | MCPErrorResponse> {
  const input = args as MemoryForgetInput;

  const businessId = authContext?.businessId || (input.business_id as string);
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  const userId = authContext?.userId;
  if (!userId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'User ID is required for memory operations' };
  }

  if (!input.memory_id && !input.search_query) {
    return { error: true, code: 'INVALID_INPUT', message: 'Either memory_id or search_query is required' };
  }

  try {
    const convex = getConvexClient();

    // Case 1: Delete by specific ID
    if (input.memory_id) {
      try {
        await convex.mutation<{ success: boolean; archivedAt: number }>(
          'functions/memoryTools:forgetMemory',
          {
            memoryId: input.memory_id,
            businessId,
            userId,
          }
        );

        logger.info('memory_forget_by_id', {
          businessId,
          tool: 'memory_forget',
        });

        return {
          deleted_count: 1,
          deleted_ids: [input.memory_id],
          message: 'Memory deleted successfully.',
        };
      } catch (error) {
        if (error instanceof ConvexError && error.message.includes('not found')) {
          return { error: true, code: 'INVALID_INPUT', message: `Memory not found: ${input.memory_id}` };
        }
        if (error instanceof ConvexError && error.message.includes('Unauthorized')) {
          return { error: true, code: 'UNAUTHORIZED', message: 'Cannot delete another user\'s memory' };
        }
        throw error;
      }
    }

    // Case 2: Delete by search query
    const searchQuery = (input.search_query || '').trim();
    const deleteAll = input.delete_all || false;

    // First, search for matching memories
    const searchResults = await convex.query<MemorySearchResult[]>(
      'functions/memoryTools:searchMemories',
      {
        query: searchQuery,
        businessId,
        userId,
        limit: deleteAll ? 10 : 1,
      }
    );

    if (!searchResults || searchResults.length === 0) {
      return {
        deleted_count: 0,
        deleted_ids: [],
        message: `No memories found matching "${searchQuery}".`,
      };
    }

    // Delete matching memories
    const deletedIds: string[] = [];
    for (const memory of searchResults) {
      try {
        await convex.mutation<{ success: boolean; archivedAt: number }>(
          'functions/memoryTools:forgetMemory',
          {
            memoryId: memory.id,
            businessId,
            userId,
          }
        );
        deletedIds.push(memory.id);
      } catch {
        // Skip memories that fail to delete (ownership mismatch, etc.)
      }

      if (!deleteAll && deletedIds.length >= 1) break;
    }

    logger.info('memory_forget_by_search', {
      businessId,
      tool: 'memory_forget',
    });

    return {
      deleted_count: deletedIds.length,
      deleted_ids: deletedIds,
      message: deletedIds.length > 0
        ? `Deleted ${deletedIds.length} memory(ies) matching "${searchQuery}".`
        : `Found matching memories but could not delete them.`,
    };
  } catch (error) {
    logger.error('memory_forget_error', {
      businessId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }
    return { error: true, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
