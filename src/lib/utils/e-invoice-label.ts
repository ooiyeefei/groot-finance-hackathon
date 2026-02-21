/**
 * Returns the e-invoice feature label.
 * Always returns generic "e-Invoice" — no country-specific mentions
 * (LHDN / Peppol) in pricing or billing contexts.
 */
export function localizeEInvoiceLabel(_currency: string): string {
  return 'e-Invoice'
}
