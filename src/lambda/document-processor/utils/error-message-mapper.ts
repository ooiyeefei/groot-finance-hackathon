/**
 * Domain-Agnostic Error Message Mapper for Lambda
 *
 * Provides comprehensive error message mapping for ALL document processing failures
 * Supports: invoices, expense-claims (receipts), and any future document processing domains
 *
 * Ported from: src/lib/shared/error-message-mapper.ts (Trigger.dev implementation)
 */

export interface ErrorMapping {
  userMessage: string;
  actionableSteps?: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  supportRequired: boolean;
}

export interface ErrorContext {
  errorCode?: string;
  errorCategory?: string;
  technicalError?: string;
  processingStage?: string;
  timeoutDuration?: string;
  retryAttempts?: number;
  domain?: 'invoices' | 'expense_claims';
  documentType?: string;
}

/**
 * Comprehensive error message mappings for all document processing domains
 */
export const ERROR_MESSAGE_MAPPINGS: Record<string, ErrorMapping> = {
  // System-level failures (common across all domains)
  'SYSTEM_ERROR': {
    userMessage: 'A system error occurred during document processing. Please try again or contact support if the issue persists.',
    actionableSteps: [
      'Wait a few moments and try uploading your document again',
      'Ensure your internet connection is stable',
      'Contact support if the error continues'
    ],
    severity: 'high',
    category: 'system_failure',
    supportRequired: true
  },

  'PYTHON_ENV_MISSING': {
    userMessage: 'AI processing service is not properly configured. Please contact support to resolve this issue.',
    actionableSteps: [
      'This is a system configuration issue',
      'Contact technical support immediately',
      'Provide the error details when contacting support'
    ],
    severity: 'critical',
    category: 'environment_missing',
    supportRequired: true
  },

  'CONFIGURATION_ERROR': {
    userMessage: 'System configuration error. Please contact support to resolve this issue.',
    actionableSteps: [
      'This requires administrator attention',
      'Contact support with details of what you were trying to do',
      'Try again later after support resolves the configuration'
    ],
    severity: 'critical',
    category: 'configuration_error',
    supportRequired: true
  },

  'SYSTEM_TIMEOUT': {
    userMessage: 'Document processing timed out due to system issues. Please try again in a few moments.',
    actionableSteps: [
      'Wait 2-3 minutes before trying again',
      'Ensure your document is clear and not too large',
      'Contact support if timeouts persist'
    ],
    severity: 'medium',
    category: 'system_timeout',
    supportRequired: false
  },

  // Processing-specific errors (adaptable across domains)
  'TIMEOUT_ERROR': {
    userMessage: 'Document processing timed out after 3 minutes. This usually happens with very complex documents or during high server load.',
    actionableSteps: [
      'Try uploading a clearer, simpler document',
      'Ensure the document is well-lit and not blurry',
      'Wait a few minutes and try again during off-peak hours',
      'Consider manually entering the information'
    ],
    severity: 'medium',
    category: 'timeout',
    supportRequired: false
  },

  'JSON_PARSE_FAILED': {
    userMessage: 'AI processing returned invalid data format. Please try uploading the document again.',
    actionableSteps: [
      'Upload the document again',
      'Try taking a clearer photo if using mobile',
      'Ensure the document is fully visible in the image',
      'Contact support if the error persists'
    ],
    severity: 'medium',
    category: 'parsing_error',
    supportRequired: false
  },

  // File and storage errors (common across all domains)
  'MISSING_IMAGE_DATA': {
    userMessage: 'No document found to process. Please ensure the document was uploaded correctly.',
    actionableSteps: [
      'Check that you selected a file before submitting',
      'Ensure the file is a valid format (JPG, PNG, PDF)',
      'Try uploading the document again',
      'Refresh the page and start over if needed'
    ],
    severity: 'low',
    category: 'missing_image',
    supportRequired: false
  },

  'STORAGE_ACCESS_ERROR': {
    userMessage: 'Unable to access the uploaded document. Please try uploading the document again.',
    actionableSteps: [
      'Upload your document again',
      'Check your internet connection',
      'Try refreshing the page and uploading again',
      'Contact support if storage issues persist'
    ],
    severity: 'medium',
    category: 'storage_access',
    supportRequired: false
  },

  'S3_READ_ERROR': {
    userMessage: 'Unable to retrieve document from storage. Please try uploading the document again.',
    actionableSteps: [
      'Upload your document again',
      'Check your internet connection',
      'Try refreshing the page',
      'Contact support if storage issues persist'
    ],
    severity: 'medium',
    category: 'storage_access',
    supportRequired: false
  },

  'S3_WRITE_ERROR': {
    userMessage: 'Unable to save processed images. Please try again.',
    actionableSteps: [
      'Try processing the document again',
      'Contact support if the issue persists'
    ],
    severity: 'medium',
    category: 'storage_access',
    supportRequired: false
  },

  // Data integrity errors
  'RECORD_NOT_FOUND': {
    userMessage: 'Document record not found. Please refresh the page and try again.',
    actionableSteps: [
      'Refresh the page',
      'Check if you\'re still logged in',
      'Navigate back to the document list',
      'Contact support if the document has disappeared'
    ],
    severity: 'medium',
    category: 'data_integrity',
    supportRequired: false
  },

  'DATABASE_UPDATE_ERROR': {
    userMessage: 'Failed to save processed data. Please try again or contact support if the issue persists.',
    actionableSteps: [
      'Try the operation again',
      'Check your internet connection',
      'Refresh the page and retry',
      'Contact support if data is not saving'
    ],
    severity: 'high',
    category: 'database_update',
    supportRequired: true
  },

  'CONVEX_UPDATE_ERROR': {
    userMessage: 'Failed to update document status. Please try again or contact support.',
    actionableSteps: [
      'Try processing the document again',
      'Refresh the page',
      'Contact support if the issue persists'
    ],
    severity: 'high',
    category: 'database_update',
    supportRequired: true
  },

  // Classification errors
  'CLASSIFICATION_FAILED': {
    userMessage: 'Unable to determine document type. Please ensure you uploaded a valid invoice or receipt.',
    actionableSteps: [
      'Ensure the document is a clear invoice or receipt',
      'Make sure the document is well-lit and not blurry',
      'Try uploading a different format (PDF instead of image)',
      'Consider manually entering the information'
    ],
    severity: 'medium',
    category: 'classification_failure',
    supportRequired: false
  },

  'UNSUPPORTED_FORMAT': {
    userMessage: 'Document format not supported. Please upload a PDF, JPG, or PNG file.',
    actionableSteps: [
      'Convert your document to PDF, JPG, or PNG format',
      'Take a photo of the document if it\'s in paper form',
      'Ensure the file extension matches the actual format'
    ],
    severity: 'low',
    category: 'unsupported_format',
    supportRequired: false
  },

  // PDF conversion errors
  'PDF_CONVERSION_FAILED': {
    userMessage: 'Failed to process PDF document. Please try uploading a clearer PDF or an image.',
    actionableSteps: [
      'Try uploading an image instead of PDF',
      'Ensure the PDF is not password-protected',
      'Check that the PDF is not corrupted',
      'Convert the PDF to images manually before uploading'
    ],
    severity: 'medium',
    category: 'pdf_conversion',
    supportRequired: false
  },

  'PDF_TOO_LARGE': {
    userMessage: 'PDF has too many pages. Please upload a document with fewer than 100 pages.',
    actionableSteps: [
      'Split the PDF into smaller files',
      'Upload only the relevant pages',
      'Extract specific pages that need processing'
    ],
    severity: 'low',
    category: 'pdf_conversion',
    supportRequired: false
  },

  'PDF_CORRUPTED': {
    userMessage: 'The PDF file appears to be corrupted or invalid. Please try a different file.',
    actionableSteps: [
      'Try re-downloading the PDF',
      'Check that the PDF opens correctly on your device',
      'Take a photo of the document instead',
      'Export the document as a new PDF'
    ],
    severity: 'low',
    category: 'pdf_conversion',
    supportRequired: false
  },

  // Extraction-specific errors
  'EMPTY_EXTRACTION_RESULT': {
    userMessage: 'AI processing completed but no data was extracted. Please try uploading a clearer document.',
    actionableSteps: [
      'Ensure the document text is clearly visible',
      'Try taking a photo in better lighting',
      'Make sure the document is not torn or damaged',
      'Consider manually entering the information'
    ],
    severity: 'low',
    category: 'empty_result',
    supportRequired: false
  },

  'INVALID_DATA_FORMAT': {
    userMessage: 'AI processing returned invalid data format. Please try uploading the document again.',
    actionableSteps: [
      'Upload the document again',
      'Try a different image of the same document',
      'Ensure the document is clear and readable',
      'Contact support if the error continues'
    ],
    severity: 'medium',
    category: 'parsing_error',
    supportRequired: false
  },

  'EXTRACTION_FAILED': {
    userMessage: 'Unable to extract data from this document. Please try uploading a clearer image or contact support.',
    actionableSteps: [
      'Take a clearer photo with better lighting',
      'Ensure all text on the document is visible',
      'Try uploading a different format (PDF instead of image)',
      'Consider manually entering the information'
    ],
    severity: 'medium',
    category: 'extraction_failure',
    supportRequired: false
  },

  'LOW_CONFIDENCE': {
    userMessage: 'The extracted data may not be accurate. Please review and correct any errors before saving.',
    actionableSteps: [
      'Review all extracted fields carefully',
      'Correct any inaccurate information',
      'Upload a clearer document if many fields are wrong'
    ],
    severity: 'low',
    category: 'low_confidence',
    supportRequired: false
  },

  // AI service errors
  'AI_SERVICE_ERROR': {
    userMessage: 'AI processing service is temporarily unavailable. Please try again in a few minutes.',
    actionableSteps: [
      'Wait 2-3 minutes before trying again',
      'Check system status if available',
      'Contact support if the service remains unavailable'
    ],
    severity: 'medium',
    category: 'ai_service',
    supportRequired: false
  },

  'AI_RATE_LIMITED': {
    userMessage: 'AI service rate limit reached. Please wait a moment and try again.',
    actionableSteps: [
      'Wait 1-2 minutes before trying again',
      'Avoid uploading multiple documents simultaneously',
      'Contact support if rate limiting persists'
    ],
    severity: 'low',
    category: 'ai_service',
    supportRequired: false
  },

  // Workflow errors
  'TIMEOUT': {
    userMessage: 'Document processing timed out. Please try again.',
    actionableSteps: [
      'Try processing the document again',
      'Upload a smaller or clearer document',
      'Contact support if timeouts persist'
    ],
    severity: 'medium',
    category: 'timeout',
    supportRequired: false
  },

  'CHECKPOINT_ERROR': {
    userMessage: 'Processing was interrupted. Please try again.',
    actionableSteps: [
      'Try processing the document again',
      'Contact support if the error continues'
    ],
    severity: 'medium',
    category: 'system_failure',
    supportRequired: false
  },

  'IDEMPOTENCY_CONFLICT': {
    userMessage: 'This document is already being processed. Please wait for it to complete.',
    actionableSteps: [
      'Wait for the current processing to complete',
      'Refresh the page to see the status',
      'Do not upload the same document again'
    ],
    severity: 'low',
    category: 'duplicate_request',
    supportRequired: false
  },

  'PROCESSING_FAILED': {
    userMessage: 'Document processing failed. Please try again or contact support.',
    actionableSteps: [
      'Try processing the document again',
      'Upload a clearer version of the document',
      'Contact support if the error persists'
    ],
    severity: 'medium',
    category: 'general_failure',
    supportRequired: false
  },

  // Monitoring system errors
  'STUCK_RECORD_TIMEOUT': {
    userMessage: 'Processing timed out. The AI service may be experiencing issues. Please try uploading your document again.',
    actionableSteps: [
      'Try uploading your document again',
      'Wait a few minutes before retrying',
      'Check system status page if available',
      'Contact support if the issue persists'
    ],
    severity: 'medium',
    category: 'system_timeout',
    supportRequired: false
  },

  'MANUAL_OVERRIDE': {
    userMessage: 'Processing was manually stopped by administrator. Please try uploading your document again.',
    actionableSteps: [
      'Upload your document again',
      'Contact your administrator if you have questions',
      'Check for any system maintenance notifications'
    ],
    severity: 'low',
    category: 'admin_override',
    supportRequired: false
  },

  // Domain-specific legacy error codes (maintained for backward compatibility)
  'CLAIM_NOT_FOUND': {
    userMessage: 'Expense claim record not found. Please refresh the page and try again.',
    actionableSteps: [
      'Refresh the page',
      'Check if you\'re still logged in',
      'Navigate back to the expense claims list',
      'Contact support if the claim has disappeared'
    ],
    severity: 'medium',
    category: 'data_integrity',
    supportRequired: false
  }
};

