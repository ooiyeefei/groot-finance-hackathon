/**
 * Auto-Recall for Chat Agent (T029)
 *
 * Before agent generates response, runs semantic search on user's memories
 * and injects top 5 relevant memories (similarity > 0.7) into prompt context.
 */

import { searchMemories } from '../agent/memory/mem0-service';

export interface RecalledMemory {
  id: string;
  content: string;
  score: number;
  createdAt: string;
}

export interface AutoRecallResult {
  memories: RecalledMemory[];
  injectedContext: string;
  durationMs: number;
}

/**
 * Auto-recall relevant memories for user query
 *
 * @param query - User's question/query
 * @param userId - Clerk user ID
 * @param businessId - Business ID for multi-tenant isolation
 * @param limit - Maximum memories to return (default: 5)
 * @param threshold - Similarity threshold (default: 0.7)
 * @returns Auto-recall result with memories and formatted context
 */
export async function autoRecallMemories(
  query: string,
  userId: string,
  businessId: string,
  limit: number = 5,
  threshold: number = 0.7
): Promise<AutoRecallResult> {
  const startTime = Date.now();

  try {
    console.log(`[AutoRecall] Searching memories for user ${userId} (threshold: ${threshold})`);

    // Semantic search with threshold filtering (implemented in mem0-service.ts T010)
    const memories = await searchMemories(query, userId, businessId, limit, threshold);

    console.log(`[AutoRecall] Found ${memories.length} relevant memories (${Date.now() - startTime}ms)`);

    // Format memories into context string for prompt injection
    const injectedContext = formatMemoriesForContext(memories);

    return {
      memories: memories.map((m) => ({
        id: m.id,
        content: m.memory,
        score: m.score || 0,
        createdAt: m.created_at,
      })),
      injectedContext,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error('[AutoRecall] Error during auto-recall:', error);
    return {
      memories: [],
      injectedContext: '',
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Format recalled memories into prompt context string
 *
 * @param memories - Array of recalled memories
 * @returns Formatted context string
 */
function formatMemoriesForContext(memories: Array<{ memory: string; score?: number }>): string {
  if (memories.length === 0) {
    return '';
  }

  const memoryLines = memories.map((m, index) => {
    return `${index + 1}. ${m.memory}`;
  });

  return `

<remembered_context>
The following information was recalled from previous conversations with this user:

${memoryLines.join('\n')}

Use this context to provide more personalized and relevant assistance. If the information seems relevant to the user's current query, incorporate it naturally into your response.
</remembered_context>
`;
}

/**
 * Update memory access tracking after successful recall (T031)
 *
 * @param memoryIds - Array of memory IDs that were recalled
 */
export async function updateMemoryAccessTracking(memoryIds: string[]): Promise<void> {
  if (memoryIds.length === 0) {
    return;
  }

  try {
    // This would call a Convex mutation to update lastAccessedAt and accessCount
    // For now, just log (actual implementation in convex/functions/memoryTools.ts)
    console.log(`[AutoRecall] Would update access tracking for ${memoryIds.length} memories`);

    // TODO: Call convex mutation
    // await ctx.runMutation(internal.functions.memoryTools.updateMemoryAccess, { memoryIds });
  } catch (error) {
    console.error('[AutoRecall] Failed to update memory access tracking:', error);
  }
}

/**
 * Check if auto-recall should run for this query
 * (Skip for very short queries or meta-commands)
 *
 * @param query - User query
 * @returns True if auto-recall should run
 */
export function shouldAutoRecall(query: string): boolean {
  const trimmed = query.trim();

  // Skip for very short queries
  if (trimmed.length < 10) {
    return false;
  }

  // Skip for meta-commands
  const metaCommands = ['/help', '/reset', '/clear', '/forget'];
  if (metaCommands.some((cmd) => trimmed.toLowerCase().startsWith(cmd))) {
    return false;
  }

  return true;
}
