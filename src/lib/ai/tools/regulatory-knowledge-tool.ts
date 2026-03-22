/**
 * Regulatory Knowledge Base Search Tool
 * Uses RAG to answer compliance and regulatory questions from the 'regulatory_kb'.
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool';
import { aiServiceFactory } from '@/lib/ai/ai-services/ai-service-factory';
import { callMCPToolFromAgent } from './mcp-tool-wrapper';

interface RegulatorySearchParameters {
  query: string;
  limit?: number;
}

export class RegulatoryKnowledgeTool extends BaseTool {
  private embeddingService = aiServiceFactory.getEmbeddingService();
  private vectorService = aiServiceFactory.getVectorStorageService();

  getToolName(_modelType: ModelType = 'openai'): string {
    return 'searchRegulatoryKnowledgeBase';
  }

  getDescription(_modelType: ModelType = 'openai'): string {
    return 'Answers questions about tax laws, compliance, regulations, and registration requirements for Singapore and Malaysia. Use this for general knowledge questions like "What are the GST requirements?" or "How does Overseas Vendor Registration work?". Do NOT use this for personal user data like "What was my biggest expense?".';
  }

  getToolSchema(modelType: ModelType = 'openai'): OpenAIToolSchema {
    return {
      type: "function",
      function: {
        name: this.getToolName(modelType),
        description: this.getDescription(modelType),
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The user's question about a specific tax or regulatory topic."
            },
            limit: {
              type: "integer",
              description: "Maximum number of knowledge snippets to return (default: 5)."
            }
          },
          required: ["query"]
        }
      }
    };
  }

  protected async validateParameters(parameters: ToolParameters): Promise<{ valid: boolean; error?: string }> {
    const params = parameters as RegulatorySearchParameters;
    if (!params.query || typeof params.query !== 'string' || params.query.trim().length === 0) {
      return { valid: false, error: 'Query is required and must be a non-empty string.' };
    }
    return { valid: true };
  }

  protected async executeInternal(parameters: ToolParameters, userContext: UserContext): Promise<ToolResult> {
    const params = parameters as RegulatorySearchParameters;
    return callMCPToolFromAgent('search_regulatory_knowledge_base', {
      query: params.query.trim(),
      limit: params.limit || 5,
    }, userContext);
  }

  /**
   * Clean content text by removing navigation elements and irrelevant webpage components
   */
  private cleanContentText(text: string): string {
    if (!text || typeof text !== 'string') {
      return text;
    }

    // Remove common navigation patterns
    const navigationPatterns = [
      /Jump to:\s*Select Subheading\s*expand all\s*collapse all/gi,
      /Jump to:\s*[^\.]+/gi,
      /expand all\s*collapse all/gi,
      /Skip to main content/gi,
      /Skip navigation/gi,
      /Main navigation/gi,
      /Site search/gi,
      /Breadcrumb/gi,
      /Back to top/gi,
      /Print page/gi,
      /Share this page/gi,
      /Download PDF/gi,
      /View source/gi,
      /Last updated:/gi,
      /Published:/gi,
      /Page \d+ of \d+/gi,
      /\[Skip to Content\]/gi,
      /\[Skip to Navigation\]/gi
    ];

    // Remove table of contents patterns
    const tocPatterns = [
      /Table of Contents/gi,
      /Contents:/gi,
      /In this section:/gi,
      /On this page:/gi,
      /Quick links:/gi
    ];

    // Remove footer/header patterns
    const footerHeaderPatterns = [
      /Copyright \d{4}/gi,
      /All rights reserved/gi,
      /Terms of use/gi,
      /Privacy policy/gi,
      /Contact us/gi,
      /Help \& support/gi,
      /Accessibility/gi,
      /Site map/gi
    ];

    // Apply all cleaning patterns
    let cleanedText = text;
    
    [...navigationPatterns, ...tocPatterns, ...footerHeaderPatterns].forEach(pattern => {
      cleanedText = cleanedText.replace(pattern, '');
    });

    // Clean up excessive whitespace and line breaks
    cleanedText = cleanedText
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Multiple line breaks to double
      .replace(/\s+/g, ' ') // Multiple spaces to single
      .trim();

    // Remove very short fragments that are likely navigation remnants
    const lines = cleanedText.split('\n');
    const filteredLines = lines.filter(line => {
      const trimmedLine = line.trim();
      // Keep lines that are substantial content (longer than 10 chars and not just navigation words)
      if (trimmedLine.length < 10) return false;
      
      // Filter out common navigation words
      const navWords = ['home', 'about', 'contact', 'help', 'search', 'menu', 'login', 'register'];
      if (navWords.some(word => trimmedLine.toLowerCase() === word)) return false;
      
      return true;
    });

    return filteredLines.join('\n').trim();
  }

  private analyzeCountryAmbiguity(query: string, searchResults: any[]): { needsClarification: boolean; detectedCountries: string[] } {
    // Extract countries from search results
    const countriesInResults = new Set<string>();
    searchResults.forEach(result => {
      const country = result.payload?.metadata?.country;
      if (country) {
        countriesInResults.add(country);
      }
    });

    const uniqueCountries = Array.from(countriesInResults);

    // Check if query explicitly mentions a country
    const queryLower = query.toLowerCase();
    const countryMentioned = uniqueCountries.some(country => 
      queryLower.includes(country.toLowerCase()) ||
      (country === 'Singapore' && (queryLower.includes('sg') || queryLower.includes('singapore'))) ||
      (country === 'Malaysia' && (queryLower.includes('my') || queryLower.includes('malaysia')))
    );

    // Check for ambiguous terms that apply to multiple countries
    const ambiguousTerms = ['gst', 'tax', 'registration', 'compliance', 'regulation'];
    const hasAmbiguousTerms = ambiguousTerms.some(term => queryLower.includes(term));

    // Determine if clarification is needed
    const needsClarification = !countryMentioned && 
                              uniqueCountries.length > 1 && 
                              hasAmbiguousTerms &&
                              searchResults.length > 0;

    return {
      needsClarification,
      detectedCountries: uniqueCountries
    };
  }

  /**
   * Detect advisory/optimization questions that should be declined.
   * Factual questions (rates, deadlines, thresholds) are allowed.
   * Advisory questions (how to reduce, optimize, structure) are declined.
   */
  private isAdvisoryQuestion(query: string): boolean {
    const lower = query.toLowerCase();
    const advisoryPatterns = [
      'how should i', 'how can i reduce', 'how to minimize', 'how to avoid',
      'how to lower', 'how to save on tax', 'what should i do',
      'optimize', 'optimization', 'tax planning strategy',
      'structure my expenses', 'reduce my tax', 'minimize tax',
      'tax saving', 'tax savings', 'deduction strategy',
      'best way to', 'should i claim', 'should i deduct',
      'transfer pricing strategy', 'tax shelter', 'tax avoidance',
    ];
    return advisoryPatterns.some(p => lower.includes(p));
  }

  protected formatResultData(data: any[]): string {
    return data.map((result, index) => {
      const payload = result.payload || {};
      const metadata = payload.metadata || {};
      let text = payload.text || 'No content available.';
      
      // Clean up navigation text and irrelevant content
      text = this.cleanContentText(text);
      
      // Enhanced source citation format
      const sourceName = metadata.source_name || 'Unknown Source';
      const country = metadata.country || 'N/A';
      const topics = Array.isArray(metadata.topics) ? metadata.topics.join(', ') : 'General';
      const relevanceScore = result.score ? result.score.toFixed(3) : '0.000';
      
      // Format citation-style reference
      const citationRef = `[${sourceName}${metadata.section ? ` - ${metadata.section}` : ''}] (${country})`;
      
      return `**Source ${index + 1}** (Relevance: ${relevanceScore}):
${citationRef}
Topics: ${topics}
Content: ${text.substring(0, 400)}${text.length > 400 ? '...' : ''}

---REFERENCE---
Document: ${sourceName}
Country: ${country}
Confidence: ${relevanceScore}
${metadata.official_url ? `Link: ${metadata.official_url}` : ''}`;
    }).join('\n\n');
  }

  /**
   * Format results with citation markers [^1], [^2] for LLM to use in responses.
   * IMPORTANT: Do NOT include instructions or meta-text here — the LLM may echo them
   * verbatim into the compliance_alert card's requirements array.
   */
  private formatResultDataWithCitations(data: any[]): string {
    return data.map((result, index) => {
      const payload = result.payload || {};
      const metadata = payload.metadata || {};
      let text = payload.text || 'No content available.';

      // Clean up navigation text and irrelevant content
      text = this.cleanContentText(text);

      const sourceName = metadata.source_name || 'Unknown Source';
      const country = metadata.country || 'N/A';
      const citationMarker = `[^${index + 1}]`;

      return `${citationMarker} ${sourceName} (${country}):
${text.substring(0, 400)}${text.length > 400 ? '...' : ''}`;
    }).join('\n\n');
  }
}