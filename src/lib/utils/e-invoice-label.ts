/**
 * Returns the localized e-invoice feature label based on detected currency.
 *
 * SGD (Singapore) → Peppol InvoiceNow
 * MYR (Malaysia)  → LHDN e-Invoice
 * Others          → generic "e-Invoice"
 */
export function localizeEInvoiceLabel(currency: string): string {
  switch (currency) {
    case 'SGD':
      return 'e-Invoice (Peppol)'
    case 'MYR':
      return 'LHDN e-Invoice'
    default:
      return 'e-Invoice'
  }
}
