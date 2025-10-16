/**
 * Domain-Agnostic Error Message Mapper
 *
 * Provides comprehensive error message mapping for ALL Trigger.dev document processing failures
 * Supports: invoices, expense-claims, applications, and any future document processing domains
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
  domain?: 'invoices' | 'expense_claims' | 'applications'; // Domain context
  documentType?: string; // invoice, receipt, IC, payslip, application_form, etc.
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

  // Extraction-specific errors (adaptable to document types)
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

    if (errorText.includes('storage') || errorText.includes('file not found')) {
      return customizeMessageForDomain(ERROR_MESSAGE_MAPPINGS['STORAGE_ACCESS_ERROR'], context);
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
    },
    applications: {
      document: 'document',
      documentCapitalized: 'Document',
      processing: 'document processing',
      uploadAction: 'uploading the document'
    }
  };

  const terms = domainTerms[context.domain];
  if (!terms) return mapping;

  // Customize the message by replacing generic terms
  let customizedMessage = mapping.userMessage
    .replace(/document/g, terms.document)
    .replace(/Document/g, terms.documentCapitalized)
    .replace(/receipt/g, terms.document) // For expense claims, already uses 'receipt'
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
    'admin_override': 'Processing Stopped',
    'general_failure': 'Processing Error'
  };

  // Domain-specific title customization
  if (category === 'missing_image' && domain) {
    const domainDocuments: Record<string, string> = {
      invoices: 'Missing Invoice',
      expense_claims: 'Missing Receipt',
      applications: 'Missing Document'
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
  retryDelay?: number; // seconds
  maxRetries?: number;
} {
  const mapping = getUserFriendlyErrorMessage(context);

  // Critical errors should not be retried automatically
  if (mapping.severity === 'critical') {
    return { shouldRetry: false };
  }

  // System timeout errors should have longer delays
  if (mapping.category === 'system_timeout' || mapping.category === 'timeout') {
    return {
      shouldRetry: true,
      retryDelay: 120, // 2 minutes
      maxRetries: 2
    };
  }

  // Storage and parsing errors can be retried quickly
  if (['storage_access', 'parsing_error', 'extraction_failure'].includes(mapping.category)) {
    return {
      shouldRetry: true,
      retryDelay: 30, // 30 seconds
      maxRetries: 3
    };
  }

  // Default retry strategy
  return {
    shouldRetry: true,
    retryDelay: 60, // 1 minute
    maxRetries: 2
  };
}