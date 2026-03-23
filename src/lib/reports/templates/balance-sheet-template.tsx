/**
 * Balance Sheet Report PDF Template
 *
 * Renders Balance Sheet from journal_entry_lines:
 * Assets (1xxx), Liabilities (2xxx), Equity (3xxx).
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

export interface BalanceSheetReportData {
  businessName: string
  currency: string
  asOfDate: string
  generatedAt: string
  currentAssets: Array<{ accountCode: string; accountName: string; balance: number }>
  nonCurrentAssets: Array<{ accountCode: string; accountName: string; balance: number }>
  totalAssets: number
  currentLiabilities: Array<{ accountCode: string; accountName: string; balance: number }>
  nonCurrentLiabilities: Array<{ accountCode: string; accountName: string; balance: number }>
  totalLiabilities: number
  equity: Array<{ accountCode: string; accountName: string; balance: number }>
  retainedEarnings: number
  totalEquity: number
  totalLiabilitiesAndEquity: number
  balanced: boolean
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 20 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 11, color: '#666', marginBottom: 2 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', marginTop: 16, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#ddd', paddingBottom: 4 },
  subSectionTitle: { fontSize: 10, fontWeight: 'bold', marginTop: 8, marginBottom: 4, color: '#444' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, paddingHorizontal: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: '#333', marginTop: 4, fontWeight: 'bold' },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 4, borderTopWidth: 2, borderTopColor: '#000', marginTop: 8, fontWeight: 'bold', fontSize: 12 },
  label: { flex: 1 },
  amount: { width: 100, textAlign: 'right' },
  balanceStatus: { marginTop: 12, fontSize: 11, textAlign: 'center' },
  balanced: { color: '#16a34a' },
  unbalanced: { color: '#dc2626' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, color: '#999', textAlign: 'center' },
})

export function BalanceSheetReportDocument({ data }: { data: BalanceSheetReportData }) {
  const difference = Math.abs(data.totalAssets - data.totalLiabilitiesAndEquity)
  const currentAssetsTotal = data.currentAssets.reduce((sum, a) => sum + a.balance, 0)
  const nonCurrentAssetsTotal = data.nonCurrentAssets.reduce((sum, a) => sum + a.balance, 0)
  const currentLiabilitiesTotal = data.currentLiabilities.reduce((sum, a) => sum + a.balance, 0)
  const nonCurrentLiabilitiesTotal = data.nonCurrentLiabilities.reduce((sum, a) => sum + a.balance, 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Balance Sheet</Text>
          <Text style={styles.subtitle}>{data.businessName}</Text>
          <Text style={styles.subtitle}>As of {data.asOfDate}</Text>
        </View>

        {/* ASSETS */}
        <Text style={styles.sectionTitle}>ASSETS</Text>

        <Text style={styles.subSectionTitle}>Current Assets</Text>
        {data.currentAssets.map((item, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.label}>{item.accountCode} — {item.accountName}</Text>
            <Text style={styles.amount}>{formatCurrency(item.balance, data.currency)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.label}>Total Current Assets</Text>
          <Text style={styles.amount}>{formatCurrency(currentAssetsTotal, data.currency)}</Text>
        </View>

        <Text style={styles.subSectionTitle}>Non-Current Assets</Text>
        {data.nonCurrentAssets.map((item, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.label}>{item.accountCode} — {item.accountName}</Text>
            <Text style={styles.amount}>{formatCurrency(item.balance, data.currency)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.label}>Total Non-Current Assets</Text>
          <Text style={styles.amount}>{formatCurrency(nonCurrentAssetsTotal, data.currency)}</Text>
        </View>

        <View style={styles.grandTotalRow}>
          <Text style={styles.label}>Total Assets</Text>
          <Text style={styles.amount}>{formatCurrency(data.totalAssets, data.currency)}</Text>
        </View>

        {/* LIABILITIES */}
        <Text style={styles.sectionTitle}>LIABILITIES</Text>

        <Text style={styles.subSectionTitle}>Current Liabilities</Text>
        {data.currentLiabilities.map((item, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.label}>{item.accountCode} — {item.accountName}</Text>
            <Text style={styles.amount}>{formatCurrency(item.balance, data.currency)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.label}>Total Current Liabilities</Text>
          <Text style={styles.amount}>{formatCurrency(currentLiabilitiesTotal, data.currency)}</Text>
        </View>

        <Text style={styles.subSectionTitle}>Non-Current Liabilities</Text>
        {data.nonCurrentLiabilities.map((item, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.label}>{item.accountCode} — {item.accountName}</Text>
            <Text style={styles.amount}>{formatCurrency(item.balance, data.currency)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.label}>Total Non-Current Liabilities</Text>
          <Text style={styles.amount}>{formatCurrency(nonCurrentLiabilitiesTotal, data.currency)}</Text>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.label}>Total Liabilities</Text>
          <Text style={styles.amount}>{formatCurrency(data.totalLiabilities, data.currency)}</Text>
        </View>

        {/* EQUITY */}
        <Text style={styles.sectionTitle}>EQUITY</Text>

        {data.equity.map((item, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.label}>{item.accountCode} — {item.accountName}</Text>
            <Text style={styles.amount}>{formatCurrency(item.balance, data.currency)}</Text>
          </View>
        ))}
        <View style={styles.row}>
          <Text style={styles.label}>Retained Earnings</Text>
          <Text style={styles.amount}>{formatCurrency(data.retainedEarnings, data.currency)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.label}>Total Equity</Text>
          <Text style={styles.amount}>{formatCurrency(data.totalEquity, data.currency)}</Text>
        </View>

        <View style={styles.grandTotalRow}>
          <Text style={styles.label}>Total Liabilities & Equity</Text>
          <Text style={styles.amount}>{formatCurrency(data.totalLiabilitiesAndEquity, data.currency)}</Text>
        </View>

        <Text style={[styles.balanceStatus, data.balanced ? styles.balanced : styles.unbalanced]}>
          {data.balanced
            ? 'Assets = Liabilities + Equity: \u2713 Balanced'
            : `Assets \u2260 Liabilities + Equity: \u2717 Unbalanced (difference: ${formatCurrency(difference, data.currency)})`}
        </Text>

        <Text style={styles.footer}>
          Generated {data.generatedAt} · Groot Finance
        </Text>
      </Page>
    </Document>
  )
}
