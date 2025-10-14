/**
 * Regulatory Knowledge Base Search Tool
 * Uses RAG to answer compliance and regulatory questions from the 'regulatory_kb'.
 */

import { BaseTool, UserContext, ToolParameters, ToolResult, OpenAIToolSchema, ModelType } from './base-tool';
import { aiServiceFactory } from '@/lib/ai/ai-services/ai-service-factory';

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
    const query = params.query.trim();
    const limit = params.limit || 5;

    try {
      console.log(`[RegulatoryKnowledgeTool] Answering question for user ${userContext.userId}: "${query}"`);

      // 1. Generate an embedding for the user's query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // 2. Search the regulatory KB using the new service method
      const searchResults = await this.vectorService.searchRegulatoryKb(queryEmbedding, limit);

      if (!searchResults || searchResults.length === 0) {
        return {
          success: true,
          data: "I could not find any specific regulations matching your query in the knowledge base. You could try rephrasing your question."
        };
      }

      // 3. Check if country clarification is needed
      const countryAnalysis = this.analyzeCountryAmbiguity(query, searchResults);
      
      if (countryAnalysis.needsClarification) {
        return {
          success: true,
          data: `I found regulations for ${countryAnalysis.detectedCountries.join(' and ')}. Which country are you asking about? Please specify the country so I can provide the most accurate information.`
        };
      }

      // 4. Generate structured citations array
      const citations = searchResults.map((result: any, index) => {
        const metadata = result.payload?.metadata || {};
        
        // DEBUG: Log what we're getting from Qdrant
        console.log(`[RegulatoryKnowledgeTool] Processing search result ${index + 1}:`, {
          result_id: result.id,
          metadata_keys: Object.keys(metadata),
          metadata_url: metadata.url,
          metadata_source_name: metadata.source_name,
          full_metadata: metadata
        });
        
        // Map the 'url' field to appropriate type based on file extension
        const sourceUrl = metadata.url;
        let pdf_url: string | undefined;
        let official_url: string | undefined;
        
        if (sourceUrl) {
          console.log(`[RegulatoryKnowledgeTool] Processing URL: "${sourceUrl}"`);
          if (sourceUrl.toLowerCase().includes('.pdf')) {
            pdf_url = sourceUrl;
            console.log(`[RegulatoryKnowledgeTool] Mapped as PDF URL: ${pdf_url}`);
          } else {
            official_url = sourceUrl;
            console.log(`[RegulatoryKnowledgeTool] Mapped as Official URL: ${official_url}`);
          }
        } else {
          console.log(`[RegulatoryKnowledgeTool] No URL found in metadata for result ${index + 1}`);
        }
        
        const rawText = result.payload?.text || '';
        const cleanedText = this.cleanContentText(rawText);
        
        const citationData = {
          id: result.id || `citation_${index + 1}`,
          index: index + 1,
          source_name: metadata.source_name || 'Unknown Source',
          country: metadata.country || 'N/A',
          section: metadata.section,
          pdf_url: pdf_url,
          page_number: metadata.page_number,
          text_coordinates: metadata.text_coordinates ? {
            x1: metadata.text_coordinates.x1,
            y1: metadata.text_coordinates.y1,
            x2: metadata.text_coordinates.x2,
            y2: metadata.text_coordinates.y2
          } : undefined,
          content_snippet: cleanedText.substring(0, 200) || '',
          confidence_score: result.score || 0,
          official_url: official_url
        };
        
        console.log(`[RegulatoryKnowledgeTool] Generated citation ${index + 1}:`, citationData);
        return citationData;
      });

      // 5. Format the results with citation markers for LLM synthesis
      const formattedResults = this.formatResultDataWithCitations(searchResults);

      // Embed citations in the data string for extraction by chat API
      const citationsData = JSON.stringify(citations);
      
      return {
        success: true,
        data: `Here are the most relevant regulatory snippets I found:\n\n${formattedResults}\n\nIMPORTANT: When synthesizing your response:
1. Use [^1], [^2], [^3] etc. citation markers when referencing these sources in your answer
2. Include proper citations using the format: "According to [Source Name] (Country) [^1], requirement details..."
3. Reference specific sources for each key point with citation numbers
4. If multiple countries have different rules, clearly distinguish them with proper citations
5. Provide authoritative, regulation-based answers with proper citation attribution

<!--CITATIONS_DATA:${citationsData}:END_CITATIONS-->`,
        citations: citations
      };

    } catch (error) {
      console.error('[RegulatoryKnowledgeTool] Execution failed:', error);
      return {
        success: false,
        error: `Failed to search the regulatory knowledge base: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
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
   * Format results with citation markers [^1], [^2] for LLM to use in responses
   */
  private formatResultDataWithCitations(data: any[]): string {
    return data.map((result, index) => {
      const payload = result.payload || {};
      const metadata = payload.metadata || {};
      let text = payload.text || 'No content available.';
      
      // Clean up navigation text and irrelevant content
      text = this.cleanContentText(text);
      
      // Enhanced source citation format with citation marker
      const sourceName = metadata.source_name || 'Unknown Source';
      const country = metadata.country || 'N/A';
      const topics = Array.isArray(metadata.topics) ? metadata.topics.join(', ') : 'General';
      const relevanceScore = result.score ? result.score.toFixed(3) : '0.000';
      const citationMarker = `[^${index + 1}]`;
      
      // Format citation-style reference with marker
      const citationRef = `${citationMarker} [${sourceName}${metadata.section ? ` - ${metadata.section}` : ''}] (${country})`;
      
      return `**Source ${index + 1}** (Relevance: ${relevanceScore}):
${citationRef}
Topics: ${topics}
Content: ${text.substring(0, 400)}${text.length > 400 ? '...' : ''}

---REFERENCE---
Document: ${sourceName}
Country: ${country}
Confidence: ${relevanceScore}
Citation: Use ${citationMarker} when referencing this source
${metadata.official_url ? `Link: ${metadata.official_url}` : ''}`;
    }).join('\n\n');
  }
}