/**
 * Get user-friendly error message based on error context
 * Supports domain-specific customization while maintaining consistency
 */
export function getUserFriendlyErrorMessage(context: ErrorContext): ErrorMapping {
  // Try to match by error code first
  if (context.errorCode && ERROR_MESSAGE_MAPPINGS[context.errorCode]) {
    return customizeMessageForDomain(ERROR_MESSAGE_MAPPINGS[context.errorCode], context);
  }

  // Fallback to category-based matching
  if (context.errorCategory) {
    const categoryMapping = Object.values(ERROR_MESSAGE_MAPPINGS).find(
      mapping => mapping.category === context.errorCategory
    );
    if (categoryMapping) {
      return customizeMessageForDomain(categoryMapping, context);
    }
  }

  // Pattern matching for common error messages
  if (context.technicalError) {
    const errorText = context.technicalError.toLowerCase();

    if (errorText.includes('timeout') || errorText.includes('timed out')) {
      return customizeMessageForDomain(ERROR_MESSAGE_MAPPINGS['TIMEOUT_ERROR'], context);
    }

    if (errorText.includes('enoent') || errorText.includes('spawn python')) {
      return customizeMessageForDomain(ERROR_MESSAGE_MAPPINGS['PYTHON_ENV_MISSING'], context);
    }

    if (errorText.includes('json') || errorText.includes('parse error')) {
      return customizeMessageForDomain(ERROR_MESSAGE_MAPPINGS['JSON_PARSE_FAILED'], context);
    }

    if (errorText.includes('storage') || errorText.includes('file not found') || errorText.includes('s3')) {
      return customizeMessageForDomain(ERROR_MESSAGE_MAPPINGS['STORAGE_ACCESS_ERROR'], context);
    }

    if (errorText.includes('rate') || errorText.includes('429') || errorText.includes('quota')) {
      return customizeMessageForDomain(ERROR_MESSAGE_MAPPINGS['AI_RATE_LIMITED'], context);
    }

    if (errorText.includes('pdf') || errorText.includes('conversion')) {
      return customizeMessageForDomain(ERROR_MESSAGE_MAPPINGS['PDF_CONVERSION_FAILED'], context);
    }

    if (errorText.includes('convex') || errorText.includes('database')) {
      return customizeMessageForDomain(ERROR_MESSAGE_MAPPINGS['DATABASE_UPDATE_ERROR'], context);
    }
  }

  // Default fallback error message
  return customizeMessageForDomain({
    userMessage: 'An unexpected error occurred. Please try again or contact support if the issue persists.',
    actionableSteps: [
      'Try the operation again',
      'Refresh the page if the error continues',
      'Contact support with details of what you were trying to do'
    ],
    severity: 'medium',
    category: 'general_failure',
    supportRequired: true
  }, context);
}

