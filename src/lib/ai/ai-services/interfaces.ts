/**
 * AI Services Interfaces
 * Service contracts for all AI processing capabilities
 */

import { AnalysisResult, ServiceHealth } from './types'

// Gemini embedding task types — optimizes embeddings for specific use cases
export type EmbeddingTaskType =
  | 'RETRIEVAL_QUERY'      // Search queries (user questions)
  | 'RETRIEVAL_DOCUMENT'   // Document indexing (KB ingestion)
  | 'SEMANTIC_SIMILARITY'  // Text similarity comparison
  | 'CLASSIFICATION'       // Text categorization
  | 'CLUSTERING'           // Document grouping

// Embedding Service Interface
export interface IEmbeddingService {
  /**
   * Generate vector embedding for text
   * @param taskType - Gemini task type to optimize embedding for the use case
   */
  generateEmbedding(text: string, taskType?: EmbeddingTaskType): Promise<number[]>

  /**
   * Generate embeddings for multiple texts (batch processing)
   * @param taskType - Gemini task type to optimize embedding for the use case
   */
  generateEmbeddings(texts: string[], taskType?: EmbeddingTaskType): Promise<number[][]>

  /**
   * Check service health and availability
   */
  checkHealth(): Promise<ServiceHealth>
}

// Text Analysis Service Interface (SEA-LION)
export interface ITextAnalysisService {
  /**
   * Extract structured financial data from text
   */
  extractFinancialData(text: string): Promise<AnalysisResult>
  
  /**
   * Translate text between languages
   */
  translateText(
    text: string, 
    sourceLanguage: string, 
    targetLanguage: string
  ): Promise<string>
  
  /**
   * Check service health and availability  
   */
  checkHealth(): Promise<ServiceHealth>
}


// Vector Storage Service Interface
export interface IVectorStorageService {
  /**
   * Store document embedding with metadata
   */
  storeEmbedding(
    documentId: string,
    text: string, 
    embedding: number[], 
    metadata: Record<string, unknown>
  ): Promise<void>
  
  /**
   * Search similar documents by embedding
   */
  searchSimilar(
    embedding: number[], 
    limit: number
  ): Promise<Array<{ id: string; score: number; metadata: Record<string, unknown> }>>

  /**
   * SECURE search similar documents with user_id and business_id filtering at database level
   */
  similaritySearchSecure(
    embedding: number[],
    userId: string,
    businessId: string,
    limit?: number,
    scoreThreshold?: number
  ): Promise<Array<{ id: string; score: number; payload?: Record<string, unknown> }>>
}

// Main AI Service Factory Interface
export interface IAIServiceFactory {
  getEmbeddingService(): IEmbeddingService
  getTextAnalysisService(): ITextAnalysisService
  getVectorStorageService(): IVectorStorageService
  
  /**
   * Check health of all services
   */
  checkAllServicesHealth(): Promise<Record<string, ServiceHealth>>
}