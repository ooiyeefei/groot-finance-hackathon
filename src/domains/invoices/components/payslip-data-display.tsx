'use client'

import { CheckCircle, Shield } from 'lucide-react'

interface PayslipLineItem {
  description: string
  amount: number
}

interface PayslipData {
  employee_name?: string
  ic_number?: string
  employee_code?: string
  pay_period?: string
  gross_wages?: number
  total_deductions?: number
  net_wages?: number
  employer_name?: string
  earnings_breakdown?: PayslipLineItem[]
  deductions_breakdown?: PayslipLineItem[]
  confidence_score?: number
  parsed_pay_date?: string
}

interface PayslipDataDisplayProps {
  data: PayslipData
}

export default function PayslipDataDisplay({ data }: PayslipDataDisplayProps) {
  const formatCurrency = (amount: number | undefined) => {
    if (!amount && amount !== 0) return 'N/A'
    return `MYR ${amount.toLocaleString('en-MY', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`
  }

  const hasData = (value: any) => value !== null && value !== undefined && value !== ''

  // Calculate stats for breakdown tables
  const earningsCount = data.earnings_breakdown?.length || 0
  const deductionsCount = data.deductions_breakdown?.length || 0
  const totalItems = earningsCount + deductionsCount

  return (
    <div className="mt-4 p-4 bg-record-layer-1 rounded-lg">
      {/* Summary View (Always Visible) - Key Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Employee Name */}
        {hasData(data.employee_name) && (
          <div>
            <label className="text-xs text-record-supporting uppercase tracking-wider font-medium mb-1 block">
              Employee Name
            </label>
            <div className="text-sm text-record-title bg-record-layer-2 px-3 py-2 rounded border border-record-border">
              {data.employee_name}
            </div>
          </div>
        )}

        {/* Pay Period */}
        {hasData(data.pay_period) && (
          <div>
            <label className="text-xs text-record-supporting uppercase tracking-wider font-medium mb-1 block">
              Pay Period
            </label>
            <div className="text-sm text-record-title bg-record-layer-2 px-3 py-2 rounded border border-record-border">
              {data.pay_period}
            </div>
          </div>
        )}

        {/* Net Wages */}
        {hasData(data.net_wages) && (
          <div>
            <label className="text-xs text-record-supporting uppercase tracking-wider font-medium mb-1 block">
              Net Wages
            </label>
            <div className="text-sm text-record-title bg-record-layer-2 px-3 py-2 rounded border border-record-border font-mono">
              {formatCurrency(data.net_wages)}
            </div>
          </div>
        )}

        {/* Employer Name */}
        {hasData(data.employer_name) && (
          <div>
            <label className="text-xs text-record-supporting uppercase tracking-wider font-medium mb-1 block">
              Employer Name
            </label>
            <div className="text-sm text-record-title bg-record-layer-2 px-3 py-2 rounded border border-record-border">
              {data.employer_name}
            </div>
          </div>
        )}
      </div>

      {/* Progress Summary */}
      {totalItems > 0 && (
        <div className="mb-4 p-3 bg-record-layer-2/50 rounded-lg">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-sm font-medium text-record-title">{earningsCount}</div>
              <div className="text-xs text-record-supporting">Earnings Items</div>
            </div>
            <div>
              <div className="text-sm font-medium text-record-title">{deductionsCount}</div>
              <div className="text-xs text-record-supporting">Deduction Items</div>
            </div>
          </div>
          <div className="mt-2 text-center">
            <span className="text-xs text-record-supporting">
              {totalItems} line items extracted
            </span>
          </div>
        </div>
      )}

      {/* Details */}
      <div className="space-y-6 pt-4 border-t border-record-border">
          {/* Basic Information */}
          <div>
            <h6 className="text-sm font-medium text-record-title mb-3">Basic Information</h6>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hasData(data.ic_number) && (
                <div>
                  <label className="text-xs text-record-supporting uppercase tracking-wider font-medium mb-1 block">
                    IC Number
                  </label>
                  <div className="text-sm text-record-title bg-record-layer-2 px-3 py-2 rounded border border-record-border font-mono">
                    {data.ic_number}
                  </div>
                </div>
              )}

              {hasData(data.employee_code) && (
                <div>
                  <label className="text-xs text-record-supporting uppercase tracking-wider font-medium mb-1 block">
                    Employee Code
                  </label>
                  <div className="text-sm text-record-title bg-record-layer-2 px-3 py-2 rounded border border-record-border font-mono">
                    {data.employee_code}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Financial Summary */}
          <div>
            <h6 className="text-sm font-medium text-record-title mb-3">Financial Summary</h6>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {hasData(data.gross_wages) && (
                <div>
                  <label className="text-xs text-record-supporting uppercase tracking-wider font-medium mb-1 block">
                    Gross Wages
                  </label>
                  <div className="text-sm text-record-title bg-record-layer-2 px-3 py-2 rounded border border-record-border font-mono">
                    {formatCurrency(data.gross_wages)}
                  </div>
                </div>
              )}

              {hasData(data.total_deductions) && (
                <div>
                  <label className="text-xs text-record-supporting uppercase tracking-wider font-medium mb-1 block">
                    Total Deductions
                  </label>
                  <div className="text-sm text-record-title bg-record-layer-2 px-3 py-2 rounded border border-record-border font-mono">
                    {formatCurrency(data.total_deductions)}
                  </div>
                </div>
              )}

              {hasData(data.net_wages) && (
                <div>
                  <label className="text-xs text-record-supporting uppercase tracking-wider font-medium mb-1 block">
                    Net Wages
                  </label>
                  <div className="text-sm text-record-title bg-record-layer-2 px-3 py-2 rounded border border-record-border font-mono font-semibold">
                    {formatCurrency(data.net_wages)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Earnings Breakdown */}
          {data.earnings_breakdown && data.earnings_breakdown.length > 0 && (
            <div>
              <h6 className="text-sm font-medium text-record-title mb-3">Earnings Breakdown</h6>
              <div className="bg-record-layer-2 rounded border border-record-border overflow-hidden">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-record-layer-1">
                      <th className="text-left text-xs text-record-supporting px-3 py-2 border-b border-record-border">
                        Description
                      </th>
                      <th className="text-right text-xs text-record-supporting px-3 py-2 border-b border-record-border">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.earnings_breakdown.map((item, index) => (
                      <tr key={index} className={index < data.earnings_breakdown!.length - 1 ? "border-b border-record-border/50" : ""}>
                        <td className="px-3 py-2 text-sm text-record-title">
                          {item.description}
                        </td>
                        <td className="px-3 py-2 text-sm text-record-title font-mono text-right">
                          {formatCurrency(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Deductions Breakdown */}
          {data.deductions_breakdown && data.deductions_breakdown.length > 0 && (
            <div>
              <h6 className="text-sm font-medium text-record-title mb-3">Deductions Breakdown</h6>
              <div className="bg-record-layer-2 rounded border border-record-border overflow-hidden">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-record-layer-1">
                      <th className="text-left text-xs text-record-supporting px-3 py-2 border-b border-record-border">
                        Description
                      </th>
                      <th className="text-right text-xs text-record-supporting px-3 py-2 border-b border-record-border">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.deductions_breakdown.map((item, index) => (
                      <tr key={index} className={index < data.deductions_breakdown!.length - 1 ? "border-b border-record-border/50" : ""}>
                        <td className="px-3 py-2 text-sm text-record-title">
                          {item.description}
                        </td>
                        <td className="px-3 py-2 text-sm text-record-title font-mono text-right">
                          {formatCurrency(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* AI Extraction Warning - Bottom Left Corner */}
          <div className="flex items-center gap-2 mt-4 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded">
            <span className="text-yellow-700 dark:text-yellow-400">⚠️</span>
            <span className="text-xs text-yellow-700 dark:text-yellow-300 font-medium">AI Extraction - Please verify accuracy</span>
          </div>
        </div>
    </div>
  )
}