/**
 * Customize error messages based on domain context
 * Replaces generic terms with domain-specific language
 */
function customizeMessageForDomain(mapping: ErrorMapping, context: ErrorContext): ErrorMapping {
  if (!context.domain) return mapping;

  const domainTerms = {
    invoices: {
      document: 'invoice',
      documentCapitalized: 'Invoice',
      processing: 'invoice processing',
      uploadAction: 'uploading the invoice'
    },
    expense_claims: {
      document: 'receipt',
      documentCapitalized: 'Receipt',
      processing: 'receipt processing',
      uploadAction: 'uploading your receipt'
    }
  };

  const terms = domainTerms[context.domain];
  if (!terms) return mapping;

  // Customize the message by replacing generic terms
  let customizedMessage = mapping.userMessage
    .replace(/document/g, terms.document)
    .replace(/Document/g, terms.documentCapitalized)
    .replace(/receipt/g, terms.document)
    .replace(/Receipt/g, terms.documentCapitalized);

  // Customize actionable steps
  const customizedSteps = mapping.actionableSteps?.map(step =>
    step
      .replace(/document/g, terms.document)
      .replace(/Document/g, terms.documentCapitalized)
      .replace(/receipt/g, terms.document)
      .replace(/Receipt/g, terms.documentCapitalized)
      .replace(/uploading the document/g, terms.uploadAction)
  );

  return {
    ...mapping,
    userMessage: customizedMessage,
    actionableSteps: customizedSteps
  };
}

