/**
 * AI Services Export Index
 * Centralized exports for all AI processing services
 */

// Types and Interfaces
export * from './types'
export * from './interfaces'

// Service Implementations
export { OCRService } from './ocr-service'
export { EmbeddingService } from './embedding-service'
export { TextAnalysisService } from './text-analysis-service'
export { VectorStorageService } from './vector-storage-service'

// Service Factory
export { AIServiceFactory, aiServiceFactory, getAIServiceFactory } from './ai-service-factory'

// Configuration
export { aiConfig, checkAIConfigHealth } from '../config/ai-config'

// Re-export common types for convenience
export type {
  OCRResult,
  AnalysisResult,
  DocumentContext,
  ProcessingError,
  ServiceHealth,
  FinancialEntityType
} from './types'

export type {
  IOCRService,
  IEmbeddingService,
  ITextAnalysisService,
  IVectorStorageService,
  IAIServiceFactory
} from './interfaces'