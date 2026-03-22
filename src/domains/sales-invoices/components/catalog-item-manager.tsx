'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { Search, Plus, Pencil, Ban, RotateCcw, Package, Loader2, Undo2, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useActiveBusiness } from '@/contexts/business-context'
import { useCatalogItems, useCatalogItemMutations } from '../hooks/use-catalog-items'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import CatalogItemForm from './catalog-item-form'
import StripeSyncButton from './stripe-sync-button'
import { formatCurrency } from '@/lib/utils/format-number'
import type { CatalogItem } from '../types'
import { CATALOG_ITEM_STATUSES } from '../types'
import type { Id } from '../../../../convex/_generated/dataModel'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormMode = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; item: CatalogItem }

// ---------------------------------------------------------------------------
// Stock Badge (inline helper for catalog table)
// ---------------------------------------------------------------------------

function StockBadgeForItem({ catalogItemId, businessId }: { catalogItemId: string; businessId: string | null }) {
  // @ts-ignore - api types generated after convex codegen on main
  const stockData: any[] | undefined = useQuery(
    (api.functions as any).inventoryStock?.getByProduct,
    businessId && catalogItemId
      ? { businessId: businessId as Id<'businesses'>, catalogItemId: catalogItemId as Id<'catalog_items'> }
      : 'skip'
  )

  if (!stockData || stockData.length === 0) return <span className="text-muted-foreground">0</span>

  const totalQty = stockData.reduce((sum: number, s: any) => sum + s.stock.quantityOnHand, 0)
  const hasLow = stockData.some((s: any) => s.stock.reorderLevel !== undefined && s.stock.quantityOnHand <= s.stock.reorderLevel)

  return (
    <span className={`font-medium ${hasLow ? 'text-yellow-600 dark:text-yellow-400' : totalQty <= 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
      {totalQty}
    </span>
  )
}

function StockDetailRow({ catalogItemId, businessId }: { catalogItemId: string; businessId: string | null }) {
  // @ts-ignore - api types generated after convex codegen on main
  const stockData: any[] | undefined = useQuery(
    (api.functions as any).inventoryStock?.getByProduct,
    businessId && catalogItemId
      ? { businessId: businessId as Id<'businesses'>, catalogItemId: catalogItemId as Id<'catalog_items'> }
      : 'skip'
  )
  // @ts-ignore
  const movements: any[] | undefined = useQuery(
    (api.functions as any).inventoryMovements?.listByProduct,
    businessId && catalogItemId
      ? { businessId: businessId as Id<'businesses'>, catalogItemId: catalogItemId as Id<'catalog_items'>, limit: 5 }
      : 'skip'
  )

  if (!stockData) return <p className="text-xs text-muted-foreground">Loading...</p>

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Per-location stock */}
      <div>
        <h4 className="text-xs font-medium text-foreground mb-2">Stock by Location</h4>
        {stockData.length === 0 ? (
          <p className="text-xs text-muted-foreground">No stock data</p>
        ) : (
          <div className="space-y-1">
            {stockData.map((s: any) => (
              <div key={s.stock._id} className="flex items-center justify-between text-xs">
                <span className="text-foreground">{s.location.name}</span>
                <span className={`font-medium ${
                  s.stock.reorderLevel !== undefined && s.stock.quantityOnHand <= s.stock.reorderLevel
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : s.stock.quantityOnHand <= 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-foreground'
                }`}>
                  {s.stock.quantityOnHand}
                  {s.stock.reorderLevel !== undefined && s.stock.quantityOnHand <= s.stock.reorderLevel && (
                    <Badge className="ml-1 text-[10px] bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30">Low</Badge>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent movements */}
      <div>
        <h4 className="text-xs font-medium text-foreground mb-2">Recent Movements</h4>
        {!movements || movements.length === 0 ? (
          <p className="text-xs text-muted-foreground">No movements yet</p>
        ) : (
          <div className="space-y-1">
            {movements.map((m: any) => (
              <div key={m._id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{m.date}</span>
                <span className={`font-medium ${m.quantity > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {m.quantity > 0 ? '+' : ''}{m.quantity}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CatalogItemManager() {
  const { businessId } = useActiveBusiness()
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [formMode, setFormMode] = useState<FormMode>({ kind: 'closed' })
  const [actionLoadingIds, setActionLoadingIds] = useState<Set<string>>(new Set())

  // Data hooks
  const { items, isLoading } = useCatalogItems({
    search: searchQuery || undefined,
    source: sourceFilter !== 'all' ? sourceFilter : undefined,
  })
  const { createItem, updateItem, deactivateItem, reactivateItem } =
    useCatalogItemMutations()
  const restoreFromStripe = useMutation(api.functions.catalogItems.restoreFromStripe)

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
  // Grouped view: group Stripe items by stripeProductId
  // -------------------------------------------------------------------------

  type CatalogGroup =
    | { type: 'standalone'; item: CatalogItem }
    | { type: 'group'; productName: string; description?: string; stripeProductId: string; items: CatalogItem[] }

  const groupedItems = useMemo<CatalogGroup[]>(() => {
    const stripeGroups = new Map<string, CatalogItem[]>()
    const standalone: CatalogItem[] = []

    for (const item of filteredItems) {
      if (item.source === 'stripe' && item.stripeProductId) {
        const group = stripeGroups.get(item.stripeProductId) ?? []
        group.push(item)
        stripeGroups.set(item.stripeProductId, group)
      } else {
        standalone.push(item)
      }
    }

    const result: CatalogGroup[] = []

    // Add Stripe groups (groups with 1 item become standalone too)
    for (const [stripeProductId, groupItems] of stripeGroups) {
      if (groupItems.length === 1) {
        result.push({ type: 'standalone', item: groupItems[0] })
      } else {
        result.push({
          type: 'group',
          productName: groupItems[0].name,
          description: groupItems[0].description,
          stripeProductId,
          items: groupItems,
        })
      }
    }

    // Add manual standalone items
    for (const item of standalone) {
      result.push({ type: 'standalone', item })
    }

    // Sort: groups and standalone by name
    result.sort((a, b) => {
      const nameA = a.type === 'group' ? a.productName : a.item.name
      const nameB = b.type === 'group' ? b.productName : b.item.name
      return nameA.localeCompare(nameB)
    })

    return result
  }, [filteredItems])

  // Track which product groups are expanded
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Track which items have stock detail expanded
  const [expandedStockItems, setExpandedStockItems] = useState<Set<string>>(new Set())
  const toggleStockExpand = useCallback((itemId: string) => {
    setExpandedStockItems((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }, [])

  const toggleGroup = useCallback((stripeProductId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(stripeProductId)) next.delete(stripeProductId)
      else next.add(stripeProductId)
      return next
    })
  }, [])

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
      glCode?: string
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
      glCode?: string
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

  const handleRestoreFromStripe = useCallback(
    async (item: CatalogItem) => {
      await withActionLoading(item._id, async () => {
        await restoreFromStripe({ id: item._id, businessId: businessId as Id<"businesses"> })
      })
    },
    [businessId, restoreFromStripe, withActionLoading],
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

  const BillingLabel = ({ interval }: { interval?: string }) => {
    if (!interval) return null
    const labels: Record<string, { text: string; short: string }> = {
      monthly: { text: 'Monthly', short: '/ mo' },
      yearly: { text: 'Yearly', short: '/ yr' },
      weekly: { text: 'Weekly', short: '/ wk' },
      daily: { text: 'Daily', short: '/ day' },
      one_time: { text: 'One-time', short: 'one-time' },
    }
    const label = labels[interval]
    if (!label) return null
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
        {label.text}
      </span>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header row: search + sync + add button */}
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
        <div className="flex items-center gap-2">
          <StripeSyncButton />
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
      </div>

      {/* Source filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Source:</span>
        {(['all', 'manual', 'stripe'] as const).map((value) => (
          <button
            key={value}
            onClick={() => setSourceFilter(value)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              sourceFilter === value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
            }`}
          >
            {value === 'all' ? 'All' : value === 'stripe' ? 'Stripe' : 'Manual'}
          </button>
        ))}
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
                    <th className="px-4 py-3 text-left text-sm font-medium text-foreground">
                      GL Code
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-foreground">
                      Price
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-foreground">
                      Tax Rate
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-foreground">
                      Stock
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
                  {groupedItems.map((entry) => {
                    if (entry.type === 'standalone') {
                      const item = entry.item
                      const isEditing = formMode.kind === 'edit' && formMode.item._id === item._id
                      const isActionLoading = actionLoadingIds.has(item._id)

                      if (isEditing) {
                        return (
                          <tr key={item._id}>
                            <td colSpan={7} className="p-4">
                              <CatalogItemForm mode="edit" initialData={item} onSubmit={handleUpdate} onCancel={() => setFormMode({ kind: 'closed' })} />
                            </td>
                          </tr>
                        )
                      }

                      return (<React.Fragment key={item._id}>
                        <tr className="border-b border-border hover:bg-muted/50 transition-colors">
                          <td className="px-4 py-3">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-medium text-foreground">{item.name}</p>
                                {item.source === 'stripe' && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30">Stripe</span>
                                )}
                                <BillingLabel interval={item.billingInterval} />
                              </div>
                              {item.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{item.sku || '--'}</td>
                          <td className="px-4 py-3 text-sm">
                            {item.glCode ? (
                              <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">{item.glCode}</span>
                            ) : '--'}
                          </td>
                          <td className="px-4 py-3 text-sm text-foreground text-right">
                            {formatCurrency(item.unitPrice, item.currency)}
                            {item.billingInterval && item.billingInterval !== 'one_time' && (
                              <span className="text-xs text-muted-foreground ml-1">
                                / {item.billingInterval === 'monthly' ? 'mo' : item.billingInterval === 'yearly' ? 'yr' : item.billingInterval === 'weekly' ? 'wk' : 'day'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground text-right">{item.taxRate != null ? `${(item.taxRate * 100).toFixed(1)}%` : '--'}</td>
                          <td className="px-4 py-3 text-sm text-right">
                            {(item as any).trackInventory ? (
                              <button
                                onClick={() => toggleStockExpand(item._id)}
                                className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                              >
                                <StockBadgeForItem catalogItemId={item._id} businessId={businessId} />
                                {expandedStockItems.has(item._id)
                                  ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                                  : <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                }
                              </button>
                            ) : (
                              <span className="text-muted-foreground">--</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center"><StatusBadge status={item.status} /></td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => setFormMode({ kind: 'edit', item })} title="Edit" disabled={isActionLoading}><Pencil className="h-4 w-4" /></Button>
                              {item.status === CATALOG_ITEM_STATUSES.ACTIVE ? (
                                <Button variant="ghost" size="icon" onClick={() => handleDeactivate(item)} title="Deactivate" disabled={isActionLoading}>{isActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}</Button>
                              ) : item.source === 'stripe' && item.locallyDeactivated ? (
                                <Button variant="ghost" size="icon" onClick={() => handleRestoreFromStripe(item)} title="Restore from Stripe" disabled={isActionLoading}>{isActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />}</Button>
                              ) : (
                                <Button variant="ghost" size="icon" onClick={() => handleReactivate(item)} title="Reactivate" disabled={isActionLoading}>{isActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}</Button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* Stock detail row (expanded) */}
                        {expandedStockItems.has(item._id) && (item as any).trackInventory && (
                          <tr>
                            <td colSpan={9} className="px-4 py-3 bg-muted/30">
                              <StockDetailRow catalogItemId={item._id} businessId={businessId} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                      )
                    }

                    // Grouped Stripe product with multiple prices
                    const isExpanded = expandedGroups.has(entry.stripeProductId)
                    const priceCount = entry.items.length

                    return (
                      <tbody key={`group-${entry.stripeProductId}`}>
                        {/* Group header row */}
                        <tr
                          className="border-b border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => toggleGroup(entry.stripeProductId)}
                        >
                          <td className="px-4 py-3" colSpan={2}>
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-semibold text-foreground">{entry.productName}</p>
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30">Stripe</span>
                                </div>
                                {entry.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{entry.description}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground text-right" colSpan={5}>
                            {priceCount} price {priceCount === 1 ? 'variant' : 'variants'}
                          </td>
                        </tr>

                        {/* Price variant rows (shown when expanded) */}
                        {isExpanded && entry.items.map((item) => {
                          const isEditing = formMode.kind === 'edit' && formMode.item._id === item._id
                          const isActionLoading = actionLoadingIds.has(item._id)

                          if (isEditing) {
                            return (
                              <tr key={item._id}>
                                <td colSpan={7} className="p-4">
                                  <CatalogItemForm mode="edit" initialData={item} onSubmit={handleUpdate} onCancel={() => setFormMode({ kind: 'closed' })} />
                                </td>
                              </tr>
                            )
                          }

                          return (
                            <tr key={item._id} className="border-b border-border hover:bg-muted/50 transition-colors">
                              <td className="pl-12 pr-4 py-2.5">
                                <div className="flex items-center gap-1.5">
                                  <BillingLabel interval={item.billingInterval} />
                                  {item.lastSyncedAt && (
                                    <span className="text-[10px] text-muted-foreground">
                                      Synced: {new Date(item.lastSyncedAt).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-sm text-muted-foreground">{item.sku || '--'}</td>
                              <td className="px-4 py-2.5 text-sm">
                                {item.glCode ? (
                                  <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">{item.glCode}</span>
                                ) : '--'}
                              </td>
                              <td className="px-4 py-2.5 text-sm text-foreground text-right font-medium">
                                {formatCurrency(item.unitPrice, item.currency)}
                                {item.billingInterval && item.billingInterval !== 'one_time' && (
                                  <span className="text-xs text-muted-foreground font-normal ml-1">
                                    / {item.billingInterval === 'monthly' ? 'mo' : item.billingInterval === 'yearly' ? 'yr' : item.billingInterval === 'weekly' ? 'wk' : 'day'}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-sm text-muted-foreground text-right">{item.taxRate != null ? `${(item.taxRate * 100).toFixed(1)}%` : '--'}</td>
                              <td className="px-4 py-2.5 text-center"><StatusBadge status={item.status} /></td>
                              <td className="px-4 py-2.5 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => setFormMode({ kind: 'edit', item })} title="Edit" disabled={isActionLoading}><Pencil className="h-4 w-4" /></Button>
                                  {item.status === CATALOG_ITEM_STATUSES.ACTIVE ? (
                                    <Button variant="ghost" size="icon" onClick={() => handleDeactivate(item)} title="Deactivate" disabled={isActionLoading}>{isActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}</Button>
                                  ) : item.source === 'stripe' && item.locallyDeactivated ? (
                                    <Button variant="ghost" size="icon" onClick={() => handleRestoreFromStripe(item)} title="Restore from Stripe" disabled={isActionLoading}>{isActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />}</Button>
                                  ) : (
                                    <Button variant="ghost" size="icon" onClick={() => handleReactivate(item)} title="Reactivate" disabled={isActionLoading}>{isActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}</Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile card list - visible only on mobile */}
          <div className="space-y-3 md:hidden">
            {groupedItems.map((entry) => {
              if (entry.type === 'standalone') {
                const item = entry.item
                const isEditing = formMode.kind === 'edit' && formMode.item._id === item._id
                const isActionLoading = actionLoadingIds.has(item._id)

                if (isEditing) {
                  return <CatalogItemForm key={item._id} mode="edit" initialData={item} onSubmit={handleUpdate} onCancel={() => setFormMode({ kind: 'closed' })} />
                }

                return (
                  <Card key={item._id} className="border-border">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                            {item.source === 'stripe' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30">Stripe</span>
                            )}
                            <BillingLabel interval={item.billingInterval} />
                          </div>
                        </div>
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">
                          {formatCurrency(item.unitPrice, item.currency)}
                          {item.billingInterval && item.billingInterval !== 'one_time' && (
                            <span className="text-muted-foreground font-normal ml-1">
                              / {item.billingInterval === 'monthly' ? 'mo' : item.billingInterval === 'yearly' ? 'yr' : item.billingInterval === 'weekly' ? 'wk' : 'day'}
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setFormMode({ kind: 'edit', item })} title="Edit" disabled={isActionLoading}><Pencil className="h-4 w-4" /></Button>
                          {item.status === CATALOG_ITEM_STATUSES.ACTIVE ? (
                            <Button variant="ghost" size="icon" onClick={() => handleDeactivate(item)} title="Deactivate" disabled={isActionLoading}>{isActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}</Button>
                          ) : item.source === 'stripe' && item.locallyDeactivated ? (
                            <Button variant="ghost" size="icon" onClick={() => handleRestoreFromStripe(item)} title="Restore from Stripe" disabled={isActionLoading}>{isActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />}</Button>
                          ) : (
                            <Button variant="ghost" size="icon" onClick={() => handleReactivate(item)} title="Reactivate" disabled={isActionLoading}>{isActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}</Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              }

              // Grouped product card (mobile)
              const isExpanded = expandedGroups.has(entry.stripeProductId)
              return (
                <Card key={`group-${entry.stripeProductId}`} className="border-border">
                  <CardContent className="p-0">
                    {/* Group header */}
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 p-4 text-left hover:bg-muted/50 transition-colors"
                      onClick={() => toggleGroup(entry.stripeProductId)}
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-foreground truncate">{entry.productName}</p>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30">Stripe</span>
                        </div>
                        {entry.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{entry.description}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{entry.items.length} prices</span>
                    </button>

                    {/* Expanded price variants */}
                    {isExpanded && (
                      <div className="border-t border-border">
                        {entry.items.map((item) => {
                          const isActionLoading = actionLoadingIds.has(item._id)
                          return (
                            <div key={item._id} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0 pl-10">
                              <div className="flex items-center gap-2">
                                <BillingLabel interval={item.billingInterval} />
                                <span className="text-sm font-medium text-foreground">
                                  {formatCurrency(item.unitPrice, item.currency)}
                                  {item.billingInterval && item.billingInterval !== 'one_time' && (
                                    <span className="text-xs text-muted-foreground font-normal ml-1">
                                      / {item.billingInterval === 'monthly' ? 'mo' : item.billingInterval === 'yearly' ? 'yr' : item.billingInterval === 'weekly' ? 'wk' : 'day'}
                                    </span>
                                  )}
                                </span>
                                <StatusBadge status={item.status} />
                              </div>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" onClick={() => setFormMode({ kind: 'edit', item })} title="Edit" disabled={isActionLoading}><Pencil className="h-4 w-4" /></Button>
                                {item.status === CATALOG_ITEM_STATUSES.ACTIVE ? (
                                  <Button variant="ghost" size="icon" onClick={() => handleDeactivate(item)} title="Deactivate" disabled={isActionLoading}>{isActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}</Button>
                                ) : (
                                  <Button variant="ghost" size="icon" onClick={() => handleReactivate(item)} title="Reactivate" disabled={isActionLoading}>{isActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}</Button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
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
