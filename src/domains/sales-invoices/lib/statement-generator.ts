/**
 * Statement Generator Utility
 *
 * Formats statement data for PDF rendering.
 * Used by debtor-statement component.
 */

interface StatementData {
  customer: {
    name: string
    email?: string
    address?: string
  }
  business: {
    name: string
    address?: string
    registrationNumber?: string
  }
  period: {
    from: string
    to: string
  }
  openingBalance: number
  closingBalance: number
  currency: string
  transactions: Array<{
    date: string
    type: 'invoice' | 'payment' | 'reversal'
    reference: string
    description: string
    debit: number
    credit: number
    balance: number
  }>
  totals: {
    totalDebits: number
    totalCredits: number
  }
}

export function formatStatementForPdf(data: StatementData) {
  return {
    title: 'Statement of Account',
    businessName: data.business.name,
    businessAddress: data.business.address ?? '',
    businessRegNo: data.business.registrationNumber ?? '',
    customerName: data.customer.name,
    customerEmail: data.customer.email ?? '',
    customerAddress: data.customer.address ?? '',
    periodFrom: data.period.from,
    periodTo: data.period.to,
    currency: data.currency,
    openingBalance: data.openingBalance,
    closingBalance: data.closingBalance,
    transactions: data.transactions,
    totalDebits: data.totals.totalDebits,
    totalCredits: data.totals.totalCredits,
  }
}
