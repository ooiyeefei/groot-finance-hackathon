/**
 * Standardized Storage Path Management
 *
 * Provides consistent, scalable storage hierarchy for all document types.
 * Structure: {business_id}/{user_id}/{document_type}/{processing_stage}/{filename}
 *
 * Processing stages:
 * - raw: Original uploaded files
 * - converted: PDF→image conversions
 * - processed: OCR annotations, final outputs
 */

export type DocumentType =
  | 'invoice'
  | 'receipt'
  | 'other'
  | 'expense_receipts'  // Legacy compatibility

export type ProcessingStage = 'raw' | 'converted' | 'processed'

export interface StoragePathConfig {
  businessId: string
  userId: string
  documentType: DocumentType
  stage: ProcessingStage
  filename: string
}

export interface LegacyPathInfo {
  isLegacy: boolean
  originalPath: string
  migratedPath?: string
  documentType?: DocumentType
}

/**
 * Generate standardized storage path for new documents
 *
 * Pattern: {businessId}/{userId}/{documentId}/{stage}/{filename}
 *
 * Note: documentType is NOT included in the path - it's part of the S3 prefix
 * (e.g., 'invoices/' or 'expense_claims/') added by aws-s3.ts uploadFile()
 *
 * Full S3 key example: invoices/{businessId}/{userId}/{documentId}/raw/{filename}
 */
export function generateStoragePath(config: StoragePathConfig & { documentId?: string }): string {
  const { businessId, userId, stage, filename, documentId } = config

  // Sanitize components
  const cleanBusinessId = sanitizePathComponent(businessId)
  const cleanUserId = sanitizePathComponent(userId)
  const cleanFilename = sanitizeFilename(filename)

  // Standard pattern: {businessId}/{userId}/{documentId}/{stage}/{filename}
  if (documentId) {
    const cleanDocumentId = sanitizePathComponent(documentId)
    return `${cleanBusinessId}/${cleanUserId}/${cleanDocumentId}/${stage}/${cleanFilename}`
  }

  // Fallback without documentId (legacy compatibility)
  return `${cleanBusinessId}/${cleanUserId}/${stage}/${cleanFilename}`
}

/**
 * Generate timestamped unique filename
 */
export function generateUniqueFilename(originalFilename: string, prefix?: string): string {
  const timestamp = Date.now()
  const sanitized = sanitizeFilename(originalFilename)
  const prefixStr = prefix ? `${prefix}_` : ''

  return `${prefixStr}${timestamp}_${sanitized}`
}

/**
 * Parse and analyze storage path (new format or legacy)
 */
export function analyzeStoragePath(path: string): LegacyPathInfo {
  // New standardized format: {business_id}/{user_id}/{document_type}/{stage}/{filename}
  const parts = path.split('/')
  if (parts.length === 5 && parts[0].length === 36 && parts[1].length === 36) { // UUID format check
    return {
      isLegacy: false,
      originalPath: path,
      documentType: parts[2] as DocumentType
    }
  }

  // Legacy patterns
  if (path.startsWith('expense-receipts/')) {
    // Legacy: expense-receipts/{user_id}/filename
    return {
      isLegacy: true,
      originalPath: path,
      documentType: 'expense_receipts',
      migratedPath: generateLegacyMigrationPath(path, 'expense_receipts')
    }
  }

  if (path.includes('/') && path.split('/').length === 3) {
    // Legacy UUID structure: {business_id}/{user_id}/filename
    return {
      isLegacy: true,
      originalPath: path,
      documentType: 'invoice', // Default assumption
      migratedPath: generateLegacyMigrationPath(path, 'invoice')
    }
  }

  // Conversion artifacts
  if (path.startsWith('converted/')) {
    return {
      isLegacy: true,
      originalPath: path,
      documentType: detectDocumentTypeFromPath(path)
    }
  }

  return {
    isLegacy: true,
    originalPath: path
  }
}

/**
 * Convert legacy path to new standardized path
 */
function generateLegacyMigrationPath(legacyPath: string, documentType: DocumentType): string {
  const parts = legacyPath.split('/')

  if (legacyPath.startsWith('expense-receipts/')) {
    // expense-receipts/{user_id}/filename → need businessId from context
    const userId = parts[1]
    const filename = parts[2]
    throw new Error(`Cannot migrate expense-receipts path without business context: userId=${userId}, filename=${filename}`)
  }

  if (parts.length === 3) {
    // {business_id}/{user_id}/filename
    const [businessId, userId, filename] = parts
    return generateStoragePath({
      businessId,
      userId,
      documentType,
      stage: 'raw',
      filename
    })
  }

  throw new Error(`Unsupported legacy path format: ${legacyPath}`)
}

