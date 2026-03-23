/**
 * Report domain types
 * Part of 035-aging-payable-receivable-report feature.
 */

export interface GeneratedReport {
  _id: string
  businessId: string
  reportType: 'ap_aging' | 'ar_aging'
  reportScope: 'consolidated' | 'debtor_statement' | 'vendor_statement'
  asOfDate: string
  periodMonth: string
  generationMethod: 'manual' | 'auto_monthly'
  generatedBy: string
  s3Key: string
  totalOutstanding: number
  currency: string
  hasWarnings: boolean
  aiInsightsSummary?: string
  _creationTime: number
}

export interface DebtorStatementSend {
  _id: string
  businessId: string
  reportId: string
  customerId: string
  customerName: string
  customerEmail?: string
  totalOutstanding: number
  invoiceCount: number
  sendStatus: 'pending' | 'sent' | 'auto_sent' | 'failed' | 'no_email'
  sentAt?: number
  periodMonth: string
  hasDisclaimer: boolean
  autoSendEnabled: boolean
  _creationTime: number
}

export interface ReportSettings {
  autoGenerateMonthly?: boolean
  autoSendGlobal?: boolean
  autoSendDebtors?: string[]
  notifyEmail?: boolean
}
