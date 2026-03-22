/**
 * Invoice Mapper — FinanSEAL → LHDN UBL 2.1 JSON
 *
 * Maps sales invoice data from Convex to LHDN's UBL 2.1 JSON submission format.
 * Handles invoices, credit notes, debit notes, and refund notes.
 * Uses namespace prefixes (_D, _A, _B) required by LHDN.
 */

import type { LhdnUblDocument, LhdnUblInvoiceBody, LhdnUblParty } from "./types"
import { UBL_NAMESPACES, GENERAL_PUBLIC_TIN, mapEinvoiceTypeToDocumentType } from "./constants"
import { formatLhdnDecimal, formatLhdnTaxRate, formatLhdnQuantity } from "./decimal"

// ============================================
// INPUT INTERFACES
// ============================================

export interface InvoiceData {
  invoiceNumber: string
  invoiceDate: string // YYYY-MM-DD
  issueTime?: string // HH:mm:ssZ
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
    itemCode?: string
  }>
  subtotal: number
  totalTax: number
  totalAmount: number
  notes?: string
  einvoiceType?: string
  originalInvoiceNumber?: string
  originalInvoiceLhdnUuid?: string // 032-credit-debit-note: LHDN UUID for BillingReference
}

export interface SupplierData {
  tin: string
  brn?: string
  sstRegistration?: string
  msicCode?: string
  legalName: string
  addressLine1?: string
  addressLine2?: string
  addressLine3?: string
  city?: string
  stateCode?: string
  postalCode?: string
  countryCode: string
  phone?: string
  email?: string
}

export interface BuyerData {
  tin?: string
  brn?: string
  sstRegistration?: string
  businessName: string
  addressLine1?: string
  addressLine2?: string
  addressLine3?: string
  city?: string
  stateCode?: string
  postalCode?: string
  countryCode?: string
  phone?: string
  email?: string
}

// ============================================
// PARTY MAPPING
// ============================================

function mapSupplierParty(supplier: SupplierData): LhdnUblInvoiceBody["AccountingSupplierParty"] {
  const identifications: Array<{ ID: Array<{ _: string; schemeID: string }> }> = [
    { ID: [{ _: supplier.tin, schemeID: "TIN" }] },
  ]
  if (supplier.brn) {
    identifications.push({ ID: [{ _: supplier.brn, schemeID: "BRN" }] })
  }
  if (supplier.sstRegistration) {
    identifications.push({ ID: [{ _: supplier.sstRegistration, schemeID: "SST" }] })
  }

  const addressLines: Array<{ Line: string }> = []
  if (supplier.addressLine1) addressLines.push({ Line: supplier.addressLine1 })
  if (supplier.addressLine2) addressLines.push({ Line: supplier.addressLine2 })
  if (supplier.addressLine3) addressLines.push({ Line: supplier.addressLine3 })
  if (addressLines.length === 0) addressLines.push({ Line: "NA" })

  return [{
    Party: [{
      IndustryClassificationCode: supplier.msicCode || "00000",
      PartyIdentification: identifications,
      PostalAddress: [{
        AddressLine: addressLines,
        CityName: supplier.city,
        PostalZone: supplier.postalCode,
        CountrySubentityCode: supplier.stateCode,
        Country: [{ IdentificationCode: supplier.countryCode }],
      }],
      PartyLegalEntity: [{
        RegistrationName: supplier.legalName,
      }],
      Contact: [{
        Telephone: supplier.phone,
        ElectronicMail: supplier.email,
      }],
    }],
  }]
}

