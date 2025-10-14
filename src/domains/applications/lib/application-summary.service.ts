/**
 * Application Summary Service Layer
 * AI-extracted data consolidation for loan officer review
 */

import { auth } from '@clerk/nextjs/server'
import { createServiceSupabaseClient, getUserData } from '@/lib/db/supabase-server'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculates income trend from payslip data
 */
function calculateIncomeTrend(payslips: any[]): 'stable' | 'increasing' | 'decreasing' | 'volatile' {
  if (payslips.length < 2) return 'stable'

  const sorted = payslips
    .filter((p: any) => p.parsed_pay_date)
    .sort((a: any, b: any) => new Date(b.parsed_pay_date).getTime() - new Date(a.parsed_pay_date).getTime())

  if (sorted.length < 2) return 'stable'

  const recent = sorted.slice(0, Math.min(3, sorted.length))
  const wages = recent.map((p: any) => p.net_wages)

  const avg = wages.reduce((a: number, b: number) => a + b, 0) / wages.length
  const variance = wages.reduce((sum: number, wage: number) => sum + Math.pow(wage - avg, 2), 0) / wages.length
  const stdDev = Math.sqrt(variance)

  if (stdDev / avg > 0.2) return 'volatile'

  const trendPercentage = (wages[0] - wages[wages.length - 1]) / wages[wages.length - 1]

  if (trendPercentage > 0.05) return 'increasing'
  if (trendPercentage < -0.05) return 'decreasing'
  return 'stable'
}

/**
 * Checks employer consistency across payslips
 */
function checkEmployerConsistency(payslips: any[]): boolean {
  if (payslips.length <= 1) return true

  const employers = payslips
    .map((p: any) => p.employer_name)
    .filter((name: string) => name)
    .map((name: string) => name.trim().toUpperCase())

  return new Set(employers).size === 1
}

// ============================================================================
// Get Application Summary
// ============================================================================

/**
 * Consolidates AI-extracted data from all documents for loan officer review
 * Logic extracted from /src/app/api/applications/[id]/summary/route.ts:6-258
 *
 * @param applicationId - UUID of the application
 * @returns Promise with consolidated summary data
 */
