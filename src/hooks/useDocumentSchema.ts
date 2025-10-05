import useSWR from 'swr'

interface DocumentSchema {
  type: string
  sections: DocumentSection[]
  complexityLevel: 'simple' | 'medium' | 'complex'
  expandableByDefault: boolean
}

interface DocumentSection {
  key: string
  title: string
  fields: DocumentField[]
  importance: 'critical' | 'important' | 'optional'
  collapsible: boolean
  defaultExpanded: boolean
  gridColumns?: number // CSS Grid columns for this section
}

interface DocumentField {
  key: string
  label: string
  dataType: 'text' | 'number' | 'date' | 'currency' | 'boolean' | 'table'
  importance: 'critical' | 'important' | 'optional'
  validation?: ValidationRule[]
  bboxSupported: boolean
  colSpan?: number // Grid column span for this field
  renderAs?: 'table' // Special rendering instructions
  tableColumns?: Array<{ key: string; label: string; width?: string }> // Table column definitions
}

interface ValidationRule {
  type: 'required' | 'minLength' | 'maxLength' | 'pattern'
  value?: string | number
  message?: string
}

// Fetcher function for SWR
const fetcher = async (url: string): Promise<DocumentSchema> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch schema: ${response.status}`)
  }
  const result = await response.json()
  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch schema')
  }
  return result.data
}

/**
 * Custom SWR hook for fetching document schemas
 * @param documentType - The type of document (ic, payslip, application_form, etc.)
 * @returns SWR response object with schema data, loading state, and error
 */
export function useDocumentSchema(documentType: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    documentType ? `/api/invoices/schemas/${documentType}` : null,
    fetcher,
    {
      // Cache for 5 minutes to avoid redundant API calls
      dedupingInterval: 5 * 60 * 1000,
      // Revalidate on window focus
      revalidateOnFocus: false,
      // Don't retry on error (schema shouldn't change frequently)
      errorRetryCount: 1,
      // Cache the response for better performance
      shouldRetryOnError: false
    }
  )

  return {
    schema: data,
    isLoading,
    error,
    mutate, // Allows manual revalidation if needed
    isValidDocumentType: !!documentType && !error && !isLoading
  }
}

// Export types for use in components
export type {
  DocumentSchema,
  DocumentSection,
  DocumentField,
  ValidationRule
}