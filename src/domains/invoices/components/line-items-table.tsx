'use client'

// Native HTML table implementation - no external dependencies

interface TableColumn {
  key: string
  label: string
  width?: string
}

interface LineItemsTableProps {
  data: any[]
  columns: TableColumn[]
  className?: string
}

export default function LineItemsTable({ data, columns, className = '' }: LineItemsTableProps) {
  // Handle empty or invalid data
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className={`bg-gray-800 border border-gray-600 rounded-lg p-4 ${className}`}>
        <p className="text-sm text-gray-400 text-center">No line items available</p>
      </div>
    )
  }

  // Format currency values
  const formatCurrency = (value: any) => {
    if (value === null || value === undefined || value === '') return '-'
    const num = parseFloat(value)
    if (isNaN(num)) return value
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
      minimumFractionDigits: 2
    }).format(num)
  }

  // Format cell value based on column type
  const formatCellValue = (value: any, columnKey: string) => {
    if (value === null || value === undefined || value === '') return '-'

    if (columnKey.includes('price') || columnKey.includes('amount') || columnKey === 'total_price' || columnKey === 'unit_price') {
      return formatCurrency(value)
    }

    if (columnKey === 'quantity') {
      const num = parseFloat(value)
      return isNaN(num) ? value : num.toLocaleString()
    }

    return value.toString()
  }

  return (
    <div className={`bg-gray-800 border border-gray-600 rounded-lg overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-700">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider border-b border-gray-600"
                  style={{ width: column.width || 'auto' }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-600">
            {data.map((item, index) => (
              <tr
                key={index}
                className="hover:bg-gray-750 transition-colors"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className="px-4 py-3 text-gray-300 border-b border-gray-700"
                  >
                    <div className="truncate" title={formatCellValue(item[column.key], column.key)}>
                      {formatCellValue(item[column.key], column.key)}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary row for totals if applicable */}
      {data.length > 1 && (
        <div className="bg-gray-700 px-4 py-2 border-t border-gray-600">
          <p className="text-xs text-gray-400">
            Total items: <span className="text-gray-300 font-medium">{data.length}</span>
          </p>
        </div>
      )}
    </div>
  )
}