'use client'

import { useState, useCallback } from 'react'
import { useQuery, useAction } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { useActiveBusiness } from '@/contexts/business-context'
import BankAccountsManager from './bank-accounts-manager'
import ReconciliationDashboard from './reconciliation-dashboard'
import ReconciliationSummary from './reconciliation-summary'
import BankImportButton from './bank-import-button'
import { Id } from '../../../../../convex/_generated/dataModel'
import { Landmark, Plus, RefreshCw, AlertTriangle, CheckCircle2, X, Sparkles, Brain } from 'lucide-react'
import AccountingTabs from '../../../../app/[locale]/accounting/accounting-tabs'

interface ImportNotification {
  type: 'success' | 'warning' | 'info'
  message: string
}

export default function BankReconTab() {
  const { businessId } = useActiveBusiness()
  const [selectedAccountId, setSelectedAccountId] = useState<Id<'bank_accounts'> | null>(null)
  const [showAccountManager, setShowAccountManager] = useState(false)
  const [isMatching, setIsMatching] = useState(false)
  const [isClassifying, setIsClassifying] = useState(false)
  const [notification, setNotification] = useState<ImportNotification | null>(null)

  const convexBusinessId = businessId as unknown as Id<'businesses'> | undefined

  const bankAccounts = useQuery(
    api.functions.bankAccounts.list,
    convexBusinessId ? { businessId: convexBusinessId } : 'skip'
  )

  const runMatching = useAction(api.functions.reconciliationMatches.runMatching)
  const classifyBatch = useAction(api.functions.bankTransactions.classifyBatch)

  const handleImportComplete = useCallback(async (summary: { imported: number; duplicatesSkipped: number }) => {
    // Show import result notification
    if (summary.duplicatesSkipped > 0) {
      setNotification({
        type: 'warning',
        message: `Imported ${summary.imported} transaction${summary.imported !== 1 ? 's' : ''}. ${summary.duplicatesSkipped} duplicate${summary.duplicatesSkipped !== 1 ? 's' : ''} skipped.`,
      })
    } else {
      setNotification({
        type: 'success',
        message: `Successfully imported ${summary.imported} transaction${summary.imported !== 1 ? 's' : ''}.`,
      })
    }

    // Auto-dismiss after 8 seconds
    setTimeout(() => setNotification(null), 8000)

    if (!convexBusinessId || !selectedAccountId) return

    // Run auto-matching first
    setIsMatching(true)
    setNotification({
      type: 'info',
      message: `Analyzing transactions for smart matches...`,
    })

    try {
      const matchResult = await runMatching({
        businessId: convexBusinessId,
        bankAccountId: selectedAccountId,
      })

      if (matchResult.matched > 0) {
        setNotification({
          type: 'success',
          message: `Found ${matchResult.matched} suggested match${matchResult.matched !== 1 ? 'es' : ''}. Now running AI classification...`,
        })
      }
    } catch (err) {
      console.error('Matching failed:', err)
    } finally {
      setIsMatching(false)
    }

    // Run AI classification on remaining unmatched
    setIsClassifying(true)
    setNotification({
      type: 'info',
      message: `Running AI classification on unmatched transactions...`,
    })

    try {
      const classifyResult = await classifyBatch({
        businessId: convexBusinessId,
        bankAccountId: selectedAccountId,
      })

      if (classifyResult.classified > 0) {
        setNotification({
          type: 'success',
          message: `AI classified ${classifyResult.classified} transaction${classifyResult.classified !== 1 ? 's' : ''}. Review suggested GL postings.`,
        })
      } else {
        setNotification({
          type: 'info',
          message: `No additional classifications found. You can manually categorize remaining transactions.`,
        })
      }

      setTimeout(() => setNotification(null), 8000)
    } catch (err) {
      console.error('Classification failed:', err)
      setNotification({
        type: 'warning',
        message: 'AI classification encountered an error. You can still manually classify transactions.',
      })
      setTimeout(() => setNotification(null), 6000)
    } finally {
      setIsClassifying(false)
    }
  }, [convexBusinessId, selectedAccountId, runMatching, classifyBatch])

  const handleRunMatching = useCallback(async () => {
    if (!convexBusinessId || !selectedAccountId) return
    setIsMatching(true)

    setNotification({
      type: 'info',
      message: `Re-analyzing unmatched transactions...`,
    })

    try {
      const matchResult = await runMatching({
        businessId: convexBusinessId,
        bankAccountId: selectedAccountId,
      })

      if (matchResult.matched > 0) {
        setNotification({
          type: 'success',
          message: `Found ${matchResult.matched} new suggested match${matchResult.matched !== 1 ? 'es' : ''}!`,
        })
      } else {
        setNotification({
          type: 'info',
          message: `No new matches found. All unmatched transactions have been analyzed.`,
        })
      }

      setTimeout(() => setNotification(null), 6000)
    } catch (err) {
      console.error('Matching failed:', err)
      setNotification({
        type: 'warning',
        message: 'Matching encountered an error. Please try again.',
      })
      setTimeout(() => setNotification(null), 6000)
    } finally {
      setIsMatching(false)
    }
  }, [convexBusinessId, selectedAccountId, runMatching])

  const handleRunClassification = useCallback(async () => {
    if (!convexBusinessId || !selectedAccountId) return
    setIsClassifying(true)

    setNotification({
      type: 'info',
      message: `Running AI classification on unmatched transactions...`,
    })

    try {
      const result = await classifyBatch({
        businessId: convexBusinessId,
        bankAccountId: selectedAccountId,
      })

      if (result.classified > 0) {
        setNotification({
          type: 'success',
          message: `AI classified ${result.classified} transaction${result.classified !== 1 ? 's' : ''}.${result.errors > 0 ? ` ${result.errors} could not be classified.` : ''}`,
        })
      } else {
        setNotification({
          type: 'info',
          message: `No unmatched transactions to classify.`,
        })
      }

      setTimeout(() => setNotification(null), 6000)
    } catch (err) {
      console.error('Classification failed:', err)
      setNotification({
        type: 'warning',
        message: 'AI classification encountered an error. Please try again.',
      })
      setTimeout(() => setNotification(null), 6000)
    } finally {
      setIsClassifying(false)
    }
  }, [convexBusinessId, selectedAccountId, classifyBatch])

  if (!convexBusinessId) {
    return (
      <div className="space-y-6">
        <AccountingTabs activeTab="bank-reconciliation" hideNewEntryButton />
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          Select a business to view bank reconciliation
        </div>
      </div>
    )
  }

  // Empty state: no bank accounts yet
  if (bankAccounts && bankAccounts.length === 0 && !showAccountManager) {
    return (
      <div className="space-y-6">
        <AccountingTabs activeTab="bank-reconciliation" hideNewEntryButton />
        <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <Landmark className="w-8 h-8 text-muted-foreground" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-foreground">No bank accounts</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Register your bank accounts to start importing statements and reconciling transactions against your accounting records.
          </p>
        </div>
        <button
          onClick={() => setShowAccountManager(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Bank Account
        </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AccountingTabs activeTab="bank-reconciliation" hideNewEntryButton />
      {/* Import notification banner */}
      {notification && (
        <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
          notification.type === 'warning'
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-600'
            : notification.type === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
            : 'border-blue-500/30 bg-blue-500/10 text-blue-600'
        }`}>
          {notification.type === 'warning' ? (
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          ) : notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <Sparkles className="w-4 h-4 flex-shrink-0" />
          )}
          <span className="flex-1">{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="p-0.5 rounded hover:bg-foreground/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top bar: Account selector + actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {/* Bank account selector */}
          <select
            value={selectedAccountId ?? ''}
            onChange={(e) => setSelectedAccountId(e.target.value as Id<'bank_accounts'> | null)}
            className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground"
          >
            <option value="">Select bank account</option>
            {bankAccounts?.map((acc) => (
              <option key={acc._id} value={acc._id}>
                {acc.bankName} — •••• {acc.accountNumberLast4} ({acc.currency})
                {acc.nickname ? ` — ${acc.nickname}` : ''}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowAccountManager(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-card hover:bg-muted text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Manage Accounts
          </button>
        </div>

        <div className="flex items-center gap-2">
          {selectedAccountId && (
            <>
              <BankImportButton
                businessId={convexBusinessId}
                bankAccountId={selectedAccountId}
                onImportComplete={handleImportComplete}
              />
              <button
                onClick={handleRunMatching}
                disabled={isMatching || isClassifying}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-card hover:bg-muted text-foreground transition-colors disabled:opacity-50"
                title="Re-run smart matching on unmatched transactions"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isMatching ? 'animate-spin' : ''}`} />
                {isMatching ? 'Matching...' : 'Re-match'}
              </button>
              <button
                onClick={handleRunClassification}
                disabled={isClassifying || isMatching}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-50"
                title="Run AI classification on unmatched transactions"
              >
                <Brain className={`w-3.5 h-3.5 ${isClassifying ? 'animate-pulse' : ''}`} />
                {isClassifying ? 'Classifying...' : 'AI Classify'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main content */}
      {selectedAccountId ? (
        <>
          <ReconciliationDashboard
            businessId={convexBusinessId}
            bankAccountId={selectedAccountId}
          />
          <ReconciliationSummary
            bankAccountId={selectedAccountId}
          />
        </>
      ) : (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          Select a bank account to view reconciliation
        </div>
      )}

      {/* Bank Accounts Manager Sheet */}
      {showAccountManager && (
        <BankAccountsManager
          businessId={convexBusinessId}
          onClose={() => setShowAccountManager(false)}
        />
      )}
    </div>
  )
}
