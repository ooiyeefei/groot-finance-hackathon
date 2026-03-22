/**
 * memory_store MCP Tool Implementation
 *
 * Stores a user memory with contradiction detection and LRU eviction.
 * Delegates to Convex functions/memoryTools:storeMemory mutation.
 *
 * Note: Embedding generation is skipped in MCP (Lambda has no Gemini embedding access).
 * The Convex mutation handles contradiction detection via topic classification.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  MemoryStoreInput,
  MemoryStoreOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

interface StoreMemoryResult {
  memoryId: string | null;
  conflict: {
    topic: string;
    existingMemory: { id: string; content: string; createdAt: number };
    options: Array<{ action: string; label: string }>;
  } | null;
}

export async function memoryStore(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<MemoryStoreOutput | MCPErrorResponse> {
  const input = args as MemoryStoreInput;

  const businessId = authContext?.businessId || (input.business_id as string);
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  const userId = authContext?.userId;
  if (!userId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'User ID is required for memory operations' };
  }

  const content = (input.content || '').trim();
  if (!content) {
    return { error: true, code: 'INVALID_INPUT', message: 'Content is required and cannot be empty' };
  }

  if (content.length > 1000) {
    return { error: true, code: 'INVALID_INPUT', message: 'Content too long (max 1000 characters)' };
  }

  const validCategories = ['preference', 'fact', 'context', 'instruction'];
  if (!input.category || !validCategories.includes(input.category)) {
    return { error: true, code: 'INVALID_INPUT', message: `Category must be one of: ${validCategories.join(', ')}` };
  }

  try {
    const convex = getConvexClient();

    // Call Convex storeMemory mutation
    // Note: passing empty embeddings — Convex mutation handles contradiction detection
    // via topic classification (keyword-based), not embeddings.
    const result = await convex.mutation<StoreMemoryResult>(
      'functions/memoryTools:storeMemory',
      {
        content,
        businessId,
        userId,
        memoryType: input.category,
        source: 'mcp_store',
        sourceConversationId: input.conversation_id || undefined,
        embeddings: [], // Embeddings generated client-side when available
        topicTags: input.tags || [],
      }
    );

    // Check for contradiction
    if (result.conflict) {
      logger.info('memory_store_conflict', {
        businessId,
        tool: 'memory_store',
      });

      return {
        stored: false,
        conflict: {
          topic: result.conflict.topic,
          existing_memory: {
            id: result.conflict.existingMemory.id,
            content: result.conflict.existingMemory.content,
            created_at: new Date(result.conflict.existingMemory.createdAt).toISOString(),
          },
          options: result.conflict.options.map(o => ({
            action: o.action as 'replace' | 'keep_both' | 'cancel',
            label: o.label,
          })),
        },
      };
    }

    logger.info('memory_store_success', {
      businessId,
      tool: 'memory_store',
    });

    return {
      stored: true,
      memory_id: result.memoryId || undefined,
      category: input.category,
      tags: input.tags || [],
      message: `Remembered ${input.category}: "${content.substring(0, 80)}${content.length > 80 ? '...' : ''}"`,
    };
  } catch (error) {
    logger.error('memory_store_error', {
      businessId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }
    return { error: true, code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown error' };
  }
}
