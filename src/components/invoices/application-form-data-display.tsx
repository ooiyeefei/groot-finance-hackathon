'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle, Shield, DollarSign, User, Briefcase, ChevronDown, ChevronUp } from 'lucide-react'

// Enhanced interfaces matching the new EmploymentDetails model
interface FinancingDetails {
  application_type?: 'Single Application / Permohonan Individu' | 'Joint Application / Permohonan Bersama'
  type_of_financing?: 'Ar Rahnu / Pajak Gadai-i' | 'ASB Financing / Pembiayaan ASB' | 'MCash' | 'Personal Financing / Pembiayaan Peribadi' | 'Property Financing / Pembiayaan Hartanah' | 'Vehicle Financing / Pembiayaan Kenderaan' | 'Others / Lain-lain'
  purpose_of_financing?: string
  amount_requested?: number | string
  tenor?: number | string
}

interface PersonalDetails {
  name?: string
  mykad_no?: string
  date_of_birth?: string  // YYYY-MM-DD format
  residential_address?: string
  hp_no?: string
  email?: string
  marital_status?: 'Single / Bujang' | 'Married / Berkahwin'
  // Legacy fields for backward compatibility
  gender?: string
  race?: string
}

interface EmploymentDetails {
  employer_name?: string
  job_title?: string
  employment_type?: 'Permanent' | 'Contract' | 'Part-time' | 'Self-employed'
  monthly_income?: number | string
  years_of_service?: number | string
  employer_address?: string
  office_phone?: string
  department?: string
  // Legacy fields for backward compatibility
  occupation?: string
  employment_sector?: string
  employment_status?: string
}

interface ApplicationFormData {
  document_type?: string
  // Nested structure (current)
  financing_details?: FinancingDetails
  personal_details?: PersonalDetails
  employment_details?: EmploymentDetails

  // Flat structure (legacy support)
  type_of_financing?: string
  application_type?: string
  purpose_of_financing?: string
  amount_requested?: number | string
  tenor?: number | string
  name?: string
  mykad_no?: string
  date_of_birth?: string
  gender?: string
  race?: string
  marital_status?: string
  hp_no?: string
  residential_address?: string
  email?: string
  employer_name?: string
  job_title?: string
  employment_type?: string
  monthly_income?: number | string
  years_of_service?: number | string
  employer_address?: string
  office_phone?: string
  department?: string
  occupation?: string
  employment_sector?: string
  employment_status?: string

  confidence_score?: number
}

interface ApplicationFormDataDisplayProps {
  data: ApplicationFormData
}

