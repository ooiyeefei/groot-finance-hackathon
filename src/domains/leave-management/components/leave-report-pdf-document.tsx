/**
 * 034-leave-enhance: PDF Document Template for Leave Reports
 *
 * Uses @react-pdf/renderer to generate downloadable PDFs.
 * Follows the use-invoice-pdf.ts pattern (dynamic import + blob).
 */

import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 20,
  },
  businessName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  reportTitle: {
    fontSize: 14,
    color: '#444',
    marginBottom: 4,
  },
  dateRange: {
    fontSize: 10,
    color: '#666',
    marginBottom: 16,
  },
  table: {
    width: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  headerCell: {
    fontWeight: 'bold',
    fontSize: 9,
    color: '#374151',
  },
  cell: {
    fontSize: 9,
    color: '#111827',
  },
  // Column widths for balance summary
  colName: { width: '20%' },
  colTeam: { width: '15%' },
  colType: { width: '15%' },
  colNum: { width: '10%', textAlign: 'right' },
  // Column widths for utilization
  colTeamWide: { width: '25%' },
  colMembers: { width: '15%', textAlign: 'right' },
  colEntitled: { width: '15%', textAlign: 'right' },
  colUsed: { width: '15%', textAlign: 'right' },
  colRate: { width: '15%', textAlign: 'right' },
  // Column widths for trends
  colMonth: { width: '20%' },
  colDays: { width: '20%', textAlign: 'right' },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: '#9ca3af',
    textAlign: 'center',
  },
});

interface LeaveReportPdfProps {
  reportType: string;
  data: any;
  businessName: string;
}

export function LeaveReportPdfDocument({ reportType, data, businessName }: LeaveReportPdfProps) {
  const titleMap: Record<string, string> = {
    balance: 'Leave Balance Summary',
    utilization: 'Leave Utilization Report',
    trends: 'Absence Trends Report',
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.businessName}>{businessName}</Text>
          <Text style={styles.reportTitle}>{titleMap[reportType] || 'Leave Report'}</Text>
          <Text style={styles.dateRange}>
            Period: {data.yearLabel || data.year} | Generated: {new Date().toLocaleDateString()}
          </Text>
        </View>

        {/* Balance Summary Table */}
        {reportType === 'balance' && data.employees && (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.headerCell, styles.colName]}>Employee</Text>
              <Text style={[styles.headerCell, styles.colTeam]}>Team</Text>
              <Text style={[styles.headerCell, styles.colType]}>Leave Type</Text>
              <Text style={[styles.headerCell, styles.colNum]}>Entitled</Text>
              <Text style={[styles.headerCell, styles.colNum]}>Used</Text>
              <Text style={[styles.headerCell, styles.colNum]}>Adj.</Text>
              <Text style={[styles.headerCell, styles.colNum]}>C/O</Text>
              <Text style={[styles.headerCell, styles.colNum]}>Remaining</Text>
            </View>
            {data.employees.flatMap((emp: any) =>
              emp.balances.map((bal: any, i: number) => (
                <View key={`${emp.userId}-${i}`} style={styles.tableRow}>
                  <Text style={[styles.cell, styles.colName]}>{i === 0 ? emp.userName : ''}</Text>
                  <Text style={[styles.cell, styles.colTeam]}>{i === 0 ? emp.teamName : ''}</Text>
                  <Text style={[styles.cell, styles.colType]}>{bal.leaveTypeName}</Text>
                  <Text style={[styles.cell, styles.colNum]}>{bal.entitled}</Text>
                  <Text style={[styles.cell, styles.colNum]}>{bal.used}</Text>
                  <Text style={[styles.cell, styles.colNum]}>{bal.adjustments}</Text>
                  <Text style={[styles.cell, styles.colNum]}>{bal.carryover}</Text>
                  <Text style={[styles.cell, styles.colNum]}>{bal.remaining}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* Utilization Table */}
        {reportType === 'utilization' && data.teams && (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.headerCell, styles.colTeamWide]}>Team</Text>
              <Text style={[styles.headerCell, styles.colMembers]}>Members</Text>
              <Text style={[styles.headerCell, styles.colEntitled]}>Entitled</Text>
              <Text style={[styles.headerCell, styles.colUsed]}>Used</Text>
              <Text style={[styles.headerCell, styles.colRate]}>Utilization %</Text>
            </View>
            {data.teams.map((team: any, i: number) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.cell, styles.colTeamWide]}>{team.teamName}</Text>
                <Text style={[styles.cell, styles.colMembers]}>{team.memberCount}</Text>
                <Text style={[styles.cell, styles.colEntitled]}>{team.totalEntitled}</Text>
                <Text style={[styles.cell, styles.colUsed]}>{team.totalUsed}</Text>
                <Text style={[styles.cell, styles.colRate]}>{team.utilizationRate}%</Text>
              </View>
            ))}
          </View>
        )}

        {/* Trends Table */}
        {reportType === 'trends' && data.months && (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.headerCell, styles.colMonth]}>Month</Text>
              <Text style={[styles.headerCell, styles.colDays]}>Total Absence Days</Text>
            </View>
            {data.months.map((month: any, i: number) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.cell, styles.colMonth]}>{month.month}</Text>
                <Text style={[styles.cell, styles.colDays]}>{month.totalAbsenceDays}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer}>
          {businessName} — {titleMap[reportType] || 'Leave Report'} — Generated by Groot Finance
        </Text>
      </Page>
    </Document>
  );
}
