/**
 * Invoice PDF document rendered with @react-pdf/renderer.
 *
 * This produces a real vector PDF — no html2canvas / DOM capture issues.
 * Supports both "modern" and "classic" layouts via the `templateId` prop.
 */
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────
export interface PdfInvoiceData {
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  customerSnapshot: {
    businessName: string
    contactPerson?: string
    email: string
    phone?: string
    address?: string
    taxId?: string
  }
  lineItems: Array<{
    description: string
    quantity: number
    unitPrice: number
    taxRate?: number
    taxAmount?: number
    discountAmount?: number
    totalAmount: number
    currency: string
    itemCode?: string
    unitMeasurement?: string
    supplyDateStart?: string
    supplyDateEnd?: string
  }>
  subtotal: number
  totalDiscount?: number
  totalTax: number
  totalAmount: number
  balanceDue: number
  amountPaid?: number
  currency: string
  taxMode: string
  notes?: string
  paymentInstructions?: string
  paymentTerms?: string
  signatureName?: string
  status: string
  footer?: string
  customFields?: Array<{ key: string; value: string }>
  showTaxId?: boolean
}

export interface PdfBusinessInfo {
  companyName?: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  registrationNumber?: string
  taxId?: string
  logoUrl?: string
}

interface InvoicePdfDocumentProps {
  invoice: PdfInvoiceData
  businessInfo?: PdfBusinessInfo
  templateId?: string
}

// ─── Register cursive font for signature ─────────────────
Font.register({
  family: 'Autography',
  src: '/fonts/Autography.otf',
})

// ─── Colors (light-mode palette for PDF) ─────────────────
const C = {
  foreground: '#1a1a1a',
  muted: '#6b7280',
  border: '#e5e7eb',
  bg: '#ffffff',
  tableBg: '#f9fafb',
}

// ─── Styles ──────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: C.foreground,
    backgroundColor: C.bg,
  },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  companyBlock: { maxWidth: '60%' },
  companyName: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  companyDetail: { fontSize: 9, color: C.muted, lineHeight: 1.5 },
  invoiceTitle: { fontSize: 22, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  invoiceNumber: { fontSize: 10, color: C.muted, textAlign: 'right', marginTop: 2 },

  separator: { borderBottomWidth: 1, borderBottomColor: C.border, marginVertical: 16 },

  // Two-column section
  twoCol: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  colHalf: { width: '48%' },
  sectionLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 3 },
  detailLabel: { fontSize: 9, color: C.muted, marginRight: 8 },
  detailValue: { fontSize: 9, fontFamily: 'Helvetica-Bold' },

  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.tableBg,
    borderBottomWidth: 1.5,
    borderBottomColor: C.border,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  thText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.muted, textTransform: 'uppercase' },
  tdText: { fontSize: 9 },
  tdMuted: { fontSize: 9, color: C.muted },

  // Column widths for 6-col table
  colCode: { width: '10%' },
  colDesc: { width: '30%' },
  colQty: { width: '10%', textAlign: 'right' },
  colPrice: { width: '18%', textAlign: 'right' },
  colTax: { width: '12%', textAlign: 'right' },
  colAmount: { width: '20%', textAlign: 'right' },

  // Totals
  totalsBlock: { alignItems: 'flex-end', marginTop: 16, marginBottom: 16 },
  totalsRow: { flexDirection: 'row', width: 220, justifyContent: 'space-between', paddingVertical: 3 },
  totalsBorder: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6 },
  totalsLabel: { fontSize: 9, color: C.muted },
  totalsValue: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  grandTotalLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  grandTotalValue: { fontSize: 11, fontFamily: 'Helvetica-Bold' },

  // Footer sections
  footerSection: { marginTop: 8, width: '100%' },
  footerText: { fontSize: 9, color: C.muted, lineHeight: 1.5, width: '100%' },

  // Signature
  signatureBlock: { alignItems: 'flex-end', marginTop: 24 },
  signatureName: { fontSize: 22, fontFamily: 'Autography', marginBottom: 4 },
  signatureLine: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 4, width: 160 },
  signatureLabel: { fontSize: 8, color: C.muted, textAlign: 'right' },
})

