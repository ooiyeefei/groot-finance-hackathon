/**
 * Profit & Loss Report PDF Template
 *
 * Renders P&L from journal_entry_lines:
 * Revenue (4xxx), COGS (5xxx), Expenses (6xxx).
 * All amounts in home currency.
 */
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from '@react-pdf/renderer'
import { formatCurrency } from '@/lib/utils/format-number'

export interface PnlReportData {
  businessName: string
  currency: string
  periodStart: string
  periodEnd: string
  generatedAt: string
  revenue: Array<{ accountCode: string; accountName: string; amount: number }>
  cogs: Array<{ accountCode: string; accountName: string; amount: number }>
  expenses: Array<{ accountCode: string; accountName: string; amount: number }>
  totalRevenue: number
  totalCogs: number
  grossProfit: number
  totalExpenses: number
  netIncome: number
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

export function PnlReportDocument({ data }: { data: PnlReportData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Profit & Loss Statement</Text>
          <Text style={styles.subtitle}>{data.businessName}</Text>
          <Text style={styles.subtitle}>Period: {data.periodStart} to {data.periodEnd}</Text>
        </View>

        <Text style={styles.sectionTitle}>Revenue</Text>
        {data.revenue.map((item, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.label}>{item.accountCode} — {item.accountName}</Text>
            <Text style={styles.amount}>{formatCurrency(item.amount, data.currency)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.label}>Total Revenue</Text>
          <Text style={styles.amount}>{formatCurrency(data.totalRevenue, data.currency)}</Text>
        </View>

        <Text style={styles.sectionTitle}>Cost of Goods Sold</Text>
        {data.cogs.map((item, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.label}>{item.accountCode} — {item.accountName}</Text>
            <Text style={styles.amount}>{formatCurrency(item.amount, data.currency)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.label}>Total COGS</Text>
          <Text style={styles.amount}>{formatCurrency(data.totalCogs, data.currency)}</Text>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.label}>Gross Profit</Text>
          <Text style={styles.amount}>{formatCurrency(data.grossProfit, data.currency)}</Text>
        </View>

        <Text style={styles.sectionTitle}>Operating Expenses</Text>
        {data.expenses.map((item, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.label}>{item.accountCode} — {item.accountName}</Text>
            <Text style={styles.amount}>{formatCurrency(item.amount, data.currency)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.label}>Total Expenses</Text>
          <Text style={styles.amount}>{formatCurrency(data.totalExpenses, data.currency)}</Text>
        </View>

        <View style={styles.grandTotalRow}>
          <Text style={styles.label}>Net Income</Text>
          <Text style={styles.amount}>{formatCurrency(data.netIncome, data.currency)}</Text>
        </View>

        <Text style={styles.footer}>
          Generated {data.generatedAt} · Groot Finance
        </Text>
      </Page>
    </Document>
  )
}
