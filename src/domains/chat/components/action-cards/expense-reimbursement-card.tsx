'use client'

/**
 * Expense Reimbursement Card
 *
 * Lets finance admins mark approved expense claims as paid directly from chat.
 * Groups claims by employee, supports payment method and reference input.
 */

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Wallet, Check, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { registerActionCard, type ActionCardProps } from './registry'
import type { Id } from '@/convex/_generated/dataModel'

interface ClaimItem {
  claimId: string
  vendorName: string
  amount: number
  currency: string
  category?: string
  transactionDate?: string
}

interface EmployeeGroup {
  employeeName: string
  employeeId?: string
  claims: ClaimItem[]
  totalAmount: number
  currency: string
}

interface ReimbursementData {
  businessId: string
  employees: EmployeeGroup[]
  totalAmount: number
  currency: string
  claimCount: number
}

const PAYMENT_METHODS = [
  'Bank Transfer',
  'Cheque',
  'Cash',
  'DuitNow',
  'PayNow',
]

type CardState = 'idle' | 'confirm' | 'loading' | 'done' | 'error'

function ExpenseReimbursementCard({ action, isHistorical }: ActionCardProps) {
  const data = action.data as unknown as ReimbursementData
  const [cardState, setCardState] = useState<CardState>('idle')
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer')
  const [paymentReference, setPaymentReference] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<{ processedCount: number; skippedCount: number } | null>(null)

  const batchMarkAsPaid = useMutation(api.functions.expenseClaims.batchMarkAsPaid)

  if (!data?.businessId || !data?.employees || data.employees.length === 0) return null

  const allClaimIds = data.employees.flatMap((e) => e.claims.map((c) => c.claimId))

  const toggleEmployee = (name: string) => {
    setExpandedEmployees((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const handleMarkAsPaid = async () => {
    setCardState('loading')
    setErrorMsg('')

    try {
      const res = await batchMarkAsPaid({
        businessId: data.businessId as Id<'businesses'>,
        claimIds: allClaimIds as Id<'expense_claims'>[],
        paymentMethod,
        paymentReference: paymentReference.trim() || undefined,
      })
      setResult({ processedCount: res.processedCount, skippedCount: res.skippedCount })
      setCardState('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Operation failed')
      setCardState('error')
    }
  }

  const isDone = cardState === 'done'

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center gap-2">
        <Wallet className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-medium text-foreground">Expense Reimbursement</span>
        {isDone && (
          <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-600 dark:text-green-400">
            Paid
          </span>
        )}
      </div>

      {/* Summary */}
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between mb-1.5">
          <div>
            <p className="text-xs text-muted-foreground">
              {data.claimCount} approved {data.claimCount === 1 ? 'claim' : 'claims'} from{' '}
              {data.employees.length} {data.employees.length === 1 ? 'employee' : 'employees'}
            </p>
          </div>
          <span className="text-sm font-semibold text-foreground">
            {data.currency} {data.totalAmount?.toLocaleString() ?? '0'}
          </span>
        </div>

        {/* Employee groups */}
        <div className="space-y-1 mb-2.5">
          {data.employees.map((emp) => (
            <div key={emp.employeeName} className="border border-border rounded">
              <button
                type="button"
                onClick={() => toggleEmployee(emp.employeeName)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors"
              >
                <span className="font-medium text-foreground truncate mr-2">
                  {emp.employeeName}
                  <span className="text-muted-foreground font-normal ml-1">
                    ({emp.claims.length} {emp.claims.length === 1 ? 'claim' : 'claims'})
                  </span>
                </span>
                <span className="flex items-center gap-1 flex-shrink-0">
                  <span className="font-medium text-foreground">
                    {emp.currency} {emp.totalAmount?.toLocaleString() ?? '0'}
                  </span>
                  {expandedEmployees.has(emp.employeeName) ? (
                    <ChevronUp className="w-3 h-3 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  )}
                </span>
              </button>
              {expandedEmployees.has(emp.employeeName) && (
                <div className="border-t border-border px-2 py-1.5 space-y-1">
                  {emp.claims.map((claim) => (
                    <div key={claim.claimId} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate mr-2">
                        {claim.vendorName || 'Unknown vendor'}
                        {claim.transactionDate && (
                          <span className="ml-1">({claim.transactionDate})</span>
                        )}
                      </span>
                      <span className="text-foreground font-medium flex-shrink-0">
                        {claim.currency} {claim.amount?.toLocaleString() ?? '0'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Payment controls */}
        {!isHistorical && !isDone && (
          <>
            {(cardState === 'idle' || cardState === 'confirm') && (
              <div className="space-y-2">
                {/* Payment method */}
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="mt-0.5 w-full text-xs px-2 py-1.5 rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Payment reference */}
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Payment Reference (optional)
                  </label>
                  <input
                    type="text"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="e.g. TRF-20260319-001"
                    className="mt-0.5 w-full text-xs px-2 py-1.5 rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                {/* Buttons */}
                {cardState === 'idle' && (
                  <button
                    onClick={() => setCardState('confirm')}
                    className="w-full inline-flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground transition-colors font-medium"
                  >
                    <Check className="w-3 h-3" /> Mark as Paid
                  </button>
                )}

                {cardState === 'confirm' && (
                  <div className="bg-muted/50 border border-border rounded p-2">
                    <p className="text-xs text-foreground mb-2">
                      Mark {data.claimCount} {data.claimCount === 1 ? 'claim' : 'claims'} as paid
                      via {paymentMethod}?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleMarkAsPaid}
                        className="flex-1 text-xs px-3 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-colors"
                      >
                        Yes, Mark Paid
                      </button>
                      <button
                        onClick={() => setCardState('idle')}
                        className="flex-1 text-xs px-3 py-1.5 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Loading */}
            {cardState === 'loading' && (
              <div className="flex items-center justify-center gap-2 py-2 text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-xs">Processing reimbursement...</span>
              </div>
            )}

            {/* Error with retry */}
            {cardState === 'error' && (
              <div className="bg-destructive/10 border border-destructive/30 rounded p-2">
                <p className="text-xs text-destructive mb-1.5">{errorMsg}</p>
                <button
                  onClick={() => setCardState('idle')}
                  className="text-xs text-primary hover:text-primary/80 font-medium"
                >
                  Try again
                </button>
              </div>
            )}
          </>
        )}

        {/* Success state */}
        {isDone && result && (
          <div className="bg-green-500/10 border border-green-500/30 rounded p-2">
            <p className="text-xs text-green-700 dark:text-green-400">
              {result.processedCount} {result.processedCount === 1 ? 'claim' : 'claims'} marked as
              paid via {paymentMethod}.
              {result.skippedCount > 0 && (
                <span className="text-muted-foreground">
                  {' '}({result.skippedCount} skipped)
                </span>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Register the card type
registerActionCard('expense_reimbursement', ExpenseReimbursementCard)

export { ExpenseReimbursementCard }