export default function ApplicationFormDataDisplay({ data }: ApplicationFormDataDisplayProps) {
  // Independent expansion state for each section
  const [isFinancingExpanded, setIsFinancingExpanded] = useState(false)
  const [isPersonalExpanded, setIsPersonalExpanded] = useState(false)
  const [isEmploymentExpanded, setIsEmploymentExpanded] = useState(false)

  // Helper functions to get values from either nested or flat structure
  const getFinancingValue = (key: keyof FinancingDetails): string | number | undefined => {
    const value = data.financing_details?.[key] || data[key as keyof ApplicationFormData]
    // Ensure we return only primitive values, not objects
    return typeof value === 'object' ? undefined : value
  }

  const getPersonalValue = (key: keyof PersonalDetails): string | number | undefined => {
    const value = data.personal_details?.[key] || data[key as keyof ApplicationFormData]
    // Ensure we return only primitive values, not objects
    return typeof value === 'object' ? undefined : value
  }

  const getEmploymentValue = (key: keyof EmploymentDetails): string | number | undefined => {
    const value = data.employment_details?.[key] || data[key as keyof ApplicationFormData]
    // Ensure we return only primitive values, not objects
    return typeof value === 'object' ? undefined : value
  }

  const formatCurrency = (amount: number | string | undefined) => {
    if (!amount) return 'Not provided'
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount
    if (isNaN(numAmount as number)) return amount.toString()
    return `RM ${(numAmount as number).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatTenor = (tenor: number | string | undefined) => {
    if (!tenor) return 'Not specified'
    return `${tenor} ${typeof tenor === 'number' && tenor === 1 ? 'Year' : 'Years'}`
  }

  const formatDate = (dateString: string | number | undefined) => {
    if (!dateString) return 'Not provided'
    try {
      const date = new Date(dateString.toString())
      return date.toLocaleDateString('en-MY', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    } catch {
      return dateString.toString()
    }
  }

  const formatYearsOfService = (years: number | string | undefined) => {
    if (!years) return 'Not specified'
    const numYears = typeof years === 'string' ? parseFloat(years) : years
    if (isNaN(numYears as number)) return years.toString()
    return `${numYears} ${numYears === 1 ? 'year' : 'years'}`
  }

  const hasData = (value: any) => value !== null && value !== undefined && value !== ''

  return (
    <div className="mt-4 p-4 bg-gray-700 rounded-lg">
      {/* Three Independent Sections */}
      <div className="space-y-4">

        {/* Section 1: Financing Details */}
        <div className="bg-gray-800 border border-gray-600 rounded-lg">
          {/* Header with Summary */}
          <div className="p-4 border-b border-gray-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-400" />
                <h6 className="text-sm font-medium text-white">Financing Details</h6>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsFinancingExpanded(!isFinancingExpanded)}
                className="text-gray-400 hover:text-white hover:bg-gray-700"
              >
                {isFinancingExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </Button>
            </div>

            {/* Summary (Always Visible) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1 block">
                  Type of Financing
                </label>
                <div className="text-sm text-white">
                  {getFinancingValue('type_of_financing') || 'Not provided'}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1 block">
                  Amount Requested
                </label>
                <div className="text-sm text-white font-mono">
                  {formatCurrency(getFinancingValue('amount_requested'))}
                </div>
              </div>
            </div>
          </div>

          {/* Expandable Details */}
          {isFinancingExpanded && (
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                    Application Type
                  </label>
                  <div className="text-sm text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                    {getFinancingValue('application_type') || 'Not specified'}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                    Tenure
                  </label>
                  <div className="text-sm text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                    {formatTenor(getFinancingValue('tenor'))}
                  </div>
                </div>
                {getFinancingValue('purpose_of_financing') && (
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                      Purpose of Financing
                    </label>
                    <div className="text-sm text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                      {getFinancingValue('purpose_of_financing')}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Personal Information */}
        <div className="bg-gray-800 border border-gray-600 rounded-lg">
          {/* Header with Summary */}
          <div className="p-4 border-b border-gray-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-blue-400" />
                <h6 className="text-sm font-medium text-white">Personal Information</h6>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsPersonalExpanded(!isPersonalExpanded)}
                className="text-gray-400 hover:text-white hover:bg-gray-700"
              >
                {isPersonalExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </Button>
            </div>

            {/* Summary (Always Visible) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1 block">
                  Full Name
                </label>
                <div className="text-sm text-white">
                  {getPersonalValue('name') || 'Not provided'}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1 block">
                  MyKad Number
                </label>
                <div className="text-sm text-white font-mono">
                  {getPersonalValue('mykad_no') || 'Not provided'}
                </div>
              </div>
            </div>
          </div>

          {/* Expandable Details */}
          {isPersonalExpanded && (
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                    Date of Birth
                  </label>
                  <div className="text-sm text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                    {formatDate(getPersonalValue('date_of_birth'))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                    Marital Status
                  </label>
                  <div className="text-sm text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                    {getPersonalValue('marital_status') || 'Not provided'}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                    Phone Number
                  </label>
                  <div className="text-sm text-white bg-gray-700 px-3 py-2 rounded border border-gray-600 font-mono">
                    {getPersonalValue('hp_no') || 'Not provided'}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                    Email Address
                  </label>
                  <div className="text-sm text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                    {getPersonalValue('email') || 'Not provided'}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                    Residential Address
                  </label>
                  <div className="text-sm text-white bg-gray-700 px-3 py-2 rounded border border-gray-600 min-h-[60px]">
                    {getPersonalValue('residential_address') || 'Not provided'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Employment Details */}
        <div className="bg-gray-800 border border-gray-600 rounded-lg">
          {/* Header with Summary */}
          <div className="p-4 border-b border-gray-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-green-400" />
                <h6 className="text-sm font-medium text-white">Employment Details</h6>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEmploymentExpanded(!isEmploymentExpanded)}
                className="text-gray-400 hover:text-white hover:bg-gray-700"
              >
                {isEmploymentExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </Button>
            </div>

            {/* Summary (Always Visible) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1 block">
                  Employer Name
                </label>
                <div className="text-sm text-white">
                  {getEmploymentValue('employer_name') || 'Not provided'}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1 block">
                  Monthly Income
                </label>
                <div className="text-sm text-white font-mono">
                  {formatCurrency(getEmploymentValue('monthly_income'))}
                </div>
              </div>
            </div>
          </div>

          {/* Expandable Details */}
          {isEmploymentExpanded && (
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                    Job Title
                  </label>
                  <div className="text-sm text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                    {getEmploymentValue('job_title') || getEmploymentValue('occupation') || 'Not provided'}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                    Employment Type
                  </label>
                  <div className="text-sm text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                    {getEmploymentValue('employment_type') || getEmploymentValue('employment_status') || 'Not provided'}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                    Years of Service
                  </label>
                  <div className="text-sm text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                    {formatYearsOfService(getEmploymentValue('years_of_service'))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                    Department
                  </label>
                  <div className="text-sm text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                    {getEmploymentValue('department') || getEmploymentValue('employment_sector') || 'Not provided'}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                    Office Phone
                  </label>
                  <div className="text-sm text-white bg-gray-700 px-3 py-2 rounded border border-gray-600 font-mono">
                    {getEmploymentValue('office_phone') || 'Not provided'}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                    Employer Address
                  </label>
                  <div className="text-sm text-white bg-gray-700 px-3 py-2 rounded border border-gray-600 min-h-[60px]">
                    {getEmploymentValue('employer_address') || 'Not provided'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Extraction Warning - Bottom Left Corner */}
      <div className="flex items-center gap-2 mt-4 p-2 bg-amber-900/20 border border-amber-700/50 rounded">
        <span className="text-amber-400">⚠️</span>
        <span className="text-xs text-amber-300 font-medium">AI Extraction - Please verify accuracy</span>
      </div>
    </div>
  )
}