function mapBuyerParty(buyer: BuyerData, useGeneralTin: boolean): LhdnUblInvoiceBody["AccountingCustomerParty"] {
  const buyerTin = buyer.tin || (useGeneralTin ? GENERAL_PUBLIC_TIN : GENERAL_PUBLIC_TIN)

  const identifications: Array<{ ID: Array<{ _: string; schemeID: string }> }> = [
    { ID: [{ _: buyerTin, schemeID: "TIN" }] },
  ]
  if (buyer.brn) {
    identifications.push({ ID: [{ _: buyer.brn, schemeID: "BRN" }] })
  }
  if (buyer.sstRegistration) {
    identifications.push({ ID: [{ _: buyer.sstRegistration, schemeID: "SST" }] })
  }

  const addressLines: Array<{ Line: string }> = []
  if (buyer.addressLine1) addressLines.push({ Line: buyer.addressLine1 })
  if (buyer.addressLine2) addressLines.push({ Line: buyer.addressLine2 })
  if (buyer.addressLine3) addressLines.push({ Line: buyer.addressLine3 })
  if (addressLines.length === 0) addressLines.push({ Line: "NA" })

  return [{
    Party: [{
      PartyIdentification: identifications,
      PostalAddress: [{
        AddressLine: addressLines,
        CityName: buyer.city,
        PostalZone: buyer.postalCode,
        CountrySubentityCode: buyer.stateCode,
        Country: [{ IdentificationCode: buyer.countryCode || "MYS" }],
      }],
      PartyLegalEntity: [{
        RegistrationName: buyer.businessName,
      }],
      Contact: [{
        Telephone: buyer.phone,
        ElectronicMail: buyer.email,
      }],
    }],
  }]
}

// ============================================
// LINE ITEMS & TAX
// ============================================

function mapLineItems(items: InvoiceData["lineItems"]): LhdnUblInvoiceBody["InvoiceLine"] {
  return items.map((item) => ({
    ID: String(item.lineOrder),
    Description: item.description,
    Quantity: formatLhdnQuantity(item.quantity),
    UnitCode: item.unitMeasurement || "C62",
    UnitPrice: formatLhdnDecimal(item.unitPrice),
    TaxAmount: formatLhdnDecimal(item.taxAmount ?? 0),
    TaxPercent: formatLhdnTaxRate(item.taxRate ?? 0),
    TaxCategory: item.taxRate && item.taxRate > 0 ? "01" : "06",
    LineExtensionAmount: formatLhdnDecimal(item.quantity * item.unitPrice),
    ...(item.itemCode ? { ItemClassificationCode: item.itemCode } : {}),
  }))
}

function buildTaxTotal(items: InvoiceData["lineItems"], totalTax: number): LhdnUblInvoiceBody["TaxTotal"] {
  // Group by tax rate
  const taxGroups = new Map<number, { taxableAmount: number; taxAmount: number }>()

  for (const item of items) {
    const rate = item.taxRate ?? 0
    const existing = taxGroups.get(rate) || { taxableAmount: 0, taxAmount: 0 }
    existing.taxableAmount += item.quantity * item.unitPrice
    existing.taxAmount += item.taxAmount ?? 0
    taxGroups.set(rate, existing)
  }

  const subtotals = Array.from(taxGroups.entries()).map(([rate, group]) => ({
    TaxableAmount: formatLhdnDecimal(group.taxableAmount),
    TaxAmount: formatLhdnDecimal(group.taxAmount),
    TaxCategory: [{
      ID: rate > 0 ? "01" : "06",
      Percent: formatLhdnTaxRate(rate),
      TaxScheme: [{ ID: "OTH" }],
    }],
  }))

  return [{
    TaxAmount: formatLhdnDecimal(totalTax),
    TaxSubtotal: subtotals,
  }]
}

// ============================================
// MAIN MAPPER
// ============================================

/**
 * Map a FinanSEAL sales invoice to LHDN UBL 2.1 JSON document format.
 *
 * Returns the UBL document object (not stringified) for signing.
 * The caller is responsible for stringifying, hashing, and wrapping
 * in an LhdnDocument for submission.
 */