/**
 * Format error message for UI display with context and domain customization
 */
export function formatErrorForUI(context: ErrorContext): {
  title: string;
  message: string;
  actionableSteps?: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  supportRequired: boolean;
  contactInfo?: string;
} {
  const mapping = getUserFriendlyErrorMessage(context);

  // Add context-specific details
  let enhancedMessage = mapping.userMessage;

  if (context.timeoutDuration) {
    enhancedMessage += ` (Timeout after ${context.timeoutDuration})`;
  }

  if (context.retryAttempts && context.retryAttempts > 1) {
    enhancedMessage += ` This was attempt ${context.retryAttempts}.`;
  }

  return {
    title: getErrorTitle(mapping.category, context.domain),
    message: enhancedMessage,
    actionableSteps: mapping.actionableSteps,
    severity: mapping.severity,
    supportRequired: mapping.supportRequired,
    contactInfo: mapping.supportRequired ? 'Please contact support if this error continues.' : undefined
  };
}

/**
 * Get appropriate error title based on category and domain
 */
function getErrorTitle(category: string, domain?: string): string {
  const baseTitleMappings: Record<string, string> = {
    'system_failure': 'System Error',
    'environment_missing': 'Service Configuration Error',
    'configuration_error': 'Configuration Error',
    'system_timeout': 'Processing Timeout',
    'timeout': 'Processing Timeout',
    'parsing_error': 'Data Processing Error',
    'missing_image': 'Missing Document',
    'storage_access': 'File Access Error',
    'data_integrity': 'Data Error',
    'database_update': 'Save Error',
    'empty_result': 'No Data Extracted',
    'extraction_failure': 'Extraction Failed',
    'classification_failure': 'Classification Failed',
    'unsupported_format': 'Unsupported Format',
    'pdf_conversion': 'PDF Processing Error',
    'low_confidence': 'Low Confidence',
    'ai_service': 'AI Service Error',
    'duplicate_request': 'Duplicate Request',
    'admin_override': 'Processing Stopped',
    'general_failure': 'Processing Error'
  };

  // Domain-specific title customization
  if (category === 'missing_image' && domain) {
    const domainDocuments: Record<string, string> = {
      invoices: 'Missing Invoice',
      expense_claims: 'Missing Receipt'
    };
    return domainDocuments[domain] || baseTitleMappings[category];
  }

  return baseTitleMappings[category] || 'Processing Error';
}

