/**
 * search_regulatory_knowledge_base MCP Tool Implementation
 *
 * Answers questions about tax laws, compliance, and regulations
 * for Singapore and Malaysia using RAG over the regulatory knowledge base.
 *
 * NOTE: Like search_documents, this uses embedding + Qdrant vector search.
 * Delegates to a Convex action that wraps the vector search internally.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import type { AuthContext } from '../lib/auth.js';
import type {
  SearchRegulatoryKBInput,
  SearchRegulatoryKBOutput,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';
import { logger } from '../lib/logger.js';

// Advisory question patterns that should be declined
const ADVISORY_PATTERNS = [
  'how should i', 'how can i reduce', 'how to minimize', 'how to avoid',
  'how to lower', 'how to save on tax', 'what should i do',
  'optimize', 'optimization', 'tax planning strategy',
  'structure my expenses', 'reduce my tax', 'minimize tax',
  'tax saving', 'tax savings', 'deduction strategy',
  'best way to', 'should i claim', 'should i deduct',
  'transfer pricing strategy', 'tax shelter', 'tax avoidance',
];

export async function searchRegulatoryKB(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<SearchRegulatoryKBOutput | MCPErrorResponse> {
  const input = args as SearchRegulatoryKBInput;

  if (!input.query || input.query.trim().length === 0) {
    return { error: true, code: 'INVALID_INPUT', message: 'Query is required' };
  }

  const query = input.query.trim();
  const queryLower = query.toLowerCase();

  // Check for advisory/optimization questions — decline with professional referral
  if (ADVISORY_PATTERNS.some(p => queryLower.includes(p))) {
    return {
      results: [],
      totalCount: 0,
      disclaimer: 'I can provide factual tax reference information (rates, deadlines, thresholds), but I\'m not able to provide tax optimization advice or strategy recommendations. For questions about how to structure expenses, reduce tax liability, or optimize your tax position, please consult a qualified tax professional.',
    };
  }

  try {
    const convex = getConvexClient();

    // Use a Convex action that handles embedding generation + Qdrant KB search
    const result = await convex.query<any>('functions/financialIntelligence:searchRegulatoryKBForMCP', {
      query,
      limit: input.limit || 5,
    });

    if (!result || !result.results || result.results.length === 0) {
      return {
        results: [],
        totalCount: 0,
        disclaimer: 'No specific regulations matching your query were found. Try rephrasing your question.',
      };
    }

    // Check if tax-related — add disclaimer
    const taxKeywords = ['tax', 'gst', 'sst', 'filing', 'corporate tax', 'income tax', 'withholding'];
    const hasTaxContent = taxKeywords.some(k => queryLower.includes(k)) ||
      result.results.some((r: any) => r.category === 'tax_reference');

    return {
      results: result.results.map((r: any) => ({
        source_name: r.source_name || 'Unknown Source',
        country: r.country || 'N/A',
        content_snippet: (r.content_snippet || r.text || '').substring(0, 400),
        confidence_score: r.confidence_score || r.score || 0,
        section: r.section,
        official_url: r.official_url,
        pdf_url: r.pdf_url,
      })),
      totalCount: result.results.length,
      disclaimer: hasTaxContent
        ? 'This is factual reference information only. Please consult a qualified tax professional for advice specific to your situation.'
        : undefined,
    };
  } catch (error) {
    logger.error('search_regulatory_kb_error', {
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }
    return {
      error: true,
      code: 'INTERNAL_ERROR',
      message: 'Regulatory knowledge search temporarily unavailable. Please try again later.',
    };
  }
}
