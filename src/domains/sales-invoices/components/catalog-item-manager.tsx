'use client'

import { useState, useCallback, useMemo } from 'react'
import { Search, Plus, Pencil, Ban, RotateCcw, Package, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useActiveBusiness } from '@/contexts/business-context'
import { useCatalogItems, useCatalogItemMutations } from '../hooks/use-catalog-items'
import CatalogItemForm from './catalog-item-form'
import { formatCurrency } from '@/lib/utils/format-number'
import type { CatalogItem } from '../types'
import { CATALOG_ITEM_STATUSES } from '../types'
import type { Id } from '../../../../convex/_generated/dataModel'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormMode = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; item: CatalogItem }

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CatalogItemManager() {
  const { businessId } = useActiveBusiness()
  const [searchQuery, setSearchQuery] = useState('')
  const [formMode, setFormMode] = useState<FormMode>({ kind: 'closed' })
  const [actionLoadingIds, setActionLoadingIds] = useState<Set<string>>(new Set())

  // Data hooks
  const { items, isLoading } = useCatalogItems({
    search: searchQuery || undefined,
  })
  const { createItem, updateItem, deactivateItem, reactivateItem } =
    useCatalogItemMutations()

  // -------------------------------------------------------------------------
  // Filtered items based on local search
  // -------------------------------------------------------------------------

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items
    const q = searchQuery.toLowerCase()
    return items.filter(
      (item: CatalogItem) =>
        item.name.toLowerCase().includes(q) ||
        (item.sku && item.sku.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q)),
    )
  }, [items, searchQuery])

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
      name: string
      description?: string
      sku?: string
      unitPrice: number
      currency: string
      unitMeasurement?: string
      taxRate?: number
    }) => {
      if (!businessId) return
      await createItem({
        businessId: businessId as Id<"businesses">,
        ...data,
      })
      setFormMode({ kind: 'closed' })
    },
    [businessId, createItem],
  )

  const handleUpdate = useCallback(
    async (data: {
      name: string
      description?: string
      sku?: string
      unitPrice: number
      currency: string
      unitMeasurement?: string
      taxRate?: number
    }) => {
      if (formMode.kind !== 'edit') return
      await updateItem({
        businessId: businessId as Id<"businesses">,
        id: formMode.item._id,
        ...data,
      })
      setFormMode({ kind: 'closed' })
    },
    [businessId, formMode, updateItem],
  )

  const handleDeactivate = useCallback(
    async (item: CatalogItem) => {
      await withActionLoading(item._id, async () => {
        await deactivateItem({ id: item._id, businessId: businessId as Id<"businesses"> })
      })
    },
    [businessId, deactivateItem, withActionLoading],
  )

  const handleReactivate = useCallback(
    async (item: CatalogItem) => {
      await withActionLoading(item._id, async () => {
        await reactivateItem({ id: item._id, businessId: businessId as Id<"businesses"> })
      })
    },
    [businessId, reactivateItem, withActionLoading],
  )

  // -------------------------------------------------------------------------
  // Status badge helper
  // -------------------------------------------------------------------------

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === CATALOG_ITEM_STATUSES.ACTIVE) {
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
            placeholder="Search items by name, SKU, or description..."
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
          Add Item
        </Button>
      </div>

      {/* Inline create form */}
      {formMode.kind === 'create' && (
        <CatalogItemForm
          mode="create"
          onSubmit={handleCreate}
          onCancel={() => setFormMode({ kind: 'closed' })}
        />
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading catalog items...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredItems.length === 0 && (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">
              {searchQuery ? 'No items found' : 'No catalog items yet'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery
                ? 'Try adjusting your search terms.'
                : 'Start by adding your first catalog item.'}
            </p>
            {!searchQuery && formMode.kind === 'closed' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setFormMode({ kind: 'create' })}
              >
                <Plus className="h-4 w-4" />
                Add Item
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Desktop table view */}
      {!isLoading && filteredItems.length > 0 && (
        <>
          {/* Desktop table - hidden on mobile */}
          <Card className="border-border hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                      SKU
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-foreground">
                      Price
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-foreground">
                      Tax Rate
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
                  {filteredItems.map((item: CatalogItem) => {
                    const isEditing =
                      formMode.kind === 'edit' && formMode.item._id === item._id
                    const isActionLoading = actionLoadingIds.has(item._id)

                    if (isEditing) {
                      return (
                        <tr key={item._id}>
                          <td colSpan={6} className="p-4">
                            <CatalogItemForm
                              mode="edit"
                              initialData={item}
                              onSubmit={handleUpdate}
                              onCancel={() => setFormMode({ kind: 'closed' })}
                            />
                          </td>
                        </tr>
                      )
                    }

                    return (
                      <tr
                        key={item._id}
                        className="border-b border-border hover:bg-muted/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {item.name}
                            </p>
                            {item.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                {item.description}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {item.sku || '--'}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground text-right">
                          {formatCurrency(item.unitPrice, item.currency)}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground text-right">
                          {item.taxRate != null
                            ? `${(item.taxRate * 100).toFixed(1)}%`
                            : '--'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={item.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setFormMode({ kind: 'edit', item })
                              }
                              title="Edit"
                              disabled={isActionLoading}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {item.status === CATALOG_ITEM_STATUSES.ACTIVE ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeactivate(item)}
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
                                onClick={() => handleReactivate(item)}
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
            {filteredItems.map((item: CatalogItem) => {
              const isEditing =
                formMode.kind === 'edit' && formMode.item._id === item._id
              const isActionLoading = actionLoadingIds.has(item._id)

              if (isEditing) {
                return (
                  <CatalogItemForm
                    key={item._id}
                    mode="edit"
                    initialData={item}
                    onSubmit={handleUpdate}
                    onCancel={() => setFormMode({ kind: 'closed' })}
                  />
                )
              }

              return (
                <Card key={item._id} className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {item.name}
                        </p>
                        {item.sku && (
                          <p className="text-xs text-muted-foreground">
                            SKU: {item.sku}
                          </p>
                        )}
                      </div>
                      <StatusBadge status={item.status} />
                    </div>

                    {item.description && (
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                        {item.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <span className="font-medium text-foreground">
                          {formatCurrency(item.unitPrice, item.currency)}
                        </span>
                        {item.taxRate != null && (
                          <span className="text-muted-foreground ml-2">
                            Tax: {(item.taxRate * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setFormMode({ kind: 'edit', item })
                          }
                          title="Edit"
                          disabled={isActionLoading}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {item.status === CATALOG_ITEM_STATUSES.ACTIVE ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeactivate(item)}
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
                            onClick={() => handleReactivate(item)}
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