export async function getApplicationSummary(applicationId: string) {
  // Get authenticated user from Clerk
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  console.log(`[ApplicationSummaryService.getApplicationSummary] User ${userId} fetching summary for application ${applicationId}`)

  // Get user data and use service client
  const userData = await getUserData(userId)
  const supabase = createServiceSupabaseClient()

  // Fetch application with EXPLICIT user filtering
  const { data: application, error: appError } = await supabase
    .from('applications')
    .select(`
      id,
      title,
      application_type,
      status,
      progress_percentage,
      validation_results,
      created_at,
      submitted_at,
      user_id,
      application_types!inner (
        display_name,
        description
      )
    `)
    .eq('id', applicationId)
    .eq('user_id', userData.id)
    .single()

  if (appError || !application) {
    throw new Error('Application not found')
  }

  // Fetch all completed documents with extracted data
  const { data: documents, error: docError } = await supabase
    .from('application_documents')
    .select('*')
    .eq('application_id', applicationId)
    .eq('user_id', userData.id)
    .eq('processing_status', 'completed')
    .not('extracted_data', 'is', null)

  if (docError) {
    console.error('[ApplicationSummaryService.getApplicationSummary] Error fetching documents:', docError)
    throw new Error('Failed to fetch documents')
  }

  // Process extracted data by document type
  const processedData: any = {
    application: {
      id: application.id,
      title: application.title,
      type: application.application_type,
      type_display: (application.application_types as any)?.display_name || 'Unknown',
      status: application.status,
      progress: application.progress_percentage,
      created_at: application.created_at,
      submitted_at: application.submitted_at
    },
    applicant: null,
    employment: null,
    financial: null,
    financing: null,
    processing: {
      total_documents: documents?.length || 0,
      confidence_scores: [] as Array<{document_type: string, slot: string, confidence: number}>,
      completion_status: 'incomplete'
    }
  }

  // Process each document type
  documents?.forEach(doc => {
    const extractedData = doc.extracted_data

    processedData.processing.confidence_scores.push({
      document_type: doc.document_type,
      slot: doc.document_slot,
      confidence: doc.confidence_score || extractedData?.confidence_score || 0
    })

    switch (doc.document_type) {
      case 'ic':
        processedData.applicant = {
          full_name: extractedData.full_name,
          ic_number: extractedData.ic_number,
          date_of_birth: extractedData.date_of_birth,
          gender: extractedData.gender,
          address: extractedData.address,
          confidence: extractedData.confidence_score
        }
        break

      case 'application_form':
        const personalDetails = extractedData.personal_details || {}
        const employmentDetails = extractedData.employment_details || {}
        const financingDetails = extractedData.financing_details || {}

        processedData.employment = {
          employer_name: employmentDetails.employer_name || extractedData.employer_name,
          job_title: employmentDetails.job_title || extractedData.job_title,
          employment_type: employmentDetails.employment_type || extractedData.employment_type,
          monthly_income: employmentDetails.monthly_income || extractedData.monthly_income,
          years_of_service: employmentDetails.years_of_service || extractedData.years_of_service,
          employer_address: employmentDetails.employer_address || extractedData.employer_address,
          office_phone: employmentDetails.office_phone || extractedData.office_phone,
          department: employmentDetails.department || extractedData.department
        }

        processedData.financing = {
          type_of_financing: financingDetails.type_of_financing || extractedData.type_of_financing,
          application_type: financingDetails.application_type || extractedData.application_type,
          amount_requested: financingDetails.amount_requested || extractedData.amount_requested,
          tenor: financingDetails.tenor || extractedData.tenor,
          purpose_of_financing: financingDetails.purpose_of_financing || extractedData.purpose_of_financing
        }

        if (!processedData.applicant) {
          processedData.applicant = {
            full_name: personalDetails.name || extractedData.name,
            ic_number: personalDetails.mykad_no || extractedData.mykad_no,
            date_of_birth: personalDetails.date_of_birth || extractedData.date_of_birth,
            address: personalDetails.residential_address || extractedData.residential_address,
            phone: personalDetails.hp_no || extractedData.hp_no,
            email: personalDetails.email || extractedData.email,
            marital_status: personalDetails.marital_status || extractedData.marital_status
          }
        }
        break

      case 'payslip':
      case 'multi_payslip':
        const payslips = extractedData.payslips || [extractedData]

        if (payslips.length > 0) {
          const validPayslips = payslips.filter((p: any) => p.net_wages && p.gross_wages)

          if (validPayslips.length > 0) {
            const netWages = validPayslips.map((p: any) => p.net_wages)
            const grossWages = validPayslips.map((p: any) => p.gross_wages)

            processedData.financial = {
              payslip_count: validPayslips.length,
              average_net_income: Math.round(netWages.reduce((a: number, b: number) => a + b, 0) / netWages.length),
              average_gross_income: Math.round(grossWages.reduce((a: number, b: number) => a + b, 0) / grossWages.length),
              min_net_income: Math.min(...netWages),
              max_net_income: Math.max(...netWages),
              latest_net_income: validPayslips[0]?.net_wages || 0,
              income_trend: calculateIncomeTrend(validPayslips),
              payslip_months: validPayslips.map((p: any) => ({
                period: p.pay_period,
                net_wages: p.net_wages,
                gross_wages: p.gross_wages,
                employer: p.employer_name
              })).sort((a: any, b: any) => new Date(b.period || '').getTime() - new Date(a.period || '').getTime()),
              employer_consistency: checkEmployerConsistency(validPayslips)
            }

            if (!processedData.employment?.employer_name && validPayslips[0]) {
              processedData.employment = {
                ...processedData.employment,
                employer_name: validPayslips[0].employer_name,
                employee_name: validPayslips[0].employee_name,
                employee_code: validPayslips[0].employee_code
              }
            }
          }
        }
        break
    }
  })

  // Calculate overall processing status
  const avgConfidence = processedData.processing.confidence_scores.length > 0
    ? processedData.processing.confidence_scores.reduce((sum: number, score: any) => sum + (score.confidence || 0), 0) / processedData.processing.confidence_scores.length
    : 0

  processedData.processing = {
    ...processedData.processing,
    average_confidence: Math.round(avgConfidence * 100) / 100,
    completion_status: processedData.applicant && processedData.financing && processedData.financial ? 'complete' : 'incomplete'
  }

  return processedData
}
