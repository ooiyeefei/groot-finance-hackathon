/**
 * Expense Summary Report PDF Template
 *
 * Shows expense claims grouped by category and claimant
 * for the reporting period.
 */
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from '@react-pdf/renderer'
import { formatCurrency } from '@/lib/utils/format-number'

export interface ExpenseSummaryReportData {
  businessName: string
  currency: string
  periodStart: string
  periodEnd: string
  generatedAt: string
  byCategory: Array<{
    category: string
    claimCount: number
    totalAmount: number
  }>
  byClaimant: Array<{
    claimantName: string
    claimCount: number
    totalAmount: number
  }>
  totalClaims: number
  totalAmount: number
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 20 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 11, color: '#666', marginBottom: 2 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', marginTop: 16, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#ddd', paddingBottom: 4 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 4, marginBottom: 4, fontWeight: 'bold' },
  tableRow: { flexDirection: 'row', paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  totalRow: { flexDirection: 'row', paddingVertical: 4, borderTopWidth: 2, borderTopColor: '#000', marginTop: 4, fontWeight: 'bold' },
  colName: { flex: 2 },
  colCount: { width: 60, textAlign: 'right' },
  colAmount: { width: 100, textAlign: 'right' },
  summaryBox: { marginTop: 20, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 4 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  summaryLabel: { fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, color: '#999', textAlign: 'center' },
})

export function ExpenseSummaryReportDocument({ data }: { data: ExpenseSummaryReportData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Expense Summary</Text>
          <Text style={styles.subtitle}>{data.businessName}</Text>
          <Text style={styles.subtitle}>Period: {data.periodStart} to {data.periodEnd}</Text>
        </View>

        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Claims</Text>
            <Text>{data.totalClaims}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Amount</Text>
            <Text>{formatCurrency(data.totalAmount, data.currency)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>By Category</Text>
        <View style={styles.tableHeader}>
          <Text style={styles.colName}>Category</Text>
          <Text style={styles.colCount}>Claims</Text>
          <Text style={styles.colAmount}>Amount</Text>
        </View>
        {data.byCategory.map((item, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={styles.colName}>{item.category}</Text>
            <Text style={styles.colCount}>{item.claimCount}</Text>
            <Text style={styles.colAmount}>{formatCurrency(item.totalAmount, data.currency)}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>By Claimant</Text>
        <View style={styles.tableHeader}>
          <Text style={styles.colName}>Claimant</Text>
          <Text style={styles.colCount}>Claims</Text>
          <Text style={styles.colAmount}>Amount</Text>
        </View>
        {data.byClaimant.map((item, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={styles.colName}>{item.claimantName}</Text>
            <Text style={styles.colCount}>{item.claimCount}</Text>
            <Text style={styles.colAmount}>{formatCurrency(item.totalAmount, data.currency)}</Text>
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={styles.colName}>Total</Text>
          <Text style={styles.colCount}>{data.totalClaims}</Text>
          <Text style={styles.colAmount}>{formatCurrency(data.totalAmount, data.currency)}</Text>
        </View>

        {data.totalClaims === 0 && (
          <View style={{ marginTop: 20, alignItems: 'center' }}>
            <Text style={{ color: '#999' }}>No expense claims for this period.</Text>
          </View>
        )}

        <Text style={styles.footer}>
          Generated {data.generatedAt} · Groot Finance
        </Text>
      </Page>
    </Document>
  )
}
