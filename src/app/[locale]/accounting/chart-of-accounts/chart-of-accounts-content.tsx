'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useChartOfAccounts } from '@/domains/accounting/hooks/use-chart-of-accounts'
import { Plus, Edit, Archive } from 'lucide-react'
import { toast } from 'sonner'

// Tooltip for icon buttons
function Tooltip({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <span className="relative group">
      {children}
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs bg-popover text-popover-foreground border border-border rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
        {label}
      </span>
    </span>
  )
}

type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'

const ACCOUNT_TYPE_OPTIONS: { value: AccountType; label: string; range: string; normalBalance: 'debit' | 'credit' }[] = [
  { value: 'Asset', label: 'Asset', range: '1000-1999', normalBalance: 'debit' },
  { value: 'Liability', label: 'Liability', range: '2000-2999', normalBalance: 'credit' },
  { value: 'Equity', label: 'Equity', range: '3000-3999', normalBalance: 'credit' },
  { value: 'Revenue', label: 'Revenue', range: '4000-4999', normalBalance: 'credit' },
  { value: 'Expense', label: 'Expense', range: '5000-5999', normalBalance: 'debit' },
]

export default function ChartOfAccountsContent() {
  const { businessId, accounts, isLoading, createAccount, updateAccount, deactivateAccount } =
    useChartOfAccounts()

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<any>(null)

  const [formData, setFormData] = useState({
    accountCode: '',
    accountName: '',
    accountType: 'Asset' as AccountType,
    description: '',
  })

  const resetForm = () => {
    setFormData({
      accountCode: '',
      accountName: '',
      accountType: 'Asset',
      description: '',
    })
  }

  const handleCreate = async () => {
    try {
      const normalBalance = ACCOUNT_TYPE_OPTIONS.find((t) => t.value === formData.accountType)?.normalBalance || 'debit'
      await createAccount({
        businessId: businessId as any,
        accountCode: formData.accountCode,
        accountName: formData.accountName,
        accountType: formData.accountType,
        normalBalance,
        description: formData.description || undefined,
      })
      toast.success('Account created successfully')
      setIsCreateDialogOpen(false)
      resetForm()
    } catch (error: any) {
      toast.error(error.message || 'Failed to create account')
    }
  }

  const handleEdit = async () => {
    if (!selectedAccount) return

    try {
      await updateAccount({
        accountId: selectedAccount._id as any,
        accountName: formData.accountName,
        description: formData.description || undefined,
      })
      toast.success('Account updated successfully')
      setIsEditDialogOpen(false)
      setSelectedAccount(null)
      resetForm()
    } catch (error: any) {
      toast.error(error.message || 'Failed to update account')
    }
  }

  const [deactivateTarget, setDeactivateTarget] = useState<string | null>(null)

  const handleDeactivateConfirm = async () => {
    if (!deactivateTarget) return
    try {
      await deactivateAccount({ accountId: deactivateTarget as any })
      toast.success('Account deactivated successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to deactivate account')
    } finally {
      setDeactivateTarget(null)
    }
  }

  const openEditDialog = (account: any) => {
    setSelectedAccount(account)
    setFormData({
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType,
      description: account.description || '',
    })
    setIsEditDialogOpen(true)
  }

  const getAccountTypeBadge = (type: AccountType) => {
    const colors = {
      Asset: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30',
      Liability: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30',
      Equity: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30',
      Revenue: 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30',
      Expense: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30',
    }
    return colors[type] || ''
  }

  const groupedAccounts = ACCOUNT_TYPE_OPTIONS.reduce((acc, type) => {
    acc[type.value] = accounts.filter((a: any) => a.accountType === type.value)
    return acc
  }, {} as Record<AccountType, any[]>)

  if (isLoading) {
    return (
      <div>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Chart of Accounts</h1>

        <Button onClick={() => setIsCreateDialogOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
          <Plus className="w-4 h-4 mr-2" />
          New Account
        </Button>
      </div>

      <div className="space-y-6">
        {ACCOUNT_TYPE_OPTIONS.map((type) => {
          const typeAccounts = groupedAccounts[type.value]
          if (typeAccounts.length === 0) return null

          return (
            <Card key={type.value}>
              <CardHeader className="border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">
                    {type.label} Accounts
                    <span className="ml-2 text-sm text-muted-foreground font-normal">
                      ({type.range})
                    </span>
                  </CardTitle>
                  <Badge className={getAccountTypeBadge(type.value)}>
                    {typeAccounts.length} accounts
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-medium text-foreground">
                          Code
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-medium text-foreground">
                          Account Name
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-medium text-foreground">
                          Description
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-medium text-foreground">
                          Status
                        </th>
                        <th className="px-6 py-3 text-right text-sm font-medium text-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {typeAccounts.map((account: any) => (
                        <tr
                          key={account._id}
                          className="border-b border-border hover:bg-muted/50"
                        >
                          <td className="px-6 py-4 text-sm font-mono text-foreground">
                            {account.accountCode}
                          </td>
                          <td className="px-6 py-4 text-sm text-foreground font-medium">
                            {account.accountName}
                          </td>
                          <td className="px-6 py-4 text-sm text-muted-foreground">
                            {account.description || '—'}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            {account.isSystemAccount && (
                              <Badge
                                variant="outline"
                                className="mr-2 text-xs"
                              >
                                System
                              </Badge>
                            )}
                            <Badge
                              className={
                                account.isActive
                                  ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30'
                                  : 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/30'
                              }
                            >
                              {account.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-sm text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <Tooltip label="Edit account">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditDialog(account)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                              </Tooltip>
                              {!account.isSystemAccount && account.isActive && (
                                <Tooltip label="Deactivate account">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDeactivateTarget(account._id)}
                                  >
                                    <Archive className="w-4 h-4" />
                                  </Button>
                                </Tooltip>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Create Account Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Account</DialogTitle>
            <DialogDescription>
              Add a new account to your chart of accounts. Account codes must be unique.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Account Type</Label>
              <Select
                value={formData.accountType}
                onValueChange={(value: AccountType) =>
                  setFormData({ ...formData, accountType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPE_OPTIONS.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label} ({type.range})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Account Code</Label>
              <Input
                placeholder="e.g., 1100"
                value={formData.accountCode}
                onChange={(e) =>
                  setFormData({ ...formData, accountCode: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Must be 4 digits within the selected type range
              </p>
            </div>

            <div>
              <Label>Account Name</Label>
              <Input
                placeholder="e.g., Petty Cash"
                value={formData.accountName}
                onChange={(e) =>
                  setFormData({ ...formData, accountName: e.target.value })
                }
              />
            </div>

            <div>
              <Label>Description (Optional)</Label>
              <Input
                placeholder="Account description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button className="bg-secondary hover:bg-secondary/80 text-secondary-foreground" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              Create Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Account Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
            <DialogDescription>
              Update account details. Account code and type cannot be changed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Account Code</Label>
              <Input value={formData.accountCode} disabled />
            </div>

            <div>
              <Label>Account Type</Label>
              <Input
                value={ACCOUNT_TYPE_OPTIONS.find((t) => t.value === formData.accountType)?.label}
                disabled
              />
            </div>

            <div>
              <Label>Account Name</Label>
              <Input
                placeholder="Account name"
                value={formData.accountName}
                onChange={(e) =>
                  setFormData({ ...formData, accountName: e.target.value })
                }
              />
            </div>

            <div>
              <Label>Description (Optional)</Label>
              <Input
                placeholder="Account description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button className="bg-secondary hover:bg-secondary/80 text-secondary-foreground" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation Dialog */}
      <Dialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Deactivate Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate this account? Deactivated accounts won&apos;t appear in dropdowns but existing journal entries are preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="bg-secondary hover:bg-secondary/80 text-secondary-foreground" onClick={() => setDeactivateTarget(null)}>
              Cancel
            </Button>
            <Button className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={handleDeactivateConfirm}>
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
