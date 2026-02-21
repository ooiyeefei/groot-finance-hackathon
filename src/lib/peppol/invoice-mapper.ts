/**
 * Invoice Mapper — FinanSEAL → Storecove JSON
 *
 * Maps sales invoice data from Convex to Storecove's document submission format.
 * Handles both invoices and credit notes.
 */

import {
  type StorecoveDocumentSubmission,
  type StorecoveInvoiceLine,
  type StorecoveParty,
  STORECOVE_SCHEME_SG,
  mapTaxCategory,
} from "./types"
import { getLegalEntityId } from "./storecove-client"

interface InvoiceData {
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  currency: string
  lineItems: Array<{
    lineOrder: number
    description: string
    quantity: number
    unitPrice: number
    totalAmount: number
    taxRate?: number
    taxAmount?: number
    unitMeasurement?: string
  }>
  subtotal: number
  totalTax: number
  totalAmount: number
  notes?: string
  einvoiceType?: string
  originalInvoiceNumber?: string // For credit notes — the parent invoice number
}

interface BusinessData {
  legalName?: string
  businessName: string
  peppolParticipantId?: string
  address?: string
  addressLine1?: string
  city?: string
  postalCode?: string
  countryCode?: string
  email?: string
  phone?: string
}

interface CustomerData {
  businessName: string
  peppolParticipantId?: string
  address?: string
  addressLine1?: string
  city?: string
  postalCode?: string
  countryCode?: string
  email?: string
  contactPerson?: string
  phone?: string
}

/**
 * Parse a Peppol participant ID (e.g., "0195:T08GA1234A") into scheme + identifier
 * for Storecove routing.
 */
export function parsePeppolId(peppolId: string): {
  scheme: string
  identifier: string
} {
  const colonIndex = peppolId.indexOf(":")
  if (colonIndex === -1) {
    // Assume Singapore UEN if no scheme prefix
    return { scheme: STORECOVE_SCHEME_SG, identifier: peppolId }
  }

  const schemeCode = peppolId.substring(0, colonIndex)
  const identifier = peppolId.substring(colonIndex + 1)

  // Map ICD scheme codes to Storecove routing schemes
  const schemeMap: Record<string, string> = {
    "0195": STORECOVE_SCHEME_SG, // Singapore UEN
  }

  return {
    scheme: schemeMap[schemeCode] || schemeCode,
    identifier,
  }
}

function mapParty(data: BusinessData | CustomerData): StorecoveParty {
  return {
    party: {
      companyName: data.businessName,
      address: {
        street1: data.addressLine1 || data.address,
        city: data.city,
        zip: data.postalCode,
        country: data.countryCode || "SG",
      },
      contact: {
        email: data.email,
        phone: data.phone,
        ...("contactPerson" in data && data.contactPerson
          ? { firstName: data.contactPerson }
          : {}),
      },
    },
  }
}

function mapLineItems(
  items: InvoiceData["lineItems"],
  country: string
): StorecoveInvoiceLine[] {
  return items.map((item, index) => ({
    lineId: String(item.lineOrder || index + 1),
    description: item.description,
    quantity: item.quantity,
    unitCode: item.unitMeasurement || "C62", // C62 = "one" (unit)
    amountExcludingVat: round(item.quantity * item.unitPrice),
    itemPrice: item.unitPrice,
    ...(item.taxRate !== undefined
      ? {
          tax: {
            amount: item.taxAmount ?? 0,
            percentage: item.taxRate,
            country,
            category: mapTaxCategory(item.taxRate),
          },
        }
      : {}),
  }))
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Map a FinanSEAL sales invoice to Storecove's document submission format.
 */
export function mapInvoiceToStorecove(
  invoice: InvoiceData,
  business: BusinessData,
  customer: CustomerData
): StorecoveDocumentSubmission {
  if (!customer.peppolParticipantId) {
    throw new Error("Customer does not have a Peppol participant ID")
  }

  const receiverId = parsePeppolId(customer.peppolParticipantId)
  const country = business.countryCode || "SG"
  const isCredit = invoice.einvoiceType === "credit_note"

  const submission: StorecoveDocumentSubmission = {
    legalEntityId: getLegalEntityId(),
    routing: {
      eIdentifiers: [
        {
          scheme: receiverId.scheme,
          id: receiverId.identifier,
        },
      ],
    },
    document: {
      documentType: isCredit ? "creditnote" : "invoice",
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.invoiceDate,
      dueDate: invoice.dueDate || undefined,
      documentCurrencyCode: invoice.currency,
      accountingSupplierParty: mapParty(business),
      accountingCustomerParty: mapParty(customer),
      invoiceLines: mapLineItems(invoice.lineItems, country),
      amountIncludingVat: invoice.totalAmount,
      note: invoice.notes,
      ...(isCredit && invoice.originalInvoiceNumber
        ? { billingReference: invoice.originalInvoiceNumber }
        : {}),
    },
  }

  // Add tax subtotals if there are taxed lines
  const taxedLines = invoice.lineItems.filter(
    (item) => item.taxRate !== undefined
  )
  if (taxedLines.length > 0) {
    // Group by tax rate
    const taxGroups = new Map<
      number,
      { taxableAmount: number; taxAmount: number }
    >()
    for (const item of taxedLines) {
      const rate = item.taxRate ?? 0
      const existing = taxGroups.get(rate) || {
        taxableAmount: 0,
        taxAmount: 0,
      }
      existing.taxableAmount += round(item.quantity * item.unitPrice)
      existing.taxAmount += item.taxAmount ?? 0
      taxGroups.set(rate, existing)
    }

    submission.document.taxSubtotals = Array.from(taxGroups.entries()).map(
      ([rate, group]) => ({
        taxableAmount: round(group.taxableAmount),
        taxAmount: round(group.taxAmount),
        percentage: rate,
        country,
        category: mapTaxCategory(rate),
      })
    )
  }

  return submission
}

/**
 * Map Storecove validation errors to FinanSEAL peppolErrors format.
 */
export function mapStorecoveErrorsToPeppolErrors(
  storecoveErrors: Array<{ source: string; details: string }>
): Array<{ code: string; message: string }> {
  return storecoveErrors.map((err) => ({
    code: err.source || "VALIDATION_ERROR",
    message: err.details || "Unknown validation error",
  }))
}
