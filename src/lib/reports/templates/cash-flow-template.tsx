/**
 * Cash Flow Report PDF Template
 *
 * Shows opening balance, inflows, outflows, net change, closing balance.
 * Sourced from bank_transactions and journal_entry_lines (1000 Cash).
 */
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from '@react-pdf/renderer'
import { formatCurrency } from '@/lib/utils/format-number'

export interface CashFlowReportData {
  businessName: string
  currency: string
  periodStart: string
  periodEnd: string
  generatedAt: string
  openingBalance: number
  inflows: Array<{ category: string; amount: number }>
  outflows: Array<{ category: string; amount: number }>
  totalInflows: number
  totalOutflows: number
  netChange: number
  closingBalance: number
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 20 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 11, color: '#666', marginBottom: 2 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', marginTop: 16, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#ddd', paddingBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, paddingHorizontal: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: '#333', marginTop: 4, fontWeight: 'bold' },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 4, borderTopWidth: 2, borderTopColor: '#000', marginTop: 8, fontWeight: 'bold', fontSize: 12 },
  label: { flex: 1 },
  amount: { width: 100, textAlign: 'right' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, color: '#999', textAlign: 'center' },
})

export function CashFlowReportDocument({ data }: { data: CashFlowReportData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Cash Flow Statement</Text>
          <Text style={styles.subtitle}>{data.businessName}</Text>
          <Text style={styles.subtitle}>Period: {data.periodStart} to {data.periodEnd}</Text>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.label}>Opening Cash Balance</Text>
          <Text style={styles.amount}>{formatCurrency(data.openingBalance, data.currency)}</Text>
        </View>

        <Text style={styles.sectionTitle}>Cash Inflows</Text>
        {data.inflows.map((item, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.label}>{item.category}</Text>
            <Text style={styles.amount}>{formatCurrency(item.amount, data.currency)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.label}>Total Inflows</Text>
          <Text style={styles.amount}>{formatCurrency(data.totalInflows, data.currency)}</Text>
        </View>

        <Text style={styles.sectionTitle}>Cash Outflows</Text>
        {data.outflows.map((item, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.label}>{item.category}</Text>
            <Text style={styles.amount}>{formatCurrency(Math.abs(item.amount), data.currency)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.label}>Total Outflows</Text>
          <Text style={styles.amount}>({formatCurrency(Math.abs(data.totalOutflows), data.currency)})</Text>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.label}>Net Cash Change</Text>
          <Text style={styles.amount}>{formatCurrency(data.netChange, data.currency)}</Text>
        </View>

        <View style={styles.grandTotalRow}>
          <Text style={styles.label}>Closing Cash Balance</Text>
          <Text style={styles.amount}>{formatCurrency(data.closingBalance, data.currency)}</Text>
        </View>

        <Text style={styles.footer}>
          Generated {data.generatedAt} · Groot Finance
        </Text>
      </Page>
    </Document>
  )
}
