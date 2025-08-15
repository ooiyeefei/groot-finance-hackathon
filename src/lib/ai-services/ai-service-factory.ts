/**
 * AI Service Factory Implementation
 * Centralized factory for managing all AI processing services
 */

import { IAIServiceFactory } from './interfaces'
import { ServiceHealth } from './types'

// Service implementations
import { OCRService } from './ocr-service'
import { EmbeddingService } from './embedding-service'
import { TextAnalysisService } from './text-analysis-service'
import { VectorStorageService } from './vector-storage-service'

export class AIServiceFactory implements IAIServiceFactory {
  private static instance: AIServiceFactory
  
  // Service instances (lazy-loaded singletons)
  private _ocrService?: OCRService
  private _embeddingService?: EmbeddingService
  private _textAnalysisService?: TextAnalysisService
  private _vectorStorageService?: VectorStorageService

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance of the factory
   */
  public static getInstance(): AIServiceFactory {
    if (!AIServiceFactory.instance) {
      AIServiceFactory.instance = new AIServiceFactory()
    }
    return AIServiceFactory.instance
  }

  /**
   * Get OCR service instance
   */
  getOCRService(): OCRService {
    if (!this._ocrService) {
      this._ocrService = new OCRService()
      console.log('[Factory] Initialized OCR service')
    }
    return this._ocrService
  }

  /**
   * Get embedding service instance
   */
  getEmbeddingService(): EmbeddingService {
    if (!this._embeddingService) {
      this._embeddingService = new EmbeddingService()
      console.log('[Factory] Initialized Embedding service')
    }
    return this._embeddingService
  }

  /**
   * Get text analysis service instance (SEA-LION)
   */
  getTextAnalysisService(): TextAnalysisService {
    if (!this._textAnalysisService) {
      this._textAnalysisService = new TextAnalysisService()
      console.log('[Factory] Initialized SEA-LION Text Analysis service')
    }
    return this._textAnalysisService
  }


  /**
   * Get vector storage service instance
   */
  getVectorStorageService(): VectorStorageService {
    if (!this._vectorStorageService) {
      this._vectorStorageService = new VectorStorageService()
      console.log('[Factory] Initialized Vector Storage service')
    }
    return this._vectorStorageService
  }

  /**
   * Check health of all services
   */
  async checkAllServicesHealth(): Promise<Record<string, ServiceHealth>> {
    const healthChecks = await Promise.allSettled([
      this.getOCRService().checkHealth(),
      this.getEmbeddingService().checkHealth(),
      this.getTextAnalysisService().checkHealth(),
      this.getVectorStorageService().checkHealth()
    ])

    const results: Record<string, ServiceHealth> = {}

    // OCR Service Health
    const ocrResult = healthChecks[0]
    results.ocr = ocrResult.status === 'fulfilled' 
      ? ocrResult.value 
      : {
          healthy: false,
          lastCheck: new Date(),
          error: ocrResult.reason?.message || 'Health check failed'
        }

    // Embedding Service Health
    const embeddingResult = healthChecks[1]
    results.embedding = embeddingResult.status === 'fulfilled'
      ? embeddingResult.value
      : {
          healthy: false,
          lastCheck: new Date(),
          error: embeddingResult.reason?.message || 'Health check failed'
        }

    // Text Analysis Service Health
    const textAnalysisResult = healthChecks[2]
    results.textAnalysis = textAnalysisResult.status === 'fulfilled'
      ? textAnalysisResult.value
      : {
          healthy: false,
          lastCheck: new Date(),
          error: textAnalysisResult.reason?.message || 'Health check failed'
        }

    // Vector Storage Service Health
    const vectorStorageResult = healthChecks[3]
    results.vectorStorage = vectorStorageResult.status === 'fulfilled'
      ? vectorStorageResult.value
      : {
          healthy: false,
          lastCheck: new Date(),
          error: vectorStorageResult.reason?.message || 'Health check failed'
        }

    // Log health summary
    const healthyServices = Object.entries(results).filter(([_, health]) => health.healthy).length
    const totalServices = Object.keys(results).length
    
    console.log(`[Factory] Health check complete: ${healthyServices}/${totalServices} services healthy`)

    return results
  }

  /**
   * Get system status summary
   */
  async getSystemStatus(): Promise<{
    healthy: boolean
    services: Record<string, ServiceHealth>
    summary: {
      totalServices: number
      healthyServices: number
      averageLatency: number
    }
  }> {
    const serviceHealth = await this.checkAllServicesHealth()
    
    const healthyServices = Object.values(serviceHealth).filter(health => health.healthy)
    const totalServices = Object.keys(serviceHealth).length
    
    const averageLatency = healthyServices.reduce((sum, health) => {
      return sum + (health.latency || 0)
    }, 0) / Math.max(healthyServices.length, 1)

    const systemHealthy = healthyServices.length === totalServices

    return {
      healthy: systemHealthy,
      services: serviceHealth,
      summary: {
        totalServices,
        healthyServices: healthyServices.length,
        averageLatency: Math.round(averageLatency)
      }
    }
  }

  /**
   * Reset all service instances (for testing or configuration changes)
   */
  resetServices(): void {
    this._ocrService = undefined
    this._embeddingService = undefined
    this._textAnalysisService = undefined
    this._vectorStorageService = undefined
    
    console.log('[Factory] All services reset')
  }

  /**
   * Get service configuration status
   */
  getConfigurationStatus(): {
    configured: string[]
    missing: string[]
    issues: string[]
  } {
    const configured: string[] = []
    const missing: string[] = []
    const issues: string[] = []

    // Check required environment variables
    const requiredVars = {
      OCR_ENDPOINT_URL: 'OCR Service',
      OCR_MODEL_NAME: 'OCR Service',
      EMBEDDING_ENDPOINT_URL: 'Embedding Service',
      EMBEDDING_MODEL_ID: 'Embedding Service',
      EMBEDDING_API_KEY: 'Embedding Service',
      SEALION_ENDPOINT_URL: 'SEA-LION Service',
      SEALION_MODEL_ID: 'SEA-LION Service',
      QDRANT_URL: 'Vector Storage',
      QDRANT_API_KEY: 'Vector Storage'
    }

    Object.entries(requiredVars).forEach(([envVar, serviceName]) => {
      if (process.env[envVar]) {
        configured.push(`${serviceName} (${envVar})`)
      } else {
        missing.push(`${serviceName} (${envVar})`)
      }
    })

    // Check URL validity
    const urlVars = ['OCR_ENDPOINT_URL', 'EMBEDDING_ENDPOINT_URL', 'SEALION_ENDPOINT_URL', 'QDRANT_URL']
    urlVars.forEach(envVar => {
      const url = process.env[envVar]
      if (url) {
        try {
          new URL(url)
        } catch {
          issues.push(`Invalid URL format: ${envVar}`)
        }
      }
    })

    return {
      configured,
      missing,
      issues
    }
  }
}

// Export singleton instance
export const aiServiceFactory = AIServiceFactory.getInstance()

// Helper function to get service factory
export function getAIServiceFactory(): AIServiceFactory {
  return aiServiceFactory
}