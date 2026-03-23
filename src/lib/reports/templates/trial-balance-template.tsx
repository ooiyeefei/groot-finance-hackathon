/**
 * Trial Balance Report PDF Template
 *
 * Renders Trial Balance from journal_entry_lines:
 * All accounts with their debit/credit balances.
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

export interface TrialBalanceReportData {
  businessName: string
  currency: string
  asOfDate: string
  generatedAt: string
  lines: Array<{ accountCode: string; accountName: string; accountType: string; debitBalance: number; creditBalance: number }>
  totalDebits: number
  totalCredits: number
  balanced: boolean
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 20 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 11, color: '#666', marginBottom: 2 },
  tableHeader: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#333', fontWeight: 'bold', marginTop: 8 },
  row: { flexDirection: 'row', paddingVertical: 2, paddingHorizontal: 4 },
  totalRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4, borderTopWidth: 2, borderTopColor: '#000', marginTop: 4, fontWeight: 'bold', fontSize: 12 },
  colCode: { width: 80 },
  colName: { flex: 1 },
  colDebit: { width: 100, textAlign: 'right' },
  colCredit: { width: 100, textAlign: 'right' },
  balanceStatus: { marginTop: 12, fontSize: 11, textAlign: 'center' },
  balanced: { color: '#16a34a' },
  unbalanced: { color: '#dc2626' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, color: '#999', textAlign: 'center' },
})

export function TrialBalanceReportDocument({ data }: { data: TrialBalanceReportData }) {
  const difference = Math.abs(data.totalDebits - data.totalCredits)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Trial Balance</Text>
          <Text style={styles.subtitle}>{data.businessName}</Text>
          <Text style={styles.subtitle}>As of {data.asOfDate}</Text>
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.colCode}>Account Code</Text>
          <Text style={styles.colName}>Account Name</Text>
          <Text style={styles.colDebit}>Debit</Text>
          <Text style={styles.colCredit}>Credit</Text>
        </View>

        {data.lines.map((line, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.colCode}>{line.accountCode}</Text>
            <Text style={styles.colName}>{line.accountName}</Text>
            <Text style={styles.colDebit}>
              {line.debitBalance > 0 ? formatCurrency(line.debitBalance, data.currency) : ''}
            </Text>
            <Text style={styles.colCredit}>
              {line.creditBalance > 0 ? formatCurrency(line.creditBalance, data.currency) : ''}
            </Text>
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={styles.colCode} />
          <Text style={styles.colName}>Total</Text>
          <Text style={styles.colDebit}>{formatCurrency(data.totalDebits, data.currency)}</Text>
          <Text style={styles.colCredit}>{formatCurrency(data.totalCredits, data.currency)}</Text>
        </View>

        <Text style={[styles.balanceStatus, data.balanced ? styles.balanced : styles.unbalanced]}>
          {data.balanced
            ? '\u2713 Balanced'
            : `\u2717 Unbalanced (difference: ${formatCurrency(difference, data.currency)})`}
        </Text>

        <Text style={styles.footer}>
          Generated {data.generatedAt} · Groot Finance
        </Text>
      </Page>
    </Document>
  )
}
