/**
 * CSV Export Utility
 *
 * Client-side CSV generation and download for action card data.
 * Numbers formatted as plain values for spreadsheet compatibility.
 */

import { downloadCsv } from '@/lib/capacitor/native-download'

/**
 * Generate a CSV file and trigger browser download.
 *
 * @param filename - The download filename (e.g., "spending-breakdown.csv")
 * @param headers - Column header names
 * @param rows - Data rows as arrays of string or number values
 */
export async function exportToCSV(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
): Promise<void> {
  const escapeCell = (value: string | number): string => {
    const str = String(value)
    // Wrap in quotes if the cell contains commas, quotes, or newlines
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const csvLines = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ]

  const csvString = csvLines.join('\n')
  await downloadCsv(csvString, filename)
}
