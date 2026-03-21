/**
 * AR Aging Report PDF Template
 *
 * Groups outstanding sales invoices by aging buckets:
 * Current, 1-30, 31-60, 61-90, 90+ days.
 */
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from '@react-pdf/renderer'
import { formatCurrency } from '@/lib/utils/format-number'

export interface ArAgingReportData {
  businessName: string
  currency: string
  periodEnd: string
  generatedAt: string
  customers: Array<{
    customerName: string
    current: number
    days30: number
    days60: number
    days90: number
    days120plus: number
    total: number
  }>
  totals: {
    current: number
    days30: number
    days60: number
    days90: number
    days120plus: number
    total: number
  }
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: 'Helvetica' },
  header: { marginBottom: 20 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 11, color: '#666', marginBottom: 2 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#000', paddingBottom: 4, marginBottom: 4, fontWeight: 'bold' },
  tableRow: { flexDirection: 'row', paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  totalRow: { flexDirection: 'row', paddingVertical: 4, borderTopWidth: 2, borderTopColor: '#000', marginTop: 4, fontWeight: 'bold' },
  colName: { flex: 2 },
  colAmount: { width: 70, textAlign: 'right' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, color: '#999', textAlign: 'center' },
})

export function ArAgingReportDocument({ data }: { data: ArAgingReportData }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Accounts Receivable Aging</Text>
          <Text style={styles.subtitle}>{data.businessName}</Text>
          <Text style={styles.subtitle}>As of {data.periodEnd}</Text>
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.colName}>Customer</Text>
          <Text style={styles.colAmount}>Current</Text>
          <Text style={styles.colAmount}>1-30 Days</Text>
          <Text style={styles.colAmount}>31-60 Days</Text>
          <Text style={styles.colAmount}>61-90 Days</Text>
          <Text style={styles.colAmount}>90+ Days</Text>
          <Text style={styles.colAmount}>Total</Text>
        </View>

        {data.customers.map((c, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={styles.colName}>{c.customerName}</Text>
            <Text style={styles.colAmount}>{c.current ? formatCurrency(c.current, data.currency) : '-'}</Text>
            <Text style={styles.colAmount}>{c.days30 ? formatCurrency(c.days30, data.currency) : '-'}</Text>
            <Text style={styles.colAmount}>{c.days60 ? formatCurrency(c.days60, data.currency) : '-'}</Text>
            <Text style={styles.colAmount}>{c.days90 ? formatCurrency(c.days90, data.currency) : '-'}</Text>
            <Text style={styles.colAmount}>{c.days120plus ? formatCurrency(c.days120plus, data.currency) : '-'}</Text>
            <Text style={styles.colAmount}>{formatCurrency(c.total, data.currency)}</Text>
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={styles.colName}>Total</Text>
          <Text style={styles.colAmount}>{formatCurrency(data.totals.current, data.currency)}</Text>
          <Text style={styles.colAmount}>{formatCurrency(data.totals.days30, data.currency)}</Text>
          <Text style={styles.colAmount}>{formatCurrency(data.totals.days60, data.currency)}</Text>
          <Text style={styles.colAmount}>{formatCurrency(data.totals.days90, data.currency)}</Text>
          <Text style={styles.colAmount}>{formatCurrency(data.totals.days120plus, data.currency)}</Text>
          <Text style={styles.colAmount}>{formatCurrency(data.totals.total, data.currency)}</Text>
        </View>

        {data.customers.length === 0 && (
          <View style={{ marginTop: 20, alignItems: 'center' }}>
            <Text style={{ color: '#999' }}>No outstanding receivables for this period.</Text>
          </View>
        )}

        <Text style={styles.footer}>
          Generated {data.generatedAt} · Groot Finance
        </Text>
      </Page>
    </Document>
  )
}
