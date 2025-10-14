'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  ArrowLeft,
  FileText,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  User,
  Briefcase,
  DollarSign,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Building,
  CreditCard,
  Shield,
  Edit3,
  Save,
  XCircle
} from 'lucide-react'
import Link from 'next/link'
import { useLocale } from 'next-intl'

interface ApplicationSummaryData {
  application: {
    id: string
    title: string
    type: string
    type_display: string
    status: string
    progress: number
    created_at: string
    submitted_at?: string
  }
  applicant: {
    full_name?: string
    ic_number?: string
    date_of_birth?: string
    gender?: string
    address?: string
    phone?: string
    email?: string
    marital_status?: string
    confidence?: number
  } | null
  employment: {
    employer_name?: string
    job_title?: string
    employment_type?: string
    monthly_income?: number
    years_of_service?: number
    employer_address?: string
    office_phone?: string
    department?: string
    employee_name?: string
    employee_code?: string
  } | null
  financial: {
    payslip_count: number
    average_net_income: number
    average_gross_income: number
    min_net_income: number
    max_net_income: number
    latest_net_income: number
    income_trend: 'stable' | 'increasing' | 'decreasing' | 'volatile'
    payslip_months: Array<{
      period: string
      net_wages: number
      gross_wages: number
      employer: string
    }>
    employer_consistency: boolean
  } | null
  financing: {
    type_of_financing?: string
    application_type?: string
    amount_requested?: number
    tenor?: number
    purpose_of_financing?: string
  } | null
  processing: {
    total_documents: number
    confidence_scores: Array<{
      document_type: string
      slot: string
      confidence: number
    }>
    average_confidence: number
    completion_status: 'complete' | 'incomplete'
  }
}

interface ApplicationSummaryContainerProps {
  applicationId: string
}

