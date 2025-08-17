/**
 * AI Services Interfaces
 * Service contracts for all AI processing capabilities
 */

import { AnalysisResult, ServiceHealth } from './types'

// Embedding Service Interface  
export interface IEmbeddingService {
  /**
   * Generate vector embedding for text
   */
  generateEmbedding(text: string): Promise<number[]>
  
  /**
   * Generate embeddings for multiple texts (batch processing)
   */
  generateEmbeddings(texts: string[]): Promise<number[][]>
  
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