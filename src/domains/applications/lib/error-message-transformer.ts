/**
 * Utility to transform technical error messages from document processing
 * into user-friendly, actionable messages
 */

interface DocumentSlotInfo {
  slot: string
  displayName: string
  expectedType: string
}

// Map of document slots to user-friendly information
const SLOT_INFO_MAP: Record<string, DocumentSlotInfo> = {
  'identity_card': {
    slot: 'identity_card',
    displayName: 'Identity Card',
    expectedType: 'identity card (IC)'
  },
  'bank_application_form': {
    slot: 'bank_application_form',
    displayName: 'Bank Application Form',
    expectedType: 'completed bank application form'
  },
  'payslip_recent': {
    slot: 'payslip_recent',
    displayName: 'Recent Payslip',
    expectedType: 'recent payslip'
  },
  'payslip_month1': {
    slot: 'payslip_month1',
    displayName: 'Payslip (Month 1)',
    expectedType: 'payslip document'
  },
  'payslip_month2': {
    slot: 'payslip_month2',
    displayName: 'Payslip (Month 2)',
    expectedType: 'payslip document'
  },
  'business_registration': {
    slot: 'business_registration',
    displayName: 'Business Registration',
    expectedType: 'business registration certificate'
  },
  'financial_statement': {
    slot: 'financial_statement',
    displayName: 'Financial Statement',
    expectedType: 'financial statement document'
  }
}

// Map of document types to user-friendly names
const DOCUMENT_TYPE_MAP: Record<string, string> = {
  'ic': 'identity card (IC)',
  'identity_card': 'identity card (IC)',
  'application_form': 'application form',
  'bank_form': 'bank application form',
  'payslip': 'payslip',
  'financial_statement': 'financial statement',
  'business_registration': 'business registration',
  'certificate': 'certificate document',
  'unknown': 'unrecognized document type'
}

/**
 * Transform technical error messages into user-friendly ones
 */
export function transformErrorMessage(errorMessage: string | null, slotName?: string): string {
  if (!errorMessage) {
    return 'Document processing failed. Please try uploading again.'
  }

  const message = errorMessage.toLowerCase()
  const slotInfo = slotName ? SLOT_INFO_MAP[slotName] : null

  // Pattern 1: Slot validation failed - document type mismatch
  // Example: "[Classify] Slot validation failed: Document type mismatch for slot 'identity_card'. Expected: ic, but detected: application_form. Please upload the correct document type."
  const slotValidationMatch = message.match(
    /slot validation failed.*slot '([^']+)'.*expected:\s*([^,]+),\s*but detected:\s*([^.]+)/
  )

  if (slotValidationMatch) {
    const [, detectedSlot, expectedType, detectedType] = slotValidationMatch
    const slot = SLOT_INFO_MAP[detectedSlot]
    const expectedFriendly = DOCUMENT_TYPE_MAP[expectedType.trim()] || expectedType.trim()
    const detectedFriendly = DOCUMENT_TYPE_MAP[detectedType.trim()] || detectedType.trim()

    if (slot) {
      return `Wrong file type uploaded. Expected ${expectedFriendly}, but detected ${detectedFriendly}. Please upload the correct ${slot.expectedType}.`
    }
    return `Document type mismatch. Expected ${expectedFriendly}, but detected ${detectedFriendly}. Please upload the correct document type.`
  }

  // Pattern 2: Classification failed with confidence issues
  // Example: "[Classify] Classification confidence too low: 0.45 for document type 'ic'"
  const confidenceMatch = message.match(/classification confidence too low.*for document type '([^']+)'/)
  if (confidenceMatch) {
    const [, docType] = confidenceMatch
    const friendlyType = DOCUMENT_TYPE_MAP[docType] || docType

    if (slotInfo) {
      return `Document is unclear or poor quality. Cannot confidently identify as ${friendlyType}. Please upload a clearer image of your ${slotInfo.expectedType}.`
    }
    return `Document quality is too low for reliable processing. Please upload a clearer image.`
  }

  // Pattern 3: File format or processing errors
  if (message.includes('unsupported file format') || message.includes('invalid file')) {
    return 'Unsupported file format. Please upload PDF, JPG, or PNG files only.'
  }

  if (message.includes('file too large') || message.includes('size limit')) {
    return 'File size is too large. Please upload files smaller than 10MB.'
  }

  if (message.includes('corrupted') || message.includes('cannot read')) {
    return 'File appears to be corrupted. Please try uploading the file again.'
  }

  // Pattern 4: OCR or extraction failures
  if (message.includes('extraction failed') || message.includes('ocr failed')) {
    if (slotInfo) {
      return `Could not extract text from document. Please ensure your ${slotInfo.expectedType} image is clear and readable.`
    }
    return 'Could not extract text from document. Please ensure the image is clear and readable.'
  }

  // Pattern 5: Network or timeout errors
  if (message.includes('timeout') || message.includes('network')) {
    return 'Processing timed out. Please try uploading again.'
  }

  // Pattern 6: Authentication or permission errors
  if (message.includes('unauthorized') || message.includes('permission')) {
    return 'Upload permission error. Please refresh the page and try again.'
  }

  // Fallback for unknown errors - provide contextual help if we know the slot
  if (slotInfo) {
    return `Processing failed for ${slotInfo.displayName}. Please ensure you've uploaded a clear, readable ${slotInfo.expectedType} and try again.`
  }

  // Generic fallback
  return 'Document processing failed. Please check your file and try uploading again.'
}

/**
 * Get user-friendly suggestions based on slot and error
 */
export function getErrorSuggestions(slotName?: string, errorMessage?: string | null): string[] {
  const suggestions: string[] = []
  const slotInfo = slotName ? SLOT_INFO_MAP[slotName] : null

  if (slotInfo) {
    suggestions.push(`Ensure you're uploading a ${slotInfo.expectedType}`)
  }

  suggestions.push('Check that the document image is clear and readable')
  suggestions.push('Verify the file is in PDF, JPG, or PNG format')
  suggestions.push('Make sure the file size is under 10MB')

  if (errorMessage && errorMessage.toLowerCase().includes('type mismatch')) {
    suggestions.push('Double-check you\'re uploading to the correct document slot')
  }

  return suggestions
}