'use client'

import { useState, useEffect } from 'react'
import { FileText } from 'lucide-react'
import ExpandableSection from './expandable-section'
import FieldComponent from './field-component'
import LineItemsTable from './line-items-table'
import { DocumentSchema, DocumentField } from '@/domains/invoices/hooks/useDocumentSchema'

interface DynamicFieldRendererProps {
  schema: DocumentSchema
  data: Record<string, any>
  onFieldHover?: (fieldKey: string | null) => void
}

export default function DynamicFieldRenderer({
  schema,
  data,
  onFieldHover
}: DynamicFieldRendererProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  // Initialize expanded sections after component mounts to avoid hydration mismatch
  useEffect(() => {
    const initialExpanded = new Set(
      schema.sections.filter(section => section.defaultExpanded).map(section => section.key)
    )
    setExpandedSections(initialExpanded)
  }, [schema.sections])

  const toggleSection = (sectionKey: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(sectionKey)) {
      newExpanded.delete(sectionKey)
    } else {
      newExpanded.add(sectionKey)
    }
    setExpandedSections(newExpanded)
  }

  // Helper function to get nested field value
  const getFieldValue = (fieldKey: string, sectionData: any): any => {
    // For nested objects (like personal_details.name), try accessing the nested structure first
    if (sectionData && typeof sectionData === 'object' && fieldKey in sectionData) {
      return sectionData[fieldKey]
    }

    // Fallback to top-level data access for flat structures
    if (data && fieldKey in data) {
      return data[fieldKey]
    }

    return undefined
  }

  // Calculate completion status for sections
  const getSectionCompletion = (section: any, sectionData: any) => {
    const totalFields = section.fields.length
    const completedFields = section.fields.filter((field: DocumentField) => {
      const value = getFieldValue(field.key, sectionData)
      return value !== undefined && value !== null && value !== ''
    }).length

    return {
      completed: completedFields,
      total: totalFields,
      percentage: totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0
    }
  }

  // Processing errors display
  if (data?.text && (data.text.includes('error') || data.text.includes('failed'))) {
    return (
      <div className="space-y-6">
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <h4 className="text-sm font-medium text-red-400 mb-2">Processing Issue</h4>
          <p className="text-sm text-red-300 whitespace-pre-wrap">{data.text}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h4 className="text-sm font-medium text-white mb-4 flex items-center">
          <FileText className="w-4 h-4 mr-2" />
          {schema.type.toUpperCase()} Document Analysis
          <span className="ml-2 px-2 py-1 bg-blue-600/20 text-blue-400 text-xs rounded border border-blue-500">
            {schema.complexityLevel}
          </span>
        </h4>
      </div>

      {/* Render each section based on schema */}
      {schema.sections.map((section) => {
        // Get section data - try nested structure first, then fall back to top-level data
        let sectionData = data[section.key] || data

        // Special handling for nested objects in our Pydantic models
        if (section.key === 'personal_details' && data.personal_details) {
          sectionData = data.personal_details
        } else if (section.key === 'employment_details' && data.employment_details) {
          sectionData = data.employment_details
        } else if (section.key === 'financing_details' && data.financing_details) {
          sectionData = data.financing_details
        }

        const completion = getSectionCompletion(section, sectionData)
        const isExpanded = expandedSections.has(section.key)

        return (
          <div key={section.key} className="mb-6">
            {section.collapsible ? (
              <ExpandableSection
                title={section.title}
                importance={section.importance}
                isExpanded={isExpanded}
                onToggle={() => toggleSection(section.key)}
                completion={completion}
              >
                {/* Schema-driven layout with CSS Grid */}
                <div
                  className="grid gap-4"
                  style={{
                    gridTemplateColumns: `repeat(${section.gridColumns || 2}, 1fr)`
                  }}
                >
                  {section.fields.map((field) => {
                    const value = getFieldValue(field.key, sectionData)

                    // Special handling for table fields
                    if (field.renderAs === 'table' && field.tableColumns) {
                      return (
                        <div
                          key={field.key}
                          className="col-span-full"
                          style={{ gridColumn: `span ${field.colSpan || section.gridColumns || 2}` }}
                        >
                          <h6 className="text-sm font-medium text-gray-300 mb-3">{field.label}</h6>
                          <LineItemsTable
                            data={value || []}
                            columns={field.tableColumns}
                            className="mb-4"
                          />
                        </div>
                      )
                    }

                    return (
                      <div
                        key={field.key}
                        style={{ gridColumn: `span ${field.colSpan || 1}` }}
                      >
                        <FieldComponent
                          field={field}
                          value={value}
                          onHover={onFieldHover}
                          sectionKey={section.key}
                        />
                      </div>
                    )
                  })}
                </div>
              </ExpandableSection>
            ) : (
              // Non-collapsible sections render directly
              <div className="mb-6">
                <h5 className="text-sm font-medium text-white mb-4 flex items-center">
                  <div className={`w-1 h-4 mr-2 rounded-full ${
                    section.importance === 'critical'
                      ? 'bg-red-500'
                      : section.importance === 'important'
                      ? 'bg-amber-500'
                      : 'bg-gray-500'
                  }`} />
                  {section.title}
                  <span className="ml-2 text-xs text-gray-400">
                    ({completion.completed}/{completion.total} fields)
                  </span>
                </h5>

                {/* Schema-driven layout with CSS Grid */}
                <div
                  className="grid gap-4"
                  style={{
                    gridTemplateColumns: `repeat(${section.gridColumns || 2}, 1fr)`
                  }}
                >
                  {section.fields.map((field) => {
                    const value = getFieldValue(field.key, sectionData)

                    // Special handling for table fields
                    if (field.renderAs === 'table' && field.tableColumns) {
                      return (
                        <div
                          key={field.key}
                          className="col-span-full"
                          style={{ gridColumn: `span ${field.colSpan || section.gridColumns || 2}` }}
                        >
                          <h6 className="text-sm font-medium text-gray-300 mb-3">{field.label}</h6>
                          <LineItemsTable
                            data={value || []}
                            columns={field.tableColumns}
                            className="mb-4"
                          />
                        </div>
                      )
                    }

                    return (
                      <div
                        key={field.key}
                        style={{ gridColumn: `span ${field.colSpan || 1}` }}
                      >
                        <FieldComponent
                          field={field}
                          value={value}
                          onHover={onFieldHover}
                          sectionKey={section.key}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Raw Data Toggle for Development/Debugging */}
      <div className="mt-6 pt-6 border-t border-gray-700">
        <details className="group">
          <summary className="cursor-pointer text-sm text-blue-400 hover:text-blue-300 transition-colors list-none">
            <span className="flex items-center">
              <span className="group-open:rotate-90 transition-transform mr-2">▶</span>
              Show Raw Extracted Data
            </span>
          </summary>
          <div className="mt-3 bg-gray-800 rounded-lg p-4">
            <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-auto max-h-64">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        </details>
      </div>
    </div>
  )
}