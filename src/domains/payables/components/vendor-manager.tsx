'use client'

import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'
import {
  Search,
  Plus,
  Pencil,
  Ban,
  RotateCcw,
  Loader2,
  Building,
  Clock,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { VENDOR_STATUSES, PAYMENT_TERMS_OPTIONS } from '@/lib/constants/statuses'
import { formatCurrency } from '@/lib/utils/format-number'
import VendorProfilePanel from './vendor-profile-panel'

const PAYMENT_TERMS_LABELS: Record<string, string> = {
  due_on_receipt: 'Due on Receipt',
  net_15: 'Net 15',
  net_30: 'Net 30',
  net_60: 'Net 60',
  custom: 'Custom',
}

type StatusFilter = 'all' | 'prospective' | 'active' | 'inactive'

interface CreateVendorForm {
  name: string
  email: string
  phone: string
  category: string
}

export default function VendorManager() {
  const { businessId } = useActiveBusiness()
  const bizId = businessId as Id<'businesses'>

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState<CreateVendorForm>({
    name: '',
    email: '',
    phone: '',
    category: '',
  })
  const [isCreating, setIsCreating] = useState(false)
  const [actionLoadingIds, setActionLoadingIds] = useState<Set<string>>(new Set())

  // Data
  const vendorsResult = useQuery(
    api.functions.vendors.list,
    businessId
      ? {
          businessId: bizId,
          status:
            statusFilter !== 'all'
              ? (statusFilter as 'prospective' | 'active' | 'inactive')
              : undefined,
        }
      : 'skip'
  )

  const createVendor = useMutation(api.functions.vendors.create)
  const deactivateVendor = useMutation(api.functions.vendors.deactivate)
  const reactivateVendor = useMutation(api.functions.vendors.reactivate)

  const vendors = vendorsResult?.vendors ?? []
  const isLoading = vendorsResult === undefined

  // Local search filtering
  const filteredVendors = useMemo(() => {
    if (!searchQuery.trim()) return vendors
    const q = searchQuery.toLowerCase()
    return vendors.filter(
      (v: any) =>
        v.name.toLowerCase().includes(q) ||
        (v.email && v.email.toLowerCase().includes(q)) ||
        (v.category && v.category.toLowerCase().includes(q)) ||
        (v.contactPerson && v.contactPerson.toLowerCase().includes(q))
    )
  }, [vendors, searchQuery])

  // Action helper
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
    []
  )

  // Handlers
  const handleCreate = useCallback(async () => {
    if (!businessId || !createForm.name.trim()) return
    setIsCreating(true)
    try {
      await createVendor({
        businessId: bizId,
        name: createForm.name.trim(),
        email: createForm.email.trim() || undefined,
        phone: createForm.phone.trim() || undefined,
        category: createForm.category.trim() || undefined,
      })
      setCreateForm({ name: '', email: '', phone: '', category: '' })
      setShowCreateForm(false)
    } catch (err) {
      console.error('Failed to create vendor:', err)
    } finally {
      setIsCreating(false)
    }
  }, [businessId, bizId, createForm, createVendor])

  const handleDeactivate = useCallback(
    async (vendorId: string) => {
      await withActionLoading(vendorId, async () => {
        await deactivateVendor({ id: vendorId })
      })
    },
    [deactivateVendor, withActionLoading]
  )

  const handleReactivate = useCallback(
    async (vendorId: string) => {
      await withActionLoading(vendorId, async () => {
        await reactivateVendor({ id: vendorId })
      })
    },
    [reactivateVendor, withActionLoading]
  )

  // Status badge
  const StatusBadge = ({ status }: { status: string }) => {
    if (status === VENDOR_STATUSES.ACTIVE) {
      return <Badge variant="success">Active</Badge>
    }
    if (status === VENDOR_STATUSES.PROSPECTIVE) {
      return (
        <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30">
          Prospective
        </Badge>
      )
    }
    return <Badge variant="default">Inactive</Badge>
  }

  // If a vendor is selected, show profile panel
  if (selectedVendorId) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedVendorId(null)}
        >
          &larr; Back to Vendor List
        </Button>
        <VendorProfilePanel
          vendorId={selectedVendorId}
          onClose={() => setSelectedVendorId(null)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header row: search + filters + add button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vendors by name, email, or category..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="bg-input border border-border text-foreground rounded-md px-3 py-1.5 text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="prospective">Prospective</option>
            <option value="inactive">Inactive</option>
          </select>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowCreateForm(true)}
            disabled={showCreateForm}
          >
            <Plus className="h-4 w-4" />
            Add Vendor
          </Button>
        </div>
      </div>

      {/* Inline create form */}
      {showCreateForm && (
        <Card className="border-border">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">New Vendor</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                placeholder="Vendor name *"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm({ ...createForm, name: e.target.value })
                }
              />
              <Input
                placeholder="Email"
                type="email"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm({ ...createForm, email: e.target.value })
                }
              />
              <Input
                placeholder="Phone"
                value={createForm.phone}
                onChange={(e) =>
                  setCreateForm({ ...createForm, phone: e.target.value })
                }
              />
              <Input
                placeholder="Category"
                value={createForm.category}
                onChange={(e) =>
                  setCreateForm({ ...createForm, category: e.target.value })
                }
              />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCreateForm(false)
                  setCreateForm({ name: '', email: '', phone: '', category: '' })
                }}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreate}
                disabled={isCreating || !createForm.name.trim()}
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Create Vendor'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading vendors...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredVendors.length === 0 && (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">
              {searchQuery || statusFilter !== 'all'
                ? 'No vendors found'
                : 'No vendors yet'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your search or filter.'
                : 'Vendors are auto-created from invoice processing, or add one manually.'}
            </p>
            {!searchQuery && statusFilter === 'all' && !showCreateForm && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowCreateForm(true)}
              >
                <Plus className="h-4 w-4" />
                Add Vendor
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Vendor list */}
      {!isLoading && filteredVendors.length > 0 && (
        <>
          {/* Desktop table */}
          <Card className="border-border hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                      Vendor
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                      Payment Terms
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                      Contact
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
                  {filteredVendors.map((vendor: any) => {
                    const isActionLoading = actionLoadingIds.has(vendor._id)
                    return (
                      <tr
                        key={vendor._id}
                        className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => setSelectedVendorId(vendor._id)}
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-foreground">
                            {vendor.name}
                          </p>
                          {vendor.email && (
                            <p className="text-xs text-muted-foreground">
                              {vendor.email}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {vendor.category || '--'}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            {vendor.paymentTerms ? (
                              <>
                                <Clock className="w-3 h-3" />
                                {PAYMENT_TERMS_LABELS[vendor.paymentTerms] ||
                                  vendor.paymentTerms}
                                {vendor.paymentTerms === 'custom' &&
                                  vendor.customPaymentDays &&
                                  ` (${vendor.customPaymentDays}d)`}
                              </>
                            ) : (
                              '--'
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {vendor.contactPerson || vendor.phone || '--'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={vendor.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div
                            className="flex items-center justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setSelectedVendorId(vendor._id)}
                              title="View / Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {vendor.status === VENDOR_STATUSES.ACTIVE ||
                            vendor.status === VENDOR_STATUSES.PROSPECTIVE ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeactivate(vendor._id)}
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
                                onClick={() => handleReactivate(vendor._id)}
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
            {vendorsResult?.totalCount !== undefined && (
              <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
                {vendorsResult.totalCount} vendor{vendorsResult.totalCount !== 1 ? 's' : ''} total
              </div>
            )}
          </Card>

          {/* Mobile card list */}
          <div className="space-y-3 md:hidden">
            {filteredVendors.map((vendor: any) => {
              const isActionLoading = actionLoadingIds.has(vendor._id)
              return (
                <Card
                  key={vendor._id}
                  className="border-border cursor-pointer"
                  onClick={() => setSelectedVendorId(vendor._id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {vendor.name}
                        </p>
                        {vendor.category && (
                          <p className="text-xs text-muted-foreground">
                            {vendor.category}
                          </p>
                        )}
                      </div>
                      <StatusBadge status={vendor.status} />
                    </div>

                    <div className="space-y-1 mb-3">
                      {vendor.paymentTerms && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {PAYMENT_TERMS_LABELS[vendor.paymentTerms] ||
                            vendor.paymentTerms}
                        </div>
                      )}
                      {vendor.email && (
                        <p className="text-xs text-muted-foreground">
                          {vendor.email}
                        </p>
                      )}
                    </div>

                    <div
                      className="flex items-center justify-between"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1">
                        {vendor.status === VENDOR_STATUSES.ACTIVE ||
                        vendor.status === VENDOR_STATUSES.PROSPECTIVE ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeactivate(vendor._id)}
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
                            onClick={() => handleReactivate(vendor._id)}
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
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
