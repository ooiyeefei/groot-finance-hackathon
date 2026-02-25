/**
 * Self-Bill Mapper — FinanSEAL → LHDN Self-Billed E-Invoice (Type 11)
 *
 * Maps expense claims and AP invoices to LHDN self-billed UBL 2.1 JSON.
 * In self-billing, the buyer (FinanSEAL business) issues the invoice
 * on behalf of the seller (vendor).
 */

import type { LhdnUblDocument, LhdnUblInvoiceBody } from "./types"
import { UBL_NAMESPACES, LHDN_DOCUMENT_TYPES, GENERAL_INDIVIDUAL_TIN } from "./constants"
import { formatLhdnDecimal, formatLhdnTaxRate, formatLhdnQuantity } from "./decimal"

// ============================================
// INPUT INTERFACES
// ============================================

export interface SelfBillData {
  /** Reference number (expense claim ID or AP invoice number) */
  referenceNumber: string
  /** Transaction/invoice date (YYYY-MM-DD) */
  date: string
  issueTime?: string
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
}

export interface SelfBillBuyerData {
  /** FinanSEAL business = buyer in self-billing */
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

export interface SelfBillSellerData {
  /** Vendor = seller in self-billing */
  tin?: string
  name: string
  addressLine1?: string
  city?: string
  countryCode?: string
  phone?: string
  email?: string
}

// ============================================
// MAIN MAPPER
// ============================================

/**
 * Map expense claim or AP invoice data to a self-billed UBL 2.1 document (type 11).
 * In self-billing, the buyer issues the invoice on behalf of the seller (vendor).
 */
export function mapToSelfBilledInvoice(
  data: SelfBillData,
  buyer: SelfBillBuyerData,
  seller: SelfBillSellerData
): LhdnUblDocument {
  const sellerTin = seller.tin || GENERAL_INDIVIDUAL_TIN
  const issueTime = data.issueTime || new Date().toISOString().split("T")[1]?.replace(/\.\d{3}/, "") || "00:00:00Z"

  // Build supplier party (vendor/seller)
  const supplierParty: LhdnUblInvoiceBody["AccountingSupplierParty"] = [{
    Party: [{
      IndustryClassificationCode: "00000",
      PartyIdentification: [
        { ID: [{ _: sellerTin, schemeID: "TIN" }] },
      ],
      PostalAddress: [{
        AddressLine: [
          { Line: seller.addressLine1 || "NA" },
        ],
        CityName: seller.city,
        Country: [{ IdentificationCode: seller.countryCode || "MYS" }],
      }],
      PartyLegalEntity: [{
        RegistrationName: seller.name,
      }],
      Contact: [{
        Telephone: seller.phone,
        ElectronicMail: seller.email,
      }],
    }],
  }]

  // Build customer party (FinanSEAL business/buyer)
  const buyerIdentifications: Array<{ ID: Array<{ _: string; schemeID: string }> }> = [
    { ID: [{ _: buyer.tin, schemeID: "TIN" }] },
  ]
  if (buyer.brn) {
    buyerIdentifications.push({ ID: [{ _: buyer.brn, schemeID: "BRN" }] })
  }
  if (buyer.sstRegistration) {
    buyerIdentifications.push({ ID: [{ _: buyer.sstRegistration, schemeID: "SST" }] })
  }

  const buyerAddressLines: Array<{ Line: string }> = []
  if (buyer.addressLine1) buyerAddressLines.push({ Line: buyer.addressLine1 })
  if (buyer.addressLine2) buyerAddressLines.push({ Line: buyer.addressLine2 })
  if (buyer.addressLine3) buyerAddressLines.push({ Line: buyer.addressLine3 })
  if (buyerAddressLines.length === 0) buyerAddressLines.push({ Line: "NA" })

  const customerParty: LhdnUblInvoiceBody["AccountingCustomerParty"] = [{
    Party: [{
      PartyIdentification: buyerIdentifications,
      PostalAddress: [{
        AddressLine: buyerAddressLines,
        CityName: buyer.city,
        PostalZone: buyer.postalCode,
        CountrySubentityCode: buyer.stateCode,
        Country: [{ IdentificationCode: buyer.countryCode }],
      }],
      PartyLegalEntity: [{
        RegistrationName: buyer.legalName,
      }],
      Contact: [{
        Telephone: buyer.phone,
        ElectronicMail: buyer.email,
      }],
    }],
  }]

  // Build line items
  const invoiceLines: LhdnUblInvoiceBody["InvoiceLine"] = data.lineItems.map((item) => ({
    ID: String(item.lineOrder),
    Description: item.description,
    Quantity: formatLhdnQuantity(item.quantity),
    UnitCode: item.unitMeasurement || "C62",
    UnitPrice: formatLhdnDecimal(item.unitPrice),
    TaxAmount: formatLhdnDecimal(item.taxAmount ?? 0),
    TaxPercent: formatLhdnTaxRate(item.taxRate ?? 0),
    TaxCategory: item.taxRate && item.taxRate > 0 ? "01" : "06",
    LineExtensionAmount: formatLhdnDecimal(item.quantity * item.unitPrice),
  }))

  // Build tax totals
  const taxGroups = new Map<number, { taxableAmount: number; taxAmount: number }>()
  for (const item of data.lineItems) {
    const rate = item.taxRate ?? 0
    const existing = taxGroups.get(rate) || { taxableAmount: 0, taxAmount: 0 }
    existing.taxableAmount += item.quantity * item.unitPrice
    existing.taxAmount += item.taxAmount ?? 0
    taxGroups.set(rate, existing)
  }

  const taxSubtotals = Array.from(taxGroups.entries()).map(([rate, group]) => ({
    TaxableAmount: formatLhdnDecimal(group.taxableAmount),
    TaxAmount: formatLhdnDecimal(group.taxAmount),
    TaxCategory: [{
      ID: rate > 0 ? "01" : "06",
      Percent: formatLhdnTaxRate(rate),
      TaxScheme: [{ ID: "OTH" }],
    }],
  }))

  const invoiceBody: LhdnUblInvoiceBody = {
    ID: data.referenceNumber,
    IssueDate: data.date,
    IssueTime: issueTime,
    InvoiceTypeCode: LHDN_DOCUMENT_TYPES.SELF_BILLED_INVOICE,
    DocumentCurrencyCode: data.currency,
    AccountingSupplierParty: supplierParty,
    AccountingCustomerParty: customerParty,
    TaxTotal: [{
      TaxAmount: formatLhdnDecimal(data.totalTax),
      TaxSubtotal: taxSubtotals,
    }],
    LegalMonetaryTotal: [{
      LineExtensionAmount: formatLhdnDecimal(data.subtotal),
      TaxExclusiveAmount: formatLhdnDecimal(data.subtotal),
      TaxInclusiveAmount: formatLhdnDecimal(data.totalAmount),
      PayableAmount: formatLhdnDecimal(data.totalAmount),
    }],
    InvoiceLine: invoiceLines,
  }

  if (data.notes) {
    invoiceBody.InvoicePeriod = [{ Description: data.notes }]
  }

  return {
    _D: UBL_NAMESPACES._D,
    _A: UBL_NAMESPACES._A,
    _B: UBL_NAMESPACES._B,
    Invoice: [invoiceBody],
  }
}

/**
 * Extract buyer data from a business record for self-billing.
 * In self-billing, the business (buyer) issues the invoice.
 */
export function extractSelfBillBuyerData(business: {
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
}): SelfBillBuyerData {
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
