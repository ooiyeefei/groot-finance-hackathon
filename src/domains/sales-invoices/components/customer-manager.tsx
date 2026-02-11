'use client'

import { useState, useCallback, useMemo } from 'react'
import { Search, Plus, Pencil, Ban, RotateCcw, Users, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useActiveBusiness } from '@/contexts/business-context'
import { useCustomers, useCustomerMutations } from '../hooks/use-customers'
import CustomerForm from './customer-form'
import type { Customer } from '../types'
import { CUSTOMER_STATUSES } from '../types'
import type { Id } from '../../../../convex/_generated/dataModel'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormMode = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; customer: Customer }

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CustomerManager() {
  const { businessId } = useActiveBusiness()
  const [searchQuery, setSearchQuery] = useState('')
  const [formMode, setFormMode] = useState<FormMode>({ kind: 'closed' })
  const [actionLoadingIds, setActionLoadingIds] = useState<Set<string>>(new Set())

  // Data hooks
  const { customers, isLoading } = useCustomers({
    search: searchQuery || undefined,
  })
  const { createCustomer, updateCustomer, deactivateCustomer, reactivateCustomer } =
    useCustomerMutations()

  // -------------------------------------------------------------------------
  // Filtered customers based on local search
  // -------------------------------------------------------------------------

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers
    const q = searchQuery.toLowerCase()
    return customers.filter(
      (c: Customer) =>
        c.businessName.toLowerCase().includes(q) ||
        (c.contactPerson && c.contactPerson.toLowerCase().includes(q)) ||
        c.email.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)),
    )
  }, [customers, searchQuery])

  // -------------------------------------------------------------------------
  // Action helpers
  // -------------------------------------------------------------------------

  const withActionLoading = useCallback(
    async (id: string, fn: () => Promise<void>) => {
      setActionLoadingIds((prev) => new Set(prev).add(id))
      try {
        await fn()
      } finally {
        setActionLoadingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    },
    [],
  )

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleCreate = useCallback(
    async (data: {
      businessName: string
      contactPerson?: string
      email: string
      phone?: string
      address?: string
      taxId?: string
    }) => {
      if (!businessId) return
      await createCustomer({
        businessId: businessId as Id<"businesses">,
        ...data,
      })
      setFormMode({ kind: 'closed' })
    },
    [businessId, createCustomer],
  )

  const handleUpdate = useCallback(
    async (data: {
      businessName: string
      contactPerson?: string
      email: string
      phone?: string
      address?: string
      taxId?: string
    }) => {
      if (formMode.kind !== 'edit') return
      await updateCustomer({
        businessId: businessId as Id<"businesses">,
        id: formMode.customer._id,
        ...data,
      })
      setFormMode({ kind: 'closed' })
    },
    [businessId, formMode, updateCustomer],
  )

  const handleDeactivate = useCallback(
    async (customer: Customer) => {
      await withActionLoading(customer._id, async () => {
        await deactivateCustomer({ id: customer._id, businessId: businessId as Id<"businesses"> })
      })
    },
    [businessId, deactivateCustomer, withActionLoading],
  )

  const handleReactivate = useCallback(
    async (customer: Customer) => {
      await withActionLoading(customer._id, async () => {
        await reactivateCustomer({ id: customer._id, businessId: businessId as Id<"businesses"> })
      })
    },
    [businessId, reactivateCustomer, withActionLoading],
  )

  // -------------------------------------------------------------------------
  // Status badge helper
  // -------------------------------------------------------------------------

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === CUSTOMER_STATUSES.ACTIVE) {
      return <Badge variant="success">Active</Badge>
    }
    return <Badge variant="default">Inactive</Badge>
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header row: search + add button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers by name, email, or phone..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setFormMode({ kind: 'create' })}
          disabled={formMode.kind !== 'closed'}
        >
          <Plus className="h-4 w-4" />
          Add Customer
        </Button>
      </div>

      {/* Inline create form */}
      {formMode.kind === 'create' && (
        <CustomerForm
          mode="create"
          onSubmit={handleCreate}
          onCancel={() => setFormMode({ kind: 'closed' })}
        />
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading customers...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredCustomers.length === 0 && (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">
              {searchQuery ? 'No customers found' : 'No customers yet'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery
                ? 'Try adjusting your search terms.'
                : 'Start by adding your first customer.'}
            </p>
            {!searchQuery && formMode.kind === 'closed' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setFormMode({ kind: 'create' })}
              >
                <Plus className="h-4 w-4" />
                Add Customer
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Data display */}
      {!isLoading && filteredCustomers.length > 0 && (
        <>
          {/* Desktop table - hidden on mobile */}
          <Card className="border-border hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                      Business Name
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                      Contact Person
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                      Phone
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer: Customer) => {
                    const isEditing =
                      formMode.kind === 'edit' &&
                      formMode.customer._id === customer._id
                    const isActionLoading = actionLoadingIds.has(customer._id)

                    if (isEditing) {
                      return (
                        <tr key={customer._id}>
                          <td colSpan={6} className="p-4">
                            <CustomerForm
                              mode="edit"
                              initialData={customer}
                              onSubmit={handleUpdate}
                              onCancel={() => setFormMode({ kind: 'closed' })}
                            />
                          </td>
                        </tr>
                      )
                    }

                    return (
                      <tr
                        key={customer._id}
                        className="border-b border-border hover:bg-muted/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-foreground">
                            {customer.businessName}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {customer.contactPerson || '--'}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {customer.email}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {customer.phone || '--'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={customer.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setFormMode({ kind: 'edit', customer })
                              }
                              title="Edit"
                              disabled={isActionLoading}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {customer.status === CUSTOMER_STATUSES.ACTIVE ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeactivate(customer)}
                                title="Deactivate"
                                disabled={isActionLoading}
                              >
                                {isActionLoading ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Ban className="h-4 w-4" />
                                )}
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleReactivate(customer)}
                                title="Reactivate"
                                disabled={isActionLoading}
                              >
                                {isActionLoading ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile card list - visible only on mobile */}
          <div className="space-y-3 md:hidden">
            {filteredCustomers.map((customer: Customer) => {
              const isEditing =
                formMode.kind === 'edit' &&
                formMode.customer._id === customer._id
              const isActionLoading = actionLoadingIds.has(customer._id)

              if (isEditing) {
                return (
                  <CustomerForm
                    key={customer._id}
                    mode="edit"
                    initialData={customer}
                    onSubmit={handleUpdate}
                    onCancel={() => setFormMode({ kind: 'closed' })}
                  />
                )
              }

              return (
                <Card key={customer._id} className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {customer.businessName}
                        </p>
                        {customer.contactPerson && (
                          <p className="text-xs text-muted-foreground">
                            {customer.contactPerson}
                          </p>
                        )}
                      </div>
                      <StatusBadge status={customer.status} />
                    </div>

                    <div className="space-y-1 mb-3">
                      <p className="text-xs text-muted-foreground">
                        {customer.email}
                      </p>
                      {customer.phone && (
                        <p className="text-xs text-muted-foreground">
                          {customer.phone}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setFormMode({ kind: 'edit', customer })
                        }
                        title="Edit"
                        disabled={isActionLoading}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {customer.status === CUSTOMER_STATUSES.ACTIVE ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeactivate(customer)}
                          title="Deactivate"
                          disabled={isActionLoading}
                        >
                          {isActionLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Ban className="h-4 w-4" />
                          )}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleReactivate(customer)}
                          title="Reactivate"
                          disabled={isActionLoading}
                        >
                          {isActionLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