export default function ApplicationSummaryContainer({ applicationId }: ApplicationSummaryContainerProps) {
  const locale = useLocale()
  const [summaryData, setSummaryData] = useState<ApplicationSummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Editable fields state management
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [savingSection, setSavingSection] = useState<string | null>(null)
  const [editedApplicant, setEditedApplicant] = useState<any>({})
  const [editedEmployment, setEditedEmployment] = useState<any>({})
  const [editedFinancing, setEditedFinancing] = useState<any>({})

  const fetchSummaryData = useCallback(async () => {
    console.log(`[ApplicationSummary] Fetching data for applicationId: ${applicationId}`)
    try {
      setLoading(true)
      const response = await fetch(`/api/v1/applications/${applicationId}/summary`)
      const result = await response.json()

      if (result.success) {
        console.log(`[ApplicationSummary] Data fetched successfully for applicationId: ${applicationId}`)
        setSummaryData(result.data)
      } else {
        setError(result.error || 'Failed to fetch application summary')
      }
    } catch (err) {
      console.error('Error fetching application summary:', err)
      setError('An error occurred while loading the application summary')
    } finally {
      setLoading(false)
    }
  }, [applicationId])

  useEffect(() => {
    fetchSummaryData()
  }, [fetchSummaryData])

  // Helper functions for editing functionality
  const startEditing = (section: string) => {
    if (!summaryData) return

    setEditingSection(section)
    // Initialize edited values with current data
    switch (section) {
      case 'applicant':
        setEditedApplicant({
          full_name: summaryData.applicant?.full_name || '',
          ic_number: summaryData.applicant?.ic_number || '',
          date_of_birth: summaryData.applicant?.date_of_birth || '',
          gender: summaryData.applicant?.gender || '',
          address: summaryData.applicant?.address || '',
          phone: summaryData.applicant?.phone || '',
          email: summaryData.applicant?.email || '',
          marital_status: summaryData.applicant?.marital_status || ''
        })
        break
      case 'employment':
        setEditedEmployment({
          employer_name: summaryData.employment?.employer_name || '',
          job_title: summaryData.employment?.job_title || '',
          employment_type: summaryData.employment?.employment_type || '',
          years_of_service: summaryData.employment?.years_of_service || '',
          employer_address: summaryData.employment?.employer_address || '',
          office_phone: summaryData.employment?.office_phone || ''
        })
        break
      case 'financing':
        setEditedFinancing({
          type_of_financing: summaryData.financing?.type_of_financing || '',
          application_type: summaryData.financing?.application_type || '',
          amount_requested: summaryData.financing?.amount_requested || '',
          tenor: summaryData.financing?.tenor || '',
          purpose_of_financing: summaryData.financing?.purpose_of_financing || ''
        })
        break
    }
  }

  const cancelEditing = () => {
    setEditingSection(null)
    setEditedApplicant({})
    setEditedEmployment({})
    setEditedFinancing({})
  }

  const saveChanges = async (section: string) => {
    if (!summaryData) return

    setSavingSection(section)
    try {
      let payload: any = {}

      switch (section) {
        case 'applicant':
          payload = { applicant: editedApplicant }
          break
        case 'employment':
          payload = { employment: editedEmployment }
          break
        case 'financing':
          payload = { financing: editedFinancing }
          break
      }

      const response = await fetch(`/api/v1/applications/${applicationId}/summary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const result = await response.json()

      if (result.success) {
        // Update local state with saved data
        setSummaryData(prev => prev ? { ...prev, [section]: payload[section] } : null)
        setEditingSection(null)
        // Clear edited state
        switch (section) {
          case 'applicant':
            setEditedApplicant({})
            break
          case 'employment':
            setEditedEmployment({})
            break
          case 'financing':
            setEditedFinancing({})
            break
        }
      } else {
        setError(result.error || `Failed to save ${section} changes`)
      }
    } catch (err) {
      console.error(`Error saving ${section} changes:`, err)
      setError(`An error occurred while saving ${section} changes`)
    } finally {
      setSavingSection(null)
    }
  }

  const formatCurrency = (amount: number | undefined) => {
    if (!amount && amount !== 0) return 'N/A'
    return `RM ${amount.toLocaleString('en-MY', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`
  }

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatDateShort = (dateString: string | undefined) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric'
    })
  }

  const getIncomeTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return <TrendingUp className="w-4 h-4 text-green-400" />
      case 'decreasing':
        return <TrendingDown className="w-4 h-4 text-red-400" />
      case 'volatile':
        return <Activity className="w-4 h-4 text-yellow-400" />
      default:
        return <Minus className="w-4 h-4 text-gray-400" />
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-400'
    if (confidence >= 0.7) return 'text-yellow-400'
    return 'text-red-400'
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-1 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-40 bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !summaryData) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-red-400 mb-4">{error || 'No data available'}</p>
        <div className="flex gap-4 justify-center">
          <Link href={`/${locale}/applications`}>
            <Button variant="outline" className="bg-gray-700 text-white border-gray-600 hover:bg-gray-600 hover:border-gray-500">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Applications
            </Button>
          </Link>
          <Button onClick={() => fetchSummaryData()} className="bg-blue-600 hover:bg-blue-700 text-white">
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Application Info Header */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                Reference No.
              </label>
              <div className="text-lg font-mono text-white">
                {summaryData.application.id.toUpperCase()}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                Application Date
              </label>
              <div className="text-lg text-white">
                {formatDate(summaryData.application.created_at)}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                Application Type
              </label>
              <div className="text-lg text-white">
                {summaryData.application.type_display}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                AI Processing Status
              </label>
              <Badge className={`${summaryData.processing.completion_status === 'complete'
                ? 'bg-green-900/20 text-green-300 border-green-700/50'
                : 'bg-yellow-900/20 text-yellow-300 border-yellow-700/50'
              }`}>
                <CheckCircle className="w-3 h-3 mr-1" />
                {Math.round(summaryData.processing.average_confidence * 100)}% Confidence
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Applicant Details */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center justify-between">
              <div className="flex items-center">
                <User className="w-5 h-5 mr-2 text-blue-400" />
                Applicant Details
              </div>
              <div className="flex gap-2">
                {editingSection === 'applicant' ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => saveChanges('applicant')}
                      disabled={savingSection === 'applicant'}
                      className="bg-green-600 hover:bg-green-700 text-white border-0"
                    >
                      {savingSection === 'applicant' ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      onClick={cancelEditing}
                      disabled={savingSection === 'applicant'}
                      className="bg-gray-600 hover:bg-gray-700 text-white border-0"
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => startEditing('applicant')}
                    className="bg-blue-600 hover:bg-blue-700 text-white border-0"
                    title="Edit applicant details"
                  >
                    <Edit3 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {summaryData.applicant ? (
              <>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                      Full Name
                    </label>
                    {editingSection === 'applicant' ? (
                      <Input
                        value={editedApplicant.full_name || ''}
                        onChange={(e) => setEditedApplicant((prev: any) => ({ ...prev, full_name: e.target.value }))}
                        className="text-white bg-gray-700 border-gray-600 focus:border-blue-500"
                        placeholder="Enter full name"
                      />
                    ) : (
                      <div className="text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                        {summaryData.applicant.full_name || 'N/A'}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                      IC Number
                    </label>
                    {editingSection === 'applicant' ? (
                      <Input
                        value={editedApplicant.ic_number || ''}
                        onChange={(e) => setEditedApplicant((prev: any) => ({ ...prev, ic_number: e.target.value }))}
                        className="text-white bg-gray-700 border-gray-600 focus:border-blue-500 font-mono"
                        placeholder="Enter IC number"
                      />
                    ) : (
                      <div className="text-white bg-gray-700 px-3 py-2 rounded border border-gray-600 font-mono">
                        {summaryData.applicant.ic_number || 'N/A'}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                      Date of Birth
                    </label>
                    <div className="text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                      {formatDate(summaryData.applicant.date_of_birth)}
                    </div>
                  </div>
                  {summaryData.applicant.gender && (
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                        Gender
                      </label>
                      <div className="text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                        {summaryData.applicant.gender === 'LELAKI' ? 'Male' :
                         summaryData.applicant.gender === 'PEREMPUAN' ? 'Female' :
                         summaryData.applicant.gender}
                      </div>
                    </div>
                  )}
                  {(summaryData.applicant.address || editingSection === 'applicant') && (
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                        Residential Address
                      </label>
                      {editingSection === 'applicant' ? (
                        <Textarea
                          value={editedApplicant.address || ''}
                          onChange={(e) => setEditedApplicant((prev: any) => ({ ...prev, address: e.target.value }))}
                          className="text-white bg-gray-700 border-gray-600 focus:border-blue-500 min-h-[60px]"
                          placeholder="Enter residential address"
                          rows={3}
                        />
                      ) : (
                        <div className="text-white bg-gray-700 px-3 py-2 rounded border border-gray-600 min-h-[60px]">
                          {summaryData.applicant.address}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(summaryData.applicant.phone || editingSection === 'applicant') && (
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                          Mobile No.
                        </label>
                        {editingSection === 'applicant' ? (
                          <Input
                            value={editedApplicant.phone || ''}
                            onChange={(e) => setEditedApplicant((prev: any) => ({ ...prev, phone: e.target.value }))}
                            className="text-white bg-gray-700 border-gray-600 focus:border-blue-500 font-mono"
                            placeholder="Enter mobile number"
                          />
                        ) : (
                          <div className="text-white bg-gray-700 px-3 py-2 rounded border border-gray-600 font-mono">
                            {summaryData.applicant.phone}
                          </div>
                        )}
                      </div>
                    )}
                    {(summaryData.applicant.email || editingSection === 'applicant') && (
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                          Email
                        </label>
                        {editingSection === 'applicant' ? (
                          <Input
                            value={editedApplicant.email || ''}
                            onChange={(e) => setEditedApplicant((prev: any) => ({ ...prev, email: e.target.value }))}
                            className="text-white bg-gray-700 border-gray-600 focus:border-blue-500"
                            placeholder="Enter email address"
                            type="email"
                          />
                        ) : (
                          <div className="text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                            {summaryData.applicant.email}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center text-gray-400 py-8">
                <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Applicant information not extracted</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Employment Details */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center">
              <Briefcase className="w-5 h-5 mr-2 text-green-400" />
              Employment Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {summaryData.employment ? (
              <>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                      Employer Name
                    </label>
                    <div className="text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                      {summaryData.employment.employer_name || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                      Job Title
                    </label>
                    <div className="text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                      {summaryData.employment.job_title || 'N/A'}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                        Employment Type
                      </label>
                      <div className="text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                        {summaryData.employment.employment_type || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                        Years of Service
                      </label>
                      <div className="text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                        {summaryData.employment.years_of_service ?
                          `${summaryData.employment.years_of_service} years` : 'N/A'}
                      </div>
                    </div>
                  </div>
                  {summaryData.employment.employer_address && (
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                        Employer Address
                      </label>
                      <div className="text-white bg-gray-700 px-3 py-2 rounded border border-gray-600 min-h-[60px]">
                        {summaryData.employment.employer_address}
                      </div>
                    </div>
                  )}
                  {summaryData.employment.office_phone && (
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                        Office Phone
                      </label>
                      <div className="text-white bg-gray-700 px-3 py-2 rounded border border-gray-600 font-mono">
                        {summaryData.employment.office_phone}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center text-gray-400 py-8">
                <Briefcase className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Employment information not extracted</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Financial Analysis */}
      {summaryData.financial && (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center">
              <DollarSign className="w-5 h-5 mr-2 text-amber-400" />
              Financial Analysis ({summaryData.financial.payslip_count} months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Financial Summary */}
              <div className="lg:col-span-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                      Average Net Income
                    </label>
                    <div className="text-xl font-bold text-white font-mono">
                      {formatCurrency(summaryData.financial.average_net_income)}
                    </div>
                  </div>
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                      Latest Net Income
                    </label>
                    <div className="text-xl font-bold text-white font-mono">
                      {formatCurrency(summaryData.financial.latest_net_income)}
                    </div>
                  </div>
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                      Income Trend
                    </label>
                    <div className="flex items-center gap-2">
                      {getIncomeTrendIcon(summaryData.financial.income_trend)}
                      <span className="text-white capitalize">
                        {summaryData.financial.income_trend}
                      </span>
                    </div>
                  </div>
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                      Employer Consistency
                    </label>
                    <div className="flex items-center gap-2">
                      {summaryData.financial.employer_consistency ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-yellow-400" />
                      )}
                      <span className="text-white">
                        {summaryData.financial.employer_consistency ? 'Consistent' : 'Varied'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Monthly Breakdown */}
                <div>
                  <h4 className="text-sm font-medium text-gray-300 mb-3">Monthly Income History</h4>
                  <div className="bg-gray-700 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-600">
                          <th className="text-left text-xs text-gray-300 px-4 py-3 font-medium">Month</th>
                          <th className="text-right text-xs text-gray-300 px-4 py-3 font-medium">Net Income</th>
                          <th className="text-right text-xs text-gray-300 px-4 py-3 font-medium">Gross Income</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryData.financial.payslip_months.map((month, index) => (
                          <tr key={index} className="border-b border-gray-600 last:border-b-0">
                            <td className="px-4 py-3 text-white">
                              {month.period || `Month ${index + 1}`}
                            </td>
                            <td className="px-4 py-3 text-white font-mono text-right">
                              {formatCurrency(month.net_wages)}
                            </td>
                            <td className="px-4 py-3 text-white font-mono text-right">
                              {formatCurrency(month.gross_wages)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Income Range */}
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-3">Income Range Analysis</h4>
                <div className="space-y-4">
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                      Highest Net Income
                    </label>
                    <div className="text-lg font-bold text-green-400 font-mono">
                      {formatCurrency(summaryData.financial.max_net_income)}
                    </div>
                  </div>
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                      Lowest Net Income
                    </label>
                    <div className="text-lg font-bold text-red-400 font-mono">
                      {formatCurrency(summaryData.financial.min_net_income)}
                    </div>
                  </div>
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                      Income Variance
                    </label>
                    <div className="text-lg font-bold text-white font-mono">
                      {formatCurrency(summaryData.financial.max_net_income - summaryData.financial.min_net_income)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Financing Details */}
      {summaryData.financing && (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center">
              <CreditCard className="w-5 h-5 mr-2 text-purple-400" />
              Financing Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                  Type of Financing
                </label>
                <div className="text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                  {summaryData.financing.type_of_financing || 'N/A'}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                  Amount Requested
                </label>
                <div className="text-white bg-gray-700 px-3 py-2 rounded border border-gray-600 font-mono font-bold">
                  {formatCurrency(summaryData.financing.amount_requested)}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                  Tenure (Years)
                </label>
                <div className="text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                  {summaryData.financing.tenor ? `${summaryData.financing.tenor} years` : 'N/A'}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                  Application Type
                </label>
                <div className="text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                  {summaryData.financing.application_type || 'N/A'}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                  Purpose of Financing
                </label>
                <div className="text-white bg-gray-700 px-3 py-2 rounded border border-gray-600">
                  {summaryData.financing.purpose_of_financing || 'N/A'}
                </div>
              </div>
            </div>

            {/* Enhanced DSR Financial Calculations */}
            {summaryData.financial && summaryData.financing.amount_requested && (
              <div className="mt-6 pt-6 border-t border-gray-600">
                <h4 className="text-sm font-medium text-gray-300 mb-4">Debt Service Ratio (DSR) Assessment</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                      Projected DSR*
                    </label>
                    <div className="text-lg font-bold text-white">
                      {summaryData.financial.average_gross_income > 0 ?
                        (() => {
                          // Calculate with 6.5% interest rate (typical Malaysian personal loan rate)
                          const principal = summaryData.financing.amount_requested;
                          const years = summaryData.financing.tenor || 2;
                          const monthlyRate = 0.065 / 12;
                          const numPayments = years * 12;
                          const monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
                          const dsr = (monthlyPayment / summaryData.financial.average_gross_income) * 100;
                          return `${Math.round(dsr)}%`;
                        })()
                        : 'N/A'
                      }
                    </div>
                  </div>
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                      Monthly Payment (Est.)
                    </label>
                    <div className="text-lg font-bold text-white font-mono">
                      {summaryData.financing.tenor ?
                        (() => {
                          const principal = summaryData.financing.amount_requested;
                          const years = summaryData.financing.tenor;
                          const monthlyRate = 0.065 / 12;
                          const numPayments = years * 12;
                          const monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
                          return formatCurrency(monthlyPayment);
                        })()
                        : 'N/A'
                      }
                    </div>
                  </div>
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                      DSR Compliance
                    </label>
                    <div className="text-lg font-bold">
                      {summaryData.financial.average_gross_income > 0 ?
                        (() => {
                          const principal = summaryData.financing.amount_requested;
                          const years = summaryData.financing.tenor || 2;
                          const monthlyRate = 0.065 / 12;
                          const numPayments = years * 12;
                          const monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
                          const dsr = (monthlyPayment / summaryData.financial.average_gross_income) * 100;

                          if (dsr <= 40) return <span className="text-green-400">Excellent</span>;
                          if (dsr <= 60) return <span className="text-yellow-400">Moderate</span>;
                          if (dsr <= 70) return <span className="text-orange-400">High Risk</span>;
                          return <span className="text-red-400">Exceeds Limit</span>;
                        })()
                        : 'N/A'
                      }
                    </div>
                  </div>
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                      Max Serviceable (60%)
                    </label>
                    <div className="text-lg font-bold text-white font-mono">
                      {summaryData.financial.average_gross_income > 0 ?
                        formatCurrency(summaryData.financial.average_gross_income * 0.60)
                        : 'N/A'
                      }
                    </div>
                  </div>
                </div>

                {/* DSR Guidelines Notice */}
                <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                  <div className="text-xs text-blue-300">
                    <strong>*DSR Guidelines (Bank Negara Malaysia):</strong><br/>
                    • Excellent: ≤40% | Moderate: 41-60% | High Risk: 61-70% | Above 70%: Likely rejection<br/>
                    • Calculation assumes 6.5% interest rate and no existing debt obligations<br/>
                    • Final assessment requires verification of existing financial commitments
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI Processing Summary */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Shield className="w-5 h-5 mr-2 text-indigo-400" />
            AI Processing Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-700 p-4 rounded-lg">
              <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                Documents Processed
              </label>
              <div className="text-2xl font-bold text-white">
                {summaryData.processing.total_documents}
              </div>
            </div>
            <div className="bg-gray-700 p-4 rounded-lg">
              <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                Average Confidence
              </label>
              <div className={`text-2xl font-bold ${getConfidenceColor(summaryData.processing.average_confidence)}`}>
                {Math.round(summaryData.processing.average_confidence * 100)}%
              </div>
            </div>
            <div className="bg-gray-700 p-4 rounded-lg">
              <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                Processing Status
              </label>
              <div className={`text-lg font-bold ${summaryData.processing.completion_status === 'complete' ? 'text-green-400' : 'text-yellow-400'}`}>
                {summaryData.processing.completion_status === 'complete' ? 'Complete' : 'Incomplete'}
              </div>
            </div>
            <div className="bg-gray-700 p-4 rounded-lg">
              <label className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1 block">
                Data Quality
              </label>
              <div className={`text-lg font-bold ${summaryData.processing.average_confidence >= 0.9 ? 'text-green-400' :
                summaryData.processing.average_confidence >= 0.7 ? 'text-yellow-400' : 'text-red-400'}`}>
                {summaryData.processing.average_confidence >= 0.9 ? 'Excellent' :
                 summaryData.processing.average_confidence >= 0.7 ? 'Good' : 'Fair'}
              </div>
            </div>
          </div>

          {/* Document Confidence Breakdown */}
          <div className="mt-6">
            <h4 className="text-sm font-medium text-gray-300 mb-3">Document Extraction Confidence</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {summaryData.processing.confidence_scores.map((score, index) => (
                <div key={index} className="bg-gray-700 p-3 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300 capitalize text-sm">
                      {score.document_type.replace('_', ' ')}
                    </span>
                    <span className={`font-bold ${getConfidenceColor(score.confidence)}`}>
                      {Math.round(score.confidence * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Extraction Warning */}
      <div className="flex items-center gap-2 p-4 bg-amber-900/20 border border-amber-700/50 rounded-lg">
        <span className="text-amber-400">⚠️</span>
        <span className="text-sm text-amber-300 font-medium">
          AI Extraction - Please verify accuracy. This summary is generated from AI-processed documents and should be reviewed before making lending decisions.
        </span>
      </div>
    </div>
  )
}