import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient, getUserData } from '@/lib/supabase-server'
import { auth } from '@clerk/nextjs/server'

// Application Summary API - Consolidates AI-extracted data for loan officer review
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const applicationId = id

    // Get user data and use service client to bypass RLS (explicit filtering below)
    const userData = await getUserData(userId)
    const supabase = createServiceSupabaseClient()

    // Fetch application with application type details and EXPLICIT user filtering
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
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    // Fetch all application documents with extracted data and EXPLICIT user filtering
    const { data: documents, error: docError } = await supabase
      .from('application_documents')
      .select('*')
      .eq('application_id', applicationId)
      .eq('user_id', userData.id)
      .eq('processing_status', 'completed')
      .not('extracted_data', 'is', null)

    if (docError) {
      console.error('Error fetching documents:', docError)
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
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

          // Merge with flat structure for backward compatibility
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

          // Update applicant with application form data if not from IC
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
          // Handle both single and multi-payslip structures
          const payslips = extractedData.payslips || [extractedData]

          if (payslips.length > 0) {
            // Calculate financial metrics
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

              // Update employment from payslip if not from application form
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

    return NextResponse.json({
      success: true,
      data: processedData
    })

  } catch (error) {
    console.error('Application summary API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper function to calculate income trend
function calculateIncomeTrend(payslips: any[]): 'stable' | 'increasing' | 'decreasing' | 'volatile' {
  if (payslips.length < 2) return 'stable'

  // Sort by date (most recent first)
  const sorted = payslips
    .filter((p: any) => p.parsed_pay_date)
    .sort((a: any, b: any) => new Date(b.parsed_pay_date).getTime() - new Date(a.parsed_pay_date).getTime())

  if (sorted.length < 2) return 'stable'

  const recent = sorted.slice(0, Math.min(3, sorted.length))
  const wages = recent.map((p: any) => p.net_wages)

  // Calculate variance
  const avg = wages.reduce((a: number, b: number) => a + b, 0) / wages.length
  const variance = wages.reduce((sum: number, wage: number) => sum + Math.pow(wage - avg, 2), 0) / wages.length
  const stdDev = Math.sqrt(variance)

  // If high variance (>20% of average), mark as volatile
  if (stdDev / avg > 0.2) return 'volatile'

  // Compare first and last values
  const trendPercentage = (wages[0] - wages[wages.length - 1]) / wages[wages.length - 1]

  if (trendPercentage > 0.05) return 'increasing'
  if (trendPercentage < -0.05) return 'decreasing'
  return 'stable'
}

// Helper function to check employer consistency
function checkEmployerConsistency(payslips: any[]): boolean {
  if (payslips.length <= 1) return true

  const employers = payslips
    .map((p: any) => p.employer_name)
    .filter((name: string) => name)
    .map((name: string) => name.trim().toUpperCase())

  return new Set(employers).size === 1
}