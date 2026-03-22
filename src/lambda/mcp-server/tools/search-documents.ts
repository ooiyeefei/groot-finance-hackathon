/**
 * search_documents MCP Tool Implementation
 *
 * Searches uploaded financial documents by text content using vector similarity.
 * Uses Qdrant vector storage for semantic search.
 *
 * NOTE: This tool uses embedding generation + vector search (Qdrant),
 * not a direct Convex query. The MCP server needs access to the embedding
 * and vector services. For now, we query via a Convex action that wraps
 * the vector search internally.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  SearchDocumentsInput,
  SearchDocumentsOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

export async function searchDocuments(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<SearchDocumentsOutput | MCPErrorResponse> {
  const input = args as SearchDocumentsInput;

  const businessId = authContext?.businessId || (input.business_id as string);
  if (!businessId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'Business ID is required' };
  }

  const userId = authContext?.userId;
  if (!userId) {
    return { error: true, code: 'UNAUTHORIZED', message: 'User ID is required for document search' };
  }

  if (!input.query || input.query.trim().length === 0) {
    return { error: true, code: 'INVALID_INPUT', message: 'Query is required and must not be empty' };
  }

  try {
    const convex = getConvexClient();

    // Use a Convex action that handles embedding generation + Qdrant search server-side
    // This avoids needing Qdrant/embedding credentials in the MCP Lambda
    const result = await convex.action<any>('functions/financialIntelligence:searchDocumentsForMCP', {
      businessId,
      userId,
      query: input.query.trim(),
      limit: input.limit || 5,
      similarityThreshold: input.similarity_threshold || 0.7,
    });

    if (!result || !result.documents || result.documents.length === 0) {
      return {
        documents: [],
        totalCount: 0,
      };
    }

    return {
      documents: result.documents.map((doc: any) => ({
        document_id: doc.document_id || doc.documentId || 'Unknown',
        content_snippet: (doc.content_snippet || doc.text || '').substring(0, 200),
        relevance_score: doc.relevance_score || doc.score || 0,
        upload_date: doc.upload_date || doc.created_at || 'Unknown',
      })),
      totalCount: result.documents.length,
    };
  } catch (error) {
    logger.error('search_documents_error', {
      businessId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }
    return {
      error: true,
      code: 'INTERNAL_ERROR',
      message: 'Document search temporarily unavailable. Please try again later.',
    };
  }
}