// ─── Component ───────────────────────────────────────────
export function InvoicePdfDocument({ invoice, businessInfo }: InvoicePdfDocumentProps) {
  const { customerSnapshot: cust, lineItems, currency } = invoice
  const taxLabel = invoice.taxMode === 'inclusive' ? 'Tax (Inclusive)' : 'Tax'
  const hasDiscount = (invoice.totalDiscount ?? 0) > 0
  const hasAmountPaid = (invoice.amountPaid ?? 0) > 0

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.companyBlock}>
            {businessInfo?.logoUrl && (
              <Image src={businessInfo.logoUrl} style={{ height: 36, marginBottom: 6 }} />
            )}
            {businessInfo?.companyName && (
              <Text style={s.companyName}>{businessInfo.companyName}</Text>
            )}
            {businessInfo?.companyAddress && (
              <Text style={s.companyDetail}>{businessInfo.companyAddress}</Text>
            )}
            {businessInfo?.companyPhone && (
              <Text style={s.companyDetail}>{businessInfo.companyPhone}</Text>
            )}
            {businessInfo?.companyEmail && (
              <Text style={s.companyDetail}>{businessInfo.companyEmail}</Text>
            )}
            {businessInfo?.registrationNumber && (
              <Text style={s.companyDetail}>Reg: {businessInfo.registrationNumber}</Text>
            )}
            {businessInfo?.taxId && (
              <Text style={s.companyDetail}>Tax ID: {businessInfo.taxId}</Text>
            )}
          </View>
          <View>
            <Text style={s.invoiceTitle}>INVOICE</Text>
            <Text style={s.invoiceNumber}>{invoice.invoiceNumber}</Text>
          </View>
        </View>

        <View style={s.separator} />

        {/* ── Bill To + Invoice Details ── */}
        <View style={s.twoCol}>
          {/* Bill To */}
          <View style={s.colHalf}>
            <Text style={s.sectionLabel}>Bill To</Text>
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>
              {cust.businessName}
            </Text>
            {cust.contactPerson && <Text style={s.companyDetail}>{cust.contactPerson}</Text>}
            {cust.address && <Text style={s.companyDetail}>{cust.address}</Text>}
            {cust.email && <Text style={s.companyDetail}>{cust.email}</Text>}
            {cust.phone && <Text style={s.companyDetail}>{cust.phone}</Text>}
            {cust.taxId && <Text style={s.companyDetail}>Tax ID: {cust.taxId}</Text>}
          </View>

          {/* Invoice Details */}
          <View style={s.colHalf}>
            <Text style={s.sectionLabel}>Invoice Details</Text>
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Invoice Date:</Text>
              <Text style={s.detailValue}>{formatBusinessDate(invoice.invoiceDate)}</Text>
            </View>
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Due Date:</Text>
              <Text style={s.detailValue}>{formatBusinessDate(invoice.dueDate)}</Text>
            </View>
            {invoice.paymentTerms && (
              <View style={s.detailRow}>
                <Text style={s.detailLabel}>Payment Terms:</Text>
                <Text style={s.detailValue}>
                  {invoice.paymentTerms.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                </Text>
              </View>
            )}
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Currency:</Text>
              <Text style={s.detailValue}>{currency}</Text>
            </View>
          </View>
        </View>

        <View style={s.separator} />

        {/* ── Line Items Table ── */}
        <View style={s.tableHeader}>
          <Text style={[s.thText, s.colCode]}>Code</Text>
          <Text style={[s.thText, s.colDesc]}>Description</Text>
          <Text style={[s.thText, s.colQty]}>Qty</Text>
          <Text style={[s.thText, s.colPrice]}>Unit Price</Text>
          <Text style={[s.thText, s.colTax]}>Tax</Text>
          <Text style={[s.thText, s.colAmount]}>Amount</Text>
        </View>
        {lineItems.map((item, i) => (
          <View key={i} style={s.tableRow}>
            <Text style={[s.tdMuted, s.colCode]}>{item.itemCode || '-'}</Text>
            <View style={s.colDesc}>
              <Text style={s.tdText}>{item.description}</Text>
              {item.unitMeasurement && (
                <Text style={{ fontSize: 7, color: C.muted }}>Unit: {item.unitMeasurement}</Text>
              )}
              {item.supplyDateStart && item.supplyDateEnd && (
                <Text style={{ fontSize: 7, color: C.muted }}>
                  {formatBusinessDate(item.supplyDateStart)} – {formatBusinessDate(item.supplyDateEnd)}
                </Text>
              )}
              {(item.discountAmount ?? 0) > 0 && (
                <Text style={{ fontSize: 7, color: C.muted }}>
                  Discount: -{formatCurrency(item.discountAmount, currency)}
                </Text>
              )}
            </View>
            <Text style={[s.tdText, s.colQty]}>{String(item.quantity)}</Text>
            <Text style={[s.tdText, s.colPrice]}>{formatCurrency(item.unitPrice, currency)}</Text>
            <Text style={[s.tdMuted, s.colTax]}>
              {item.taxRate != null && item.taxRate > 0
                ? `${(item.taxRate * 100).toFixed(1)}%`
                : '-'}
            </Text>
            <Text style={[s.tdText, s.colAmount, { fontFamily: 'Helvetica-Bold' }]}>
              {formatCurrency(item.totalAmount, currency)}
            </Text>
          </View>
        ))}

        {/* ── Totals ── */}
        <View style={s.totalsBlock}>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Subtotal</Text>
            <Text style={s.totalsValue}>{formatCurrency(invoice.subtotal, currency)}</Text>
          </View>
          {hasDiscount && (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Discount</Text>
              <Text style={s.totalsValue}>-{formatCurrency(invoice.totalDiscount, currency)}</Text>
            </View>
          )}
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>{taxLabel}</Text>
            <Text style={s.totalsValue}>{formatCurrency(invoice.totalTax, currency)}</Text>
          </View>
          <View style={[s.totalsRow, s.totalsBorder]}>
            <Text style={s.grandTotalLabel}>Total</Text>
            <Text style={s.grandTotalValue}>{formatCurrency(invoice.totalAmount, currency)}</Text>
          </View>
          {hasAmountPaid && (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Amount Paid</Text>
              <Text style={s.totalsValue}>-{formatCurrency(invoice.amountPaid, currency)}</Text>
            </View>
          )}
          {hasAmountPaid && (
            <View style={[s.totalsRow, s.totalsBorder]}>
              <Text style={s.grandTotalLabel}>Balance Due</Text>
              <Text style={s.grandTotalValue}>{formatCurrency(invoice.balanceDue, currency)}</Text>
            </View>
          )}
          {!hasAmountPaid && (
            <View style={[s.totalsRow, s.totalsBorder]}>
              <Text style={s.grandTotalLabel}>Balance Due</Text>
              <Text style={s.grandTotalValue}>{formatCurrency(invoice.balanceDue, currency)}</Text>
            </View>
          )}
        </View>

        {/* ── Notes ── */}
        {invoice.notes && (
          <View style={s.footerSection}>
            <Text style={s.sectionLabel}>Notes</Text>
            <Text style={s.footerText}>{invoice.notes}</Text>
          </View>
        )}

        {/* ── Payment Instructions ── */}
        {invoice.paymentInstructions && (
          <View style={s.footerSection}>
            <Text style={s.sectionLabel}>Payment Instructions</Text>
            <Text style={s.footerText}>{invoice.paymentInstructions}</Text>
          </View>
        )}

        {/* ── Custom Fields ── */}
        {invoice.customFields && invoice.customFields.length > 0 && (
          <View style={[s.footerSection, { marginTop: 12 }]}>
            <Text style={s.sectionLabel}>Additional Information</Text>
            {invoice.customFields.map((field, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text style={{ fontSize: 9, color: C.muted }}>{field.key}</Text>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold' }}>{field.value}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Footer ── */}
        {invoice.footer && (
          <View style={{ marginTop: 16, borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 8 }}>
            <Text style={{ fontSize: 8, color: C.muted, textAlign: 'center' }}>{invoice.footer}</Text>
          </View>
        )}

        {/* ── Signature ── */}
        {invoice.signatureName && (
          <View style={s.signatureBlock}>
            <Text style={s.signatureName}>{invoice.signatureName}</Text>
            <View style={s.signatureLine}>
              <Text style={s.signatureLabel}>Authorized Signature</Text>
            </View>
          </View>
        )}
      </Page>
    </Document>
  )
}
