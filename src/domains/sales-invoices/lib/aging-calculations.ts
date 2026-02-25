/**
 * Aging Bucket Calculation Utility
 *
 * Calculates AR aging buckets based on invoice due date relative to a reference date.
 * Used by debtor list, debtor detail, and aging report features.
 *
 * Buckets: Current (not yet due), 1-30 days overdue, 31-60, 61-90, 90+ days overdue.
 * Per FR-014: aging is calculated from invoice due date, not issue date.
 */

import type { AgingBuckets } from '../types'

/**
 * Calculate the number of days between two ISO date strings.
 * Returns positive if dueDate is in the past relative to asOfDate.
 */
function daysBetween(dueDate: string, asOfDate: string): number {
  const due = new Date(dueDate + 'T00:00:00Z')
  const asOf = new Date(asOfDate + 'T00:00:00Z')
  const diffMs = asOf.getTime() - due.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Get today's date as an ISO string (YYYY-MM-DD) in local timezone.
 */
export function getTodayISO(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Determine which aging bucket a single invoice belongs to.
 *
 * @param dueDate - Invoice due date (ISO YYYY-MM-DD)
 * @param asOfDate - Reference date for aging calculation (defaults to today)
 * @returns The bucket name: 'current' | 'days1to30' | 'days31to60' | 'days61to90' | 'days90plus'
 */
export function calculateAgingBucket(
  dueDate: string,
  asOfDate?: string
): keyof AgingBuckets {
  const referenceDate = asOfDate ?? getTodayISO()
  const daysOverdue = daysBetween(dueDate, referenceDate)

  if (daysOverdue <= 0) return 'current'
  if (daysOverdue <= 30) return 'days1to30'
  if (daysOverdue <= 60) return 'days31to60'
  if (daysOverdue <= 90) return 'days61to90'
  return 'days90plus'
}

/**
 * Calculate aging buckets for a set of invoices.
 * Each invoice's balanceDue is placed into the appropriate bucket based on its dueDate.
 *
 * @param invoices - Array of objects with dueDate and balanceDue
 * @param asOfDate - Reference date for aging calculation (defaults to today)
 * @returns AgingBuckets with summed amounts per bucket
 */
export function calculateAgingBuckets(
  invoices: Array<{ dueDate: string; balanceDue: number }>,
  asOfDate?: string
): AgingBuckets {
  const buckets: AgingBuckets = {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    days90plus: 0,
  }

  for (const invoice of invoices) {
    if (invoice.balanceDue <= 0) continue
    const bucket = calculateAgingBucket(invoice.dueDate, asOfDate)
    buckets[bucket] += invoice.balanceDue
  }

  // Round each bucket to 2 decimal places
  buckets.current = Math.round(buckets.current * 100) / 100
  buckets.days1to30 = Math.round(buckets.days1to30 * 100) / 100
  buckets.days31to60 = Math.round(buckets.days31to60 * 100) / 100
  buckets.days61to90 = Math.round(buckets.days61to90 * 100) / 100
  buckets.days90plus = Math.round(buckets.days90plus * 100) / 100

  return buckets
}

/**
 * Calculate days overdue for an invoice (0 if not yet due).
 *
 * @param dueDate - Invoice due date (ISO YYYY-MM-DD)
 * @param asOfDate - Reference date (defaults to today)
 * @returns Number of days overdue (0 if current)
 */
export function calculateDaysOverdue(
  dueDate: string,
  asOfDate?: string
): number {
  const referenceDate = asOfDate ?? getTodayISO()
  const days = daysBetween(dueDate, referenceDate)
  return Math.max(0, days)
}

/**
 * Export aging report data as CSV and trigger browser download.
 * Uses the generateCsv utility from the exports domain.
 */
export async function exportAgingReportCsv(
  reportData: {
    debtors: Array<{
      customerName: string
      current: number
      days1to30: number
      days31to60: number
      days61to90: number
      days90plus: number
      total: number
    }>
    summary: {
      current: number
      days1to30: number
      days31to60: number
      days61to90: number
      days90plus: number
      total: number
    }
    asOfDate: string
    currency: string
  }
): Promise<void> {
  // Build CSV rows manually for simplicity (no dependency on export template system)
  const headers = ['Customer', 'Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days', 'Total']
  const rows: string[][] = []

  for (const debtor of reportData.debtors) {
    rows.push([
      debtor.customerName,
      debtor.current.toFixed(2),
      debtor.days1to30.toFixed(2),
      debtor.days31to60.toFixed(2),
      debtor.days61to90.toFixed(2),
      debtor.days90plus.toFixed(2),
      debtor.total.toFixed(2),
    ])
  }

  // Add summary/total row
  rows.push([
    'TOTAL',
    reportData.summary.current.toFixed(2),
    reportData.summary.days1to30.toFixed(2),
    reportData.summary.days31to60.toFixed(2),
    reportData.summary.days61to90.toFixed(2),
    reportData.summary.days90plus.toFixed(2),
    reportData.summary.total.toFixed(2),
  ])

  // Escape CSV values
  const escapeCsv = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`
    }
    return val
  }

  const csvContent = [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => row.map(escapeCsv).join(',')),
  ].join('\n')

  // Trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const { downloadBlob } = await import('@/lib/capacitor/native-download')
  await downloadBlob(blob, `ar-aging-report-${reportData.asOfDate}-${reportData.currency}.csv`)
}
