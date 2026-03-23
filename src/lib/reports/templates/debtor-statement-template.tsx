/**
 * Individual Debtor Statement PDF Template
 *
 * Per-customer statement showing their outstanding invoices,
 * aging breakdown, and total amount owed.
 * Part of 035-aging-payable-receivable-report feature.
 */
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from '@react-pdf/renderer'
import { formatCurrency } from '@/lib/utils/format-number'

export interface DebtorStatementData {
  businessName: string
  businessEmail: string
  currency: string
  asOfDate: string
  generatedAt: string
  customer: {
    name: string
    email?: string
    contactPerson?: string
  }
  invoices: Array<{
    invoiceNumber: string
    invoiceDate: string
    dueDate: string
    originalAmount: number
    paidAmount: number
    outstandingBalance: number
    daysOverdue: number
  }>
  agingTotals: {
    current: number
    days1to30: number
    days31to60: number
    days61to90: number
    days90plus: number
  }
  grandTotal: number
  hasDisclaimer: boolean
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: 'Helvetica' },
  header: { marginBottom: 20 },
  title: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 11, color: '#666', marginBottom: 2 },
  sectionTitle: { fontSize: 11, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  customerBox: { marginBottom: 16, padding: 10, backgroundColor: '#f8f8f8', borderRadius: 4 },
  customerName: { fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  customerDetail: { fontSize: 9, color: '#666' },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#000', paddingBottom: 4, marginBottom: 4, fontWeight: 'bold' },
  tableRow: { flexDirection: 'row', paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  totalRow: { flexDirection: 'row', paddingVertical: 4, borderTopWidth: 2, borderTopColor: '#000', marginTop: 4, fontWeight: 'bold' },
  colInvNo: { width: 80 },
  colDate: { width: 65 },
  colAmount: { width: 75, textAlign: 'right' },
  colDays: { width: 45, textAlign: 'right' },
  agingRow: { flexDirection: 'row', paddingVertical: 3 },
  agingLabel: { flex: 1 },
  agingAmount: { width: 90, textAlign: 'right', fontWeight: 'bold' },
  summaryBox: { marginTop: 16, padding: 12, backgroundColor: '#f0f4ff', borderRadius: 4 },
  summaryTotal: { fontSize: 14, fontWeight: 'bold', textAlign: 'right' },
  disclaimer: { marginTop: 16, padding: 8, backgroundColor: '#fff8e1', borderRadius: 4, fontSize: 8, color: '#b58900' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, color: '#999', textAlign: 'center' },
  contactNote: { marginTop: 12, fontSize: 8, color: '#666' },
})

export function DebtorStatementDocument({ data }: { data: DebtorStatementData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Statement of Account</Text>
          <Text style={styles.subtitle}>{data.businessName}</Text>
          <Text style={styles.subtitle}>As of {data.asOfDate}</Text>
        </View>

        {/* Customer info */}
        <View style={styles.customerBox}>
          <Text style={styles.customerName}>{data.customer.name}</Text>
          {data.customer.contactPerson && (
            <Text style={styles.customerDetail}>Attn: {data.customer.contactPerson}</Text>
          )}
          {data.customer.email && (
            <Text style={styles.customerDetail}>{data.customer.email}</Text>
          )}
        </View>

        {/* Outstanding invoices table */}
        <Text style={styles.sectionTitle}>Outstanding Invoices</Text>

        <View style={styles.tableHeader}>
          <Text style={styles.colInvNo}>Invoice #</Text>
          <Text style={styles.colDate}>Date</Text>
          <Text style={styles.colDate}>Due Date</Text>
          <Text style={styles.colAmount}>Original</Text>
          <Text style={styles.colAmount}>Paid</Text>
          <Text style={styles.colAmount}>Outstanding</Text>
          <Text style={styles.colDays}>Days</Text>
        </View>

        {data.invoices.map((inv, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={styles.colInvNo}>{inv.invoiceNumber}</Text>
            <Text style={styles.colDate}>{inv.invoiceDate}</Text>
            <Text style={styles.colDate}>{inv.dueDate}</Text>
            <Text style={styles.colAmount}>{formatCurrency(inv.originalAmount, data.currency)}</Text>
            <Text style={styles.colAmount}>{inv.paidAmount ? formatCurrency(inv.paidAmount, data.currency) : '-'}</Text>
            <Text style={styles.colAmount}>{formatCurrency(inv.outstandingBalance, data.currency)}</Text>
            <Text style={styles.colDays}>{inv.daysOverdue > 0 ? `${inv.daysOverdue}` : 'Current'}</Text>
          </View>
        ))}

        {/* Aging breakdown */}
        <Text style={styles.sectionTitle}>Aging Summary</Text>
        <View style={styles.agingRow}>
          <Text style={styles.agingLabel}>Current (not yet due)</Text>
          <Text style={styles.agingAmount}>{formatCurrency(data.agingTotals.current, data.currency)}</Text>
        </View>
        <View style={styles.agingRow}>
          <Text style={styles.agingLabel}>1 - 30 days overdue</Text>
          <Text style={styles.agingAmount}>{formatCurrency(data.agingTotals.days1to30, data.currency)}</Text>
        </View>
        <View style={styles.agingRow}>
          <Text style={styles.agingLabel}>31 - 60 days overdue</Text>
          <Text style={styles.agingAmount}>{formatCurrency(data.agingTotals.days31to60, data.currency)}</Text>
        </View>
        <View style={styles.agingRow}>
          <Text style={styles.agingLabel}>61 - 90 days overdue</Text>
          <Text style={styles.agingAmount}>{formatCurrency(data.agingTotals.days61to90, data.currency)}</Text>
        </View>
        <View style={styles.agingRow}>
          <Text style={styles.agingLabel}>Over 90 days overdue</Text>
          <Text style={styles.agingAmount}>{formatCurrency(data.agingTotals.days90plus, data.currency)}</Text>
        </View>

        {/* Grand total */}
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTotal}>
            Total Outstanding: {formatCurrency(data.grandTotal, data.currency)}
          </Text>
        </View>

        {/* Disclaimer for unreconciled payments */}
        {data.hasDisclaimer && (
          <View style={styles.disclaimer}>
            <Text>
              Note: If you have recently made a payment, it may not yet be reflected in this statement.
              Please contact us if you believe there is a discrepancy.
            </Text>
          </View>
        )}

        {/* Contact note */}
        <View style={styles.contactNote}>
          <Text>
            If you have any questions regarding this statement, please contact us at {data.businessEmail}.
          </Text>
        </View>

        {data.invoices.length === 0 && (
          <View style={{ marginTop: 20, alignItems: 'center' }}>
            <Text style={{ color: '#999' }}>No outstanding invoices for this period.</Text>
          </View>
        )}

        <Text style={styles.footer}>
          Generated {data.generatedAt} · Groot Finance
        </Text>
      </Page>
    </Document>
  )
}