export function mapInvoiceToLhdn(
  invoice: InvoiceData,
  supplier: SupplierData,
  buyer: BuyerData,
  options?: { useGeneralBuyerTin?: boolean }
): LhdnUblDocument {
  const documentTypeCode = mapEinvoiceTypeToDocumentType(invoice.einvoiceType)
  const issueTime = invoice.issueTime || new Date().toISOString().split("T")[1]?.replace(/\.\d{3}/, "") || "00:00:00Z"

  const invoiceBody: LhdnUblInvoiceBody = {
    ID: invoice.invoiceNumber,
    IssueDate: invoice.invoiceDate,
    IssueTime: issueTime,
    InvoiceTypeCode: documentTypeCode,
    DocumentCurrencyCode: invoice.currency,
    AccountingSupplierParty: mapSupplierParty(supplier),
    AccountingCustomerParty: mapBuyerParty(buyer, options?.useGeneralBuyerTin ?? false),
    TaxTotal: buildTaxTotal(invoice.lineItems, invoice.totalTax),
    LegalMonetaryTotal: [{
      LineExtensionAmount: formatLhdnDecimal(invoice.subtotal),
      TaxExclusiveAmount: formatLhdnDecimal(invoice.subtotal),
      TaxInclusiveAmount: formatLhdnDecimal(invoice.totalAmount),
      PayableAmount: formatLhdnDecimal(invoice.totalAmount),
    }],
    InvoiceLine: mapLineItems(invoice.lineItems),
  }

  // Add billing reference for credit/debit notes
  // 032-credit-debit-note: Prefer LHDN UUID for BillingReference, fall back to invoice number
  const billingRefId = invoice.originalInvoiceLhdnUuid ?? invoice.originalInvoiceNumber
  if (billingRefId && invoice.einvoiceType !== "invoice") {
    invoiceBody.BillingReference = [{
      AdditionalDocumentReference: [{
        ID: billingRefId,
      }],
    }]
  }

  // Add invoice period if notes contain period info
  if (invoice.notes) {
    invoiceBody.InvoicePeriod = [{
      Description: invoice.notes,
    }]
  }

  return {
    _D: UBL_NAMESPACES._D,
    _A: UBL_NAMESPACES._A,
    _B: UBL_NAMESPACES._B,
    Invoice: [invoiceBody],
  }
}

/**
 * Extract supplier data from a FinanSEAL business record.
 */
export function extractSupplierData(business: {
  name: string
  legalName?: string
  lhdnTin?: string
  businessRegistrationNumber?: string
  sstRegistrationNumber?: string
  msicCode?: string
  addressLine1?: string
  addressLine2?: string
  addressLine3?: string
  city?: string
  stateCode?: string
  postalCode?: string
  countryCode?: string
  phone?: string
  contactEmail?: string
}): SupplierData {
  return {
    tin: business.lhdnTin || "",
    brn: business.businessRegistrationNumber,
    sstRegistration: business.sstRegistrationNumber,
    msicCode: business.msicCode,
    legalName: business.legalName || business.name,
    addressLine1: business.addressLine1,
    addressLine2: business.addressLine2,
    addressLine3: business.addressLine3,
    city: business.city,
    stateCode: business.stateCode,
    postalCode: business.postalCode,
    countryCode: business.countryCode || "MYS",
    phone: business.phone,
    email: business.contactEmail,
  }
}

/**
 * Extract buyer data from a FinanSEAL customer snapshot or customer record.
 */
export function extractBuyerData(customer: {
  businessName: string
  tin?: string
  brn?: string
  sstRegistration?: string
  addressLine1?: string
  addressLine2?: string
  addressLine3?: string
  city?: string
  stateCode?: string
  postalCode?: string
  countryCode?: string
  phone?: string
  email?: string
}): BuyerData {
  return {
    tin: customer.tin,
    brn: customer.brn,
    businessName: customer.businessName,
    addressLine1: customer.addressLine1,
    addressLine2: customer.addressLine2,
    addressLine3: customer.addressLine3,
    city: customer.city,
    stateCode: customer.stateCode,
    postalCode: customer.postalCode,
    countryCode: customer.countryCode || "MYS",
    phone: customer.phone,
    email: customer.email,
  }
}