/**
 * Check if error requires immediate support escalation
 */
export function requiresImmediateSupport(context: ErrorContext): boolean {
  const mapping = getUserFriendlyErrorMessage(context);
  return mapping.severity === 'critical' || mapping.supportRequired;
}

/**
 * Get retry recommendation based on error type
 */
export function getRetryRecommendation(context: ErrorContext): {
  shouldRetry: boolean;
  retryable: boolean;
  retryDelay?: number; // seconds
  maxRetries?: number;
} {
  const mapping = getUserFriendlyErrorMessage(context);

  // Critical errors should not be retried automatically
  if (mapping.severity === 'critical') {
    return { shouldRetry: false, retryable: false };
  }

  // System timeout errors should have longer delays
  if (mapping.category === 'system_timeout' || mapping.category === 'timeout') {
    return {
      shouldRetry: true,
      retryable: true,
      retryDelay: 120, // 2 minutes
      maxRetries: 2
    };
  }

  // AI rate limiting should retry with backoff
  if (mapping.category === 'ai_service') {
    return {
      shouldRetry: true,
      retryable: true,
      retryDelay: 60, // 1 minute
      maxRetries: 3
    };
  }

  // Storage and parsing errors can be retried quickly
  if (['storage_access', 'parsing_error', 'extraction_failure'].includes(mapping.category)) {
    return {
      shouldRetry: true,
      retryable: true,
      retryDelay: 30, // 30 seconds
      maxRetries: 3
    };
  }

  // Classification failures are generally not worth retrying with same document
  if (mapping.category === 'classification_failure') {
    return {
      shouldRetry: false,
      retryable: false
    };
  }

  // Default retry strategy
  return {
    shouldRetry: true,
    retryable: true,
    retryDelay: 60, // 1 minute
    maxRetries: 2
  };
}
