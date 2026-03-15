'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { Id } from '../../../../../convex/_generated/dataModel'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Plus, Pencil, Trash2, RotateCcw, AlertTriangle } from 'lucide-react'

interface BankAccountsManagerProps {
  businessId: Id<'businesses'>
  onClose: () => void
}

export default function BankAccountsManager({ businessId, onClose }: BankAccountsManagerProps) {
  const accounts = useQuery(api.functions.bankAccounts.listAll, { businessId })
  const createAccount = useMutation(api.functions.bankAccounts.create)
  const updateAccount = useMutation(api.functions.bankAccounts.update)
  const deactivateAccount = useMutation(api.functions.bankAccounts.deactivate)
  const reactivateAccount = useMutation(api.functions.bankAccounts.reactivate)

  // Fetch asset-type COA entries for GL account linking
  const coaAccounts = useQuery(api.functions.chartOfAccounts.list, {
    businessId,
    accountType: 'Asset',
    isActive: true,
  })

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<Id<'bank_accounts'> | null>(null)
  const [formData, setFormData] = useState({
    bankName: '',
    accountNumber: '',
    currency: 'MYR',
    nickname: '',
    glAccountId: '' as string,
  })

  const resetForm = () => {
    setFormData({ bankName: '', accountNumber: '', currency: 'MYR', nickname: '', glAccountId: '' })
    setEditingId(null)
    setShowForm(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.bankName || !formData.accountNumber) return

    const glAccountId = formData.glAccountId
      ? (formData.glAccountId as Id<'chart_of_accounts'>)
      : undefined

    if (editingId) {
      await updateAccount({
        id: editingId,
        bankName: formData.bankName,
        accountNumber: formData.accountNumber,
        currency: formData.currency,
        nickname: formData.nickname || undefined,
        glAccountId,
      })
    } else {
      await createAccount({
        businessId,
        bankName: formData.bankName,
        accountNumber: formData.accountNumber,
        currency: formData.currency,
        nickname: formData.nickname || undefined,
        glAccountId,
      })
    }
    resetForm()
  }

  const handleEdit = (account: NonNullable<typeof accounts>[number]) => {
    setFormData({
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      currency: account.currency,
      nickname: account.nickname ?? '',
      glAccountId: (account as any).glAccountId ?? '',
    })
    setEditingId(account._id)
    setShowForm(true)
  }

  // Helper to resolve GL account name for display
  const getGLAccountName = (glAccountId?: Id<'chart_of_accounts'>) => {
    if (!glAccountId || !coaAccounts) return null
    const account = coaAccounts.find((a) => a._id === glAccountId)
    return account ? `${account.accountCode} — ${account.accountName}` : null
  }

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="w-[440px] sm:max-w-[440px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Bank Accounts</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Account list */}
          {accounts?.map((account) => {
            const glName = getGLAccountName((account as any).glAccountId)
            const hasGLLink = !!(account as any).glAccountId

            return (
              <div
                key={account._id}
                className={`rounded-lg border p-4 ${
                  account.status === 'inactive' ? 'opacity-50 border-dashed' : 'border-border'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-foreground">{account.bankName}</div>
                    <div className="text-sm text-muted-foreground">
                      •••• {account.accountNumberLast4} · {account.currency}
                    </div>
                    {account.nickname && (
                      <div className="text-xs text-muted-foreground mt-0.5">{account.nickname}</div>
                    )}
                    {glName ? (
                      <div className="text-xs text-primary mt-1">GL: {glName}</div>
                    ) : (
                      account.status === 'active' && (
                        <div className="flex items-center gap-1 text-xs text-amber-500 mt-1">
                          <AlertTriangle className="w-3 h-3" />
                          No GL link
                        </div>
                      )
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {account.transactionCount} transactions
                      {account.lastImportDate && ` · Last import: ${account.lastImportDate}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {account.status === 'active' ? (
                      <>
                        <button
                          onClick={() => handleEdit(account)}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deactivateAccount({ id: account._id })}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => reactivateAccount({ id: account._id })}
                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Add/Edit form */}
          {showForm ? (
            <form onSubmit={handleSubmit} className="rounded-lg border border-border p-4 space-y-3">
              <div className="text-sm font-medium text-foreground">
                {editingId ? 'Edit Bank Account' : 'Add Bank Account'}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Bank Name</label>
                <input
                  type="text"
                  value={formData.bankName}
                  onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                  placeholder="e.g., Maybank, CIMB"
                  className="mt-1 w-full h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Account Number</label>
                <input
                  type="text"
                  value={formData.accountNumber}
                  onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                  placeholder="e.g., 1234567890"
                  className="mt-1 w-full h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground"
                  required
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">Currency</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="mt-1 w-full h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground"
                  >
                    <option value="MYR">MYR</option>
                    <option value="USD">USD</option>
                    <option value="SGD">SGD</option>
                    <option value="THB">THB</option>
                    <option value="IDR">IDR</option>
                    <option value="PHP">PHP</option>
                    <option value="VND">VND</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">Nickname (optional)</label>
                  <input
                    type="text"
                    value={formData.nickname}
                    onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                    placeholder="e.g., Operating Account"
                    className="mt-1 w-full h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>
              {/* GL Account Selector */}
              <div>
                <label className="text-xs text-muted-foreground">GL Account (Cash at Bank)</label>
                <select
                  value={formData.glAccountId}
                  onChange={(e) => setFormData({ ...formData, glAccountId: e.target.value })}
                  className="mt-1 w-full h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground"
                >
                  <option value="">— Select GL Account —</option>
                  {coaAccounts?.map((coa) => (
                    <option key={coa._id} value={coa._id}>
                      {coa.accountCode} — {coa.accountName}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Link to the Cash at Bank account in your chart of accounts for automatic GL posting.
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
                >
                  {editingId ? 'Update' : 'Add Account'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-1.5 text-sm font-medium rounded-md bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-md border border-dashed border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Bank Account
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