/**
 * Detect document type from path or filename
 */
function detectDocumentTypeFromPath(path: string): DocumentType | undefined {
  const lowerPath = path.toLowerCase()

  if (lowerPath.includes('invoice')) return 'invoice'
  if (lowerPath.includes('receipt')) return 'receipt'

  return undefined
}

/**
 * Get conversion paths (raw → converted → processed)
 */
export function getProcessingPaths(config: Omit<StoragePathConfig, 'stage'>) {
  return {
    raw: generateStoragePath({ ...config, stage: 'raw' }),
    converted: generateStoragePath({ ...config, stage: 'converted' }),
    processed: generateStoragePath({ ...config, stage: 'processed' })
  }
}

/**
 * Generate path for processing artifacts (annotations, etc.)
 */
export function generateProcessedPath(
  basePath: string,
  artifactType: 'annotated' | 'ocr_result' | 'classification' | 'converted',
  documentId: string,
  extension = 'png'
): string {
  const pathInfo = analyzeStoragePath(basePath)

  if (pathInfo.isLegacy) {
    // For legacy paths, create processed version
    const parts = basePath.split('/')
    const filename = parts[parts.length - 1]
    const nameWithoutExt = filename.split('.')[0]

    return `processed/${artifactType}_${documentId}_${nameWithoutExt}.${extension}`
  }

  // For new standardized paths, change stage to 'processed'
  const parts = basePath.split('/')
  parts[3] = 'processed' // Change stage (0: business_id, 1: user_id, 2: document_type, 3: stage, 4: filename)
  const filename = parts[4]
  const nameWithoutExt = filename.split('.')[0]
  parts[4] = `${artifactType}_${documentId}_${nameWithoutExt}.${extension}`

  return parts.join('/')
}

/**
 * Sanitize path components
 */
function sanitizePathComponent(component: string): string {
  return component
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase()
}

/**
 * Sanitize filename
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase()
}

/**
 * Migration utilities for existing files
 */
export class StorageMigrator {
  /**
   * Generate migration plan for legacy storage structure
   */
  static generateMigrationPlan(
    legacyPaths: string[],
    businessId: string,
    userId: string,
    defaultDocumentType: DocumentType = 'invoice'
  ) {
    const migrations: Array<{
      from: string
      to: string
      documentType: DocumentType
      requiresManualReview: boolean
    }> = []

    for (const legacyPath of legacyPaths) {
      const pathInfo = analyzeStoragePath(legacyPath)

      if (!pathInfo.isLegacy) {
        continue // Already in new format
      }

      let targetDocumentType = pathInfo.documentType || defaultDocumentType
      let targetPath: string

      try {
        if (legacyPath.startsWith('expense-receipts/')) {
          const pathParts = legacyPath.split('/')
          const legacyUserId = pathParts[1]
          const filename = pathParts[2]
          targetPath = generateStoragePath({
            businessId,
            userId: legacyUserId, // Use original user ID from path
            documentType: 'expense_receipts',
            stage: 'raw',
            filename
          })
        } else {
          targetPath = pathInfo.migratedPath || generateStoragePath({
            businessId,
            userId,
            documentType: targetDocumentType,
            stage: 'raw',
            filename: legacyPath.split('/').pop() || 'unknown'
          })
        }

        migrations.push({
          from: legacyPath,
          to: targetPath,
          documentType: targetDocumentType,
          requiresManualReview: !pathInfo.documentType // Needs review if type was guessed
        })
      } catch (error) {
        console.warn(`Cannot generate migration for ${legacyPath}:`, error)
      }
    }

    return migrations
  }
}

/**
 * Type-safe storage path builder
 */
export class StoragePathBuilder {
  constructor(
    private businessId: string,
    private userId: string,
    private documentId?: string
  ) {}

  forDocument(documentType: DocumentType, documentId?: string) {
    // Use provided documentId or fall back to constructor documentId
    const activeDocumentId = documentId || this.documentId;

    return {
      raw: (filename: string) => generateStoragePath({
        businessId: this.businessId,
        userId: this.userId,
        documentType,
        stage: 'raw',
        filename,
        documentId: activeDocumentId
      }),
      converted: (filename: string) => generateStoragePath({
        businessId: this.businessId,
        userId: this.userId,
        documentType,
        stage: 'converted',
        filename,
        documentId: activeDocumentId
      }),
      processed: (filename: string, artifactType?: string) => {
        const processedFilename = artifactType
          ? `${artifactType}_${filename}`
          : filename

        return generateStoragePath({
          businessId: this.businessId,
          userId: this.userId,
          documentType,
          stage: 'processed',
          filename: processedFilename,
          documentId: activeDocumentId
        })
      }
    }
  }
}